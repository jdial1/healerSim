package com.jdial.aegis.ui

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.*
import com.jdial.aegis.ui.theme.Vital
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The threat meter the party frames draw.
 *
 * Every assertion here is really the same one: the denominator is the aggro
 * holder's threat and never the reader's own, which is what makes a tank's
 * cast move four bars instead of failing to move one.
 */
class ThreatMeterTest {
    private val engine = Engine(Fixtures.data)
    private val margin = Fixtures.data.balance.threat.overtakeMultiplier

    private val fight = engine.reduce(
        engine.newCharacter(PlayerClass.WARRIOR, Rng(4)),
        Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"),
        Rng(4),
    )
    private val tank = fight.party.first { it.role == UnitRole.TANK }
    private val dps = fight.party.first { it.role == UnitRole.DPS }

    private fun table(vararg threats: Pair<String, Double>): GameState {
        val map = threats.toMap()
        return fight.copy(
            party = fight.party.map { it.copy(threat = map[it.id] ?: 0.0) },
            enemyTargetId = threats.first().first,
        )
    }

    @Test
    fun `the aggro holder is a hundred percent and everyone else is a share of it`() {
        val r = threatReadouts(table(tank.id to 1000.0, dps.id to 800.0), margin)
        assertEquals(100, r[tank.id]?.pct)
        assertTrue(r[tank.id]?.hasAggro == true)
        assertEquals(80, r[dps.id]?.pct)
        assertTrue(r[dps.id]?.hasAggro == false)
    }

    @Test
    fun `a tank's own cast moves every other bar`() {
        val before = threatReadouts(table(tank.id to 1000.0, dps.id to 800.0), margin)
        val after = threatReadouts(table(tank.id to 1400.0, dps.id to 800.0), margin)
        // The complaint this exists to answer: the tank acts, the numbers move.
        assertEquals(80, before[dps.id]?.pct)
        assertEquals(57, after[dps.id]?.pct)
        // And the tank's own reading is the one thing that stays put, because a
        // bar that can only ever say 100% is not where a tank should be looking.
        assertEquals(before[tank.id]?.pct, after[tank.id]?.pct)
    }

    @Test
    fun `the pull line is the margin the engine enforces`() {
        val r = threatReadouts(table(tank.id to 1000.0, dps.id to 500.0), margin)
        val dpsBar = r[dps.id]!!
        assertEquals((1.0 / margin).toFloat(), dpsBar.pullLine, 1e-6f)
        assertTrue(!dpsBar.closing)

        // Level with the holder: the engine has not switched yet -- it wants
        // the whole margin -- and the bar has to have said so before it does.
        val hot = threatReadouts(table(tank.id to 1000.0, dps.id to 1000.0), margin)
        assertTrue(hot[dps.id]!!.closing)
    }

    @Test
    fun `nothing is drawn over an empty table`() {
        assertEquals(emptyMap<String, ThreatReadout>(), threatReadouts(fight.copy(enemyTargetId = null), margin))
        assertEquals(emptyMap<String, ThreatReadout>(), threatReadouts(table(tank.id to 0.0), margin))
    }

    @Test
    fun `the dead hold no place on the table`() {
        val s = table(tank.id to 1000.0, dps.id to 900.0)
            .let { st -> st.copy(party = st.party.map { if (it.id == dps.id) it.copy(health = 0.0) else it }) }
        assertTrue(threatReadouts(s, margin)[dps.id] == null)
    }

    @Test
    fun `a tank holding is calm and a rival closing is not`() {
        val r = threatReadouts(table(tank.id to 1000.0, dps.id to 990.0), margin)
        assertEquals(
            Vital.shield,
            threatColor(r[tank.id]!!, playerWantsAggro = true, unitIsTank = true),
        )
        assertEquals(
            Vital.critical,
            threatColor(r[dps.id]!!, playerWantsAggro = true, unitIsTank = false),
        )
    }
}
