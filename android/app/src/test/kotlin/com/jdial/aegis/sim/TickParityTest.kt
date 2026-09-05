package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Replays the JS engine's recorded combat ticks against the Kotlin port.
 *
 * This is the gate for the simulation port: every stage of the tick loop — boss
 * mechanic scheduling, environmental damage, DoT and HoT ticks, mana regen,
 * death and encounter progression — has to agree, tick for tick, on the same
 * seeded PRNG stream.
 */
class TickParityTest {

    private val data = Fixtures.data
    private val engine = Engine(data)

    // Healths are doubles accumulated over hundreds of operations; allow only
    // floating-point noise, not behavioural drift.
    private val eps = 1e-6

    private fun JsonObject.arr(key: String) = getValue(key).jsonArray
    private fun JsonObject.obj(key: String) = getValue(key).jsonObject
    private fun JsonObject.num(key: String) = getValue(key).jsonPrimitive.double
    private fun JsonObject.i(key: String) = getValue(key).jsonPrimitive.int
    private fun JsonObject.str(key: String) = getValue(key).jsonPrimitive.content
    private fun JsonObject.bool(key: String) = getValue(key).jsonPrimitive.boolean

    private fun buildInitialState(sc: JsonObject): GameState {
        val cls = PlayerClass.valueOf(sc.str("cls"))
        val dungeon = data.dungeon(sc.str("dungeonId"))!!
        val phase = CombatPhase.valueOf(sc.str("phase"))
        val level = sc.i("level")
        val ranks = sc.obj("talents").mapValues { (_, v) -> v.jsonPrimitive.int }
        val talents = data.bundle(cls).talents.map {
            TalentRank(it, minOf(it.maxPoints, ranks[it.id] ?: 0))
        }

        val party = sc.arr("party").map { row ->
            val u = row.jsonObject
            val maxHealth = u.num("maxHealth")
            Unit(
                id = u.str("id"),
                name = u.str("name"),
                role = UnitRole.valueOf(u.str("role")),
                level = u.i("level"),
                health = maxHealth,
                maxHealth = maxHealth,
            )
        }

        val trashHp = engine.progression.trashMaxHealth(dungeon)
        val isBoss = phase == CombatPhase.BOSS
        val enemyHp = if (isBoss) dungeon.bossHealth else trashHp
        val maxMana = sc.i("maxMana")

        return GameState(
            playerClass = cls,
            level = level,
            xp = sc.i("xp"),
            talents = talents,
            introTutorialComplete = true,
            party = party,
            mana = maxMana.toDouble(),
            maxMana = maxMana,
            currentDungeon = dungeon,
            dungeonPace = "normal",
            dungeonProgress = if (isBoss) 75.0 else 0.0,
            combatPhase = phase,
            trashPullsRemaining = if (isBoss) 0 else TRASH_PACK_COUNT,
            enemyHealth = enemyHp,
            enemyMaxHealth = enemyHp,
            isCombatActive = true,
            mechanicCooldown = sc.i("mechanicCooldown"),
        )
    }

    @Test
    fun combatTicksMatchTheJsEngine() {
        val scenarios = Fixtures.golden.getValue("tickScenarios").jsonArray
        assertTrue("no tick scenarios in golden.json", scenarios.isNotEmpty())

        scenarios.forEach { row ->
            val sc = row.jsonObject
            val name = sc.str("name")
            var state = buildInitialState(sc)
            val rng = Rng(sc.i("seed"))

            val expectedByTick = sc.arr("snapshots").associateBy { it.jsonObject.i("tick") }
            val maxTick = expectedByTick.keys.max()

            val rotation = sc["rotation"]?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.jsonObject
            val everyTicks = rotation?.i("everyTicks") ?: 0
            val spells = rotation?.arr("spells")?.map { it.jsonPrimitive.content } ?: emptyList()
            var castIndex = 0

            for (t in 1..maxTick) {
                state = engine.reduce(state, Action.Tick(1), rng)
                if (!state.isCombatActive) {
                    expectedByTick[t]?.let { assertSnapshot(name, t, it.jsonObject, state) }
                    break
                }

                if (rotation != null && everyTicks > 0 && t % everyTicks == 0) {
                    val living = state.party.filter { it.health > 0 }
                    if (living.isNotEmpty()) {
                        val target = living.minByOrNull { it.health / it.maxHealth }!!
                        val spellId = spells[castIndex % spells.size]
                        castIndex += 1
                        state = engine.reduce(
                            state,
                            Action.CastSpell(spellId, target.id, rng.nextDouble() * 100.0),
                            rng,
                        )
                    }
                }
                expectedByTick[t]?.let { assertSnapshot(name, t, it.jsonObject, state) }
            }
        }
    }

    private fun assertSnapshot(name: String, tick: Int, e: JsonObject, s: GameState) {
        val at = "$name @tick $tick"

        assertEquals("$at phase", e.str("phase"), s.combatPhase.name)
        assertEquals("$at trashPullsRemaining", e.i("trashPullsRemaining"), s.trashPullsRemaining)
        assertEquals("$at combatActive", e.bool("combatActive"), s.isCombatActive)
        assertEquals("$at enemyHealth", e.num("enemyHealth"), s.enemyHealth, eps)
        assertEquals("$at mana", e.num("mana"), s.mana, eps)
        assertEquals("$at progress", e.num("progress"), s.dungeonProgress, eps)
        assertEquals("$at healEffective", e.num("healEffective"), s.runHealEffective, eps)
        assertEquals("$at healOverheal", e.num("healOverheal"), s.runHealOverheal, eps)

        // The mechanic rotation is the most drift-prone part of the boss AI.
        assertEquals("$at mechanicCooldown", e.i("mechanicCooldown"), s.mechanicCooldown)
        assertEquals("$at mechanicOrdinal", e.i("mechanicOrdinal"), s.mechanicOrdinal)

        val expectedBossBuffs = e.arr("bossBuffs").map {
            it.jsonObject.str("id") to it.jsonObject.i("ticks")
        }
        assertEquals(
            "$at bossBuffs",
            expectedBossBuffs,
            s.bossSelfBuffs.map { it.sourceAbilityId to it.remainingTicks },
        )

        assertEquals(
            "$at cooldowns",
            e.arr("cooldowns").map { it.jsonObject.str("id") to it.jsonObject.i("t") },
            s.spellCooldowns.toSortedMap().map { (k, v) -> k to v },
        )
        assertEquals(
            "$at playerBuffs",
            e.arr("playerBuffs").map {
                Triple(it.jsonObject.str("id"), it.jsonObject.i("ticks"), it.jsonObject.i("stacks"))
            },
            s.playerCombatBuffs.sortedBy { it.id }.map { Triple(it.id, it.remainingTicks, it.stacks) },
        )

        assertEquals("$at xp", e.i("xp"), s.xp)
        assertEquals("$at level", e.i("level"), s.level)
        val expectedOutcome = e.getValue("outcome").jsonPrimitive.contentOrNull
        assertEquals("$at outcome", expectedOutcome, s.dungeonOutcome?.kind?.name?.let(::jsOutcomeName))
        if (expectedOutcome != null) {
            assertEquals("$at outcome xp", e.i("outcomeXp"), s.dungeonOutcome!!.xpGained)
        }

        // When a run ends the web app regenerates the party with Math.random,
        // NOT the injected PRNG, so that party is unreproducible by design.
        // Everything above still pins the reward path.
        if (!s.isCombatActive) return

        val expectedParty = e.arr("party")
        assertEquals("$at party size", expectedParty.size, s.party.size)
        expectedParty.forEachIndexed { i, row ->
            val u = row.jsonObject
            val actual = s.party[i]
            val who = "$at unit ${u.str("id")}"
            assertEquals("$who id", u.str("id"), actual.id)
            assertEquals("$who health", u.num("health"), actual.health, eps)
            assertEquals("$who shield", u.num("shield"), actual.shield, eps)
            assertEquals(
                "$who buffs",
                u.arr("buffs").map { it.jsonObject.str("src") to it.jsonObject.i("ticks") },
                actual.buffs.map { it.sourceSpellId to it.remainingTicks },
            )
            assertEquals(
                "$who debuffs",
                u.arr("debuffs").map { it.jsonObject.str("src") to it.jsonObject.i("ticks") },
                actual.debuffs.map { it.sourceAbilityId to it.remainingTicks },
            )
        }
    }
}

/** The JS outcome uses `reason` for failures and `kind` for success. */
private fun jsOutcomeName(kind: String): String = when (kind) {
    "SUCCESS" -> "success"
    else -> kind
}
