package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Enrage, the exposed window, and the rest between pulls (encounters.json "pressure"). */
class PressureTest {
    // No ambient damage and no AI healing: only what is under test moves health.
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
    private val p = data.encounters.pressure

    private fun run(cls: PlayerClass = PlayerClass.PRIEST): GameState {
        val rng = Rng(4)
        val s = engine.newCharacter(cls, rng)
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == "deadmines" }, "normal"), rng)
    }

    private fun boss(s: GameState = run()) = s.copy(
        combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 1e9, enemyMaxHealth = 1e9,
        mechanicCooldown = 10_000,
    )

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    @Test
    fun `the boss clock only runs at the boss, and enrage ramps after it`() {
        assertEquals(0, step(run(), 5).bossTicks)
        val b = boss()
        assertEquals(5, step(b, 5).bossTicks)

        assertEquals(1.0, tick.enrageMultiplier(b.copy(bossTicks = p.enrageAfterTicks)), 0.0)
        assertEquals(1 + 100 * p.enrageRampPerTick, tick.enrageMultiplier(b.copy(bossTicks = p.enrageAfterTicks + 100)), 1e-12)
    }

    @Test
    fun `an enraged boss's debuffs hit harder`() {
        val dot = UnitDebuff(id = "d", name = "d", remainingTicks = 50, damagePerTick = 2.0, sourceAbilityId = "vc_gut_slash")
        fun taken(bossTicks: Int): Double {
            val s = boss().copy(bossTicks = bossTicks)
                .let { it.copy(party = it.party.map { u -> if (u.id == "2") u.copy(debuffs = listOf(dot)) else u }) }
            return s.unit("2")!!.health - step(s).unit("2")!!.health
        }
        val calm = taken(0)
        assertTrue(calm > 0)
        // bossTicks is advanced once before the tick's damage is dealt.
        val later = p.enrageAfterTicks + 99
        assertEquals(calm * (1 + 100 * p.enrageRampPerTick), taken(later), 1e-9)
    }

    @Test
    fun `an enraged boss's attacks hit harder`() {
        fun taken(bossTicks: Int): Double {
            val cast = EnemyCast(abilityId = "vc_ambush", name = "Ambush", targets = listOf("2"), remainingTicks = 1, totalTicks = 20)
            val s = boss().copy(bossTicks = bossTicks, enemyCast = cast)
            return s.unit("2")!!.health - step(s).unit("2")!!.health
        }
        val calm = taken(0)
        assertTrue(calm > 0)
        assertEquals(calm * (1 + 100 * p.enrageRampPerTick), taken(p.enrageAfterTicks + 99), 1e-9)
    }

    @Test
    fun `an exposed boss takes more from everyone, and the window runs out`() {
        val b = boss()
        val normal = b.enemyHealth - step(b).enemyHealth
        val exposed = b.copy(exposedTicks = 10)
        val afterExposed = step(exposed)
        assertEquals(normal * p.exposedDamageMultiplier, b.enemyHealth - afterExposed.enemyHealth, 1e-6)
        assertEquals(9, afterExposed.exposedTicks)
    }

    @Test
    fun `a kick exposes the boss`() {
        val cast = EnemyCast(abilityId = "vc_cannon", name = "Cannon", targets = listOf("1"), remainingTicks = 20, totalTicks = 30, interruptible = true)
        val mage = boss(run(PlayerClass.MAGE)).copy(enemyCast = cast)
        val kicked = engine.reduce(mage, Action.CastSpell("counterspell", null, 99.0), Rng(1))
        assertEquals(p.exposedTicks, kicked.exposedTicks)

        val ai = tick.aiKick(boss().copy(enemyCast = cast, interruptibleCasts = 2))
        assertEquals(p.exposedTicks, ai.exposedTicks)
    }

    @Test
    fun `the boss is exposed once, on reaching half health`() {
        val b = boss().copy(enemyMaxHealth = 10_000.0, enemyHealth = 5_000.0001)
        val crossed = step(b)
        assertTrue(crossed.enemyHealth <= 5_000.0)
        assertEquals(p.exposedTicks, crossed.exposedTicks)
        assertTrue(crossed.exposedAtHalf)
        // Not again.
        assertEquals(0, step(crossed.copy(exposedTicks = 0)).exposedTicks)
    }

    @Test
    fun `a cleared pull starts a rest, where the party drinks and nothing fights`() {
        val s = run()
        val killed = step(s.copy(enemyHealth = 0.001))
        assertEquals(p.restTicks, killed.restTicks)

        val tired = killed.copy(party = killed.party.map { it.copy(health = it.maxHealth * 0.5) })
            .withMe { it.copy(mana = 0.0) }
        val rested = step(tired)
        assertEquals(p.restTicks - 1, rested.restTicks)
        assertEquals(tired.enemyHealth, rested.enemyHealth, 0.0)
        for (u in rested.party) assertEquals(u.maxHealth * (0.5 + p.restHealthPerTick), u.health, 1e-9)
        assertEquals(tired.maxMana * p.restManaPerTick, rested.mana, 1e-9)

        // And nothing to hit meanwhile.
        val mage = step(run(PlayerClass.MAGE).copy(enemyHealth = 0.001))
        assertSame(mage, engine.reduce(mage, Action.CastSpell("frostbolt", null, 99.0), Rng(1)))
    }

    @Test
    fun `the boss gets a rest before it too, and its clock starts after`() {
        val lastPull = run().copy(trashPullsRemaining = 1, enemyHealth = 0.001)
        val atBoss = step(lastPull)
        assertEquals(CombatPhase.BOSS, atBoss.combatPhase)
        assertEquals(p.restTicks, atBoss.restTicks)
        assertEquals(0, step(atBoss, p.restTicks).bossTicks)
    }

    @Test
    fun `pulling early ends the rest and banks XP`() {
        val resting = run().copy(restTicks = 40)
        val pulled = engine.reduce(resting, Action.PullNow, Rng(1))
        assertEquals(0, pulled.restTicks)
        assertEquals(40 * p.earlyPullXpPerTick, pulled.earlyPullBonus, 1e-12)
        assertSame("nothing to skip", pulled, engine.reduce(pulled, Action.PullNow, Rng(1)))

        fun xp(bonus: Double): Int {
            val s = boss().copy(enemyHealth = 0.001, enemyMaxHealth = 1000.0, earlyPullBonus = bonus)
            return step(s).dungeonOutcome!!.xpGained
        }
        val plain = xp(0.0)
        assertEquals(Math.round(plain * 1.5).toDouble(), xp(0.5).toDouble(), 1.0)
    }
}
