package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Spell
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * One line of what a spell does: a label, its value, and a tone for colour.
 *
 * [tone] is a word rather than an enum on purpose -- a new top-level enum is a
 * new name R8 can rename, and this one never needs to survive a save.
 */
data class SpellStat(val label: String, val value: String, val tone: String)

/**
 * What [spell] does for this character right now.
 *
 * Read the same way the engine reads it -- rank from level, the rank's cost
 * multiplier on mana, and the talents' and worn charm's `cost:`, `cooldown:`,
 * `heal:` and `damage:` keys -- so the numbers on the profile are the numbers
 * a cast actually uses, rather than the base figures in the content file. Crit
 * and the class's own healing power are left out: they vary cast to cast, and
 * a number that is sometimes true is worse than one that is always a floor.
 */
fun spellStats(spell: Spell, cls: PlayerClass, level: Int, me: Participant?, stats: PlayerStats): List<SpellStat> {
    val rank = stats.spellRank(spell.id, cls, level)
    val grow = stats.rankHealMult(rank)
    val effect = { key: String -> me?.effect(key) ?: 0.0 }

    return buildList {
        // What it costs.
        if (spell.manaCost > 0) {
            val base = if (spell.resource == "MANA") spell.manaCost * stats.rankCostMult(rank) else spell.manaCost.toDouble()
            val cost = max(0, (base - effect("cost:${spell.id}")).roundToInt())
            add(SpellStat("COST", "$cost ${spell.resourceName}", "cost"))
        }
        val cd = max(0, spell.cooldown - effect("cooldown:${spell.id}").roundToInt())
        if (cd > 0) add(SpellStat("COOLDOWN", seconds(cd), "time"))

        // What it does.
        val bonus = when (spell.school) {
            SpellSchool.DAMAGE -> 1 + effect("damage:${spell.id}") / 100
            else -> 1 + effect("heal:${spell.id}") / 100
        }
        if (spell.healing > 0) {
            val amount = (spell.healing * grow * bonus).roundToInt()
            if (spell.school == SpellSchool.DAMAGE) {
                add(SpellStat(if (spell.type == SpellType.AOE) "DAMAGE, ALL" else "DAMAGE", "$amount", "damage"))
            } else {
                add(SpellStat(if (spell.type == SpellType.AOE) "HEAL, ALL" else "HEAL", "$amount", "heal"))
            }
        }
        val perTick = spell.hotHealingPerTick
        if (perTick != null && perTick > 0) {
            val ticks = spell.hotDuration ?: 0
            val total = (perTick * ticks * grow * bonus).roundToInt()
            val word = if (spell.school == SpellSchool.DAMAGE) "OVER TIME" else "HEAL OVER TIME"
            add(SpellStat(word, "$total / ${seconds(ticks)}", if (spell.school == SpellSchool.DAMAGE) "damage" else "heal"))
        }
        if (spell.shield > 0) {
            add(SpellStat("ABSORB", "${(spell.shield * grow * bonus).roundToInt()}", "shield"))
        }
        val dr = spell.damageReduction
        if (dr != null) {
            add(SpellStat("DAMAGE TAKEN", "-${(dr * 100).roundToInt()}% / ${seconds(spell.damageReductionTicks ?: 0)}", "shield"))
        }
        val regen = spell.manaRegenBuffDurationTicks
        if (regen != null && regen > 0) add(SpellStat("MANA", "restores over ${seconds(regen)}", "mana"))

        // What else it is for.
        spell.tauntTicks?.let { add(SpellStat("TAUNT", seconds(it), "utility")) }
        if (spell.interrupts) add(SpellStat("INTERRUPTS", "a cast", "utility"))
        if (spell.dispels) add(SpellStat("DISPELS", "one debuff", "utility"))
        if (spell.threatMultiplier != 1.0) {
            add(SpellStat("THREAT", "×${"%.1f".format(spell.threatMultiplier)}", "utility"))
        }
        // The mana potion climbs its own tiers rather than ranks, so a rank on
        // it would be a number that means nothing.
        if (rank > 1 && spell.id != MANA_POTION_ID) add(SpellStat("RANK", "$rank", "rank"))
    }
}

/**
 * The shelf a spell sits on: what a player reaches for it to do.
 *
 * One answer per spell, first match wins, so a damage spell that happens to
 * carry threat is damage and a heal that shields is a heal.
 */
fun spellGroup(spell: Spell): String = when {
    spell.interrupts || spell.dispels || spell.tauntTicks != null -> "UTILITY"
    spell.damageReduction != null || (spell.shield > 0 && spell.healing <= 0) -> "DEFENCE"
    spell.school == SpellSchool.DAMAGE -> "DAMAGE"
    spell.school == SpellSchool.HEAL && (spell.healing > 0 || (spell.hotHealingPerTick ?: 0.0) > 0) -> "HEALING"
    else -> "UTILITY"
}

/** The shelves, in the order they are shown. */
val SPELL_GROUPS = listOf("HEALING", "DAMAGE", "DEFENCE", "UTILITY")

private fun seconds(ticks: Int): String = "${ceil(ticks / 10.0).toInt()}s"
