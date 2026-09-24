package com.jdial.aegis.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The seats the player does not hold have to be wrong in ways the player can
 * feel and name.
 *
 * The AI healer got judgment limits first, which fixed the tank and damage
 * seats. It left the *healer* -- the deepest seat in the game -- playing beside
 * two teammates that were limited only by throughput: the AI tank taunted on the
 * frame the boss turned, and an AI damage dealer earned a fixed share of the
 * scripted damage in threat and so was incapable of pulling. Neither could make
 * a mistake, so neither left a hole to fill.
 */
class FalliblePartyTest {
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)
    private val cfg = Fixtures.data.balance.roles

    private fun unit(id: String, role: UnitRole, threat: Double = 0.0) =
        Unit(id = id, name = "u$id", role = role, level = 20, health = 100.0, maxHealth = 100.0, threat = threat)

    /** A healer's run: the player heals, the AI holds and deals. */
    private fun healerRun(enemyOn: String) = GameState(
        participants = mapOf(PLAYER_UNIT_ID to Participant(PLAYER_UNIT_ID, role = UnitRole.HEALER)),
        localUnitId = PLAYER_UNIT_ID,
        party = listOf(
            unit("1", UnitRole.TANK, threat = 100.0),
            unit("2", UnitRole.DPS, threat = 80.0),
            unit("3", UnitRole.DPS, threat = 80.0),
            unit(PLAYER_UNIT_ID, UnitRole.HEALER),
        ),
        enemyTargetId = enemyOn,
        isCombatActive = true,
    )

    @Test
    fun `the AI tank does not taunt on the tick the enemy turns`() {
        assertTrue("this test only means anything with a delay", cfg.aiTankNoticeTicks > 0)
        // Off the tank, cooldown ready, but it has only just happened.
        var s = healerRun(enemyOn = "2").copy(aiTauntCooldown = 0)
        s = tick.aiTankTaunt(s)
        assertEquals("taunted instantly", "2", s.enemyTargetId)
        assertEquals(1, s.aiTankOffTankTicks)
    }

    @Test
    fun `the AI tank taunts once it has noticed`() {
        var s = healerRun(enemyOn = "2").copy(aiTauntCooldown = 0)
        // One tick past the notice window.
        repeat(cfg.aiTankNoticeTicks + 1) { s = tick.aiTankTaunt(s) }
        assertEquals("never took it back", "1", s.enemyTargetId)
        assertEquals("the clock resets with the taunt", 0, s.aiTankOffTankTicks)
    }

    @Test
    fun `the notice clock is since it turned, not a slice of the tick count`() {
        // On the tank: nothing accumulates, however long the fight runs.
        var s = healerRun(enemyOn = "1").copy(aiTauntCooldown = 0, combatElapsedTicks = 997)
        repeat(20) { s = tick.aiTankTaunt(s) }
        assertEquals(0, s.aiTankOffTankTicks)
    }

    @Test
    fun `an AI damage dealer overreaches, and only one of them does`() {
        assertTrue("this test only means anything with greed on", cfg.aiDpsGreedEveryTicks > 0)
        val s = healerRun(enemyOn = "1")

        // Never in the first cycle: there has to be a threat table before there
        // is anything to overtake.
        assertTrue(
            "greedy before the tank had built anything",
            tick.aiDpsGreed(s.copy(combatElapsedTicks = 0), 100.0).isEmpty(),
        )

        // Inside a window: exactly one AI damage dealer is credited extra.
        val greedy = tick.aiDpsGreed(
            s.copy(combatElapsedTicks = cfg.aiDpsGreedEveryTicks),
            scriptedDamage = 100.0,
        )
        assertEquals("one seat overreaches, not the whole party", 1, greedy.size)
        assertTrue("the extra threat is positive", greedy.values.first() > 0)
        assertTrue("it is a damage dealer", greedy.keys.first() in listOf("2", "3"))

        // Outside it: nothing.
        val calm = s.copy(combatElapsedTicks = cfg.aiDpsGreedEveryTicks + cfg.aiDpsGreedTicks + 1)
        assertTrue("greedy outside its window", tick.aiDpsGreed(calm, 100.0).isEmpty())
    }

    @Test
    fun `greed is deterministic and never touches a human seat`() {
        val s = healerRun(enemyOn = "1")
        val at = cfg.aiDpsGreedEveryTicks
        val once = tick.aiDpsGreed(s.copy(combatElapsedTicks = at), 100.0)
        val twice = tick.aiDpsGreed(s.copy(combatElapsedTicks = at), 100.0)
        assertEquals("the same tick must give the same answer", once, twice)

        // A run where both damage seats are people: nobody's threat is forged.
        val allHuman = s.copy(
            participants = s.participants +
                mapOf(
                    "2" to Participant("2", role = UnitRole.DPS, isHuman = true),
                    "3" to Participant("3", role = UnitRole.DPS, isHuman = true),
                ),
        )
        assertTrue(
            "a human damage dealer was credited threat it did not earn",
            tick.aiDpsGreed(allHuman.copy(combatElapsedTicks = at), 100.0).isEmpty(),
        )
    }
}
