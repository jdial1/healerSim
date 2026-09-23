package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A loss you cannot attribute is noise rather than a lesson.
 *
 * The run counted its deaths and recorded nothing about them, so a wipe could
 * say that three people died and never who or when. "The boss spiked" and "I
 * lost the tank at forty seconds" are the same run described by a player who
 * cannot see the cause and one who can.
 */
class FirstDownTest {
    private val harness = PlaytestHarness()

    /** An idle warrior at the last dungeon: somebody is going to fall. */
    private fun idleRuns() = (1..6).map { seed ->
        val data = Fixtures.data
        val dungeon = data.dungeons.last { !it.endless && it.levelMin <= 47 }
        harness.play(PlayerClass.WARRIOR, 47, dungeon.id, false, "normal", seed, idle = true)
    }

    @Test
    fun `a run that loses people names the first one`() {
        val lost = idleRuns().filter { it.deaths > 0 }
        assertTrue("the harness produced no deaths to attribute", lost.isNotEmpty())
        for (r in lost) {
            assertTrue(
                "seed ${r.seed} lost ${r.deaths} and named nobody",
                r.firstDown.isNotEmpty(),
            )
            assertTrue(
                "seed ${r.seed} named ${r.firstDown} at tick ${r.firstDownTick}",
                r.firstDownTick > 0,
            )
        }
    }

    @Test
    fun `nobody is named when nobody falls`() {
        for (r in idleRuns().filter { it.deaths == 0 }) {
            assertEquals("seed ${r.seed} named someone who did not fall", "", r.firstDown)
        }
    }

    @Test
    fun `the name survives the end of the run and is gone by the next one`() {
        val s = GameState(runFirstDownName = "Tanky McShield", runFirstDownTick = 120)

        // endedRun deliberately keeps the run accumulators: the outcome screen
        // is built after it and reads them.
        assertEquals("Tanky McShield", s.endedRun().runFirstDownName)
        assertEquals(120, s.endedRun().runFirstDownTick)

        // clearedCombat is what wipes the slate, and it runs when a run starts.
        assertEquals("", s.clearedCombat().runFirstDownName)
        assertEquals(0, s.clearedCombat().runFirstDownTick)
    }
}
