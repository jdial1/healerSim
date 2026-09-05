package com.jdial.aegis.sim

import com.jdial.aegis.data.Spell
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Port of `src/talentMechanics.js`, `src/healMath.js` and `src/combatHelper.js`:
 * the small primitives shared by the cast pipeline and the tick loop.
 */

// --- heal maths -------------------------------------------------------------

data class HealSplit(val effective: Double, val overheal: Double)

/**
 * Splits a raw heal into effective and wasted portions. Note the web app still
 * clamps health to max separately — this only reports the split.
 */
fun healSplit(healthBefore: Double, maxHealth: Double, rawHeal: Double): HealSplit {
    if (healthBefore <= 0 || rawHeal <= 0) return HealSplit(0.0, 0.0)
    val room = max(0.0, maxHealth - healthBefore)
    val eff = min(room, rawHeal)
    return HealSplit(eff, max(0.0, rawHeal - eff))
}

data class AppliedHeal(val health: Double, val effective: Double, val overheal: Double)

fun applyHealToUnit(unit: Unit, rawHeal: Double): AppliedHeal {
    val split = healSplit(unit.health, unit.maxHealth, rawHeal)
    return AppliedHeal(min(unit.maxHealth, unit.health + rawHeal), split.effective, split.overheal)
}

// --- damage -----------------------------------------------------------------

data class DamageResult(
    val health: Double,
    val shield: Double,
    val shieldTicksRemaining: Int,
    val tookHealthDamage: Double,
)

/** Shields absorb first. Note DoT ticks deliberately bypass this and hit health. */
fun applyDamage(health: Double, shield: Double, damage: Double): DamageResult {
    if (shield >= damage) return DamageResult(health, shield - damage, 0, 0.0)
    val remaining = damage - shield
    return DamageResult(max(0.0, health - remaining), 0.0, 0, remaining)
}

// --- player buffs -----------------------------------------------------------

fun PlayerBuff.isActive(): Boolean =
    if (id in NO_TIME_DECAY_BUFFS) stacks > 0 else remainingTicks > 0

fun List<PlayerBuff>.activeBuff(id: String): PlayerBuff? =
    firstOrNull { it.id == id }?.takeIf { it.isActive() }

fun List<PlayerBuff>.hasBuff(id: String): Boolean = activeBuff(id) != null

fun List<PlayerBuff>.buffTicks(id: String): Int =
    if (id in NO_TIME_DECAY_BUFFS) 0 else activeBuff(id)?.remainingTicks ?: 0

fun List<PlayerBuff>.buffStacks(id: String): Int = activeBuff(id)?.stacks ?: 0

fun List<PlayerBuff>.naturalPerfectionStacks(): Int = buffStacks(BUFF_NATURAL_PERFECTION)

fun List<PlayerBuff>.addBuff(
    id: String,
    ticks: Int,
    stacks: Int,
    potionDripPerTick: Double? = null,
): List<PlayerBuff> {
    val i = indexOfFirst { it.id == id }
    if (i < 0) return this + PlayerBuff(id, ticks, stacks, potionDripPerTick)
    val prev = this[i]
    return toMutableList().apply {
        this[i] = PlayerBuff(
            id = id,
            remainingTicks = max(ticks, prev.remainingTicks),
            stacks = stacks,
            potionDripPerTick = potionDripPerTick ?: prev.potionDripPerTick,
        )
    }
}

fun List<PlayerBuff>.removeBuff(id: String): List<PlayerBuff> = filterNot { it.id == id }

fun List<PlayerBuff>.tickBuffs(): List<PlayerBuff> =
    map { if (it.id in NO_TIME_DECAY_BUFFS) it else it.copy(remainingTicks = it.remainingTicks - 1) }
        .filter { it.isActive() }

fun List<PlayerBuff>.decrementBuff(id: String): List<PlayerBuff> =
    map { b ->
        when {
            b.id != id -> b
            b.stacks <= 1 -> b.copy(remainingTicks = 0, stacks = 0)
            else -> b.copy(stacks = b.stacks - 1)
        }
    }.filter { it.remainingTicks > 0 && it.stacks > 0 }

fun List<PlayerBuff>.potionDrip(): Double =
    firstOrNull { it.id == BUFF_MANA_REGEN_POTION && it.remainingTicks > 0 }?.potionDripPerTick ?: 0.0

fun List<PlayerBuff>.addPowerInfusionCharges(minCharges: Int): List<PlayerBuff> =
    addBuff(BUFF_POWER_INFUSION, 1, max(buffStacks(BUFF_POWER_INFUSION), minCharges))

fun List<PlayerBuff>.applyPowerInfusionAfterCast(castsRemaining: Int): List<PlayerBuff> =
    if (castsRemaining <= 0) removeBuff(BUFF_POWER_INFUSION)
    else addBuff(BUFF_POWER_INFUSION, 1, castsRemaining)

fun List<PlayerBuff>.setNaturalPerfection(stacks: Int): List<PlayerBuff> =
    if (stacks <= 0) removeBuff(BUFF_NATURAL_PERFECTION)
    else addBuff(BUFF_NATURAL_PERFECTION, 1, stacks)

fun List<PlayerBuff>.addSpiritLockoutIfSpent(spentMana: Boolean): List<PlayerBuff> =
    if (!spentMana) this
    else addBuff(BUFF_SPIRIT_REGEN_LOCKOUT, MANA_SPIRIT_REGEN_LOCKOUT_TICKS, 1)

fun Map<String, Int>.icdReady(key: String): Boolean = (this[key] ?: 0) <= 0

// --- unit auras -------------------------------------------------------------

fun Unit.buffStacksOf(spellId: String): Int {
    val b = buffs.firstOrNull { (it.sourceSpellId == spellId || it.id == spellId) && it.category == "helpful" }
        ?: return 0
    if (b.stacks > 0) return b.stacks
    return if (b.remainingTicks > 0) 1 else 0
}

fun Unit.debuffStacksOf(abilityId: String): Int {
    val d = debuffs.firstOrNull {
        (it.sourceAbilityId == abilityId || it.id == abilityId) && it.category == "harmful"
    } ?: return 0
    return if (d.remainingTicks > 0) 1 else 0
}

/** Removes the first dispellable harmful aura, if any. */
fun List<UnitDebuff>.dispelOne(): List<UnitDebuff> {
    val i = indexOfFirst { it.category == "harmful" && it.dispellable }
    return if (i < 0) this else filterIndexed { j, _ -> j != i }
}

// --- spell classification ---------------------------------------------------

/** Every spell in the game is a heal; the mana potion is the sole exception. */
fun Spell.isHeal(): Boolean = id != "mana_potion"

fun Spell.isDirectHeal(): Boolean = when {
    id == "mana_potion" -> false
    type == com.jdial.aegis.data.SpellType.AOE -> true
    type == com.jdial.aegis.data.SpellType.DIRECT -> true
    type == com.jdial.aegis.data.SpellType.HOT && healing > 0 -> true
    else -> false
}

/**
 * Applies or refreshes a heal-over-time, pandemic style: the remainder of an
 * existing HoT carries over, capped at 130% of the base duration.
 */
fun applyHot(
    unit: Unit,
    spell: Spell,
    healingPerTick: Double,
    pandemicCapMult: Double,
    hasteTickScale: Double = 1.0,
    bloomBurstHeal: Double? = null,
): Unit {
    val baseTicks = spell.hotDuration ?: 0
    if (baseTicks <= 0) return unit

    val capTicks = max(baseTicks, floor(baseTicks * pandemicCapMult).toInt())
    val existingIdx = unit.buffs.indexOfFirst { it.sourceSpellId == spell.id }
    val carried = if (existingIdx >= 0) unit.buffs[existingIdx].remainingTicks else 0
    val kept = if (existingIdx >= 0) unit.buffs.filterIndexed { i, _ -> i != existingIdx } else unit.buffs

    val combined = min(carried + baseTicks, capTicks)
    val bloom = bloomBurstHeal
        ?: if (spell.id == "lifebloom") max(0.0, spell.healing) else null

    return unit.copy(
        buffs = kept + UnitBuff(
            id = spell.id,
            name = spell.name,
            remainingTicks = combined,
            healingPerTick = healingPerTick,
            icon = spell.icon,
            sourceSpellId = spell.id,
            durationTicksMax = combined,
            tickIntervalScale = hasteTickScale,
            tickAccumulator = 0.0,
            bloomBurstHeal = bloom?.takeIf { it > 0 },
            rendersAsHoTRing = true,
        ),
    )
}
