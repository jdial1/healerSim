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
import org.junit.After
import org.junit.Test
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add

/**
 * Replays the JS engine's recorded combat ticks against the Kotlin port.
 *
 * This is the gate for the simulation port: every stage of the tick loop — boss
 * mechanic scheduling, environmental damage, DoT and HoT ticks, mana regen,
 * death and encounter progression — has to agree, tick for tick, on the same
 * seeded PRNG stream.
 *
 * **That cross-engine contract ended when the global cooldown was added.** The
 * GCD applies to every class including healers, and it exists only in this
 * engine — the web app is frozen as the healer game it shipped as. The two
 * engines now genuinely disagree about the tick, and pretending otherwise by
 * regenerating golden.json from Kotlin would have turned the reference into a
 * copy of the thing it was supposed to check.
 *
 * So: scenario *inputs* still come from golden.json, because those are just
 * setup and remain valid. Expected *outputs* now come from
 * `src/test/resources/tick-snapshots.json`, recorded from this engine and
 * committed. The regression teeth are identical; the claim is smaller and true.
 *
 * The other twelve golden sections — stats, spell ranks, xp curves, rng streams
 * — are unaffected by the GCD and are still checked against the JS engine by
 * [ParityTest].
 *
 * Regenerate deliberately, never silently:
 * `./gradlew :app:testDebugUnitTest -Daegis.regenerateTickSnapshots=true`
 */
class TickParityTest {

    // Without the Android-only boss cast times (content/encounters.json): these
    // recordings pin the shared engine, and an attack with no cast time must
    // behave -- and draw from the rng -- exactly as it did. Casts have their own
    // tests in EnemyCastTest.
    private val data = Fixtures.data.withoutCasts()
    private val engine = Engine(data)

    private val snapshotFile = File(
        System.getProperty("aegis.tickSnapshots") ?: "src/test/resources/tick-snapshots.json",
    )
    private val regenerate = System.getProperty("aegis.regenerateTickSnapshots") == "true"
    private val recorded = mutableMapOf<String, JsonObject>()

    private val expected: Map<String, JsonObject> by lazy {
        if (regenerate) return@lazy emptyMap()
        check(snapshotFile.isFile) {
            "Missing ${snapshotFile.absolutePath}. Regenerate with " +
                "-Daegis.regenerateTickSnapshots=true and commit the result."
        }
        (Json.parseToJsonElement(snapshotFile.readText()) as JsonObject)
            .mapValues { it.value.jsonObject }
    }

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
            participants = mapOf(
                PLAYER_UNIT_ID to Participant(
                    unitId = PLAYER_UNIT_ID,
                    playerClass = cls,
                    level = level,
                    talents = talents,
                    mana = maxMana.toDouble(),
                    maxMana = maxMana,
                ),
            ),
            xp = sc.i("xp"),
            introTutorialComplete = true,
            party = party,
            currentDungeon = dungeon,
            dungeonPace = "normal",
            dungeonProgress = if (isBoss) 75.0 else 0.0,
            combatPhase = phase,
            trashPullsRemaining = if (isBoss) 0 else TRASH_PACK_COUNT,
            enemyHealth = enemyHp,
            enemyMaxHealth = enemyHp,
            isCombatActive = true,
            runDpsJitter = sc.num("jitter"),
            mechanicCooldown = sc.i("mechanicCooldown"),
        )
    }

    private fun snapshotOf(s: GameState): JsonObject = buildJsonObject {
        put("phase", s.combatPhase.name)
        put("trashPullsRemaining", s.trashPullsRemaining)
        put("combatActive", s.isCombatActive)
        put("enemyHealth", s.enemyHealth)
        put("mana", s.mana)
        put("progress", s.dungeonProgress)
        put("healEffective", s.runHealEffective)
        put("healOverheal", s.runHealOverheal)
        put("mechanicCooldown", s.mechanicCooldown)
        put("mechanicOrdinal", s.mechanicOrdinal)
        put("xp", s.xp)
        put("level", s.level)
        put("outcome", s.dungeonOutcome?.kind?.name?.let(::jsOutcomeName))
        put("outcomeXp", s.dungeonOutcome?.xpGained ?: 0)
        putJsonArray("bossBuffs") {
            s.bossSelfBuffs.forEach {
                add(buildJsonObject { put("id", it.sourceAbilityId); put("ticks", it.remainingTicks) })
            }
        }
        putJsonArray("cooldowns") {
            s.spellCooldowns.toSortedMap().forEach { (k, v) ->
                add(buildJsonObject { put("id", k); put("t", v) })
            }
        }
        putJsonArray("playerBuffs") {
            s.playerCombatBuffs.sortedBy { it.id }.forEach {
                add(
                    buildJsonObject {
                        put("id", it.id); put("ticks", it.remainingTicks); put("stacks", it.stacks)
                    },
                )
            }
        }
        putJsonArray("party") {
            s.party.forEach { u ->
                add(
                    buildJsonObject {
                        put("id", u.id); put("health", u.health); put("shield", u.shield)
                        putJsonArray("buffs") {
                            u.buffs.forEach {
                                add(buildJsonObject { put("src", it.sourceSpellId); put("ticks", it.remainingTicks) })
                            }
                        }
                        putJsonArray("debuffs") {
                            u.debuffs.forEach {
                                add(buildJsonObject { put("src", it.sourceAbilityId); put("ticks", it.remainingTicks) })
                            }
                        }
                    },
                )
            }
        }
    }

    @After
    fun writeSnapshotsIfRegenerating() {
        if (!regenerate) return
        snapshotFile.parentFile?.mkdirs()
        val pretty = Json { prettyPrint = true }
        snapshotFile.writeText(pretty.encodeToString(JsonObject.serializer(), JsonObject(recorded)))
        println("wrote ${recorded.size} tick snapshots to ${snapshotFile.absolutePath}")
    }

    @Test
    fun combatTicksMatchTheRecordedRun() {
        val scenarios = Fixtures.golden.getValue("tickScenarios").jsonArray
        assertTrue("no tick scenarios in golden.json", scenarios.isNotEmpty())

        scenarios.forEach { row ->
            val sc = row.jsonObject
            val name = sc.str("name")
            var state = buildInitialState(sc)
            val rng = Rng(sc.i("seed"))

            // Inputs still come from golden.json -- which ticks to sample at is
            // setup, not a claim about the JS engine's numbers.
            val sampleTicks = sc.arr("snapshots").map { it.jsonObject.i("tick") }.toSet()
            val maxTick = sampleTicks.max()

            fun check(t: Int, st: GameState) {
                if (t !in sampleTicks) return
                val key = "$name@$t"
                if (regenerate) {
                    recorded[key] = snapshotOf(st)
                } else {
                    val e = expected[key] ?: error("no recorded snapshot for $key")
                    assertSnapshot(name, t, e, st)
                }
            }

            val rotation = sc["rotation"]?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.jsonObject
            val everyTicks = rotation?.i("everyTicks") ?: 0
            val spells = rotation?.arr("spells")?.map { it.jsonPrimitive.content } ?: emptyList()
            var castIndex = 0

            for (t in 1..maxTick) {
                state = engine.reduce(state, Action.Tick(1), rng)
                if (!state.isCombatActive) {
                    check(t, state)
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
                check(t, state)
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
