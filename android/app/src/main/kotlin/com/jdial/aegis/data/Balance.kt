package com.jdial.aegis.data

import kotlinx.serialization.Serializable

/**
 * Mirror of `src/data/balance.json` — every tuning scalar in the game. Modelled
 * as a data class tree rather than loose constants so the JSON stays the single
 * source of truth for both the web app and this one.
 */
@Serializable
data class Balance(
    val boss: BossBalance,
    val endless: EndlessBalance,
    val partyDamageFromDungeonLevelGap: LevelGapBalance,
    val partyDps: PartyDpsBalance,
    val environmentalDamage: EnvironmentalBalance,
    val trash: TrashBalance,
    val xp: XpBalance,
    val playerStats: PlayerStatsBalance,
    val combat: CombatBalance,
)

@Serializable
data class BossBalance(val damageMultiplierPerDifficultyStep: Double)

@Serializable
data class EndlessBalance(
    val scalingPerCycle: Double,
    val bossKillXpFraction: Double,
)

@Serializable
data class LevelGapBalance(val multiplierPerPartyLevelOverDungeonMax: Double)

@Serializable
data class PartyDpsBalance(
    val base: Double,
    val levelExponent: Double,
    val levelMultiplier: Double,
    /** Per-run variance, +/- this fraction, so runs are not identical. */
    val runJitter: Double = 0.0,
)

@Serializable
data class EnvironmentalBalance(
    val tankProcChance: Double,
    val tankDamageRandomMax: Double,
    val nonTankProcChance: Double,
    val nonTankDamageRandomMax: Double,
    val ambientChipEveryTicks: Int,
    val ambientChipDamageMultiplier: Double,
)

@Serializable
data class TrashBalance(val maxHealthFractionOfBoss: Double)

@Serializable
data class XpBalance(
    val dungeonTierAdditivePerDifficultyOver1: Double,
    val dungeonBaseAmount: Double,
    val dungeonBaseDifficultyPowBase: Double,
    val overlevelDiminishingBase: Double,
    val failureFractionWhenAllTrashCleared: Double,
    val failureFractionWhenTwoPullsCleared: Double,
    val failureFractionWhenOnePullCleared: Double,
)

@Serializable
data class PlayerStatsBalance(
    val manaPerIntellect: Double,
    val healingPctPerSpirit: Double,
    val manaRegenMultPerSpirit: Double,
)

@Serializable
data class CombatBalance(
    val shared: SharedCombat,
    val priest: PriestCombat,
    val paladin: PaladinCombat,
    val druid: DruidCombat,
)

@Serializable
data class SharedCombat(
    val shieldDefaultTicks: Int,
    val directHealSynergyMultiplierDefault: Double,
    val hotPandemicDurationCapMultDefault: Double,
    val dispellableCurseCleanseProcPerRank: Double,
)

@Serializable
data class PriestCombat(
    val divinityOverhealToShieldPerRating: Double,
    val divinityAegisMultBonusPerRating: Double,
    val passiveEchoOfLightHealFraction: Double,
    val passiveEchoOfLightDurationTicks: Int,
    val pathMoonMaxManaReturnPerRank: Double,
    val meditativeManaReturnPerRankPerTick: Double,
    val divineAegisShieldFractionPerRank: Double,
    val luminousAegisMultiplierPerRank: Double,
    val bindingHealSelfFraction: Double,
    val bindingHealMaxRanksForCap: Int,
    val surgeOfLightProcChancePerRank: Double,
    val gleamingProclamationFlashHealCritBonusPct: Double,
    val shieldMaintenanceHastePerRank: Double,
    val selfShieldDamageReductionPerRank: Double,
    val archangelEchoShieldConsumeBonusFraction: Double,
    val aegisBurstHealPerAbsorbPerRank: Double,
)

@Serializable
data class PaladinCombat(
    val illuminationManaRefundFraction: Double,
    val radianceHealMultPerMissingHealthPerRating: Double,
    val radianceHealMultBonusCap: Double,
    val passiveLightbringerSplashFraction: Double,
    val passiveLightbringerEnvDamageManaPerHp: Double,
    val passiveLightbringerEnvDamageHolyPowerChance: Double,
    val devotionDamageReductionPerRank: Double,
    val devotionDamageTakenFloor: Double,
    val vowProtectorCritManaRefundFraction: Double,
    val emergencyCritBonusPerRankBelowHealthFraction: Double,
    val emergencyCritHealthThreshold: Double,
    val emergencyHasteFromMissingHealthMax: Double,
    val beaconEchoBaseMultiplier: Double,
    val beaconEchoVowBonusPerRank: Double,
    val purifyTowerOfRadianceMultiplier: Double,
    val vowCrusaderAoEBonusPerRank: Double,
    val avengingWrathSplashFraction: Double,
)

@Serializable
data class DruidCombat(
    val vitalityBloomChancePerRating: Double,
    val vitalityBloomChanceCap: Double,
    val vitalityBloomHealFractionOfTick: Double,
    val vitalityBloomManaRefundChance: Double,
    val vitalityBloomManaRefundAmount: Double,
    val passiveOmenProcPerHotTickPerRating: Double,
    val passiveOmenProcChanceCap: Double,
    val passiveOmenClearcastingTicks: Int,
    val treeOfLifeHotManaCostFactor: Double,
    val treeOfLifeBigDirectManaCostFactor: Double,
    val treeOfLifeFlashHealHealingThreshold: Double,
    val livingSeedPoolFraction: Double,
    val livingSeedNaturalPerfectionBonusFraction: Double,
    val harmonyBonusPerRank: Double,
    val cultivationBonusPerRank: Double,
    val deepRootsBonusPerRank: Double,
    val photosynthesisDoubleTickChancePerRank: Double,
    val photosynthesisHastePerRankWhenSelfHoT: Double,
    val hotTickManaReturnPerRank: Double,
    val rampHastePerHotPerRank: Double,
    val rampCritPerHotPerRank: Double,
    val naturesGraceHotTickRateMultiplier: Double,
    val barkskinSelfHealFractionPerRank: Double,
)
