package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A seat only matters if leaving it empty loses runs.
 *
 * An idle tank used to clear every dungeon at every level: the boss hit a
 * damage dealer for exactly what it would have hit a tank for, the AI healer's
 * mana never moved, and the party's scripted damage did not care who was
 * holding anything. Three fixes answer that -- a human tank earns threat only
 * from what they cast, a boss nobody is holding hits a non-tank harder
 * (`encounters.unheldTargetDamage`), and the AI healer pays for the heal it
 * commits to rather than the part that happens to fit.
 *
 * This pins the result, not the mechanism: at the last dungeon, doing nothing
 * must cost you runs, and at every level it must cost you deaths and time.
 * The numbers are loose on purpose -- it is a floor against the seat going
 * decorative again, not a balance lock.
 */
class IdlePlayerTest {
    private val harness = PlaytestHarness()
    private val runs = 6

    private fun play(level: Int, idle: Boolean): List<PlaytestHarness.Run> {
        val data = Fixtures.data
        // The dungeon this level is actually for, as the harness picks it.
        val dungeon = data.dungeons.firstOrNull { !it.endless && level in it.levelMin..it.levelMax }
            ?: data.dungeons.last { !it.endless && it.levelMin <= level }
        return (1..runs).map { seed ->
            harness.play(PlayerClass.WARRIOR, level, dungeon.id, false, "normal", seed, idle)
        }
    }

    private fun List<PlaytestHarness.Run>.cleared() = count { it.outcome == "SUCCESS" }.toDouble() / size
    private fun List<PlaytestHarness.Run>.deaths() = sumOf { it.deaths }.toDouble() / size

    @Test
    fun `at the last dungeon, doing nothing costs runs`() {
        // Against the same seeds, not an absolute rate: what the final tier's
        // clear rate should be is a tuning question, and pinning a number here
        // would fail every time one is retuned. That idling is worse than
        // playing is not a tuning question.
        val idle = play(47, idle = true)
        val played = play(47, idle = false)
        assertTrue(
            "idling cleared ${idle.cleared() * 100}%, playing ${played.cleared() * 100}%",
            idle.cleared() <= played.cleared(),
        )
        assertTrue(
            "idling killed ${idle.deaths()} per run, playing ${played.deaths()}",
            idle.deaths() > played.deaths() + 1.0,
        )
    }

    @Test
    fun `playing beats idling, at every level`() {
        for (level in listOf(20, 34, 47)) {
            val idle = play(level, idle = true)
            val played = play(level, idle = false)
            assertTrue(
                "level $level: idling killed ${idle.deaths()}, playing killed ${played.deaths()}",
                idle.deaths() > played.deaths(),
            )
            val idleTicks = idle.filter { it.outcome == "SUCCESS" }.map { it.ticks }.average()
            val playedTicks = played.filter { it.outcome == "SUCCESS" }.map { it.ticks }.average()
            assertTrue(
                "level $level: idling cleared in $idleTicks ticks, playing in $playedTicks",
                idleTicks > playedTicks,
            )
        }
    }

    @Test
    fun `the AI healer runs out of mana in a long fight`() {
        // It is the party's whole sustain; if it never tires, nothing else the
        // party does or fails to do can matter.
        val idle = play(47, idle = true)
        assertTrue(
            "the AI healer never dropped below ${idle.minOf { it.aiHealerLowPct }}%",
            idle.all { it.aiHealerLowPct < 50.0 },
        )
    }
}
