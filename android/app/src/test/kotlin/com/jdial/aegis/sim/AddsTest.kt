package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.ui.enemyLooks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Menders, runners and boss adds: the enemies a damage dealer has to choose to hit. */
class AddsTest {
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
    private val rules = data.encounters.addRules

    private fun run(cls: PlayerClass, dungeon: String = "deadmines"): GameState {
        val rng = Rng(4)
        val s = engine.newCharacter(cls, rng)
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == dungeon }, "normal"), rng)
    }

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    private fun GameState.with(vararg adds: EnemyAdd) = copy(adds = adds.toList())

    private fun template(kind: String, hp: Double = 0.5, heal: Double = 0.0, dmg: Double = 0.0) =
        AddTemplate(kind = kind, name = kind, health = hp, healFraction = heal, damagePerTick = dmg)

    private fun one(s: GameState, t: AddTemplate) = tick.spawnAdds(listOf(t), s.enemyMaxHealth, "t").single()

    @Test
    fun `every add has a sprite`() {
        val all = data.encounters.trash.values.flatten().flatMap { it.adds } +
            data.encounters.bosses.values.flatMap { it.adds }.flatMap { it.spawn }
        assertTrue(all.isNotEmpty())
        assertEquals(emptyList<String>(), all.map { it.looksLike }.filter { it !in enemyLooks(data) })
    }

    @Test
    fun `a pull brings the adds the content gives it`() {
        val first = run(PlayerClass.MAGE, "scarlet_monastery")
        assertEquals(listOf(AddTemplate.MENDER), first.adds.map { it.kind })
        // Deadmines' runner is on the second pull.
        val deadmines = run(PlayerClass.MAGE)
        assertTrue(deadmines.adds.isEmpty())
        val second = step(deadmines.copy(enemyHealth = 0.001).with())
        assertEquals(listOf(AddTemplate.RUNNER), second.adds.map { it.kind })
    }

    @Test
    fun `a damage dealer hits the add they chose, and nothing else`() {
        val base = run(PlayerClass.MAGE)
        val s = base.with(one(base, template(AddTemplate.ADD)))
        val add = s.adds.single()
        val cast = engine.reduce(s, Action.CastSpell("frostbolt", add.id, 99.0), Rng(1))
        val dealt = cast.me.pendingAddDamage.getValue(add.id)
        assertTrue(dealt > 0)
        assertEquals(0.0, cast.me.pendingEnemyDamage, 0.0)

        // Aimed at nothing in particular, it is the main enemy's.
        val plain = engine.reduce(s, Action.CastSpell("frostbolt", null, 99.0), Rng(1))
        assertTrue(plain.me.pendingEnemyDamage > 0)
        assertTrue(plain.me.pendingAddDamage.isEmpty())

        // It lands on the add when the tick resolves, and counts as the player's damage.
        val after = step(cast)
        assertTrue(after.adds.single().health < add.health - dealt * 0.99)
        assertTrue(after.runDamageDealt >= dealt)
    }

    @Test
    fun `a mender heals its pack unless it is kicked`() {
        val base = run(PlayerClass.MAGE).copy(enemyHealth = 400.0)
        val mender = one(base, template(AddTemplate.MENDER, heal = 0.2)).copy(timer = 1)
        // Starts casting...
        val casting = step(base.with(mender))
        assertTrue(casting.adds.single().casting)
        // ...and the heal lands when the cast runs out.
        val landing = casting.copy(adds = listOf(casting.adds.single().copy(timer = 1)))
        val healed = step(landing)
        assertFalse(healed.adds.single().casting)
        assertTrue("healed to ${healed.enemyHealth}", healed.enemyHealth > landing.enemyHealth + mender.healAmount * 0.5)

        // A kick stops it, aimed or not.
        val kicked = engine.reduce(casting, Action.CastSpell("counterspell", null, 99.0), Rng(1))
        assertFalse(kicked.adds.single().casting)
        assertEquals(rules.menderEveryTicks, kicked.adds.single().timer)
    }

    @Test
    fun `a runner flees when hurt and, left alone, brings another pull`() {
        val base = run(PlayerClass.MAGE)
        val runner = one(base, template(AddTemplate.RUNNER))
        val hurt = base.with(runner.copy(health = runner.maxHealth * (rules.runnerFleeBelow - 0.05)))
        val fleeing = step(hurt)
        assertTrue(fleeing.adds.single().fleeing)
        assertEquals(rules.runnerEscapeTicks, fleeing.adds.single().timer)

        val gone = step(fleeing.copy(adds = listOf(fleeing.adds.single().copy(timer = 1, health = 1e9, maxHealth = 1e9))))
        assertTrue(gone.adds.isEmpty())
        assertEquals(1, gone.extraPulls)

        // The extra pull is fought, then the planned ones carry on.
        val cleared = step(gone.copy(enemyHealth = 0.001))
        assertEquals(0, cleared.extraPulls)
        assertEquals(gone.trashPullsRemaining, cleared.trashPullsRemaining)
    }

    @Test
    fun `a pull is not over while its adds stand, and then the AI turns on them`() {
        val base = run(PlayerClass.MAGE)
        val s = base.copy(enemyHealth = 0.001).with(one(base, template(AddTemplate.ADD, hp = 50.0)))
        val after = step(s)
        assertEquals(base.trashPullsRemaining, after.trashPullsRemaining)
        assertEquals(0.0, after.enemyHealth, 0.0)
        assertTrue(after.adds.single().health < s.adds.single().health)
    }

    @Test
    fun `without a human damage dealer the AI kills adds first, with one it mostly leaves them`() {
        fun share(cls: PlayerClass): Double {
            val base = run(cls).copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
            val s = base.with(one(base, template(AddTemplate.ADD)).copy(health = 1e6, maxHealth = 1e6))
            val after = step(s)
            val toAdd = s.adds.single().health - after.adds.single().health
            val toMain = s.enemyHealth - after.enemyHealth
            return toAdd / (toAdd + toMain)
        }
        assertEquals(1.0, share(PlayerClass.PRIEST), 1e-9)
        assertEquals(rules.aiAddShareWithHumanDps, share(PlayerClass.MAGE), 1e-9)
    }

    @Test
    fun `a boss calls its adds once, they hit the healer, and they go with it`() {
        val base = run(PlayerClass.MAGE)
        val boss = base.copy(
            combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, mechanicCooldown = 10_000,
            enemyMaxHealth = 10_000.0, enemyHealth = 5_000.0001,
            party = base.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
        )
        val called = step(boss)
        val spawn = data.encounters.bosses.getValue("deadmines").adds.first().spawn
        assertEquals(spawn.size, called.adds.size)
        assertEquals(1, called.bossAddWaves)
        assertEquals(spawn.size, step(called).adds.size)

        val healer = called.party.first { it.role == UnitRole.HEALER }.id
        val hit = step(called)
        assertTrue(hit.unit(healer)!!.health < called.unit(healer)!!.health)

        val dead = step(called.copy(enemyHealth = 0.001))
        assertTrue(dead.adds.isEmpty())
        assertNull(dead.currentDungeon)
    }

    @Test
    fun `pulling early brings the next pack in beside this one`() {
        val killed = step(run(PlayerClass.MAGE).copy(enemyHealth = 0.001))
        assertTrue(killed.restTicks > 0)
        val before = killed.trashPullsRemaining
        val rushed = engine.reduce(killed, Action.PullNow, Rng(1))
        assertEquals(0, rushed.restTicks)
        assertEquals(before - 1, rushed.trashPullsRemaining)
        val pack = rushed.adds.single { it.kind == AddTemplate.PACK }
        assertEquals(killed.enemyMaxHealth, pack.maxHealth, 0.0)
        // It brings its own pull's adds too (Deadmines' third pull: a powder keg).
        val third = data.encounters.trash.getValue("deadmines")[2].adds.size
        assertEquals(killed.adds.size + 1 + third, rushed.adds.size)

        // Both have to fall, and then the pull after the rushed one is next.
        val mainDown = step(rushed.copy(enemyHealth = 0.001))
        assertEquals(rushed.trashPullsRemaining, mainDown.trashPullsRemaining)
        val allDown = step(mainDown.copy(adds = emptyList()))
        assertEquals(rushed.trashPullsRemaining - 1, allDown.trashPullsRemaining)
    }

    @Test
    fun `the boss never comes early`() {
        val lastTrash = run(PlayerClass.MAGE).copy(trashPullsRemaining = 1, restTicks = 30)
        val rushed = engine.reduce(lastTrash, Action.PullNow, Rng(1))
        assertEquals(1, rushed.trashPullsRemaining)
        assertTrue(rushed.adds.none { it.kind == AddTemplate.PACK })
        assertEquals(0, rushed.restTicks)
    }

    @Test
    fun `a rushed pack doubles the trash damage while it stands`() {
        val loud = data.with(
            balance = data.balance.copy(
                environmentalDamage = data.balance.environmentalDamage.copy(
                    tankProcChance = 1.0, nonTankProcChance = 1.0, ambientChipEveryTicks = 1,
                ),
            ),
        )
        val e = Engine(loud)
        val rng = Rng(4)
        val start = e.reduce(e.newCharacter(PlayerClass.MAGE, rng), Action.StartDungeon(loud.dungeons.first(), "normal"), rng)
            .let { it.copy(enemyHealth = 1e9, enemyMaxHealth = 1e9, party = it.party.map { u -> u.copy(maxHealth = 1e6, health = 1e6) }) }
        val pack = EnemyAdd("pack-x", AddTemplate.PACK, "Defias Miner", "Defias Miner", 1e9, 1e9)
        fun taken(s: GameState) = e.reduce(s, Action.Tick(1), Rng(9)).party.sumOf { 1e6 - it.health }
        val calm = taken(start)
        assertTrue(calm > 0)
        assertEquals(calm * 2, taken(start.copy(adds = listOf(pack))), 1e-6)
    }

    @Test
    fun `a kickable cast lands hard only when a kick was ready`() {
        fun hit(kickOnCooldown: Boolean = false, human: Boolean = true): Double {
            val base = run(PlayerClass.MAGE).let { it.copy(
                combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 1e9, enemyMaxHealth = 1e9,
                mechanicCooldown = 10_000, party = it.party.map { u -> u.copy(maxHealth = 1e6, health = 1e6) },
            ) }
            // The cannon is kickable in the content.
            val cast = EnemyCast("vc_cannon", "Cannon", targets = listOf("2"), remainingTicks = 1, totalTicks = 30, interruptible = true)
            val s = base.copy(enemyCast = cast).withMe {
                it.copy(
                    isHuman = human,
                    spellCooldowns = if (kickOnCooldown) mapOf("counterspell" to 99) else emptyMap(),
                )
            }
            return 1e6 - step(s).unit("2")!!.health
        }
        val missed = hit()
        val couldNot = hit(kickOnCooldown = true)
        assertTrue(couldNot > 0)
        assertEquals(couldNot * data.encounters.unkickedDamageMultiplier, missed, 1e-9)
        // Nobody human to kick it: no lesson.
        assertEquals(couldNot, hit(human = false), 1e-9)
    }
}
