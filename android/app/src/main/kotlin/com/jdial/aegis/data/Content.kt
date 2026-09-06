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
) {
    fun hasTag(tag: String) = tag in tags

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
)

@Serializable
data class BossCombat(
    val debuffTemplates: List<DebuffTemplate> = emptyList(),
    val selfBuffTemplates: List<SelfBuffTemplate> = emptyList(),
    val attackTemplates: List<AttackTemplate> = emptyList(),
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
