package com.jdial.aegis.sim

import com.jdial.aegis.data.ClassesBalance
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Spell
import kotlin.math.roundToInt
import kotlin.math.max
import kotlin.math.min

/*
 * One real mechanic per playable tank and DPS class.
 *
 * Until these existed every one of them was the same thing with different
 * numbers: press whatever is off cooldown. Each mechanic here is driven by the
 * class's signature stat, so the number on the character sheet is the one
 * that changes how the mechanic plays.
 *
 * None of them draws from the rng, and none runs for a healer class, so the
 * recorded single-player runs cannot move.
 */

const val RESOURCE_RAGE = "RAGE"
const val RESOURCE_ENERGY = "ENERGY"

/** The Frostbolt chill on the enemy, kept in the enemy's debuff list. */
const val MAGE_CHILL_ID = "shatter_chill"

/**
 * Whether the player holds what [spell] costs, in whichever resource it names.
 *
 * The screens used to compare every cost against mana, which would have shown
 * Shield Slam as castable at zero rage and every Rogue strike as castable with
 * no energy at all. A finisher with no points is unaffordable too: from the
 * button's point of view that is the same thing.
 */
fun GameState.canPay(spell: Spell): Boolean {
    val have = if (spell.resource == "MANA") mana else classResource
    if (have < spell.manaCost - talents.effect("cost:${spell.id}")) return false
    return !(playerClass == PlayerClass.ROGUE && spell.id == RogueHooks.FINISHER && comboPoints <= 0)
}

/** The class resource as the action bar shows it. */
data class ResourceGauge(val label: String, val value: Int, val max: Int?, val comboPoints: Int? = null)

/** Null for the classes that only use mana. */
fun resourceGauge(state: GameState, rating: Double, b: ClassesBalance): ResourceGauge? {
    val p = state.me
    return when (p.playerClass) {
        PlayerClass.WARRIOR ->
            ResourceGauge("RAGE", p.classResource.toInt(), WarriorHooks.rageCap(rating, b).roundToInt())
        PlayerClass.ROGUE ->
            ResourceGauge("ENERGY", p.classResource.toInt(), b.rogue.energyMax.roundToInt(), p.comboPoints)
        PlayerClass.DEATHKNIGHT -> {
            // What the next Death Strike would heal for: the number the class
            // is played around.
            val maxHp = state.unit(state.localUnitId)?.maxHealth ?: 0.0
            val d = b.deathKnight
            val fraction = d.deathStrikeHealFraction + p.talents.effect("deathStrikeHeal") / 100
            val heal = maxOf(p.classResource * fraction, maxHp * d.deathStrikeMinHealFraction)
            ResourceGauge("DEATH STRIKE HEALS", heal.roundToInt(), null)
        }
        else -> null
    }
}

/**
 * What the signature stat is doing, in words, for the character sheet. Null
 * for the healers, whose stats already feed their existing mechanics.
 */
fun masteryEffect(cls: PlayerClass, rating: Double, b: ClassesBalance): String? = when (cls) {
    PlayerClass.WARRIOR ->
        "Rage cap ${WarriorHooks.rageCap(rating, b).roundToInt()}, " +
            "threat +${(rating * b.warrior.threatPerRating * 100).roundToInt()}%"
    PlayerClass.DEATHKNIGHT ->
        "Death Strike also shields for ${(rating * b.deathKnight.bloodShieldPerRating * 100).roundToInt()}% of its heal"
    PlayerClass.MAGE ->
        "+${(b.mage.shatterCritBase + rating * b.mage.shatterCritPerRating).roundToInt()}% crit against a chilled enemy"
    PlayerClass.ROGUE ->
        "+${(rating * b.rogue.builderCritPerRating).roundToInt()}% crit on combo builders"
    else -> null
}

/**
 * Warrior: rage.
 *
 * Taking damage and landing mana-paid attacks build it; Shield Slam spends it
 * instead of mana. Vengeance -- the signature stat -- raises the cap and the
 * threat everything the Warrior does generates.
 */
object WarriorHooks : ClassHooks {
    fun rageCap(rating: Double, b: com.jdial.aegis.data.ClassesBalance): Double =
        b.warrior.rageCapBase + rating * b.warrior.rageCapPerRating

    override fun threatMultiplier(ctx: CastContext): Double =
        1 + ctx.uniqueStatRating() * ctx.data.balance.classes.warrior.threatPerRating

    override fun onDamageLand(ctx: CastContext, after: GameState, land: DamageLand): GameState {
        if (land.spell.resource == RESOURCE_RAGE || land.dealt <= 0) return after
        val b = ctx.data.balance.classes
        val cap = rageCap(ctx.uniqueStatRating(), b)
        val gain = b.warrior.rageOnDamageCast + ctx.talentEffect("rageOnCast")
        return after.withMe { it.copy(classResource = min(cap, it.classResource + gain)) }
    }

    override fun classTick(tick: ClassTick): Participant {
        val u = tick.unit ?: return tick.participant
        if (u.maxHealth <= 0 || !u.isAlive) return tick.participant
        val fromHits = if (tick.damageTaken <= 0) 0.0 else {
            tick.damageTaken / u.maxHealth * tick.balance.warrior.ragePerFullHealthTaken *
                (1 + tick.participant.talents.effect("rageFromDamage") / 100)
        }
        val gained = fromHits + tick.balance.warrior.ragePerTick
        if (gained <= 0) return tick.participant
        val cap = rageCap(tick.rating, tick.balance)
        return tick.participant.copy(classResource = min(cap, tick.participant.classResource + gained))
    }
}

/**
 * Death Knight: Blood Shield.
 *
 * Remembers recent damage taken, decaying; Death Strike heals for a share of
 * it and shields for a share of the heal, the share scaled by the stat. Death
 * Strike after a big hit is the whole class.
 */
object DeathKnightHooks : ClassHooks {
    const val DEATH_STRIKE = "death_strike"

    override fun onDamageLand(ctx: CastContext, after: GameState, land: DamageLand): GameState {
        if (land.spellId != DEATH_STRIKE) return after
        val b = ctx.data.balance.classes.deathKnight
        val me = after.me
        val self = after.unit(after.localUnitId)?.takeIf { it.isAlive } ?: return after
        val fraction = b.deathStrikeHealFraction + ctx.talentEffect("deathStrikeHeal") / 100
        val heal = max(me.classResource * fraction, self.maxHealth * b.deathStrikeMinHealFraction)
        val shield = heal * ctx.uniqueStatRating() * b.bloodShieldPerRating * (1 + ctx.talentEffect("bloodShield") / 100)
        val healed = applyHealToUnit(self, heal)
        return after.copy(
            party = after.party.map {
                if (it.id != self.id) it
                else it.copy(
                    health = healed.health,
                    shield = it.shield + shield,
                    shieldTicksRemaining = max(it.shieldTicksRemaining, b.bloodShieldTicks),
                )
            },
        )
    }

    override fun classTick(tick: ClassTick): Participant {
        val b = tick.balance.deathKnight
        val p = tick.participant
        val recent = p.classResource * b.recentDamageDecayPerTick + tick.damageTaken
        return if (recent == p.classResource) p else p.copy(classResource = recent)
    }
}

/**
 * Mage: Shatter.
 *
 * Frostbolt chills the enemy; the next other spell against a chilled enemy
 * gets bonus crit, scaled by the stat, and uses the chill up. The rotation is
 * the alternation.
 */
object MageHooks : ClassHooks {
    const val FROSTBOLT = "frostbolt"

    private fun chilled(s: GameState) = s.enemyDebuffs.any { it.id == MAGE_CHILL_ID && it.remainingTicks > 0 }

    override fun damageCritBonus(ctx: CastContext, spell: Spell, spellId: String): Double {
        if (spellId == FROSTBOLT || !chilled(ctx.state)) return 0.0
        val m = ctx.data.balance.classes.mage
        return m.shatterCritBase + ctx.uniqueStatRating() * m.shatterCritPerRating + ctx.talentEffect("shatterCrit")
    }

    override fun damageMultiplier(ctx: CastContext, spell: Spell, spellId: String): Double =
        if (chilled(ctx.state)) 1 + ctx.talentEffect("chilledDamage") / 100 else 1.0

    override fun onDamageLand(ctx: CastContext, after: GameState, land: DamageLand): GameState {
        val others = after.enemyDebuffs.filterNot { it.id == MAGE_CHILL_ID }
        return when {
            land.spellId == FROSTBOLT -> after.copy(
                enemyDebuffs = others + UnitDebuff(
                    id = MAGE_CHILL_ID,
                    name = "Chilled",
                    remainingTicks = ctx.data.balance.classes.mage.chillTicks + ctx.talentEffect("chillTicks").roundToInt(),
                    damagePerTick = 0.0,
                    icon = land.spell.icon,
                    sourceAbilityId = FROSTBOLT,
                ),
            )
            chilled(after) -> after.copy(enemyDebuffs = others)
            else -> after
        }
    }
}

/**
 * Rogue: energy and combo points.
 *
 * Energy refills on its own; builders spend it and add a combo point, and
 * Seal Fate adds a second on a crit. The finisher spends every point for
 * damage in proportion. The stat is builder crit -- which is to say, how often
 * Seal Fate fires.
 */
object RogueHooks : ClassHooks {
    const val FINISHER = "eviscerate"

    override fun damageCastAllowed(ctx: CastContext, spell: Spell, spellId: String): Boolean =
        spellId != FINISHER || ctx.state.comboPoints > 0

    override fun damageMultiplier(ctx: CastContext, spell: Spell, spellId: String): Double =
        if (spellId == FINISHER) {
            ctx.state.comboPoints * (ctx.data.balance.classes.rogue.finisherPerPoint + ctx.talentEffect("finisherPerPoint"))
        } else 1.0

    override fun damageCritBonus(ctx: CastContext, spell: Spell, spellId: String): Double =
        if (spellId == FINISHER) 0.0
        else ctx.uniqueStatRating() * ctx.data.balance.classes.rogue.builderCritPerRating

    override fun onDamageLand(ctx: CastContext, after: GameState, land: DamageLand): GameState {
        val max = ctx.data.balance.classes.rogue.comboPointsMax
        return after.withMe {
            if (land.spellId == FINISHER) {
                val refund = ctx.talentEffect("finisherRefund")
                it.copy(comboPoints = 0, classResource = min(ctx.data.balance.classes.rogue.energyMax, it.classResource + refund))
            }
            else it.copy(comboPoints = min(max, it.comboPoints + 1 + if (land.isCrit) 1 else 0))
        }
    }

    override fun startingResource(b: com.jdial.aegis.data.ClassesBalance): Double = b.rogue.energyMax

    override fun classTick(tick: ClassTick): Participant {
        val r = tick.balance.rogue
        val p = tick.participant
        if (p.classResource >= r.energyMax) return p
        val regen = r.energyPerTick * (1 + p.talents.effect("energyRegen") / 100)
        return p.copy(classResource = min(r.energyMax, p.classResource + regen))
    }
}
