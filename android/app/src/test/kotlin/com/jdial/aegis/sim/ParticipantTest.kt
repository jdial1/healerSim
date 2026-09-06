package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The engine addressing more than one player.
 *
 * Everything that described a player -- mana, cooldowns, buffs, class, level,
 * the pending damage and threat accumulators -- lived on [GameState] directly,
 * which quietly asserted that exactly one exists. Single player is now a
 * [Participant] map of one running the same code, so these are the tests that
 * the plural path is real rather than a rename.
 *
 * The other half of the evidence is [ParityTest]: parity/golden.json is still
 * byte-identical, so the map-of-one produces the numbers the JS engine did.
 */
class ParticipantTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()

    /** A mage in slot 5 and a warrior in slot 1, mid-pull. */
    private fun twoPlayers(): GameState {
        val mage = engine.reduce(
            engine.newCharacter(PlayerClass.MAGE, Rng(4)),
            Action.StartDungeon(dungeon, "normal"),
            Rng(4),
        )
        val warrior = engine.newCharacter(PlayerClass.WARRIOR, Rng(4)).me
        return mage.withParticipant("1") { warrior.copy(unitId = "1", mana = warrior.maxMana.toDouble()) }
    }

    private fun firstSpell(s: GameState, id: String) =
        s.participants.getValue(id).activeActionBars.first { it.isNotEmpty() && it != MANA_POTION_ID }

    @Test
    fun `single player is a map of one`() {
        val s = engine.newCharacter(PlayerClass.PRIEST, Rng(1))
        assertEquals(1, s.participants.size)
        assertEquals(PLAYER_UNIT_ID, s.localUnitId)
        // And the accessors still answer for it, which is why the UI and the
        // several hundred existing read sites did not have to change.
        assertEquals(PlayerClass.PRIEST, s.playerClass)
        assertEquals(s.me.mana, s.mana, 0.0)
    }

    @Test
    fun `two participants casting draw from separate mana pools`() {
        val s0 = twoPlayers()
        val mageMana0 = s0.participants.getValue(PLAYER_UNIT_ID).mana
        val warriorMana0 = s0.participants.getValue("1").mana

        val s1 = engine.reduce(
            s0,
            Action.CastSpell(firstSpell(s0, PLAYER_UNIT_ID), null, 0.99, actorId = PLAYER_UNIT_ID),
            Rng(4),
        )
        assertNotEquals("the mage should have spent mana", mageMana0, s1.participants.getValue(PLAYER_UNIT_ID).mana)
        assertEquals(
            "and must not have spent the warrior's",
            warriorMana0, s1.participants.getValue("1").mana, 0.0,
        )

        val s2 = engine.reduce(
            s1,
            Action.CastSpell(firstSpell(s1, "1"), null, 0.99, actorId = "1"),
            Rng(4),
        )
        assertNotEquals("the warrior should have spent mana", warriorMana0, s2.participants.getValue("1").mana)
        assertEquals(
            "and must not have touched the mage's again",
            s1.participants.getValue(PLAYER_UNIT_ID).mana,
            s2.participants.getValue(PLAYER_UNIT_ID).mana,
            0.0,
        )
    }

    @Test
    fun `a cast leaves this client's seat where it found it`() {
        // The pipeline resolves a cast by pointing localUnitId at the actor.
        // If that is ever not handed back, the UI silently starts showing
        // somebody else's bars.
        val s0 = twoPlayers()
        val s1 = engine.reduce(
            s0, Action.CastSpell(firstSpell(s0, "1"), null, 0.99, actorId = "1"), Rng(4),
        )
        assertEquals(PLAYER_UNIT_ID, s1.localUnitId)
        // Including when the cast is rejected outright.
        val rejected = engine.reduce(
            s0, Action.CastSpell("no_such_spell", null, 0.99, actorId = "1"), Rng(4),
        )
        assertEquals(PLAYER_UNIT_ID, rejected.localUnitId)
    }

    @Test
    fun `threat credits to the acting slot, not to slot five`() {
        var s = twoPlayers()
        s = engine.reduce(s, Action.CastSpell(firstSpell(s, "1"), null, 0.99, actorId = "1"), Rng(4))
        assertTrue(
            "the warrior's cast must bank threat against the warrior",
            s.participants.getValue("1").pendingPlayerThreat > 0.0,
        )
        assertEquals(
            "and none against the mage",
            0.0, s.participants.getValue(PLAYER_UNIT_ID).pendingPlayerThreat, 0.0,
        )

        val before = s.party.associate { it.id to it.threat }
        s = engine.reduce(s, Action.Tick(1), Rng(4))
        val after = s.party.associate { it.id to it.threat }
        // Slot 1 is also the tank, which earns scripted threat every tick, so
        // compare against what a DPS slot gained rather than against zero.
        val tankGain = after.getValue("1") - before.getValue("1")
        val dpsGain = after.getValue("2") - before.getValue("2")
        assertTrue("the caster's slot should have gained the cast's threat", tankGain > dpsGain)
    }

    @Test
    fun `a cast from someone not in the run is dropped`() {
        // The shape a malformed relayed action takes. It must not conjure a
        // participant, and it must not resolve as the local player either.
        val s0 = twoPlayers()
        val s1 = engine.reduce(
            s0, Action.CastSpell(firstSpell(s0, PLAYER_UNIT_ID), null, 0.99, actorId = "3"), Rng(4),
        )
        assertEquals(s0, s1)
    }

    @Test
    fun `cooldowns advance for every participant, not just the local one`() {
        var s = twoPlayers()
        s = engine.reduce(s, Action.CastSpell(firstSpell(s, "1"), null, 0.99, actorId = "1"), Rng(4))
        val gcd0 = s.participants.getValue("1").globalCooldownRemaining
        assertTrue("the warrior should be on the global cooldown", gcd0 > 0)
        s = engine.reduce(s, Action.Tick(1), Rng(4))
        assertEquals(
            "a remote participant's cooldowns must advance on the host's tick",
            gcd0 - 1, s.participants.getValue("1").globalCooldownRemaining,
        )
    }
}
