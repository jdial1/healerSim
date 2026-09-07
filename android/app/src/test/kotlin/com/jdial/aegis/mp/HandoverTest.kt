package com.jdial.aegis.mp

import com.jdial.aegis.sim.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What happens to a slot when the person in it stops playing.
 *
 * There is deliberately no handover *path*: a dropped player is marked
 * `isHuman = false` and the AI's damage share recomputes to include their slot
 * again. A separate code path for "somebody left" would be a path that only
 * runs when something has already gone wrong, which is the worst kind to have.
 */
class HandoverTest {
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)
    private val roles = Fixtures.data.balance.roles

    private fun state(vararg humans: Pair<UnitRole, Boolean>) = GameState(
        participants = humans.mapIndexed { i, (role, human) ->
            val id = "${i + 1}"
            id to Participant(id, role = role, isHuman = human)
        }.toMap(),
    )

    @Test
    fun `one human reproduces the tuned constants exactly, not approximately`() {
        // These three numbers were tuned for exactly one player, and the parity
        // corpus was recorded against them. The generalisation has to land on
        // them bit-for-bit, not within an epsilon.
        val healer = tick.aiDamageShare(state(UnitRole.HEALER to true))
        assertEquals(roles.aiShareWhenHealer.toRawBits(), healer.toRawBits())
        assertEquals(
            roles.aiShareWhenDps.toRawBits(),
            tick.aiDamageShare(state(UnitRole.DPS to true)).toRawBits(),
        )
        assertEquals(
            roles.aiShareWhenTank.toRawBits(),
            tick.aiDamageShare(state(UnitRole.TANK to true)).toRawBits(),
        )
        // And the healer case must be exactly 1.0, because the enemy-damage
        // expression reduces to `x * 1.0 + 0.0` -- which is what lets
        // parity/golden.json still be compared byte-for-byte.
        assertEquals(1.0.toRawBits(), healer.toRawBits())
    }

    @Test
    fun `each additional human takes their own slot out of the ai's share`() {
        val share = tick.aiDamageShare(state(UnitRole.TANK to true, UnitRole.DPS to true))
        val expected = 1.0 - (1.0 - roles.aiShareWhenTank) - (1.0 - roles.aiShareWhenDps)
        assertEquals(expected, share, 1e-12)
        assertTrue("two humans must leave the ai doing less than one does", share < roles.aiShareWhenTank)
    }

    @Test
    fun `a player dropping hands their damage back to the ai`() {
        // The whole disconnect story. Nothing else runs: the slot stops being
        // human, so the scripted pool grows back by exactly what they were
        // contributing, and the run carries on.
        val playing = state(UnitRole.TANK to true, UnitRole.DPS to true)
        val dropped = playing.withParticipant("2") { it.copy(isHuman = false) }

        assertEquals(
            "a dropped human must leave the share exactly where a solo tank leaves it",
            tick.aiDamageShare(state(UnitRole.TANK to true)).toRawBits(),
            tick.aiDamageShare(dropped).toRawBits(),
        )
        assertTrue(tick.aiDamageShare(dropped) > tick.aiDamageShare(playing))
    }

    @Test
    fun `a full house of humans never drives the share negative`() {
        val everyone = state(
            UnitRole.TANK to true, UnitRole.DPS to true, UnitRole.DPS to true,
            UnitRole.DPS to true, UnitRole.HEALER to true,
        )
        val share = tick.aiDamageShare(everyone)
        assertTrue("share must stay a fraction, was $share", share in 0.0..1.0)
    }

    @Test
    fun `an all-ai party leaves the ai doing everything`() {
        assertEquals(1.0, tick.aiDamageShare(state(UnitRole.TANK to false, UnitRole.DPS to false)), 0.0)
    }
}
