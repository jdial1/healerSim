package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Boss attacks that wind up before they land.
 *
 * The world is made quiet so only the cast moves anything: no ambient damage,
 * no AI healing, no party damage to the boss.
 */
class EnemyCastTest {
    private val quiet: GameData = Fixtures.data.let { d ->
        d.with(
            balance = d.balance.copy(
                environmentalDamage = d.balance.environmentalDamage.copy(tankProcChance = 0.0, nonTankProcChance = 0.0),
                roles = d.balance.roles.copy(aiHealerHealBase = 0.0, aiHealerHealPerLevel = 0.0),
            ),
        )
    }
    private val engine = Engine(quiet)
    private val deadmines = quiet.dungeons.first { it.id == "deadmines" }
    private val ambush = deadmines.bossCombat!!.attackTemplates.first { it.abilityId == "vc_ambush" }

    /** A warrior at the Deadmines boss, whose next mechanic is Ambush, due now. */
    private fun atAmbush(data: GameData = quiet): GameState {
        val e = Engine(data)
        val rng = Rng(8)
        val s = e.reduce(e.newCharacter(PlayerClass.WARRIOR, rng), Action.StartDungeon(data.dungeons.first { it.id == "deadmines" }, "normal"), rng)
        val kinds = listOf("debuff", "buff", "attack")
        return s.copy(
            combatPhase = CombatPhase.BOSS,
            enemyHealth = 1e9,
            enemyMaxHealth = 1e9,
            mechanicCooldown = 1,
            mechanicOrdinal = kinds.indexOf("attack"),
            runDpsJitter = 0.0,
        )
    }

    private fun tick(s: GameState, rng: Rng, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), rng) }
        return out
    }

    private fun health(s: GameState) = s.party.associate { it.id to it.health }

    @Test
    fun `the content gives the big hits a wind-up`() {
        assertTrue(ambush.castTicks > 0)
    }

    @Test
    fun `a cast names its victims, holds its hit, then lands on them`() {
        val rng = Rng(3)
        val started = tick(atAmbush(), rng)
        val cast = assertNotNull(started.enemyCast).let { started.enemyCast!! }
        assertEquals(ambush.castTicks, cast.remainingTicks)
        assertTrue(cast.targets.isNotEmpty())
        val before = health(started)

        // Everything up to the last tick of the wind-up: nobody is hit.
        val waiting = tick(started, rng, ambush.castTicks - 1)
        assertEquals(before, health(waiting))
        assertEquals(1, waiting.enemyCast!!.remainingTicks)

        val landed = tick(waiting, rng)
        assertNull(landed.enemyCast)
        val after = health(landed)
        for ((id, hp) in before) {
            if (id in cast.targets) assertTrue("$id should be hit", after.getValue(id) < hp)
            else assertEquals("$id is not a target", hp, after.getValue(id), 0.0)
        }
    }

    @Test
    fun `a victim that dies during the wind-up takes nothing, and nobody else does`() {
        val rng = Rng(3)
        val started = tick(atAmbush(), rng)
        val victim = started.enemyCast!!.targets.first()
        val dead = started.copy(party = started.party.map { if (it.id == victim) it.copy(health = 0.0) else it })
        val landed = tick(dead, rng, ambush.castTicks)
        assertNull(landed.enemyCast)
        val others = health(dead).filterKeys { it != victim }
        assertEquals(others, health(landed).filterKeys { it != victim })
    }

    @Test
    fun `a defensive raised during the wind-up softens the hit`() {
        fun damageTaken(withWall: Boolean): Double {
            val rng = Rng(3)
            var s = tick(atAmbush(), rng)
            // Aim the cast at the warrior, whose wall it is.
            s = s.copy(enemyCast = s.enemyCast!!.copy(targets = listOf(s.localUnitId)))
            if (withWall) s = engine.reduce(s, Action.CastSpell("shield_wall", null, 99.0), rng)
            val before = s.unit(s.localUnitId)!!.health
            s = tick(s, rng, ambush.castTicks)
            return before - s.unit(s.localUnitId)!!.health
        }
        val open = damageTaken(false)
        val walled = damageTaken(true)
        val wall = Fixtures.data.spell("shield_wall")!!.damageReduction!!
        assertTrue(open > 0)
        assertEquals(open * (1 - wall), walled, 1e-9)
    }

    @Test
    fun `winding up draws exactly what an instant hit draws`() {
        // The targets are chosen at the same moment from the same stream, so
        // everything after the cast starts sees the same rng.
        val instant = Fixtures.data.withoutCasts().let { d ->
            d.with(balance = quiet.balance)
        }
        val a = Rng(5)
        val b = Rng(5)
        Engine(quiet).reduce(atAmbush(), Action.Tick(1), a)
        Engine(instant).reduce(atAmbush(instant), Action.Tick(1), b)
        repeat(5) { assertEquals(a.nextDouble(), b.nextDouble(), 0.0) }
    }

    @Test
    fun `the rotation waits while the boss is casting`() {
        val rng = Rng(3)
        val started = tick(atAmbush(), rng)
        val later = tick(started, rng, 5)
        assertEquals(started.mechanicCooldown, later.mechanicCooldown)
        assertEquals(started.mechanicOrdinal, later.mechanicOrdinal)
    }

    @Test
    fun `leaving the boss clears the wind-up`() {
        val rng = Rng(3)
        val started = tick(atAmbush(), rng)
        assertNull(started.endedRun().enemyCast)
        assertNull(started.clearedCombat().enemyCast)
    }
}
