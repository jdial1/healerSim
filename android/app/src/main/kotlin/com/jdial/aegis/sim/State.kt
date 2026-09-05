package com.jdial.aegis.sim

import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.PlayerClass
import kotlinx.serialization.Serializable

/**
 * The simulation state, ported from `src/gameEngineReducer.js`. Immutable: every
 * tick and every cast returns a new instance, matching the reducer semantics of
 * the web app (and making the parity harness straightforward).
 */

const val TICK_RATE_MS = 100
const val TICKS_PER_SECOND = 1000 / TICK_RATE_MS
const val HEALER_UNIT_ID = "5"
const val SUSPEND_SNAPSHOT_TICK_INTERVAL = 8
const val MANA_REGEN_PER_TICK = 0.5
const val MANA_SPIRIT_REGEN_LOCKOUT_TICKS = 5000 / TICK_RATE_MS

const val TICKS_1S = 10
const val TICKS_SPIRIT_REDEMPTION = 10 * TICKS_1S
const val ICD_SPIRIT_REDEMPTION = 120 * TICKS_1S
const val SURGE_OF_LIGHT_TICKS = 6 * TICKS_1S

/** How long a floating combat number stays on screen. */
const val FLOATING_TEXT_LIFETIME_TICKS = 22

// Player combat buff ids that are referenced by name across the engine.
const val BUFF_MANA_REGEN_POTION = "mana_regen_potion"
const val BUFF_SPIRIT_REGEN_LOCKOUT = "spirit_regen_lockout"
const val BUFF_POWER_INFUSION = "power_infusion"
const val BUFF_NATURAL_PERFECTION = "natural_perfection"

/** These two track stacks rather than time, so they must not decay per tick. */
val NO_TIME_DECAY_BUFFS = setOf(BUFF_POWER_INFUSION, BUFF_NATURAL_PERFECTION)

// Spell tags that gate behaviour.
const val TAG_DRUID_HOT = "druid-hot"
const val TAG_DRUID_CULTIVATION_HOT = "druid-cultivation-hot"
const val TAG_SWIFTMEND_CONSUMABLE = "swiftmend-consumable"
const val TAG_SWIFTMEND_PREFER = "swiftmend-prefer"
const val TAG_SYNERGY_DIRECT = "synergy-direct"
const val TAG_SYNERGY_PRIMER_SOURCE = "synergy-primer-source"
const val TAG_SURGE_FINISHER = "surge-finisher"
const val TAG_ARCHANGEL_SKIP = "archangel-skip"
const val TAG_TREE_OF_LIFE_BIG_DIRECT = "tree-of-life-big-direct"

@Serializable
enum class UnitRole { TANK, DPS, HEALER }

@Serializable
enum class CombatPhase { TRASH, BOSS }

/** A heal-over-time or other helpful aura on a party member. */
@Serializable
data class UnitBuff(
    val id: String,
    val name: String,
    val remainingTicks: Int,
    val healingPerTick: Double = 0.0,
    val icon: String = "",
    val sourceSpellId: String = "",
    val durationTicksMax: Int = 0,
    /** 1 + haste/100. Drives the tick accumulator, so haste adds ticks, not speed. */
    val tickIntervalScale: Double = 1.0,
    val tickAccumulator: Double = 0.0,
    val bloomBurstHeal: Double? = null,
    val stacks: Int = 0,
    val category: String = "helpful",
    val rendersAsHoTRing: Boolean = true,
)

/** A damage-over-time or other harmful aura on a party member. */
@Serializable
data class UnitDebuff(
    val id: String,
    val name: String,
    val remainingTicks: Int,
    val damagePerTick: Double,
    val icon: String = "",
    val sourceAbilityId: String = "",
    val dispellable: Boolean = false,
    val category: String = "harmful",
)

@Serializable
data class Unit(
    val id: String,
    val name: String,
    val role: UnitRole,
    val level: Int,
    val health: Double,
    val maxHealth: Double,
    val buffs: List<UnitBuff> = emptyList(),
    val debuffs: List<UnitDebuff> = emptyList(),
    val shield: Double = 0.0,
    val shieldTicksRemaining: Int = 0,
    val livingSeedPool: Double = 0.0,
) {
    val isAlive: Boolean get() = health > 0
}

/** A stacking or timed aura on the player (not a party member). */
@Serializable
data class PlayerBuff(
    val id: String,
    val remainingTicks: Int,
    val stacks: Int = 0,
    val potionDripPerTick: Double? = null,
)

@Serializable
data class BossBuff(
    val id: String,
    val name: String,
    val remainingTicks: Int,
    val partyDamageMultiplier: Double,
    val icon: String = "",
    val sourceAbilityId: String = "",
)

@Serializable
enum class FloatingKind { HEAL, ABSORB }

@Serializable
data class FloatingText(
    val id: Long,
    val unitId: String,
    val amount: Int,
    val kind: FloatingKind,
    val crit: Boolean,
    val expiresAtCombatTick: Int,
)

@Serializable
enum class DungeonOutcomeKind { SUCCESS, PARTY_WIPE, HEALER_DOWN }

@Serializable
data class RunStats(
    val totalHealing: Double = 0.0,
    val hps: Double = 0.0,
    val overhealPct: Double = 0.0,
    val hpm: Double = 0.0,
)

@Serializable
data class DungeonOutcome(
    val kind: DungeonOutcomeKind,
    val dungeonId: String,
    val xpGained: Int,
    val stats: RunStats = RunStats(),
    // The web app's outcome modal shows what a level-up unlocked. Progression
    // computed exactly this and nothing carried it, so Android silently threw
    // it away. Defaulted, so older suspend snapshots still decode.
    val leveledUp: Boolean = false,
    val upgradedSpellIds: List<String> = emptyList(),
    val upgradedPotion: Boolean = false,
)

@Serializable
data class GameState(
    // --- character (persisted) ---
    val playerClass: PlayerClass? = null,
    val level: Int = 1,
    val xp: Int = 0,
    val talentPoints: Int = 0,
    val talents: List<TalentRank> = emptyList(),
    val unlockedSpells: List<String> = emptyList(),
    val activeActionBars: List<String> = emptyList(),
    val completedDungeonIds: List<String> = emptyList(),
    val introTutorialComplete: Boolean = false,
    val tutorialCompletedSteps: List<String> = emptyList(),

    // --- combat ---
    val party: List<Unit> = emptyList(),
    val mana: Double = 0.0,
    val maxMana: Int = 100,
    val currentDungeon: Dungeon? = null,
    val dungeonPace: String? = null,
    val dungeonProgress: Double = 0.0,
    val combatPhase: CombatPhase = CombatPhase.TRASH,
    val trashPullsRemaining: Int = TRASH_PACK_COUNT,
    val enemyHealth: Double = 0.0,
    val enemyMaxHealth: Double = 0.0,
    val isCombatActive: Boolean = false,
    val bossSelfBuffs: List<BossBuff> = emptyList(),
    val playerCombatBuffs: List<PlayerBuff> = emptyList(),
    val internalCooldowns: Map<String, Int> = emptyMap(),
    val spellCooldowns: Map<String, Int> = emptyMap(),
    val capstoneForm: String? = null,
    val holyPower: Int = 0,
    val beaconTargetId: String = "1",
    val mechanicCooldown: Int = 0,
    val mechanicOrdinal: Int = 0,
    val combatElapsedTicks: Int = 0,
    /** Rolled once at run start; scales party damage so clear times vary. */
    val runDpsJitter: Double = 1.0,
    val endlessStacks: Int = 0,
    val manaPotionsUsedThisDungeon: Int = 0,
    val floatingCombatTexts: List<FloatingText> = emptyList(),
    val isTutorialPaused: Boolean = false,
    val dungeonOutcome: DungeonOutcome? = null,

    // --- run accumulators ---
    val runHealEffective: Double = 0.0,
    val runHealOverheal: Double = 0.0,
    val runManaSpentHealing: Double = 0.0,
) {
    val healer: Unit? get() = party.firstOrNull { it.role == UnitRole.HEALER }

    fun unit(id: String): Unit? = party.firstOrNull { it.id == id }

    /** Combat-scoped fields reset between runs; character fields are preserved. */
    fun clearedCombat(): GameState = copy(
        currentDungeon = null,
        dungeonPace = null,
        dungeonProgress = 0.0,
        combatPhase = CombatPhase.TRASH,
        trashPullsRemaining = TRASH_PACK_COUNT,
        enemyHealth = 0.0,
        enemyMaxHealth = 0.0,
        bossSelfBuffs = emptyList(),
        playerCombatBuffs = emptyList(),
        internalCooldowns = emptyMap(),
        spellCooldowns = emptyMap(),
        capstoneForm = null,
        holyPower = 0,
        mechanicCooldown = 0,
        mechanicOrdinal = 0,
        combatElapsedTicks = 0,
        runDpsJitter = 1.0,
        endlessStacks = 0,
        manaPotionsUsedThisDungeon = 0,
        floatingCombatTexts = emptyList(),
        runHealEffective = 0.0,
        runHealOverheal = 0.0,
        runManaSpentHealing = 0.0,
    )
}

/**
 * Clears the fields the web app clears when a run ends, and only those.
 *
 * Notably `combatPhase`, `trashPullsRemaining`, `combatElapsedTicks`, the run
 * heal accumulators, `capstoneForm` and `holyPower` all survive — the outcome
 * screen reads some of them, and [clearedCombat] (used when *starting* a run)
 * is what actually wipes the slate.
 */
fun GameState.endedRun(): GameState = copy(
    isCombatActive = false,
    currentDungeon = null,
    dungeonPace = null,
    playerCombatBuffs = emptyList(),
    bossSelfBuffs = emptyList(),
    mechanicCooldown = 0,
    mechanicOrdinal = 0,
    spellCooldowns = emptyMap(),
    floatingCombatTexts = emptyList(),
    endlessStacks = 0,
)
