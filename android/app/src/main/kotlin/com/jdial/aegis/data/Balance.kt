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
    val classes: ClassesBalance = ClassesBalance(),
    val rules: RulesBalance = RulesBalance(),
)

/** Rule numbers that used to be Kotlin constants. Defaults are the old values. */
@Serializable
data class RulesBalance(
    /** A human tank earns the tank's scripted threat only if they cast within this many ticks. */
    val tankActiveTicks: Int = 30,
    val manaPotionUsesPerDungeon: Int = 2,
    /** Execute abilities work below this share of the enemy's health. */
    val executeBelow: Double = 0.35,
    val spiritOfRedemptionBelow: Double = 0.3,
    val spiritOfRedemptionTicks: Int = 100,
    val spiritOfRedemptionCooldownTicks: Int = 1200,
    val surgeOfLightTicks: Int = 60,
    /** Photosynthesis: ticks a Healing Touch crit adds to every druid HoT. */
    val photosynthesisExtendTicks: Int = 20,
    /** Divinity: the most of an overheal that can become a shield. */
    val divinityShieldCap: Double = 0.45,
    /** Tower of Radiance: Holy Power for healing a target below this share. */
    val towerOfRadianceBelow: Double = 0.5,
)

/**
 * The tank and DPS classes: what their mechanics are worth, and how hard they
 * hit. Its own top-level key, like [RolesBalance], so none of it touches the
 * frozen healer numbers.
 */
@Serializable
data class ClassesBalance(
    /**
     * Player damage, by class name. Multiplied by a ramp that starts at the
     * class's [damageRampFloor] at level 1 and reaches 1 after [damageRampLevels].
     *
     * The ramp is there because the two curves have different shapes. The AI
     * party's damage is `16 + level^1.55`: the constant dominates early, so it
     * starts low and climbs. A player's grows with spirit and spell ranks from
     * a spell that already hits hard at level 1. Unramped, a DPS was 2.4-2.8x
     * an AI at level 1 and about 1.2x from level 20 on -- flat after that, so
     * a single scale cannot fix both ends. [com.jdial.aegis.sim.PlayerDamageBalanceTest]
     * pins the result.
     */
    val damageScale: Map<String, Double> = emptyMap(),
    /**
     * Per class, because the low end differs: a level-1 Mage runs out of mana
     * and a Rogue never does, so the same floor leaves one under the band and
     * the other at its top.
     */
    val damageRampFloor: Map<String, Double> = emptyMap(),
    /**
     * A class's mana pool, as a share of what its stats would give it. For the
     * classes that pay mana but are not healers: theirs used to be a healer's
     * pool, which no rotation could ever spend.
     */
    val manaPoolScale: Map<String, Double> = emptyMap(),

    val damageRampLevels: Int = 19,
    val warrior: WarriorBalance = WarriorBalance(),
    val deathKnight: DeathKnightBalance = DeathKnightBalance(),
    val mage: MageBalance = MageBalance(),
    val rogue: RogueBalance = RogueBalance(),
)

@Serializable
data class WarriorBalance(
    val rageCapBase: Double = 100.0,
    /** Vengeance: each point of the signature stat raises the rage cap by this. */
    val rageCapPerRating: Double = 2.0,
    /** Rage for taking a whole health bar of damage; less damage, pro rata. */
    val ragePerFullHealthTaken: Double = 160.0,
    /** Rage for landing a damage spell that does not itself cost rage. */
    val rageOnDamageCast: Double = 6.0,
    /**
     * Rage that comes simply from being in the fight: the floor that stops a
     * low-level tank standing with an empty bar and nothing to press.
     */
    val ragePerTick: Double = 0.0,
    /** Vengeance: threat bonus per point of the signature stat. */
    val threatPerRating: Double = 0.02,
)

@Serializable
data class DeathKnightBalance(
    /** How much of the damage taken so far is still "recent" after one tick. */
    val recentDamageDecayPerTick: Double = 0.97,
    /** Death Strike heals this share of recent damage taken... */
    val deathStrikeHealFraction: Double = 0.3,
    /** ...but never less than this share of max health. */
    val deathStrikeMinHealFraction: Double = 0.04,
    /** Blood Shield: the heal also shields for rating * this, as a fraction of the heal. */
    val bloodShieldPerRating: Double = 0.04,
    val bloodShieldTicks: Int = 60,
)

@Serializable
data class MageBalance(
    val chillTicks: Int = 50,
    /** Shatter: crit chance a chilled target grants the next non-Frostbolt spell. */
    val shatterCritBase: Double = 25.0,
    val shatterCritPerRating: Double = 2.0,
)

@Serializable
data class RogueBalance(
    val energyMax: Double = 100.0,
    val energyPerTick: Double = 1.25,
    val comboPointsMax: Int = 5,
    /** A finisher's damage is its base times combo points times this. */
    val finisherPerPoint: Double = 0.5,
    /** Seal Fate: builder crit chance per point of the signature stat. */
    val builderCritPerRating: Double = 2.0,
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
    /** How many ticks the AI healer's heal lands over. */
    val aiHealerHotTicks: Int = 6,
    /** It triages: nobody gets topped off, so chip damage accumulates. */
    val aiHealerHealBelowFraction: Double = 0.92,
    /**
     * How often the AI healer commits, in ticks. One is every tick.
     *
     * The note above says simulating an AI's *spell choice* is cost without
     * signal, and that still holds. Its **judgment** is a different thing: a
     * healer limited only by mana and heal size is a fuel tank, so a tank or
     * DPS player was graded on whether that tank ran dry and never on anything
     * they did. A delay is observable without modelling a rotation -- the bar
     * dips and stays dipped for a beat, and closing that gap is the seat's job.
     */
    val aiHealerReactionTicks: Int = 1,
    /**
     * Triage by lowest current health instead of by lowest health *fraction*.
     *
     * The mistake a real healer makes. A tank at 50 of 130 is in far more
     * danger than a mage at 40 of 65, and raw numbers say the opposite, so the
     * squishy one gets topped up while the tank sits low. Left to the player to
     * notice and answer, which is the whole of the seat.
     */
    val aiHealerTriageByRawHealth: Boolean = false,
    /**
     * How long the enemy has to be off the AI tank before it notices and taunts.
     * Zero is what it did: taunt the instant the cooldown allowed.
     *
     * The AI healer got judgment limits and the other two seats did not, so a
     * *healer* was still playing beside fuel tanks. One number buys two flaws
     * here, both of them a real tank's: the boss stays turned for a beat, and
     * because the taunt still fires eagerly once the beat is up, a brief pull
     * that would have resolved itself can spend the cooldown the real one
     * needed.
     */
    val aiTankNoticeTicks: Int = 0,
    /**
     * How often an AI damage dealer overreaches, and by how much.
     *
     * An AI damage dealer earns 0.283 of the scripted damage in threat per tick
     * against the tank's 0.375, so it could never pull -- it was incapable of
     * the mistake its human equivalent makes constantly. In its greed window it
     * generates [aiDpsGreedMultiplier] times its usual threat, which is enough
     * to cross the pull line, and then it wears the hit until the tank notices.
     *
     * Deterministic: the window opens on the tick count and the unit is chosen
     * by id, so nothing here draws from the rng.
     *
     * Zero ticks is off, which is what it did.
     */
    val aiDpsGreedEveryTicks: Int = 0,
    val aiDpsGreedTicks: Int = 0,
    val aiDpsGreedMultiplier: Double = 1.0,
    /**
     * How steeply the AI healer's healing and mana grow with level, pivoting
     * on [aiHealerLevelPivot]: 1.0 is the old straight line.
     *
     * The straight line was too flat. Incoming damage grows faster than
     * linearly, so from about level 28 a tank or DPS player's group died with
     * the AI healer still holding mana -- it could not heal fast enough -- and
     * its flat regen left it dry besides.
     */
    val aiHealerLevelExponent: Double = 1.0,
    val aiHealerLevelPivot: Double = 20.0,
    /** Added to [aiHealerManaRegenPerTick] per level, on the same curve. */
    val aiHealerManaRegenPerLevel: Double = 0.0,
    /**
     * What a tank takes of a boss hit, in a run where the player is not the
     * healer.
     *
     * Those runs send single-target hits to whoever holds threat -- the tank,
     * nearly always. The hits were tuned to land on a random party member,
     * and several late bosses land one bigger than a tank's whole health bar
     * (Dire Maul's buffed Mortal Strike: about 1,220 against 1,170). A tank
     * that wears every one of those needs the armour the healer game never
     * had to model. Healer runs are untouched.
     */
    val tankBossDamageTaken: Double = 1.0,
) {
    /** The level term the per-level constants are multiplied by. */
    fun aiHealerLevelTerm(level: Int): Double {
        val l = level.coerceAtLeast(1).toDouble()
        return l * Math.pow(l / aiHealerLevelPivot, aiHealerLevelExponent - 1.0)
    }

    fun aiHealerMaxMana(level: Int): Double = aiHealerManaBase + aiHealerManaPerLevel * aiHealerLevelTerm(level)

    fun aiHealerHeal(level: Int): Double = aiHealerHealBase + aiHealerHealPerLevel * aiHealerLevelTerm(level)

    fun aiHealerRegen(level: Int): Double = aiHealerManaRegenPerTick + aiHealerManaRegenPerLevel * aiHealerLevelTerm(level)
}

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
    /**
     * A critical heal's threat is multiplied by this, on everything it rolled
     * -- overheal included. A big crit is exactly the moment a healer should
     * be noticed; counting only the part that fit meant a crit on a nearly
     * full target generated almost nothing.
     */
    val critHealThreatMultiplier: Double = 1.0,
    /** The AI healer's heals, which do not spam or crit for show: kept at the old half. */
    val aiHealerThreatCoefficient: Double = 0.5,
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
    /** How long an AI tank's taunt pins the enemy, like the player's Taunt. */
    val aiTauntLockTicks: Int = 60,
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
    /**
     * Ticks every cast locks the whole action bar for. 10 = one second.
     *
     * Applies to every class. This is a deliberate change to the healer game as
     * well -- see the note in scripts/check-balance-frozen.mjs about why the
     * frozen-balance hash moved.
     */
    val globalCooldownTicks: Int = 10,
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
