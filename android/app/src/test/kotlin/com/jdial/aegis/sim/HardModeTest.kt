package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.enrageAfterTicks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hard mode, and what a run is worth with people in it. */
class HardModeTest {
    private val data: GameData = Fixtures.data.let { d ->
        d.with(
            balance = d.balance.copy(
                environmentalDamage = d.balance.environmentalDamage.copy(tankProcChance = 0.0, nonTankProcChance = 0.0),
                roles = d.balance.roles.copy(aiHealerHealBase = 0.0, aiHealerHealPerLevel = 0.0),
            ),
        )
    }
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)
    private val hard = data.encounters.hard
    private val deadmines = data.dungeons.first { it.id == "deadmines" }

    private fun run(level: Int, hardMode: Boolean): GameState {
        val rng = Rng(4)
        val s = engine.newCharacter(PlayerClass.MAGE, rng).withMe { it.copy(level = level) }
        return engine.reduce(s, Action.StartDungeon(deadmines, "normal", hardMode), rng)
    }

    @Test
    fun `hard mode is tougher, and an out-levelled one is synced rather than scaled`() {
        val plain = run(3, false)
        val heavy = run(3, true)
        assertTrue(heavy.hardMode)
        assertEquals(plain.enemyMaxHealth * hard.healthMultiplier, heavy.enemyMaxHealth, 1e-9)

        // Ten levels above the range: level sync plays it at one over, so the
        // step covers exactly that one level rather than ten. Out-levelling is
        // handled by making you the dungeon's level, not the dungeon yours.
        val over = run(deadmines.levelMax + 10, true)
        assertEquals(syncCap(deadmines.levelMax), over.me.level)
        val step = 1 + (syncCap(deadmines.levelMax) - deadmines.levelMax) * hard.overLevelStep
        assertEquals(plain.enemyMaxHealth * hard.healthMultiplier * step, over.enemyMaxHealth, 1e-9)
        assertEquals(hard.damageMultiplier * step, tick.hardDamage(over), 1e-9)
        assertEquals(1.0, tick.hardDamage(plain), 0.0)
    }

    @Test
    fun `a hard boss enrages sooner`() {
        val after = data.encounters.enrageAfterTicks("deadmines")
        val hardAfter = (after * hard.enrageScale).toInt()
        val heavy = run(3, true).copy(bossTicks = hardAfter + 100)
        assertTrue("enraged by ${heavy.bossTicks}", tick.enrageMultiplier(heavy) > hard.damageMultiplier)
        // Normally it would still be quiet at that point.
        assertEquals(1.0, tick.enrageMultiplier(run(3, false).copy(bossTicks = hardAfter + 100)), 0.0)
    }

    @Test
    fun `a clear pays more for hard mode, and more again for company`() {
        val alone = run(3, false)
        assertEquals(1.0, tick.runBonus(alone), 0.0)
        assertEquals(hard.xpMultiplier, tick.runBonus(run(3, true)), 0.0)

        // A second person in the party, as the queue seats one.
        val other = alone.participants.getValue(alone.localUnitId).copy(unitId = "1", isHuman = true)
        val group = alone.copy(participants = alone.participants + ("1" to other))
        assertEquals(data.encounters.groupXpMultiplier, tick.runBonus(group), 0.0)
        assertEquals(
            data.encounters.groupXpMultiplier * hard.xpMultiplier,
            tick.runBonus(group.copy(hardMode = true)),
            1e-9,
        )
    }

    @Test
    fun `the XP a run pays follows the bonus`() {
        fun xp(s: GameState): Int {
            val done = s.copy(
                combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 0.001, enemyMaxHealth = 1000.0,
            )
            return engine.reduce(done, Action.Tick(1), Rng(5)).dungeonOutcome!!.xpGained
        }
        val alone = xp(run(3, false))
        val heavy = xp(run(3, true))
        assertEquals(Math.round(alone * hard.xpMultiplier).toDouble(), heavy.toDouble(), 1.0)
    }
}
