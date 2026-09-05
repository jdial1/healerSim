package com.jdial.aegis.sim

import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

const val PLAYER_MAX_LEVEL = 55
const val TRASH_PACK_COUNT = 3
const val MANA_POTION_USES_PER_DUNGEON = 2

/**
 * Port of the XP curve, dungeon rewards and spell loadout from `src/gameStorage.js`
 * plus the scaling multipliers from `src/constants.js`.
 */
class Progression(private val data: GameData, private val stats: PlayerStats) {

    private val xpB get() = data.balance.xp

    // --- dungeon scaling -----------------------------------------------------

    fun bossDamageMultiplier(difficulty: Int): Double =
        data.balance.boss.damageMultiplierPerDifficultyStep.pow(max(0, difficulty - 1))

    fun endlessMultiplier(stacks: Int): Double =
        data.balance.endless.scalingPerCycle.pow(max(0, stacks))

    /**
     * An *over*-levelled party takes **less** damage: the multiplier is < 1 and
     * shrinks further with each level above the dungeon's cap.
     */
    fun levelGapDamageMultiplier(partyMemberLevel: Int, dungeonLevelMax: Int): Double {
        val gap = partyMemberLevel - dungeonLevelMax
        if (gap <= 0) return 1.0
        return data.balance.partyDamageFromDungeonLevelGap
            .multiplierPerPartyLevelOverDungeonMax.pow(gap)
    }

    fun trashMaxHealth(dungeon: Dungeon): Double =
        max(1.0, (dungeon.bossHealth * data.balance.trash.maxHealthFractionOfBoss).roundToInt().toDouble())

    fun pace(name: String) = data.pacing.paces.getValue(name)

    // --- XP ------------------------------------------------------------------

    fun dungeonBaseXp(difficulty: Int): Int =
        (xpB.dungeonBaseAmount * xpB.dungeonBaseDifficultyPowBase.pow(difficulty - 1)).roundToInt()

    fun dungeonXpTierMultiplier(difficulty: Int): Double =
        1.0 + xpB.dungeonTierAdditivePerDifficultyOver1 * max(0, difficulty - 1)

    private fun nominalClearXp(difficulty: Int): Int =
        (dungeonBaseXp(difficulty) * dungeonXpTierMultiplier(difficulty)).roundToInt()

    fun xpToReachNextLevel(currentLevel: Int): Int {
        val tier = (currentLevel - 1) / 3
        val runsMultiplier = 1.8 + tier + ((currentLevel - 1) % 3) * 0.8
        return max(1, (nominalClearXp(tier + 1) * runsMultiplier).roundToInt())
    }

    /** Cumulative XP required to *reach* [targetLevel]. */
    fun xpToLevel(targetLevel: Int): Int {
        val cap = min(max(targetLevel, 1), PLAYER_MAX_LEVEL)
        if (cap <= 1) return 0
        var total = 0
        for (l in 1 until cap) total += xpToReachNextLevel(l)
        return total
    }

    fun levelFromTotalXp(xp: Int): Int {
        if (xp <= 0) return 1
        var level = 1
        var total = 0
        while (level < PLAYER_MAX_LEVEL) {
            val need = xpToReachNextLevel(level)
            if (total + need > xp) break
            total += need
            level += 1
        }
        return level
    }

    data class XpProgress(val into: Int, val needed: Int)

    fun xpProgressWithinLevel(xp: Int): XpProgress {
        val level = levelFromTotalXp(xp)
        if (level >= PLAYER_MAX_LEVEL) return XpProgress(1, 1)
        return XpProgress(max(0, xp - xpToLevel(level)), xpToReachNextLevel(level))
    }

    fun dungeonXpGain(dungeon: Dungeon, playerLevel: Int): Int {
        val levelsOver = max(0, playerLevel - dungeon.levelMax)
        return max(
            0,
            (dungeonBaseXp(dungeon.difficulty) *
                dungeonXpTierMultiplier(dungeon.difficulty) *
                xpB.overlevelDiminishingBase.pow(levelsOver)).roundToInt(),
        )
    }

    fun failureXpFraction(pullsCleared: Int): Double = when {
        pullsCleared >= TRASH_PACK_COUNT -> xpB.failureFractionWhenAllTrashCleared
        pullsCleared == 2 -> xpB.failureFractionWhenTwoPullsCleared
        pullsCleared == 1 -> xpB.failureFractionWhenOnePullCleared
        else -> 0.0
    }

    fun dungeonFailureXpGain(dungeon: Dungeon, playerLevel: Int, pullsCleared: Int): Int =
        (dungeonXpGain(dungeon, playerLevel) * failureXpFraction(pullsCleared)).roundToInt()

    // --- spell loadout -------------------------------------------------------

    data class Loadout(val unlockedSpells: List<String>, val actionBar: List<String>)

    /**
     * Three heal slots in `spellOrder` priority, then the mana potion, then an
     * empty slot — always exactly 5.
     */
    fun buildSpellLoadout(cls: PlayerClass?, talents: List<TalentRank>): Loadout {
        if (cls == null) return Loadout(emptyList(), emptyList())
        val progression = data.bundle(cls).meta.progression

        val merged = progression.starterSpells.toMutableList()
        talents.filter { it.points > 0 }.mapNotNull { it.talent.spellId }.forEach {
            if (it !in merged) merged += it
        }

        val healRow = mutableListOf<String>()
        progression.spellOrder.forEach { id ->
            if (id in merged && healRow.size < 3 && id !in healRow) healRow += id
        }
        merged.forEach { id ->
            if (healRow.size < 3 && id !in healRow) healRow += id
        }
        while (healRow.size < 3) healRow += ""

        return Loadout(
            unlockedSpells = (listOf("mana_potion") + merged).distinct(),
            actionBar = listOf(healRow[0], healRow[1], healRow[2], "mana_potion", ""),
        )
    }

    /** Talent points are one per level, minus everything spent. */
    fun talentPoints(level: Int, talents: List<TalentRank>): Int =
        max(0, level - talents.sumOf { it.points * it.talent.cost })

    data class LevelUpRewards(val upgradedSpellIds: List<String>, val upgradedPotion: Boolean)

    fun levelUpRewards(
        cls: PlayerClass?,
        talents: List<TalentRank>,
        previousLevel: Int,
        newLevel: Int,
    ): LevelUpRewards {
        if (cls == null || newLevel <= previousLevel) return LevelUpRewards(emptyList(), false)
        val unlocked = buildSpellLoadout(cls, talents).unlockedSpells.toSet()
        val spells = linkedSetOf<String>()
        var potion = false
        for (l in (previousLevel + 1)..newLevel) {
            if (stats.potionUpgradeAtLevel(l)) potion = true
            stats.spellUpgradesAtLevel(cls, l).forEach { if (it in unlocked) spells += it }
        }
        return LevelUpRewards(spells.toList(), potion)
    }
}
