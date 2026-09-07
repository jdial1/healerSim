package com.jdial.aegis.mp

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.*
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The broadcast frame.
 *
 * The budget in the multiplayer plan is 0.17 GB per room-hour at 4 Hz with four
 * readers, which works out at roughly 3 KB a frame. That number is the entire
 * reason the payload is slimmed, so it is asserted rather than hoped for.
 */
class SnapshotTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()
    private val json = Json { encodeDefaults = true }

    private fun midFight(cls: PlayerClass = PlayerClass.PRIEST): GameState {
        var s = engine.reduce(engine.newCharacter(cls, Rng(4)), Action.StartDungeon(dungeon, "normal"), Rng(4))
        repeat(60) { if (s.isCombatActive) s = engine.reduce(s, Action.Tick(1), Rng(4)) }
        return s
    }

    @Test
    fun `a frame fits the plan's budget, and the full state does not`() {
        val s = midFight()
        val full = json.encodeToString(GameState.serializer(), s).length
        val frame = json.encodeToString(Snapshot.serializer(), s.toSnapshot()).length

        // Measured, not guessed: 17,839 bytes of GameState, of which 14,753 is
        // the talent tree -- every TalentRank embeds its whole Talent. Talents
        // do not change during a run, so they travel once at join.
        assertTrue("a full GameState should be far too big to broadcast, was $full", full > 15_000)
        // 4 Hz to four readers for an hour, at $1/GB of RTDB egress.
        val gbPerRoomHour = frame.toDouble() * 4 * 4 * 3600 / 1e9
        println("frame=$frame bytes (full=$full), ${"%.3f".format(gbPerRoomHour)} GB/room-hour")
        assertTrue("a frame must fit the 3 KB budget, was $frame", frame < 3_000)
        assertTrue(
            "the plan budgets 0.17 GB/room-hour, this projects ${"%.3f".format(gbPerRoomHour)}",
            gbPerRoomHour <= 0.17,
        )
    }

    @Test
    fun `a frame carries no talents and no dungeon definition`() {
        // The two constants that made the payload large. If either comes back,
        // the budget above is the only thing that notices, so name them here
        // too -- a failing size assertion does not say what got fat.
        val wire = json.encodeToString(Snapshot.serializer(), midFight().toSnapshot())
        assertTrue("talents must not be on the wire", !wire.contains("maxPoints"))
        assertTrue("the dungeon definition must not be on the wire", !wire.contains("bossHealth"))
    }

    @Test
    fun `a guest renders the host's fight but keeps its own character`() {
        val host = midFight(PlayerClass.PRIEST)
        // The guest is a different class entirely, with its own talents.
        val guest = engine.newCharacter(PlayerClass.DRUID, Rng(9))

        val rendered = host.toSnapshot().applyTo(guest, dungeon)

        assertEquals("the fight comes from the host", host.party, rendered.party)
        assertEquals(host.enemyHealth, rendered.enemyHealth, 0.0)
        assertEquals(host.combatElapsedTicks, rendered.combatElapsedTicks)
        // And the character does not. A host has no authority over who you are.
        assertEquals(PlayerClass.DRUID, rendered.playerClass)
        assertEquals(guest.talents, rendered.talents)
        assertEquals(guest.unlockedSpells, rendered.unlockedSpells)
    }

    @Test
    fun `resources for a slot the guest knows about are taken from the host`() {
        var host = midFight(PlayerClass.PRIEST)
        host = host.withMe { it.copy(mana = 7.0, holyPower = 3, globalCooldownRemaining = 4) }
        val guest = engine.newCharacter(PlayerClass.PRIEST, Rng(9))

        val rendered = host.toSnapshot().applyTo(guest, dungeon)
        assertEquals("mana is the host's", 7.0, rendered.mana, 0.0)
        assertEquals(3, rendered.holyPower)
        assertEquals("a guest must not be able to cast off its own cooldown", 4, rendered.globalCooldownRemaining)
    }

    @Test
    fun `a frame survives a json round trip`() {
        val snap = midFight().toSnapshot()
        val back = json.decodeFromString(Snapshot.serializer(), json.encodeToString(Snapshot.serializer(), snap))
        assertEquals(snap, back)
    }

    @Test
    fun `players are ordered by slot, so equal states produce equal bytes`() {
        val s = midFight()
        val shuffled = s.copy(participants = s.participants.entries.reversed().associate { it.key to it.value })
        assertEquals(
            json.encodeToString(Snapshot.serializer(), s.toSnapshot()),
            json.encodeToString(Snapshot.serializer(), shuffled.toSnapshot()),
        )
    }
}
