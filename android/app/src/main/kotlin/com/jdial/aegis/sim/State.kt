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
/**
 * The party slot the human occupies. Always "5", whatever role they play.
 *
 * Party ids are positional and load-bearing ("1" is the tank, "2".."4" the DPS),
 * and both the engine and the save index into them. When roles become playable
 * the player keeps this slot and only their `role` changes -- the generator
 * fills the other four with whatever roles are missing. Moving the player
 * between slots to match their role would touch every one of those call sites
 * for no gain.
 *
 * Named HEALER_UNIT_ID until the healer stopped being the only thing you can be.
 */
const val PLAYER_UNIT_ID = "5"

/** The only consumable, referenced from the pipeline, the UI and the loadout. */
const val MANA_POTION_ID = "mana_potion"
const val SUSPEND_SNAPSHOT_TICK_INTERVAL = 8
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

/** A cast defensive cooldown. Carries its own reduction in PlayerBuff.magnitude. */
const val BUFF_ACTIVE_MITIGATION = "active_mitigation"

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

/**
 * The roles of the five party slots, in slot order, for a party led by
 * [playerRole]. The player is always last -- slot ids are positional and
 * load-bearing across the engine, the UI and the save.
 *
 * Shared with the queue lobby rather than restated there. The lobby used to
 * draw four anonymous dots and a fifth captioned "the healer is you", which was
 * true only while healer was the one playable role; anything that describes the
 * group it is about to form has to be derived from the same place the engine
 * builds it, or it drifts into being decoration again.
 */
fun partyRoles(playerRole: UnitRole): List<UnitRole> = buildList {
    // Tank first, so slot "1" is the tank whenever there is an AI one -- a lot
    // of UI and the tank-death rule both assume it.
    if (playerRole != UnitRole.TANK) add(UnitRole.TANK)
    repeat(if (playerRole == UnitRole.DPS) 2 else 3) { add(UnitRole.DPS) }
    if (playerRole != UnitRole.HEALER) add(UnitRole.HEALER)
    add(playerRole)
}

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
    /**
     * How much the enemy wants to hit this unit.
     *
     * Accrues from damage dealt and effective healing done; overheal generates
     * none, which is the one threat rule a healer can actually play around.
     * Nothing reads it yet -- see [com.jdial.aegis.data.Targeting.HIGHEST_THREAT].
     *
     * There is deliberately no decay: it would be a per-tick multiply across
     * five units modelling something no player can perceive. The table is
     * zeroed on phase transition and when a unit dies instead.
     */
    val threat: Double = 0.0,
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
    /**
     * A generic value carried by the buff. Used by defensive cooldowns for the
     * fraction of damage they remove; null for buffs that only track time.
     */
    val magnitude: Double? = null,
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
    /**
     * True when [stats] describe the whole group rather than this player --
     * a guest's outcome, built from the host's run accumulators. The dialog
     * labels them as such rather than crediting a tank with the group's
     * healing.
     */
    val groupStats: Boolean = false,
)

/**
 * Everything that describes one *player* rather than the world.
 *
 * These fields all lived on [GameState] directly, which quietly asserted that
 * exactly one human exists: two people casting in the same tick would have
 * shared a mana pool, a cooldown table and a set of buffs. Keyed by party unit
 * id ("1".."5") so a participant and their [Unit] are the same slot.
 *
 * Single player is a map of one. There is deliberately no second code path --
 * the whole point is that the solo game runs the multi-participant engine, so
 * the multiplayer case cannot rot.
 *
 * Progression (xp, talent points, completed dungeons) stays on [GameState]: it
 * is the local player's account, awarded once at the end of a run, and moving it
 * here would drag the save format and the XP curve into a refactor that is
 * already the riskiest in the project.
 */
@Serializable
data class Participant(
    val unitId: String,
    val playerClass: PlayerClass? = null,
    val level: Int = 1,
    val talents: List<TalentRank> = emptyList(),
    val unlockedSpells: List<String> = emptyList(),
    val activeActionBars: List<String> = emptyList(),
    /** Derived from the class's ClassMeta.role. */
    val role: UnitRole = UnitRole.HEALER,
    val mana: Double = 0.0,
    val maxMana: Int = 100,
    val playerCombatBuffs: List<PlayerBuff> = emptyList(),
    val internalCooldowns: Map<String, Int> = emptyMap(),
    val spellCooldowns: Map<String, Int> = emptyMap(),
    /**
     * Ticks until this participant's next cast is allowed, from any spell.
     *
     * Stops the bar being spammed, and bounds how many actions a client can
     * produce per second -- which is what makes a relayed action stream
     * predictable rather than unbounded.
     */
    val globalCooldownRemaining: Int = 0,
    val capstoneForm: String? = null,
    val holyPower: Int = 0,
    val beaconTargetId: String = "1",
    /**
     * Damage this participant's abilities have dealt since the last tick
     * consumed it.
     *
     * A plain accumulator, not a queue: casts already resolve synchronously
     * before the next Tick action, so there is never more than a tick's worth
     * of it outstanding.
     */
    val pendingEnemyDamage: Double = 0.0,
    /**
     * Threat this participant's casts have generated since the last tick
     * consumed it.
     *
     * Separate from [pendingEnemyDamage] because threat is not proportional to
     * damage: a tank's Shield Slam is worth three times its damage in threat and
     * a taunt is worth threat with no damage at all. Deriving one from the other
     * is what made `Spell.threatMultiplier` inert.
     */
    val pendingPlayerThreat: Double = 0.0,
    val manaPotionsUsedThisDungeon: Int = 0,
    /**
     * False for a slot the AI is driving. Nothing reads it yet -- the AI party
     * is still scripted rather than participant-driven -- but the queue fills
     * empty slots with AI, and that is the flag it will set.
     */
    val isHuman: Boolean = true,
) {
    /** Combat-scoped fields reset between runs; character fields are preserved. */
    fun clearedCombat(): Participant = copy(
        playerCombatBuffs = emptyList(),
        internalCooldowns = emptyMap(),
        spellCooldowns = emptyMap(),
        globalCooldownRemaining = 0,
        capstoneForm = null,
        holyPower = 0,
        pendingEnemyDamage = 0.0,
        pendingPlayerThreat = 0.0,
        manaPotionsUsedThisDungeon = 0,
    )
}

@Serializable
data class GameState(
    /**
     * Every player in the run, keyed by party unit id. One entry in single
     * player -- see [Participant] for why there is no separate solo path.
     */
    val participants: Map<String, Participant> = emptyMap(),
    /** Which participant this client is driving. */
    val localUnitId: String = PLAYER_UNIT_ID,

    // --- character (persisted) ---
    val xp: Int = 0,
    val talentPoints: Int = 0,
    val completedDungeonIds: List<String> = emptyList(),
    val introTutorialComplete: Boolean = false,
    val tutorialCompletedSteps: List<String> = emptyList(),

    // --- combat ---
    val party: List<Unit> = emptyList(),
    val currentDungeon: Dungeon? = null,
    val dungeonPace: String? = null,
    val dungeonProgress: Double = 0.0,
    val combatPhase: CombatPhase = CombatPhase.TRASH,
    val trashPullsRemaining: Int = TRASH_PACK_COUNT,
    val enemyHealth: Double = 0.0,
    val enemyMaxHealth: Double = 0.0,
    val isCombatActive: Boolean = false,
    val bossSelfBuffs: List<BossBuff> = emptyList(),
    val mechanicCooldown: Int = 0,
    val mechanicOrdinal: Int = 0,
    /** Who the enemy is currently on. Null until the first threat is generated. */
    /**
     * The AI healer's mana. Zero and unused while the player is the healer.
     *
     * Separate from [mana], which is the player's: the two must not share a
     * pool or healing yourself would starve the party.
     */
    val aiHealerMana: Double = 0.0,
    /**
     * DoTs the player has on the enemy. Reuses [UnitDebuff], which already
     * carries remainingTicks, damagePerTick, icon and sourceAbilityId.
     */
    val enemyDebuffs: List<UnitDebuff> = emptyList(),
    val enemyTargetId: String? = null,
    /** While positive, [enemyTargetId] is held by a taunt regardless of the table. */
    val tauntLockTicks: Int = 0,
    val tauntedById: String? = null,
    val combatElapsedTicks: Int = 0,
    /** Rolled once at run start; scales party damage so clear times vary. */
    val runDpsJitter: Double = 1.0,
    val endlessStacks: Int = 0,
    val floatingCombatTexts: List<FloatingText> = emptyList(),
    val isTutorialPaused: Boolean = false,
    val dungeonOutcome: DungeonOutcome? = null,

    // --- run accumulators ---
    val runHealEffective: Double = 0.0,
    val runHealOverheal: Double = 0.0,
    val runManaSpentHealing: Double = 0.0,
    /**
     * XP awarded this run, per party slot, for every human in it.
     *
     * The engine only ever applied XP to the local player, and the frame
     * carried none of it, so a guest finished a whole dungeon with nothing. The
     * host now credits every human here, each on *their own* level, and the
     * frame carries the running total. Cumulative rather than per-event so a
     * guest applies only the increase since the last frame it saw -- a missed
     * or repeated frame can neither lose nor double an award, and endless waves,
     * which award mid-run, work the same way.
     *
     * On a guest the same field records what it has already applied.
     */
    val runXpAwards: Map<String, Int> = emptyMap(),
) {
    /**
     * The participant this client drives.
     *
     * The accessors below exist so the several hundred read sites that said
     * `state.mana` still say `state.mana`. Only *writes* had to move, and those
     * the compiler found by deleting the constructor parameters. A default is
     * returned rather than throwing because GameState() with no character is a
     * real state -- the main menu.
     */
    val me: Participant get() = participants[localUnitId] ?: Participant(localUnitId)

    val playerClass: PlayerClass? get() = me.playerClass
    val level: Int get() = me.level
    val talents: List<TalentRank> get() = me.talents
    val unlockedSpells: List<String> get() = me.unlockedSpells
    val activeActionBars: List<String> get() = me.activeActionBars
    val playerRole: UnitRole get() = me.role
    val mana: Double get() = me.mana
    val maxMana: Int get() = me.maxMana
    val playerCombatBuffs: List<PlayerBuff> get() = me.playerCombatBuffs
    val internalCooldowns: Map<String, Int> get() = me.internalCooldowns
    val spellCooldowns: Map<String, Int> get() = me.spellCooldowns
    val globalCooldownRemaining: Int get() = me.globalCooldownRemaining
    val capstoneForm: String? get() = me.capstoneForm
    val holyPower: Int get() = me.holyPower
    val beaconTargetId: String get() = me.beaconTargetId
    val manaPotionsUsedThisDungeon: Int get() = me.manaPotionsUsedThisDungeon

    /** Damage every participant has dealt since the last tick consumed it. */
    val pendingEnemyDamage: Double get() = participants.values.sumOf { it.pendingEnemyDamage }

    /** True when a real person is driving this party slot. */
    fun isHuman(unitId: String): Boolean = participants[unitId]?.isHuman == true

    /** Rewrites one participant. */
    fun withParticipant(id: String, f: (Participant) -> Participant): GameState =
        copy(participants = participants + (id to f(participants[id] ?: Participant(id))))

    /** Rewrites the participant this client drives. */
    fun withMe(f: (Participant) -> Participant): GameState = withParticipant(localUnitId, f)

    /**
     * The same state seen from another participant's seat.
     *
     * The cast pipeline and the class hooks read the acting player through
     * several dozen sites -- `state.mana`, `state.talents`, `state.capstoneForm`,
     * `state.level` -- and every one of them means "whoever is casting". Rather
     * than thread an actor parameter through all of them and rely on nobody
     * forgetting one, [Engine] points [localUnitId] at the actor for the
     * duration of the cast and points it back afterwards. Miss a site and it
     * still resolves to the right participant.
     *
     * This is the only place localUnitId means anything other than "this
     * client": treat it as a scope, and always restore it.
     */
    fun actingAs(unitId: String): GameState =
        if (unitId == localUnitId) this else copy(localUnitId = unitId)

    /** Rewrites every participant. */
    fun withEachParticipant(f: (Participant) -> Participant): GameState =
        copy(participants = participants.mapValues { (_, p) -> f(p) })

    val healer: Unit? get() = party.firstOrNull { it.role == UnitRole.HEALER }

    fun unit(id: String): Unit? = party.firstOrNull { it.id == id }

    /** Combat-scoped fields reset between runs; character fields are preserved. */
    fun clearedCombat(): GameState = withEachParticipant { it.clearedCombat() }.copy(
        currentDungeon = null,
        dungeonPace = null,
        dungeonProgress = 0.0,
        combatPhase = CombatPhase.TRASH,
        trashPullsRemaining = TRASH_PACK_COUNT,
        enemyHealth = 0.0,
        enemyMaxHealth = 0.0,
        bossSelfBuffs = emptyList(),
        mechanicCooldown = 0,
        mechanicOrdinal = 0,
        enemyTargetId = null,
        tauntLockTicks = 0,
        tauntedById = null,
        enemyDebuffs = emptyList(),
        aiHealerMana = 0.0,
        combatElapsedTicks = 0,
        runDpsJitter = 1.0,
        endlessStacks = 0,
        floatingCombatTexts = emptyList(),
        runHealEffective = 0.0,
        runHealOverheal = 0.0,
        runManaSpentHealing = 0.0,
        runXpAwards = emptyMap(),
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
fun GameState.endedRun(): GameState = withEachParticipant {
    it.copy(playerCombatBuffs = emptyList(), spellCooldowns = emptyMap(), globalCooldownRemaining = 0)
}.copy(
    isCombatActive = false,
    currentDungeon = null,
    dungeonPace = null,
    bossSelfBuffs = emptyList(),
    mechanicCooldown = 0,
    mechanicOrdinal = 0,
    floatingCombatTexts = emptyList(),
    endlessStacks = 0,
)
