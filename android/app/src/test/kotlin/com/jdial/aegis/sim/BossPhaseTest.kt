package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A boss that changes what it does as it falls, and the content that uses it. */
class BossPhaseTest {
    private val data: GameData = Fixtures.data.let { d ->
        d.with(
            balance = d.balance.copy(
                environmentalDamage = d.balance.environmentalDamage.copy(tankProcChance = 0.0, nonTankProcChance = 0.0),
                roles = d.balance.roles.copy(aiHealerHealBase = 0.0, aiHealerHealPerLevel = 0.0),
            ),
        )
    }
    private val engine = Engine(data)

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    @Test
    fun `a boss enters its phase once, says so, and starts the new rotation`() {
        val phases = data.dungeons.first { it.id == "molten_core" }.bossCombat!!.phases
        assertTrue(phases.isNotEmpty())
        val first = phases[0]

        val rng = Rng(4)
        var s = engine.newCharacter(PlayerClass.MAGE, rng).withMe { it.copy(level = 47) }
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == "molten_core" }, "normal"), rng)
        s = s.copy(
            combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, mechanicCooldown = 10_000,
            enemyMaxHealth = 10_000.0, enemyHealth = 10_000 * first.atHealth + 0.001,
            party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
            enemyCast = EnemyCast("rag_magma", "Magma", targets = listOf("1"), remainingTicks = 20, totalTicks = 30),
        )
        val entered = step(s)
        assertEquals(1, entered.bossPhase)
        // Whatever it was casting is thrown away, and the rotation restarts.
        assertNull(entered.enemyCast)
        assertEquals(0, entered.mechanicOrdinal)
        assertTrue(entered.adds.isNotEmpty())
        // Only once.
        assertEquals(1, step(entered).bossPhase)
    }

    @Test
    fun `a phase's own attacks are what the boss casts`() {
        val dungeon = data.dungeons.first { it.id == "maraudon" }
        val phase = dungeon.bossCombat!!.phases.first()
        val added = phase.attacks.first().abilityId
        val rng = Rng(4)
        var s = engine.newCharacter(PlayerClass.MAGE, rng).withMe { it.copy(level = 22) }
        s = engine.reduce(s, Action.StartDungeon(dungeon, "normal"), rng)
        s = s.copy(
            combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyMaxHealth = 1e9, enemyHealth = 1e9,
            bossPhase = 1, mechanicCooldown = 1, mechanicOrdinal = 0,
            party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
        )
        // Its rotation now includes the phase's mechanics; run it until one shows.
        var seen = false
        var cur = s
        repeat(400) {
            cur = step(cur)
            if (cur.enemyCast?.abilityId == added ||
                cur.party.any { u -> u.debuffs.any { d -> d.sourceAbilityId == phase.debuffs.firstOrNull()?.abilityId } }
            ) seen = true
            cur = cur.copy(enemyHealth = 1e9)
        }
        assertTrue("the phase's mechanics never fired", seen)
    }

    @Test
    fun `a replacing phase drops what came before`() {
        val dungeon = data.dungeons.first { it.id == "maraudon" }
        val phases = dungeon.bossCombat!!.phases
        assertTrue("maraudon's second phase replaces", phases[1].replace)
    }

    @Test
    fun `every dungeon has a boss worth fighting and no empty pull`() {
        val enc = data.encounters
        for (dungeon in data.dungeons) {
            val tuning = enc.bosses[dungeon.id]
            val extras = (tuning?.extraAttacks?.size ?: 0) + (tuning?.extraDebuffs?.size ?: 0) +
                (tuning?.adds?.size ?: 0) + (tuning?.phases?.size ?: 0)
            val puzzles = (dungeon.bossCombat?.debuffTemplates.orEmpty()).count { enc.mechanics.containsKey(it.abilityId) }
            assertTrue("${dungeon.id}'s boss decides nothing", extras + puzzles > 0)

            val pulls = enc.trash[dungeon.id].orEmpty()
            assertEquals("${dungeon.id} should tune all three pulls", TRASH_PACK_COUNT, pulls.size)
            assertTrue(
                "${dungeon.id} still has a plain pull",
                pulls.all { it.adds.isNotEmpty() || it.combat != null },
            )
        }
    }
}
