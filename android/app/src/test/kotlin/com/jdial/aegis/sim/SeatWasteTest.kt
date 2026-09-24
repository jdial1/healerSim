package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every seat gets a number for the effort that bought nothing.
 *
 * The healer's has been there since the game was named after it. The tank and
 * damage seats had none, so there was no way to tell a good clear from a lucky
 * one, and no way to compare two builds that both survived -- which is the whole
 * of the optimization game the healer already had.
 *
 * The tank's waste is threat built while already holding with room to spare; the
 * damage dealer's is damage dealt while already past the pull line, which bought
 * risk and nothing else. Both are measured against the margin
 * `resolveEnemyTarget` actually enforces, so the number on the result screen and
 * the rule in the engine are the same rule.
 */
class SeatWasteTest {
    private val harness = PlaytestHarness()

    private fun play(cls: PlayerClass, level: Int) = (1..4).map { seed ->
        val data = Fixtures.data
        val dungeon = data.dungeons.firstOrNull { !it.endless && level in it.levelMin..it.levelMax }
            ?: data.dungeons.last { !it.endless && it.levelMin <= level }
        harness.play(cls, level, dungeon.id, false, "normal", seed)
    }

    @Test
    fun `a tank posts a waste number`() {
        val runs = play(PlayerClass.WARRIOR, 20)
        assertTrue(
            "no run reported any surplus threat: ${runs.map { it.wastePct }}",
            runs.any { it.wastePct > 0.0 },
        )
        assertTrue("a share cannot exceed everything", runs.all { it.wastePct <= 100.0 })
    }

    @Test
    fun `a damage dealer posts a waste number`() {
        val runs = play(PlayerClass.MAGE, 20)
        assertTrue("a share cannot exceed everything", runs.all { it.wastePct <= 100.0 })
        assertTrue("a share cannot be negative", runs.all { it.wastePct >= 0.0 })
    }

    @Test
    fun `a healer's waste is its overheal, from one source`() {
        // Not a second accumulator for the same quantity: the healer's waste is
        // the overheal the run has always counted.
        for (r in play(PlayerClass.PRIEST, 20)) {
            assertEquals("waste and overheal disagree on seed ${r.seed}", r.overhealPct, r.wastePct, 1e-9)
        }
    }

    @Test
    fun `waste is cleared with the rest of the slate`() {
        val s = GameState(runSeatEffort = 500.0, runSeatWaste = 120.0)
        assertEquals(0.0, s.clearedCombat().runSeatEffort, 0.0)
        assertEquals(0.0, s.clearedCombat().runSeatWaste, 0.0)
    }
}
