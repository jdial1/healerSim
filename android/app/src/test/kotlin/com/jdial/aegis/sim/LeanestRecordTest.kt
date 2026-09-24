package com.jdial.aegis.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Two records that pull against each other, and no score that combines them.
 *
 * Firing everything is fast and wasteful; waiting is lean and slow. Folding the
 * two into one number would name a best clear, and naming a best clear is the
 * grade this soul refuses. So a run can set the time record, the waste record,
 * both or neither, and the card shows both.
 */
class LeanestRecordTest {
    private fun clear(dungeon: String = "deadmines", ticks: Int, waste: Double) = DungeonOutcome(
        kind = DungeonOutcomeKind.SUCCESS,
        dungeonId = dungeon,
        xpGained = 0,
        stats = RunStats(wastePct = waste),
        clearTicks = ticks,
    )

    @Test
    fun `nought percent waste is a reading, not an empty record`() {
        // The reason this field starts at -1 and not at 0 the way bestTicks does.
        val (records, _) = emptyMap<String, DungeonRecord>().withRun(clear(ticks = 600, waste = 0.0))
        assertEquals(0.0, records.getValue("deadmines").lowestWastePct, 0.0)

        // And a later worse run does not overwrite it.
        val (after, marks) = records.withRun(clear(ticks = 600, waste = 40.0))
        assertEquals(0.0, after.getValue("deadmines").lowestWastePct, 0.0)
        assertTrue("40% is not leaner than 0%", !marks.leanest)
    }

    @Test
    fun `the first clear sets the record without claiming a mark`() {
        val (_, marks) = emptyMap<String, DungeonRecord>().withRun(clear(ticks = 600, waste = 55.0))
        assertTrue("a first clear has nothing to beat", !marks.leanest)
        assertTrue("and it is the first clear", marks.firstClear)
    }

    @Test
    fun `a slower run can still be the leaner one`() {
        var records = emptyMap<String, DungeonRecord>()
        records = records.withRun(clear(ticks = 500, waste = 70.0)).first

        // Slower and leaner: takes the waste record and not the time record.
        val (after, marks) = records.withRun(clear(ticks = 900, waste = 30.0))
        assertTrue("the leaner run was not credited", marks.leanest)
        assertTrue("a slower run must not take the time record", !marks.newBest)
        assertEquals(500, after.getValue("deadmines").bestTicks)
        assertEquals(30.0, after.getValue("deadmines").lowestWastePct, 0.0)
    }

    @Test
    fun `hard mode keeps its own waste record`() {
        var records = emptyMap<String, DungeonRecord>()
        records = records.withRun(clear(ticks = 600, waste = 20.0)).first
        val hard = clear(ticks = 600, waste = 80.0).copy(hardMode = true)
        records = records.withRun(hard).first
        assertEquals(20.0, records.getValue("deadmines").lowestWastePct, 0.0)
        assertEquals(80.0, records.getValue("deadmines+hard").lowestWastePct, 0.0)
    }
}
