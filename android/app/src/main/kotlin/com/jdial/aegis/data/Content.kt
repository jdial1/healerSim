package com.jdial.aegis.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors of the web app's JSON schemas. Presentation-only fields (Tailwind class
 * strings such as `color`, `actionBarBorderClass`, `cardTheme`) are deliberately
 * not modelled — the Android UI derives its colours from the design system
 * instead, and the parser is configured with `ignoreUnknownKeys`.
 */

// --- spells -----------------------------------------------------------------

/**
 * The *shape* of a spell: one target, over time, or the whole party. Dozens of
 * branches key off this -- pandemic capping, HoT application, the aura socket
 * renderer -- so it deliberately says nothing about whether the spell helps or
 * hurts. [SpellSchool] carries that, orthogonally, which is what makes
 * `DIRECT` + `DAMAGE` a nuke and `HOT` + `DAMAGE` a DoT with no new shape code.
 */
enum class SpellType { DIRECT, HOT, AOE }

/**
 * Who a spell is pointed at. Every spell in the game today is [HEAL]; the other
 * two exist so a tank or DPS class is content rather than an engine change.
 */
@Serializable
enum class SpellSchool {
    @SerialName("heal") HEAL,
    @SerialName("damage") DAMAGE,
    @SerialName("utility") UTILITY,
}

@Serializable
data class SpellBalance(
    val directHealSynergyMultiplier: Double? = null,
)

@Serializable
data class Spell(
    val id: String,
    val name: String,
    val type: SpellType,
    val manaCost: Int,
    val healing: Double,
    /** Ticks. There is no cast time or GCD in this game; cooldown is the only gate. */
    val cooldown: Int = 0,
    val hotDuration: Int? = null,
    val hotHealingPerTick: Double? = null,
    val manaRegenBuffDurationTicks: Int? = null,
    val icon: String = "",
    val tags: List<String> = emptyList(),
    val balance: SpellBalance? = null,

    // --- role fields. All defaulted, so every existing spells.json parses
    // unchanged and no healer spell means anything different than it did.

    val school: SpellSchool = SpellSchool.HEAL,
    /**
     * `healing` doubles as the damage magnitude when [school] is DAMAGE.
     *
     * Reusing the field rather than adding `damage` is deliberate: it inherits
     * spell ranks, the crit pipeline and the healingBoost talent stat with no
     * new code. The only oddity is a stat named for healing scaling damage,
     * which no player sees because tank and DPS classes have their own trees.
     */
    val threatMultiplier: Double = 1.0,
    val flatThreat: Double = 0.0,
    /** Non-null makes this a taunt: pins the enemy for this many ticks. */
    val tauntTicks: Int? = null,
    /** A defensive cooldown: fraction of incoming damage removed while it lasts. */
    val damageReduction: Double? = null,
    val damageReductionTicks: Int? = null,
    /** MANA today. RAGE and ENERGY exist for the tank and DPS classes. */
    val resource: String = "MANA",
    /** Cancels a boss cast that can be interrupted. */
    /** Removes a dispellable debuff from its target (see CastPipeline.cleansed). */
    val dispels: Boolean = false,
    val interrupts: Boolean = false,
) {
    fun hasTag(tag: String) = tag in tags

    /** "mana", "rage" or "energy", for anywhere a cost is written out. */
    val resourceName: String get() = resource.lowercase()

    /** Convenience for the cast pipeline, which branches on this constantly. */
    val isDamage: Boolean get() = school == SpellSchool.DAMAGE
}

// --- talents ----------------------------------------------------------------

/** The closed set of declarative stat bonuses; anything else needs hook code. */
@Serializable
data class StatBonus(
    val manaPool: Double = 0.0,
    val healingBoost: Double = 0.0,
    val critChance: Double = 0.0,
    val haste: Double = 0.0,
    val uniqueStat: Double = 0.0,
    val manaReturnOnDirectHeal: Double = 0.0,
)

@Serializable
data class Talent(
    val id: String,
    val name: String,
    val description: String = "",
    val maxPoints: Int,
    val levelReq: Int,
    val cost: Int = 1,
    val icon: String = "",
    val gridX: Int,
    val gridY: Int,
    val mechanicId: String? = null,
    val spellId: String? = null,
    val prerequisites: List<String> = emptyList(),
    val exclusiveWith: List<String> = emptyList(),
    val synergyWith: List<String> = emptyList(),
    val maxRankBonusDescription: String? = null,
    val statBonus: StatBonus? = null,
    /**
     * Per-rank tuning of one mechanic, by key: `damage:<spell>`,
     * `cooldown:<spell>` (ticks), `cost:<spell>`, `execute`, `threat`, and the
     * class keys read in RoleHooks. Lets a tree say something other than "+x%
     * power" without a hook per talent.
     */
    val effects: Map<String, Double> = emptyMap(),
)

// --- class metadata ---------------------------------------------------------

@Serializable
data class StatCurves(
    val baseIntellect: Double,
    val baseSpirit: Double,
    val intellectPerLevel: Double,
    val spiritPerLevel: Double,
    val baseUniqueStat: Double,
    val uniqueStatPerLevel: Double,
)

@Serializable
data class Progression(
    val starterSpells: List<String>,
    val spellOrder: List<String>,
    // Not every class has a capstone -- the three healers do, a Mage does not.
    // Empty rather than null so the existing `== "priest_archangel"` style
    // comparisons keep working untouched.
    val capstoneForm: String = "",
    val capstoneMechanicId: String = "",
    val capstonePlayerBuffId: String = "",
)

@Serializable
data class ClassMeta(
    val id: String,
    val name: String,
    /**
     * TANK, DPS or HEALER. Absent means HEALER, which is what the three shipped
     * classes are.
     *
     * Role is a property of the class rather than a separate axis on the
     * character: that keeps `aegis.roster.v2` keyed by class alone, so adding
     * roles needs no save migration and PlayerClass still identifies a
     * character.
     */
    val role: String = "HEALER",
    /**
     * Not selectable, with no way to unlock it -- the class is not finished.
     *
     * Distinct from the Paladin, which is finished and gated on a level. The
     * field was in every class.json from the start but never declared here, so
     * kotlinx dropped it and the Paladin gate had to be hardcoded instead.
     */
    val locked: Boolean = false,
    val description: String = "",
    val passiveTraitName: String = "",
    val passiveTraitDescription: String = "",
    val passiveTraitIcon: String = "",
    val statCurves: StatCurves,
    val progression: Progression,
)

// --- dungeons ---------------------------------------------------------------

enum class Targeting {
    @SerialName("single_random") SINGLE_RANDOM,
    @SerialName("two_random") TWO_RANDOM,
    @SerialName("all_living") ALL_LIVING,

    /**
     * Whoever holds the most threat -- the mode a tank exists for.
     *
     * No dungeon in dungeons.json uses it. That is the point: every existing
     * boss keeps drawing its victims from the rng exactly as before, so adding
     * threat cannot shift the seeded stream the parity corpus was built on.
     * New content opts in; old content never notices.
     */
    @SerialName("highest_threat") HIGHEST_THREAT,
}

@Serializable
data class DebuffTemplate(
    val abilityId: String,
    val name: String,
    val icon: String = "",
    val durationTicks: Int,
    val damagePerTick: Double,
    val targeting: Targeting,
    val dispellable: Boolean = false,
)

@Serializable
data class SelfBuffTemplate(
    val abilityId: String,
    val name: String,
    val icon: String = "",
    val durationTicks: Int,
    val partyDamageMultiplier: Double,
)

@Serializable
data class AttackTemplate(
    val abilityId: String,
    val name: String,
    val icon: String = "",
    val damage: Double,
    val targeting: Targeting,
    /**
     * Ticks the attack winds up before it lands -- the telegraph. Zero lands
     * at once, as every attack did before. Supplied by the Android-owned
     * content/encounters.json, never by the web app's dungeons.json.
     */
    val castTicks: Int = 0,
    /** A DPS can cancel it while it winds up. */
    val interruptible: Boolean = false,
    /**
     * Landing, this puts the enemy in a state for [stateTicks]: `reflect`
     * (direct damage comes back to whoever dealt it; the AI holds), `shield`
     * (no damage until a kick exposes it) or `frenzy` (it hits harder).
     * Kicking the cast stops it.
     */
    val grantsState: String? = null,
    val stateTicks: Int = 0,
    /** What the boss says as the wind-up starts: its fixed tell. */
    val tell: String = "",
)

/** content/encounters.json: Android-only tuning layered onto the shared dungeons. */
@Serializable
data class Encounters(
    val attacks: Map<String, AttackTuning> = emptyMap(),
    /** Per dungeon id: what this layer adds to that boss. */
    val bosses: Map<String, BossTuning> = emptyMap(),
    /** How long an AI DPS lets a cast run before kicking it. */
    val aiKickDelayTicks: Int = 8,
    /** Per debuff ability id: what the debuff does beyond ticking. */
    val mechanics: Map<String, DebuffMechanic> = emptyMap(),
    /** How often an AI healer may dispel; 0 means it never does. */
    val aiDispelEveryTicks: Int = 0,
    val pressure: Pressure = Pressure(),
    /** Per dungeon id, per trash pull in order: what the pull brings besides its pack. */
    val trash: Map<String, List<PullTuning>> = emptyMap(),
    val addRules: AddRules = AddRules(),
    /**
     * A kickable cast that lands while a human damage dealer could have
     * kicked it hits this much harder: a lesson, not a nuisance.
     */
    val unkickedDamageMultiplier: Double = 1.0,
    /** A frenzied enemy's damage multiplier (AttackTemplate.grantsState). */
    val frenzyDamageMultiplier: Double = 1.0,
    val rules: Map<String, DungeonRules> = emptyMap(),
    /**
     * What the tank takes from the boss while a person is healing.
     *
     * A tank run mitigates the tank (roles.tankBossDamageTaken) because an AI
     * healer is covering it. A healer run never did, so the seat with the
     * largest intake was unmitigated in exactly the runs where one person has
     * to cover all five. 1.0 is the old behaviour, which is what the parity
     * corpus replays.
     */
    val healerRunTankDamage: Double = 1.0,
    /**
     * The ambient chip damage while a person is healing. One healer covers
     * five people against it, and at the later tiers it outran anything they
     * could cast. 1.0 is the old behaviour.
     */
    val healerRunChipDamage: Double = 1.0,
    /**
     * What a boss hits a non-tank for, while a person is tanking.
     *
     * Holding the line is the tank's whole job, and nothing measured it: a
     * tank who pressed nothing all run still won, because the boss beating on
     * a damage dealer cost the party no more than beating on the tank. 1.0 is
     * the old behaviour. Healer runs are excluded -- their boss picks at
     * random, not by threat, and the recorded runs replay that.
     */
    val unheldTargetDamage: Double = 1.0,
    /**
     * A player healer's power against the later dungeons. The AI healer heals
     * by a formula that grows with level; a person heals with spell ranks,
     * which do not keep up. Off by default, which is what the parity corpus
     * replays.
     */
    val healPower: HealPower = HealPower(),
    /** Run XP for everyone when two or more people are in the party. */
    val groupXpMultiplier: Double = 1.0,
    val hard: HardMode = HardMode(),
)

/**
 * Hard mode: a dungeon you have already cleared, taken seriously.
 *
 * The over-level step is what keeps it honest: a level-30 tank walking back
 * into Deadmines meets enemies scaled to him, not to the level range on the
 * card.
 */
@Serializable
data class HardMode(
    val healthMultiplier: Double = 1.0,
    val damageMultiplier: Double = 1.0,
    val xpMultiplier: Double = 1.0,
    /** Health and damage grow by this much per level above the dungeon's range. */
    val overLevelStep: Double = 0.0,
    /** The enrage timer is this share of its usual length. */
    val enrageScale: Double = 1.0,
)

/** What this moment's enemy rotates through: the boss's, or this trash pull's. */
fun Encounters.pullCombat(dungeonId: String?, pullIndex: Int): BossCombat? =
    dungeonId?.let { trash[it] }?.getOrNull(pullIndex)?.combat

/** One trash pull's extra enemies (see [AddTemplate]). */
@Serializable
data class PullTuning(
    val adds: List<AddTemplate> = emptyList(),
    /** The pull's own mechanic rotation, as a boss has: bleeds, casts, states. */
    val combat: BossCombat? = null,
)

/** See [Encounters.healPower]. */
@Serializable
data class HealPower(
    val base: Double = 1.0,
    /** Added per level above [fromLevel]. */
    val perLevel: Double = 0.0,
    val fromLevel: Int = 20,
)

/**
 * What one enemy looks like: a sprite the app has, and a colour laid over it
 * so one tile can serve several creatures.
 *
 * Content, not code. Adding a boss is a JSON edit; only *new art* touches
 * Kotlin, in `BattleView.spriteFiles`.
 */
@Serializable
data class EnemyLookDef(
    val sprite: String,
    val tint: String? = null,
    /** Which dungeon it belongs to. Read by nobody: it keeps the file legible. */
    val from: String = "",
)

/** Rules one dungeon plays by. */
@Serializable
data class DungeonRules(
    /** Pull after pull, no breather between. */
    val noRests: Boolean = false,
)

/**
 * A boss's second wind: at [atHealth] of its health it says [tell], and from
 * then on its rotation includes these templates -- or is only these, with
 * [replace]. Whatever it was casting is thrown away, so a phase reads as a
 * change rather than a pause.
 */
@Serializable
data class BossPhase(
    val atHealth: Double,
    val tell: String = "",
    val attacks: List<AttackTemplate> = emptyList(),
    val debuffs: List<DebuffTemplate> = emptyList(),
    val adds: List<AddTemplate> = emptyList(),
    val replace: Boolean = false,
)

/** Adds a boss calls in once, on falling to [atHealth] of its health. */
@Serializable
data class BossAdds(val atHealth: Double, val spawn: List<AddTemplate>)

/**
 * An enemy beside the main one, with its own health bar -- a target a damage
 * dealer has to choose to switch to.
 *
 * - `mender` keeps casting a heal on the main enemy, [healFraction] of its
 *   max health each; a kick or its death stops it.
 * - `runner` flees on falling below AddRules.runnerFleeBelow and, unless it
 *   dies in time, brings one more pull.
 * - `add` just hurts: [damagePerTick] on the party's healer.
 * - `bomb` goes off on the whole party for [blast] when its fuse
 *   (AddRules.bombFuseTicks) runs out, unless it dies first.
 * - `pack` is the next pull, brought in early by "Pull now": while it stands
 *   the party takes double trash damage.
 */
@Serializable
data class AddTemplate(
    val kind: String,
    val name: String,
    /** An enemy name `content/data/looks.json` gives a sprite to. */
    val looksLike: String = name,
    /** Its max health, as a share of the main enemy's. */
    val health: Double,
    val damagePerTick: Double = 0.0,
    val healFraction: Double = 0.0,
    val blast: Double = 0.0,
) {
    companion object {
        const val MENDER = "mender"
        const val RUNNER = "runner"
        const val ADD = "add"
        const val PACK = "pack"
        const val BOMB = "bomb"
    }
}

@Serializable
data class AddRules(
    val menderEveryTicks: Int = 80,
    val menderCastTicks: Int = 25,
    val runnerFleeBelow: Double = 0.3,
    val runnerEscapeTicks: Int = 50,
    /**
     * With a human damage dealer in the run, this share of the AI's damage
     * goes to adds; the rest is the human's call. Without one, the AI kills
     * adds first.
     */
    val aiAddShareWithHumanDps: Double = 0.2,
    val bombFuseTicks: Int = 100,
    /** One knob over everything adds hit for, for tuning passes. */
    val damageScale: Double = 1.0,
)

/**
 * How a run leans on the party over time. Every value defaults to off, which
 * is what the shared data the parity corpus replays gets.
 */
@Serializable
data class Pressure(
    /** Boss ticks before the enrage starts; 0 never enrages. A boss may override it. */
    val enrageAfterTicks: Int = 0,
    /** Enraged, boss damage grows by this share per tick. */
    val enrageRampPerTick: Double = 0.0,
    /** How long the boss stays exposed after a kick, or on reaching [exposedBelowHealth]. */
    val exposedTicks: Int = 0,
    val exposedDamageMultiplier: Double = 1.0,
    /** Exposed once per boss at this share of health; 0 never. */
    val exposedBelowHealth: Double = 0.0,
    /** The breather after each trash pull; 0 goes straight on. */
    val restTicks: Int = 0,
    /** Resting, the party regains these shares of max health and mana per tick. */
    val restHealthPerTick: Double = 0.0,
    val restManaPerTick: Double = 0.0,
    /** Pulling early banks this much extra run XP (as a share) per rest tick skipped. */
    val earlyPullXpPerTick: Double = 0.0,
)

/**
 * A boss debuff that is a puzzle rather than a number: when to dispel it.
 *
 * - `bomb`: dispelled with more than [safeBelowTicks] left, it bursts on the
 *   whole party; left to run out, it bursts on its carrier.
 * - `poison`: gains a stack every [everyTicks], up to [maxStacks], and never
 *   runs out; each stack is another tick of damage.
 * - `mind_control`: the carrier hits its most-hurt ally every [everyTicks].
 * - `curse_chain`: jumps to an uncursed ally every [everyTicks].
 * - `heal_absorb`: the carrier's next [absorb] healing is eaten.
 * - `wound`: stacks like poison on whoever holds threat; at [maxStacks] the
 *   next stack bursts for [burstDamage] instead. The carrier's defensive
 *   clears it -- the tank's signature moment.
 */
@Serializable
data class DebuffMechanic(
    val kind: String,
    /** Overrides the template's duration; the timers below count from it. */
    val durationTicks: Int? = null,
    val everyTicks: Int = 0,
    val maxStacks: Int = 1,
    val burstDamage: Double = 0.0,
    val safeBelowTicks: Int = 0,
    val hitDamage: Double = 0.0,
    val absorb: Double = 0.0,
) {
    companion object {
        const val BOMB = "bomb"
        const val POISON = "poison"
        const val MIND_CONTROL = "mind_control"
        const val CURSE_CHAIN = "curse_chain"
        const val WOUND = "wound"
        const val HEAL_ABSORB = "heal_absorb"
    }
}

@Serializable
data class AttackTuning(val castTicks: Int = 0, val interruptible: Boolean = false, val tell: String = "")

@Serializable
data class BossTuning(
    /** Attacks this boss has in addition to the shared one: a signature moment. */
    val extraAttacks: List<AttackTemplate> = emptyList(),
    val extraDebuffs: List<DebuffTemplate> = emptyList(),
    /** This boss's own enrage timer, if not the shared one. */
    val enrageAfterTicks: Int? = null,
    /** Waves of adds, each called once as the boss falls past its share of health. */
    val adds: List<BossAdds> = emptyList(),
    val phases: List<BossPhase> = emptyList(),
)

/** Boss ticks before [dungeonId]'s boss enrages; 0 means never. */
fun Encounters.enrageAfterTicks(dungeonId: String?): Int =
    dungeonId?.let { bosses[it]?.enrageAfterTicks } ?: pressure.enrageAfterTicks

/** The dungeons with [encounters] applied. Unknown ids are ignored. */
fun List<Dungeon>.withEncounters(encounters: Encounters): List<Dungeon> = map { d ->
    val combat = d.bossCombat ?: return@map d
    val boss = encounters.bosses[d.id]
    d.copy(
        bossCombat = combat.copy(
            attackTemplates = combat.attackTemplates.map { a ->
                encounters.attacks[a.abilityId]?.let { a.copy(castTicks = it.castTicks, interruptible = it.interruptible, tell = it.tell) } ?: a
            } + boss?.extraAttacks.orEmpty(),
            debuffTemplates = combat.debuffTemplates.map { t ->
                encounters.mechanics[t.abilityId]?.durationTicks?.let { t.copy(durationTicks = it) } ?: t
            } + boss?.extraDebuffs.orEmpty(),
            // Carried on the dungeon so the scene can read a phase's tell.
            phases = boss?.phases.orEmpty(),
        ),
    )
}

/** content/utility_spells.json: spells outside the class trees, and who learns them. */
@Serializable
data class UtilitySpells(
    val spells: Map<String, Spell> = emptyMap(),
    val grants: List<SpellGrant> = emptyList(),
)

/** [spell] is learned at [level] by one class, or by every class of one role. */
@Serializable
data class SpellGrant(val spell: String, val level: Int, val cls: String? = null, val role: String? = null) {
    fun appliesTo(c: PlayerClass, classRole: String): Boolean = cls == c.name || role == classRole
}

@Serializable
data class BossCombat(
    val debuffTemplates: List<DebuffTemplate> = emptyList(),
    val selfBuffTemplates: List<SelfBuffTemplate> = emptyList(),
    val attackTemplates: List<AttackTemplate> = emptyList(),
    /** What the boss starts doing instead, once it falls past each threshold. */
    val phases: List<BossPhase> = emptyList(),
    val mechanicIntervalTicksMin: Int? = null,
    val mechanicIntervalTicksMax: Int? = null,
)

@Serializable
data class EnemyRef(val name: String, val icon: String = "")

@Serializable
data class Dungeon(
    val id: String,
    val name: String,
    val difficulty: Int,
    val levelMin: Int,
    val levelMax: Int,
    val bossName: String,
    val bossHealth: Double,
    val bossIcon: String = "",
    val cardIcon: String = "",
    val endless: Boolean = false,
    val enemies: List<EnemyRef> = emptyList(),
    val bossCombat: BossCombat? = null,
)

// --- misc content -----------------------------------------------------------

@Serializable
data class RoleHealth(val base: Double, val perLevel: Double)

@Serializable
data class NpcTemplate(val name: String, val role: String)

@Serializable
data class NpcPools(
    val allyHealthDefaults: Map<String, RoleHealth>,
    val tankPool: List<NpcTemplate>,
    val dpsPool: List<NpcTemplate>,
    /** Only needed once the player is not the healer. Defaulted for old data. */
    val healerPool: List<NpcTemplate> = emptyList(),
)

@Serializable
data class Pace(
    val label: String,
    val dpsMultiplier: Double,
    val xpMultiplier: Double,
)

@Serializable
data class Pacing(val paces: Map<String, Pace>)

@Serializable
data class PartyUnitBuffDef(
    val sourceSpellId: String,
    val displayName: String,
    val icon: String = "",
    val maxStacks: Int = 1,
    val defaultDurationTicks: Int,
    val dispellable: Boolean = false,
    val healingPerStackLinearBonus: Double = 0.0,
)

@Serializable
data class PlayerAuraDef(val defaultDurationTicks: Int)

@Serializable
data class Auras(
    val partyUnitBuffs: Map<String, PartyUnitBuffDef> = emptyMap(),
    val playerCombatAuras: Map<String, PlayerAuraDef> = emptyMap(),
)

@Serializable
data class PotionTier(
    val maxLevel: Int,
    val icon: String = "",
    val label: String? = null,
    val instant: Double,
)

@Serializable
data class ConsumableDef(val tiers: List<PotionTier>)
