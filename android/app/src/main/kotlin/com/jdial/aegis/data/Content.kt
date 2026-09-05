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

enum class SpellType { DIRECT, HOT, AOE }

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
    val glowType: String = "spell",
    val staticEffectDescription: String? = null,
    val tags: List<String> = emptyList(),
    val balance: SpellBalance? = null,
) {
    fun hasTag(tag: String) = tag in tags
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
    val capstoneForm: String,
    val capstoneMechanicId: String,
    val capstonePlayerBuffId: String,
)

@Serializable
data class ClassMeta(
    val id: String,
    val name: String,
    val description: String = "",
    val locked: Boolean = false,
    val portraitIcon: String = "",
    val portraitGlow: String = "spell",
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
)

@Serializable
data class Pace(
    val label: String,
    val trashSec: Int,
    val bossSec: Int,
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
