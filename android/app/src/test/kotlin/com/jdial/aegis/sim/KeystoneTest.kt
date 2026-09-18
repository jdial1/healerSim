package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.affixesFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Keystones: the clear is the item.
 *
 * Nothing drops and nothing is equipped -- a hard clear pushes that dungeon's
 * keystone one further, and every level is one more affix from the pool. It is
 * the cheapest honest answer to "nothing changes how you play the next run",
 * because the affix system is what carries it.
 */
class KeystoneTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val place = "deadmines"

    private fun affixes(level: Int) = data.encounters.affixesFor(place, true, level)

    @Test
    fun `each level is one more affix, in a fixed order`() {
        val base = affixes(0)
        assertTrue("a hard run should already carry something", base.isNotEmpty())
        for (level in 1..4) {
            assertEquals("level $level", base.size + level, affixes(level).size)
            // The dungeon's own come first, so pushing it does not wash out its
            // character -- it stacks on top.
            assertEquals(base, affixes(level).take(base.size))
        }
        // The same level of the same place is always the same fight.
        assertEquals(affixes(3), affixes(3))
    }

    @Test
    fun `it runs out of affixes rather than inventing them`() {
        val everything = data.encounters.affixes.size
        assertEquals(everything, affixes(99).size)
        assertEquals(everything, affixes(99).distinct().size)
    }

    @Test
    fun `a normal run has no keystone at all`() {
        assertEquals(emptyList<Any>(), data.encounters.affixesFor(place, false, 5))
        val rng = Rng(1)
        val s = engine.newCharacter(PlayerClass.MAGE, rng)
        val normal = engine.reduce(
            s, Action.StartDungeon(data.dungeons.first { it.id == place }, "normal", false, 4), rng,
        )
        assertEquals("a keystone is a hard-mode thing", 0, normal.keystone)
    }

    @Test
    fun `the run carries its level, and a higher one is a harder fight`() {
        val rng = Rng(1)
        val s = engine.newCharacter(PlayerClass.MAGE, rng).withMe { it.copy(level = 30) }
        val dungeon = data.dungeons.first { it.id == place }

        val low = engine.reduce(s, Action.StartDungeon(dungeon, "normal", true, 0), rng)
        val high = engine.reduce(s, Action.StartDungeon(dungeon, "normal", true, 3), rng)
        assertEquals(3, high.keystone)

        val tick = GameTick(data, Fixtures.stats, Fixtures.progression)
        assertTrue(
            "a pushed keystone should bring more rules, not the same ones",
            tick.affixesOf(high).size > tick.affixesOf(low).size,
        )
    }

    @Test
    fun `the outcome remembers what level was beaten`() {
        val rng = Rng(1)
        val s = engine.newCharacter(PlayerClass.MAGE, rng).withMe { it.copy(level = 30) }
        var run = engine.reduce(
            s, Action.StartDungeon(data.dungeons.first { it.id == place }, "normal", true, 2), rng,
        )
        // Straight to a win: the record is what is under test, not the fight.
        run = run.copy(combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 0.0001)
        repeat(60) { if (run.dungeonOutcome == null) run = engine.reduce(run, Action.Tick(1), rng) }
        val outcome = run.dungeonOutcome
        assertTrue("the run should have ended", outcome != null)
        assertTrue(outcome!!.hardMode)
        assertEquals("the level it was beaten at", 2, outcome.keystone)
    }
}
