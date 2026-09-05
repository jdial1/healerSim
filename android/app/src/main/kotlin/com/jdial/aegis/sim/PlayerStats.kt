package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Talent
import kotlinx.serialization.Serializable
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Port of `src/playerStats.js`. Stat curves, spell ranks and talent aggregation.
 *
 * Note the two surprises carried over verbatim from the web app: **spirit**, not
 * intellect, is the healing ("spellpower") stat, and no stat contributes to crit
 * — crit comes only from talents and Natural Perfection stacks.
 */

const val RANK_HEAL_MULT = 1.15
const val RANK_COST_MULT = 1.10

/** A talent with its invested points; the JSON `points` field is runtime state. */
@Serializable
data class TalentRank(val talent: Talent, val points: Int) {
    val id: String get() = talent.id
    val mechanicId: String? get() = talent.mechanicId
}

data class PrimaryStats(val intellect: Double, val spirit: Double)

data class TalentStats(
    val flatMana: Double = 0.0,
    val healingBoostPct: Double = 0.0,
    val critChancePct: Double = 0.0,
    val hastePct: Double = 0.0,
    val uniqueStatFlat: Double = 0.0,
    val manaReturnOnDirectHeal: Double = 0.0,
)

val UNIQUE_STAT_LABELS = mapOf(
    PlayerClass.PRIEST to "Divinity",
    PlayerClass.DRUID to "Vitality",
    PlayerClass.PALADIN to "Radiance",
)

class PlayerStats(private val data: GameData) {

    private val ps get() = data.balance.playerStats

    fun spiritRegenMultiplier(spirit: Double): Double = 1.0 + spirit * ps.manaRegenMultPerSpirit

    fun primaryStats(cls: PlayerClass?, level: Int): PrimaryStats {
        if (cls == null) return PrimaryStats(0.0, 0.0)
        val c = data.bundle(cls).meta.statCurves
        val lv = max(1, level)
        return PrimaryStats(
            intellect = c.baseIntellect + (lv - 1) * c.intellectPerLevel,
            spirit = c.baseSpirit + (lv - 1) * c.spiritPerLevel,
        )
    }

    /** A fully-invested talent is worth 20% more than its raw points. */
    fun talentWeight(points: Int, maxPoints: Int): Double {
        val spent = min(max(0, points), maxPoints)
        if (spent == 0) return 0.0
        return if (spent == maxPoints) spent * 1.2 else spent.toDouble()
    }

    fun talentStats(talents: List<TalentRank>): TalentStats {
        var mana = 0.0; var heal = 0.0; var crit = 0.0; var haste = 0.0
        var unique = 0.0; var manaReturn = 0.0
        for (t in talents) {
            val b = t.talent.statBonus ?: continue
            val p = talentWeight(t.points, t.talent.maxPoints)
            mana += b.manaPool * p
            heal += b.healingBoost * p
            crit += b.critChance * p
            haste += b.haste * p
            unique += b.uniqueStat * p
            manaReturn += b.manaReturnOnDirectHeal * p
        }
        return TalentStats(mana, heal, crit, haste, unique, manaReturn)
    }

    fun maxMana(cls: PlayerClass?, level: Int, talents: List<TalentRank>): Int {
        if (cls == null) return 100
        val intellect = primaryStats(cls, level).intellect
        return (intellect * ps.manaPerIntellect + talentStats(talents).flatMana).roundToInt()
    }

    fun healingMultiplier(cls: PlayerClass?, level: Int, talents: List<TalentRank>): Double {
        if (cls == null) return 1.0
        val spirit = primaryStats(cls, level).spirit
        val talentPct = talentStats(talents).healingBoostPct
        return 1.0 + (spirit * ps.healingPctPerSpirit + talentPct) / 100.0
    }

    fun uniqueStatRating(cls: PlayerClass?, level: Int, talents: List<TalentRank>): Double {
        if (cls == null) return 0.0
        val c = data.bundle(cls).meta.statCurves
        val lv = max(1, level)
        return c.baseUniqueStat + (lv - 1) * c.uniqueStatPerLevel + talentStats(talents).uniqueStatFlat
    }

    // --- spell ranks ---------------------------------------------------------

    fun rankHealMult(rank: Int): Double = RANK_HEAL_MULT.pow(max(0, rank - 1))

    fun rankCostMult(rank: Int): Double = RANK_COST_MULT.pow(max(0, rank - 1))

    fun spellRank(spellId: String, cls: PlayerClass, level: Int): Int {
        val order = data.bundle(cls).meta.progression.spellOrder
        val idx = order.indexOf(spellId)
        if (idx == -1) return 1
        val firstUpgradeLevel = 2 + (idx % 3)
        if (level < firstUpgradeLevel) return 1
        return 2 + floor((level - firstUpgradeLevel) / 3.0).toInt()
    }

    /** Which spells gain a rank on reaching [level]. */
    fun spellUpgradesAtLevel(cls: PlayerClass, level: Int): List<String> {
        if (level < 2) return emptyList()
        val order = data.bundle(cls).meta.progression.spellOrder
        val slot = (level - 2) % 3
        return listOfNotNull(order.getOrNull(slot), order.getOrNull(slot + 3))
    }

    fun potionUpgradeAtLevel(level: Int): Boolean = level > 0 && level % 5 == 0

    // --- unit health ---------------------------------------------------------

    fun maxHealthForRole(role: String, level: Int): Int {
        val s = data.npcPools.allyHealthDefaults.getValue(role)
        return (s.base + (max(1, level) - 1) * s.perLevel).roundToInt()
    }

    /** The healer uses the DPS health curve. */
    fun healerMaxHealth(level: Int): Int = maxHealthForRole("DPS", level)

    // --- talent tree queries -------------------------------------------------

    /** Transitive prerequisite ids of [talent]. */
    fun prerequisiteIds(all: List<TalentRank>, talent: Talent): List<String> {
        val byId = all.associateBy { it.id }
        val out = mutableListOf<String>()
        val seen = mutableSetOf<String>()
        val stack = ArrayDeque(talent.prerequisites)
        while (stack.isNotEmpty()) {
            val id = stack.removeLast()
            if (!seen.add(id)) continue
            out += id
            byId[id]?.talent?.prerequisites?.forEach { stack.addLast(it) }
        }
        return out
    }

    fun unmetPrerequisites(all: List<TalentRank>, talent: Talent): List<TalentRank> {
        val byId = all.associateBy { it.id }
        return prerequisiteIds(all, talent).mapNotNull { byId[it] }.filter { it.points == 0 }
    }

    fun prereqsSatisfied(all: List<TalentRank>, talent: Talent): Boolean =
        unmetPrerequisites(all, talent).isEmpty()
}

/** Sums invested points across every talent sharing a mechanic id. */
fun List<TalentRank>.ranksOf(mechanicId: String): Int =
    filter { it.mechanicId == mechanicId }.sumOf { it.points }

/** Points invested in one specific talent id (several hooks key off ids, not mechanics). */
fun List<TalentRank>.ranksOfTalent(talentId: String): Int =
    firstOrNull { it.id == talentId }?.points ?: 0
