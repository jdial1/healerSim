package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

private const val EPS = 1e-6

private fun JsonObject.arr(key: String): JsonArray = getValue(key).jsonArray
private fun JsonObject.obj(key: String): JsonObject = getValue(key).jsonObject
private fun JsonObject.num(key: String): Double = getValue(key).jsonPrimitive.double
private fun JsonObject.i(key: String): Int = getValue(key).jsonPrimitive.int
private fun JsonObject.str(key: String): String = getValue(key).jsonPrimitive.content
private fun JsonArray.strings(): List<String> = map { it.jsonPrimitive.content }

/**
 * Asserts the Kotlin engine reproduces the JS engine exactly.
 *
 * The reference is parity/golden.json, regenerated with
 * `node parity/generate-golden.mjs`. This is the gate for the whole port: a
 * mistyped constant among ~90 balance scalars is otherwise undetectable.
 */
class ParityTest {

    private val stats = Fixtures.stats
    private val prog = Fixtures.progression
    private val golden = Fixtures.golden

    private fun zeroTalents(cls: PlayerClass): List<TalentRank> =
        Fixtures.data.bundle(cls).talents.map { TalentRank(it, 0) }

    @Test
    fun primaryAndDerivedStatsMatch() {
        val section = golden.obj("playerStats")
        for (cls in PlayerClass.entries) {
            val talents = zeroTalents(cls)
            section.arr(cls.name).forEach { row ->
                val e = row.jsonObject
                val level = e.i("level")
                val where = cls.name + " lv" + level
                val p = stats.primaryStats(cls, level)

                assertEquals("$where intellect", e.num("intellect"), p.intellect, EPS)
                assertEquals("$where spirit", e.num("spirit"), p.spirit, EPS)
                assertEquals("$where maxMana", e.i("maxMana"), stats.maxMana(cls, level, talents))
                assertEquals(
                    "$where healingMultiplier",
                    e.num("healingMultiplier"), stats.healingMultiplier(cls, level, talents), EPS,
                )
                assertEquals(
                    "$where uniqueStatRating",
                    e.num("uniqueStatRating"), stats.uniqueStatRating(cls, level, talents), EPS,
                )
                assertEquals(
                    "$where spiritRegenMultiplier",
                    e.num("spiritRegenMultiplier"), stats.spiritRegenMultiplier(p.spirit), EPS,
                )
                assertEquals("$where healerMaxHealth", e.i("healerMaxHealth"), stats.healerMaxHealth(level))
                assertEquals("$where tankMaxHealth", e.i("tankMaxHealth"), stats.maxHealthForRole("TANK", level))
                assertEquals("$where dpsMaxHealth", e.i("dpsMaxHealth"), stats.maxHealthForRole("DPS", level))
            }
        }
    }

    @Test
    fun spellRanksMatch() {
        val section = golden.obj("spellRanks")
        for (cls in PlayerClass.entries) {
            val perClass = section.obj(cls.name)
            perClass.forEach { (spellId, rows) ->
                if (spellId == "__upgradesAtLevel") return@forEach
                rows.jsonArray.forEach { row ->
                    val e = row.jsonObject
                    val level = e.i("level")
                    val rank = stats.spellRank(spellId, cls, level)
                    val where = cls.name + " " + spellId + " lv" + level
                    assertEquals("$where rank", e.i("rank"), rank)
                    assertEquals("$where healMult", e.num("healMult"), stats.rankHealMult(rank), EPS)
                    assertEquals("$where costMult", e.num("costMult"), stats.rankCostMult(rank), EPS)
                }
            }
            perClass.arr("__upgradesAtLevel").forEach { row ->
                val e = row.jsonObject
                val level = e.i("level")
                assertEquals(
                    cls.name + " upgrades lv" + level,
                    e.arr("ids").strings(), stats.spellUpgradesAtLevel(cls, level),
                )
            }
        }
    }

    @Test
    fun talentWeightingMatches() {
        golden.arr("talentWeight").forEach { row ->
            val e = row.jsonObject
            val points = e.i("points")
            val maxPoints = e.i("maxPoints")
            assertEquals(
                "weight $points/$maxPoints",
                e.num("weight"), stats.talentWeight(points, maxPoints), EPS,
            )
        }
    }

    @Test
    fun xpCurveMatchesForAllLevels() {
        golden.arr("xpCurve").forEach { row ->
            val e = row.jsonObject
            val level = e.i("level")
            assertEquals("cumulative xp to lv$level", e.i("cumulativeXp"), prog.xpToLevel(level))
        }
        golden.arr("levelFromXp").forEach { row ->
            val e = row.jsonObject
            val xp = e.i("xp")
            assertEquals("level from $xp xp", e.i("level"), prog.levelFromTotalXp(xp))
            val p = e.obj("progress")
            val actual = prog.xpProgressWithinLevel(xp)
            assertEquals("progress.into at $xp", p.i("into"), actual.into)
            assertEquals("progress.needed at $xp", p.i("needed"), actual.needed)
        }
    }

    @Test
    fun dungeonScalingAndRewardsMatch() {
        golden.arr("dungeonScaling").forEach { row ->
            val e = row.jsonObject
            val id = e.str("id")
            val d = Fixtures.data.dungeon(id)!!
            assertEquals("$id baseXp", e.i("baseXp"), prog.dungeonBaseXp(d.difficulty))
            assertEquals("$id tierMultiplier", e.num("tierMultiplier"), prog.dungeonXpTierMultiplier(d.difficulty), EPS)
            assertEquals("$id bossDamageMultiplier", e.num("bossDamageMultiplier"), prog.bossDamageMultiplier(d.difficulty), EPS)
            assertEquals("$id trashMaxHealth", e.num("trashMaxHealth"), prog.trashMaxHealth(d), EPS)
            assertEquals("$id xpAtLevelMin", e.i("xpAtLevelMin"), prog.dungeonXpGain(d, d.levelMin))
            assertEquals("$id xpAtLevelMaxPlus5", e.i("xpAtLevelMaxPlus5"), prog.dungeonXpGain(d, d.levelMax + 5))
            assertEquals("$id failureXpTwoPulls", e.i("failureXpTwoPulls"), prog.dungeonFailureXpGain(d, d.levelMin, 2))
        }
    }

    @Test
    fun endlessAndLevelGapMultipliersMatch() {
        golden.arr("endlessMultiplier").forEach { row ->
            val e = row.jsonObject
            assertEquals("endless " + e.i("stacks"), e.num("mult"), prog.endlessMultiplier(e.i("stacks")), EPS)
        }
        golden.arr("levelGapMultiplier").forEach { row ->
            val e = row.jsonObject
            val gap = e.i("gap")
            assertEquals("levelGap $gap", e.num("mult"), prog.levelGapDamageMultiplier(10 + gap, 10), EPS)
        }
    }

    @Test
    fun spellLoadoutsMatch() {
        val section = golden.obj("spellLoadout")
        for (cls in PlayerClass.entries) {
            val e = section.obj(cls.name)
            val actual = prog.buildSpellLoadout(cls, zeroTalents(cls))
            assertEquals(cls.name + " unlockedSpells", e.arr("unlockedSpells").strings(), actual.unlockedSpells)
            assertEquals(cls.name + " actionBar", e.arr("activeActionBars").strings(), actual.actionBar)
        }
    }
}
