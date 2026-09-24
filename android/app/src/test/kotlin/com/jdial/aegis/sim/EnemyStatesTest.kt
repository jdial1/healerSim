package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Reflect, shield, frenzy, heal absorb, trash rotations, bombs, add waves, dungeon rules. */
class EnemyStatesTest {
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
    private val enc = data.encounters

    private fun run(cls: PlayerClass, dungeon: String = "deadmines", level: Int = 1): GameState {
        val rng = Rng(4)
        val s = engine.newCharacter(cls, rng).withMe { it.copy(level = level, unlockedSpells = it.unlockedSpells + data.grantsFor(cls, level)) }
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == dungeon }, "normal"), rng)
            .let { it.copy(party = it.party.map { u -> u.copy(maxHealth = 1e6, health = 1e6) }) }
    }

    private fun boss(s: GameState) = s.copy(
        combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 1e9, enemyMaxHealth = 1e9, mechanicCooldown = 10_000,
    )

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    private fun cast(s: GameState, id: String, target: String? = null) = engine.reduce(s, Action.CastSpell(id, target, 99.0), Rng(1))

    @Test
    fun `a landed cast puts the enemy in its state, a kicked one does not`() {
        val b = boss(run(PlayerClass.MAGE, "sunken_temple", 25))
        val ward = EnemyCast("eranikus_ward", "Barrier", targets = listOf("1"), remainingTicks = 1, totalTicks = 25, interruptible = true)
        val landed = step(b.copy(enemyCast = ward))
        assertEquals(STATE_SHIELD, landed.enemyState)
        assertTrue(landed.enemyStateTicks > 0)
        val kicked = cast(b.copy(enemyCast = ward.copy(remainingTicks = 10)), "counterspell")
        assertNull(step(kicked).enemyState)
    }

    @Test
    fun `a reflect sends a player's damage back, and the AI holds its fire`() {
        val mage = boss(run(PlayerClass.MAGE)).copy(enemyState = STATE_REFLECT, enemyStateTicks = 30)
        val shot = cast(mage, "frostbolt")
        val dealt = shot.me.pendingEnemyDamage
        assertTrue(dealt > 0)
        val after = step(shot)
        assertEquals(mage.enemyHealth, after.enemyHealth, 0.0)
        assertEquals(1e6 - dealt, after.unit(mage.localUnitId)!!.health, 1e-9)
        assertEquals(29, after.enemyStateTicks)
        // Holding still costs nothing.
        assertEquals(1e6, step(mage).unit(mage.localUnitId)!!.health, 0.0)
        // And it wears off.
        assertNull(step(mage.copy(enemyStateTicks = 1)).enemyState)
    }

    @Test
    fun `a shield takes nothing until a kick exposes it`() {
        val mage = boss(run(PlayerClass.MAGE)).copy(enemyState = STATE_SHIELD, enemyStateTicks = 80)
        assertEquals(mage.enemyHealth, step(cast(mage, "frostbolt")).enemyHealth, 0.0)
        val opened = step(mage.copy(exposedTicks = 5))
        assertNull(opened.enemyState)
        assertTrue(opened.enemyHealth < mage.enemyHealth)
    }

    @Test
    fun `a frenzy makes the enemy hit harder`() {
        val b = boss(run(PlayerClass.MAGE))
        assertEquals(1.0, tick.enrageMultiplier(b), 0.0)
        assertEquals(enc.frenzyDamageMultiplier, tick.enrageMultiplier(b.copy(enemyState = STATE_FRENZY, enemyStateTicks = 5)), 0.0)
        assertEquals(1.0, tick.enrageMultiplier(b.copy(enemyState = STATE_FRENZY, enemyStateTicks = 0)), 0.0)
    }

    @Test
    fun `a heal absorb eats healing until it is spent, or dispelled`() {
        assertTrue(enc.mechanics.getValue("rfd_boneflay").absorb > 0)
        val absorb = 10.0
        val priest = run(PlayerClass.PRIEST, level = 10)
        val flayed = UnitDebuff("bf", "Bone Flay", 300, 0.0, sourceAbilityId = "rfd_boneflay", dispellable = true, absorbLeft = absorb)
        val hurt = priest.copy(party = priest.party.map {
            if (it.id == "1") it.copy(health = 1e6 - 5_000, debuffs = listOf(flayed)) else it
        })
        val healed = cast(hurt, "flash_heal", "1")
        val gained = healed.unit("1")!!.health - hurt.unit("1")!!.health
        val raw = cast(hurt.copy(party = hurt.party.map { it.copy(debuffs = emptyList()) }), "flash_heal", "1").unit("1")!!.health -
            hurt.unit("1")!!.health
        assertTrue(raw > absorb)
        assertEquals(raw - absorb, gained, 1e-9)
        assertTrue("spent, and gone", healed.unit("1")!!.debuffs.isEmpty())

        // A smaller heal only wears it down.
        val big = hurt.copy(party = hurt.party.map { if (it.id == "1") it.copy(debuffs = listOf(flayed.copy(absorbLeft = 1e5))) else it })
        val worn = cast(big, "flash_heal", "1")
        assertEquals(big.unit("1")!!.health, worn.unit("1")!!.health, 1e-9)
        assertEquals(1e5 - raw, worn.unit("1")!!.debuffs.single().absorbLeft, 1e-9)

        // Cleanse takes it off.
        assertTrue(cast(big, "cleanse", "1").unit("1")!!.debuffs.isEmpty())
    }

    @Test
    fun `Razorfen's Bone Flay lands with its absorb`() {
        val rfd = run(PlayerClass.PRIEST, "razorfen_downs", 16)
            .copy(trashPullsRemaining = 2, enemyHealth = 1e9, enemyMaxHealth = 1e9, mechanicCooldown = 1)
        val flayed = step(rfd).party.flatMap { it.debuffs }.single { it.sourceAbilityId == "rfd_boneflay" }
        assertEquals(enc.mechanics.getValue("rfd_boneflay").absorb, flayed.absorbLeft, 0.0)
    }

    @Test
    fun `a trash pull with a rotation of its own uses it, after a beat`() {
        // A human healer, so the bleed is theirs to dispel rather than the AI's.
        val sfk = run(PlayerClass.PRIEST, "shadowfang_keep", 4)
        val beat = tick.firstMechanicIn("shadowfang_keep", 0)
        assertTrue(beat > 0)
        assertEquals(beat, sfk.mechanicCooldown)
        val bitten = step(sfk.copy(enemyHealth = 1e9, enemyMaxHealth = 1e9), beat)
        assertTrue(bitten.party.any { u -> u.debuffs.any { it.sourceAbilityId == "sfk_bleed" } })

        // A plain pull fights as trash always did: nothing.
        val plain = run(PlayerClass.MAGE).copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
        assertTrue(step(plain, 100).party.all { it.debuffs.isEmpty() })
    }

    @Test
    fun `a bomb goes off on everyone unless it dies first`() {
        val base = run(PlayerClass.MAGE).copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
        val t = AddTemplate(kind = AddTemplate.BOMB, name = "Keg", health = 1.0, blast = 30.0)
        val keg = tick.spawnAdds(listOf(t), 1e9, "k").single()
        assertEquals(enc.addRules.bombFuseTicks, keg.timer)
        val boom = step(base.copy(adds = listOf(keg.copy(timer = 1))))
        assertTrue(boom.adds.isEmpty())
        for (u in boom.party) assertEquals(1e6 - 30.0, u.health, 1e-9)
        val defused = step(base.copy(adds = listOf(keg.copy(timer = 1, health = 0.0))))
        for (u in defused.party) assertEquals(1e6, u.health, 0.0)
    }

    @Test
    fun `a boss calls its add waves one at a time`() {
        val waves = enc.bosses.getValue("stratholme").adds
        assertEquals(3, waves.size)
        var s = boss(run(PlayerClass.MAGE, "stratholme", 34)).copy(enemyMaxHealth = 1e6, enemyHealth = 1e6 * waves[0].atHealth + 0.001)
        s = step(s)
        assertEquals(1, s.bossAddWaves)
        assertEquals(waves[0].spawn.size, s.adds.size)
        s = step(s.copy(enemyHealth = 1e6 * waves[1].atHealth + 0.001))
        assertEquals(2, s.bossAddWaves)
    }

    @Test
    fun `some dungeons have no rests`() {
        val zf = run(PlayerClass.MAGE, "zul_farrak", 19)
        assertEquals(0, step(zf.copy(enemyHealth = 0.001)).restTicks)
        val dm = run(PlayerClass.MAGE)
        assertEquals(enc.pressure.restTicks, step(dm.copy(enemyHealth = 0.001)).restTicks)
    }

    @Test
    fun `every dungeon has something to learn on its trash`() {
        val core = data.dungeons.filter { !it.endless }.map { it.id }
        val bare = core.filter { id ->
            enc.trash[id].orEmpty().none { it.adds.isNotEmpty() || it.combat != null }
        }
        assertEquals(emptyList<String>(), bare)
    }
}
