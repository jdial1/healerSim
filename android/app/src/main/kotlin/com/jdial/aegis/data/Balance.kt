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
    val progression: ProgressionBalance,
    // Defaulted, unlike its siblings: every key above describes the finished
    // healer game, this one describes work in progress. The default means the
    // engine still loads against a balance.json from before roles existed --
    // including the one a suspended run was saved under.
    val threat: ThreatBalance = ThreatBalance(),
    val roles: RolesBalance = RolesBalance(),
)

/**
 * How much of the scripted party damage the AI is credited with, by what the
 * player is doing. The player makes up the rest with their own abilities.
 *
 * [aiShareWhenHealer] is 1.0 and must stay 1.0: with the player healing, the
 * enemy-damage expression becomes `x * 1.0 + 0.0`, which is an exact IEEE
 * identity rather than an approximation. That is what lets the parity corpus be
 * compared byte-for-byte after damage exists -- see
 * `com.jdial.aegis.sim.GameTick.resolveOngoingCombat`.
 */
@Serializable
data class RolesBalance(
    val aiShareWhenHealer: Double = 1.0,
    val aiShareWhenDps: Double = 0.72,
    val aiShareWhenTank: Double = 0.86,

    // --- the AI healer -------------------------------------------------------
    // Only exists while the player is not the healer. Deliberately a budget
    // rather than a rotation: the player cannot observe an AI's spell choice,
    // only whether the bars stayed up and whether it ran dry, so simulating the
    // choice is cost without signal.
    val aiHealerManaBase: Double = 260.0,
    val aiHealerManaPerLevel: Double = 26.0,
    val aiHealerManaRegenPerTick: Double = 1.6,
    val aiHealerHealBase: Double = 9.0,
    val aiHealerHealPerLevel: Double = 3.4,
    val aiHealerManaPerHealPoint: Double = 0.34,
    /** It triages: nobody gets topped off, so chip damage accumulates. */
    val aiHealerHealBelowFraction: Double = 0.92,
)

/**
 * Threat tuning. Nothing consumes this yet: no dungeon opts into
 * [com.jdial.aegis.data.Targeting.HIGHEST_THREAT], so the table is built and
 * kept but never decides anything. That is deliberate -- it lets the model bed
 * in against the parity corpus before any content depends on it.
 */
@Serializable
data class ThreatBalance(
    /** Effective healing generates this much threat per point. Overheal generates none. */
    val healingCoefficient: Double = 0.5,
    /** Keyed by [com.jdial.aegis.sim.UnitRole] name. A tank's whole job is this number. */
    val roleMultiplier: Map<String, Double> = mapOf("TANK" to 2.5, "DPS" to 1.0, "HEALER" to 1.0),
    /** How far above the current target you must climb to pull it. Stops flapping on ties. */
    val overtakeMultiplier: Double = 1.1,
    /** Where a taunt puts you relative to the current highest. */
    val tauntOvertakeMultiplier: Double = 1.1,
    /** The tank's slice of the scripted party damage pool, for threat attribution. */
    val tankDamageShare: Double = 0.15,
    /** How long an AI tank waits between taunts. */
    val aiTauntCooldownTicks: Int = 80,
)

@Serializable
data class BossBalance(val damageMultiplierPerDifficultyStep: Double)

/**
 * The Paladin unlock lived in four places that disagreed: the web gate said 25,
 * both labels said 30, the Android gate said 30, and paladin/class.json said 5.
 * It is one number here so the two apps cannot drift again.
 */
@Serializable
data class ProgressionBalance(val paladinUnlockLevel: Int)

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
    val levelCurveRunsBase: Double,
    val levelCurveRunsPerStep: Double,
)

@Serializable
data class PlayerStatsBalance(
    val manaPerIntellect: Double,
    val healingPctPerSpirit: Double,
    val spellRankHealMultiplier: Double,
    val spellRankCostMultiplier: Double,
    val manaRegenPerTick: Double,
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
    val weaveHotBonus: Double,
    val weaveDirectBonus: Double,
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
    val livingSeedPoolFraction: Double,
    val livingSeedNaturalPerfectionBonusFraction: Double,
    val harmonyBonusPerRank: Double,
    val cultivationBonusPerRank: Double,
    val deepRootsBonusPerRank: Double,
    val photosynthesisDoubleTickChancePerRank: Double,
    val hotTickManaReturnPerRank: Double,
    val rampHastePerHotPerRank: Double,
    val rampCritPerHotPerRank: Double,
    val naturesGraceHotTickRateMultiplier: Double,
    val barkskinSelfHealFractionPerRank: Double,
    val naturesGraceHealPerLevelPerTick: Double,
)
