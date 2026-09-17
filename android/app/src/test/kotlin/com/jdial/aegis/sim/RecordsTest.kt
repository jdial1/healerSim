package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What a cleared dungeon leaves behind: the record, its marks, and what they earn. */
class RecordsTest {
    private val data = Fixtures.data
    private val engine = Engine(data)

    private fun outcome(
        kind: DungeonOutcomeKind = DungeonOutcomeKind.SUCCESS,
        ticks: Int = 1_000,
        deaths: Int = 0,
        missed: Int = 0,
        dps: Double = 50.0,
    ) = DungeonOutcome(
        kind = kind, dungeonId = "deadmines", xpGained = 10,
        stats = RunStats(dps = dps), clearTicks = ticks, deaths = deaths, missedKicks = missed,
    )

    @Test
    fun `a clear writes the record, and says what was new`() {
        val (first, news) = emptyMap<String, DungeonRecord>().withRun(outcome(ticks = 1_000, deaths = 1, missed = 1))
        val r = first.getValue("deadmines")
        assertEquals(1, r.clears)
        assertEquals(1_000, r.bestTicks)
        assertFalse(r.clean)
        assertFalse(r.sharp)
        assertTrue(news.firstClear)
        assertFalse(news.newBest)

        // Faster, cleaner, sharper: a new best and both marks.
        val (second, better) = first.withRun(outcome(ticks = 800))
        val r2 = second.getValue("deadmines")
        assertEquals(2, r2.clears)
        assertEquals(800, r2.bestTicks)
        assertEquals(800, r2.lastTicks)
        assertTrue(r2.clean && r2.sharp)
        assertTrue(better.newBest && better.clean && better.sharp)
        assertFalse(better.firstClear)

        // Slower: the best stands, and old news is not news.
        val (third, again) = second.withRun(outcome(ticks = 1_200))
        assertEquals(800, third.getValue("deadmines").bestTicks)
        assertEquals(1_200, third.getValue("deadmines").lastTicks)
        assertFalse(again.any)
    }

    @Test
    fun `a wipe leaves no mark`() {
        val (after, news) = emptyMap<String, DungeonRecord>().withRun(outcome(kind = DungeonOutcomeKind.PARTY_WIPE))
        assertTrue(after.isEmpty())
        assertFalse(news.any)
    }

    @Test
    fun `the best numbers only go up`() {
        val (one, _) = emptyMap<String, DungeonRecord>().withRun(outcome(dps = 90.0))
        val (two, _) = one.withRun(outcome(dps = 40.0))
        assertEquals(90.0, two.getValue("deadmines").bestDps, 0.0)
    }

    @Test
    fun `titles and colours come from the marks`() {
        val core = data.dungeons.count { !it.endless }
        assertNull(titleFor(emptyMap(), core))
        fun records(n: Int, clean: Boolean = false, sharp: Boolean = false) =
            (1..n).associate { "d$it" to DungeonRecord(clears = 1, clean = clean, sharp = sharp) }
        assertEquals("the Delver", titleFor(records(1), core))
        assertEquals("the Steady", titleFor(records(3, clean = true), core))
        assertEquals("the Sharp", titleFor(records(3, clean = true, sharp = true), core))
        assertEquals("the Merciless", titleFor(records(8, clean = true, sharp = true), core))
        assertEquals("Dungeonmaster", titleFor(records(core), core))

        assertNull(sigilTint(records(3)))
        assertEquals(0xFFB87333, sigilTint(records(4)))
        assertEquals(0xFFC084FC, sigilTint(records(16)))
    }

    @Test
    fun `a clock a player can read`() {
        assertEquals("1:42", clearTimeLabel(1_020))
        assertEquals("0:07", clearTimeLabel(70))
    }

    @Test
    fun `the run counts its deaths and the kicks it missed`() {
        val rng = Rng(3)
        var s = engine.newCharacter(PlayerClass.MAGE, rng)
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), rng)
        assertEquals(0, s.runDeaths)
        assertEquals(0, s.runMissedKicks)

        // A cannon left to land with a kick ready is one missed.
        val cast = EnemyCast("vc_cannon", "Cannon", targets = listOf("2"), remainingTicks = 1, totalTicks = 30, interruptible = true)
        val boss = s.copy(
            combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 1e9, enemyMaxHealth = 1e9,
            mechanicCooldown = 10_000, enemyCast = cast,
            party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
        )
        assertEquals(1, engine.reduce(boss, Action.Tick(1), Rng(5)).runMissedKicks)

        // Someone dying is one death, counted once.
        val doomed = boss.copy(enemyCast = null, party = boss.party.map { if (it.id == "2") it.copy(health = 1.0) else it })
        val hit = doomed.copy(party = doomed.party.map { if (it.id == "2") it.copy(health = 0.0) else it })
        assertEquals(0, engine.reduce(hit, Action.Tick(1), Rng(5)).runDeaths)
        assertEquals(1, engine.reduce(doomed.copy(enemyCast = cast.copy(interruptible = false, abilityId = "vc_ambush")), Action.Tick(1), Rng(5)).runDeaths)
    }

    @Test
    fun `a cleared run records its time`() {
        val rng = Rng(3)
        var s = engine.newCharacter(PlayerClass.MAGE, rng)
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), rng)
        s = s.copy(
            combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 0.001,
            enemyMaxHealth = 1000.0, combatElapsedTicks = 900, runDeaths = 2, runMissedKicks = 1,
        )
        val outcome = engine.reduce(s, Action.Tick(1), rng).dungeonOutcome!!
        assertEquals(DungeonOutcomeKind.SUCCESS, outcome.kind)
        assertEquals(901, outcome.clearTicks)
        assertEquals(2, outcome.deaths)
        assertEquals(1, outcome.missedKicks)
    }
}
