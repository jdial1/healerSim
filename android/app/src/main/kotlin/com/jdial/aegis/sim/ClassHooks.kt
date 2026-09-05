package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Spell
import com.jdial.aegis.data.SpellType
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Port of the 17 dispatch points in `src/combatHookRegistry.js`.
 *
 * The web app dispatched these by duck-typing on module exports, so hooks whose
 * names the class modules did not export fell through to defaults — Swiftmend
 * healed nothing, Surge of Light never procced, and most Druid/Paladin
 * mechanics never fired. That wiring is now repaired in both engines together,
 * so the parity harness still holds.
 *
 * Unlike the JS version, an unimplemented method here is a compile-time fact,
 * not a silent typo: the bug class cannot recur.
 */
interface ClassHooks {

    fun onHealManaCost(ctx: CastContext, spell: Spell, spellId: String, surgeFree: Boolean): Int? = null

    fun onHealLand(ctx: CastContext, land: LandContext, party: List<Unit>, buffs: List<PlayerBuff>): LandResult =
        LandResult(party, buffs, 0.0, 0.0)

    fun manaAfterHeal(ctx: CastContext, land: LandContext, initialMana: Double): Double = initialMana

    fun manaReturnOnTick(ctx: CastContext, spiritLockoutTicks: Int): Double = 0.0

    fun hasteBonusSum(ctx: CastContext): Double = 0.0

    fun critBonusForHealRoll(ctx: CastContext, spellId: String, targetId: String?): Double = 0.0

    fun castDirectHealMultiplier(ctx: CastContext, spell: Spell, spellId: String): Double = 1.0

    /** Swiftmend consumes a HoT for a burst heal; only Druid implements it. */

    fun hotTickAmount(ctx: CastContext, buff: UnitBuff, unit: Unit, healPerTick: Double): Double = healPerTick

    fun hotTickRateMultiplier(ctx: CastContext, sourceSpellId: String): Double = 1.0

    fun hotTickManaReturn(ctx: CastContext, sourceSpellId: String): Double = 0.0

    /** Per-unit: Devotion Aura is party-wide, but the Priest shield DR is not. */
    fun damageTakenMultiplier(ctx: CastContext, source: String, unit: Unit?): Double = 1.0

    fun emergencyHasteBonus(ctx: CastContext, targetId: String?): Double = 0.0

    fun selfHealOnDamage(ctx: CastContext, damageTaken: Double): Double = 0.0

    /** Aegis Burst fires when a shield is fully consumed during a tick. */
    fun onShieldTransition(ctx: CastContext, before: List<Unit>, after: List<Unit>): LandResult =
        LandResult(after, emptyList(), 0.0, 0.0)
}

/** Everything a hook needs about the caster; a narrow view over [GameState]. */
class CastContext(
    val state: GameState,
    val data: com.jdial.aegis.data.GameData,
    val stats: PlayerStats,
    val rng: Rng,
) {
    val cls: PlayerClass? get() = state.playerClass
    val talents get() = state.talents
    val party get() = state.party
    val level get() = state.level
    val maxMana get() = state.maxMana

    fun ranks(mechanicId: String): Int = talents.ranksOf(mechanicId)
    fun talentRanks(talentId: String): Int = talents.ranksOfTalent(talentId)
    fun uniqueStatRating(): Double = stats.uniqueStatRating(cls, level, talents)
}

/** The cast being resolved, passed to `onHealLand` and the mana hooks. */
data class LandContext(
    val spell: Spell,
    val spellId: String,
    val targetId: String?,
    val partyBeforeCast: List<Unit>,
    val healMultB: Double,
    val critH: Double,
    val tMod: Double,
    val isCrit: Boolean,
    val rankHealMult: Double,
    val needMana: Double = 0.0,
    val surgeFree: Boolean = false,
)

data class LandResult(
    val party: List<Unit>,
    val playerCombatBuffs: List<PlayerBuff>,
    val healEffective: Double,
    val healOverheal: Double,
)

// ---------------------------------------------------------------------------
// Priest
// ---------------------------------------------------------------------------

const val ECHO_OF_LIGHT_SOURCE = "echo_of_light"
const val GRACE_SOURCE_ID = "priest_grace"
const val BUFF_OMEN_CLEARCASTING = "omen_clearcasting"
const val BUFF_SURGE_OF_LIGHT = "surge_of_light"
const val BUFF_ARCHANGEL = "archangel"
const val ECHO_DURATION_TICKS = 60
const val DRUID_HARMONY_HOT_BUFF = "druid_harmony_for_hot"

object PriestHooks : ClassHooks {

    override fun onHealManaCost(ctx: CastContext, spell: Spell, spellId: String, surgeFree: Boolean): Int? =
        if (surgeFree && spell.hasTag(TAG_SURGE_FINISHER)) 0 else null

    override fun manaAfterHeal(ctx: CastContext, land: LandContext, initialMana: Double): Double {
        val ranks = ctx.ranks("path_moon")
        if (ctx.cls != PlayerClass.PRIEST || ranks <= 0) return initialMana
        // Matches the JS predicate: a synergy-direct tag, or a direct heal.
        if (!(land.spell.hasTag(TAG_SYNERGY_DIRECT) || land.spell.isDirectHeal())) return initialMana
        val priest = ctx.data.balance.combat.priest
        return min(ctx.maxMana.toDouble(), initialMana + ctx.maxMana * priest.pathMoonMaxManaReturnPerRank * ranks)
    }

    /** Meditative Wellspring: returns mana *only while* the five-second rule is active. */
    override fun manaReturnOnTick(ctx: CastContext, spiritLockoutTicks: Int): Double {
        if (ctx.cls != PlayerClass.PRIEST || spiritLockoutTicks <= 0) return 0.0
        val ranks = ctx.talentRanks("p_r0c4")
        if (ranks <= 0) return 0.0
        return ctx.maxMana * ctx.data.balance.combat.priest.meditativeManaReturnPerRankPerTick * ranks
    }

    override fun onHealLand(
        ctx: CastContext,
        land: LandContext,
        party: List<Unit>,
        buffs: List<PlayerBuff>,
    ): LandResult {
        var p = applyDivineAegis(ctx, land.partyBeforeCast, party, land.isCrit)
        p = applyEchoOfLight(ctx, land.partyBeforeCast, p, land)
        p = applyGraceStacks(ctx, p, land)

        var eff = 0.0
        var oh = 0.0
        val bind = applyBindingHealSelf(ctx, p, land)
        p = bind.party; eff += bind.healEffective; oh += bind.healOverheal

        val bursts = applyAegisBursts(ctx, land.partyBeforeCast, p)
        p = bursts.party; eff += bursts.healEffective; oh += bursts.healOverheal

        return LandResult(p, buffs, eff, oh)
    }

    private fun applyDivineAegis(
        ctx: CastContext,
        old: List<Unit>,
        new: List<Unit>,
        isCrit: Boolean,
    ): List<Unit> {
        val daRanks = ctx.ranks("divine_aegis")
        if (!isCrit || daRanks <= 0) return new
        val priest = ctx.data.balance.combat.priest
        var mult = priest.divineAegisShieldFractionPerRank * daRanks
        if (ctx.cls == PlayerClass.PRIEST) {
            mult *= 1 + ctx.uniqueStatRating() * priest.divinityAegisMultBonusPerRating
        }
        val luminous = ctx.ranks("luminous_aegis")
        if (luminous > 0) mult *= 1 + priest.luminousAegisMultiplierPerRank * luminous

        return new.map { now ->
            val before = old.firstOrNull { it.id == now.id } ?: return@map now
            if (before.health <= 0) return@map now
            val gained = now.health - before.health
            if (gained <= 0) return@map now
            now.copy(
                shield = now.shield + gained * mult,
                shieldTicksRemaining = ctx.data.balance.combat.shared.shieldDefaultTicks,
            )
        }
    }

    private fun applyEchoOfLight(
        ctx: CastContext,
        before: List<Unit>,
        party: List<Unit>,
        land: LandContext,
    ): List<Unit> {
        if (ctx.cls != PlayerClass.PRIEST || land.spellId == "mana_potion" || !land.spell.isDirectHeal()) return party
        val fraction = ctx.data.balance.combat.priest.passiveEchoOfLightHealFraction

        fun withEcho(unit: Unit, total: Double): Unit {
            val kept = unit.buffs.filterNot { it.sourceSpellId == ECHO_OF_LIGHT_SOURCE }
            return unit.copy(
                buffs = kept + UnitBuff(
                    id = "$ECHO_OF_LIGHT_SOURCE-${unit.id}",
                    name = "Echo of Light",
                    remainingTicks = ECHO_DURATION_TICKS,
                    healingPerTick = total / ECHO_DURATION_TICKS,
                    icon = "wow/spell_holy_surgeoflight",
                    sourceSpellId = ECHO_OF_LIGHT_SOURCE,
                ),
            )
        }

        if (land.spell.type == SpellType.AOE) {
            return party.map { u ->
                val b = before.firstOrNull { it.id == u.id }
                val gained = if (b == null || u.health <= 0) 0.0 else u.health - b.health
                if (gained > 0) withEcho(u, gained * fraction) else u
            }
        }
        val b = before.firstOrNull { it.id == land.targetId }
        val u = party.firstOrNull { it.id == land.targetId }
        if (b == null || u == null || u.health <= 0) return party
        val gained = u.health - b.health
        if (gained <= 0) return party
        return party.map { if (it.id == land.targetId) withEcho(it, gained * fraction) else it }
    }

    private fun applyGraceStacks(ctx: CastContext, party: List<Unit>, land: LandContext): List<Unit> {
        val g = ctx.ranks(GRACE_SOURCE_ID)
        if (g <= 0 || !land.spell.isDirectHeal() || land.spell.type == SpellType.AOE) return party
        val def = ctx.data.auras.partyUnitBuffs[GRACE_SOURCE_ID] ?: return party
        return party.map { u ->
            if (u.id != land.targetId || u.health <= 0) return@map u
            val existing = u.buffs.firstOrNull { it.sourceSpellId == GRACE_SOURCE_ID }
            val next = min(def.maxStacks, (existing?.stacks?.takeIf { it > 0 } ?: 0) + 1)
            u.copy(
                buffs = u.buffs.filterNot { it.sourceSpellId == GRACE_SOURCE_ID } + UnitBuff(
                    id = "$GRACE_SOURCE_ID-${u.id}",
                    name = def.displayName,
                    remainingTicks = def.defaultDurationTicks,
                    healingPerTick = 0.0,
                    icon = def.icon,
                    sourceSpellId = GRACE_SOURCE_ID,
                    stacks = max(1, next),
                ),
            )
        }
    }

    private fun applyBindingHealSelf(ctx: CastContext, party: List<Unit>, land: LandContext): LandResult {
        val ranks = ctx.ranks("binding_heal")
        if (ctx.cls == null || ranks <= 0) return LandResult(party, emptyList(), 0.0, 0.0)
        val priest = ctx.data.balance.combat.priest
        val healer = party.firstOrNull { it.id == HEALER_UNIT_ID }
        val target = ctx.party.firstOrNull { it.id == land.targetId }
        if (healer == null || target == null || target.id == healer.id) {
            return LandResult(party, emptyList(), 0.0, 0.0)
        }
        val bind = land.spell.healing * land.rankHealMult * land.healMultB * land.critH * land.tMod *
            priest.bindingHealSelfFraction * min(priest.bindingHealMaxRanksForCap, ranks)
        val applied = applyHealToUnit(healer, bind)
        return LandResult(
            party.map { if (it.id == HEALER_UNIT_ID) it.copy(health = applied.health) else it },
            emptyList(), applied.effective, applied.overheal,
        )
    }

    /** Aegis Burst: when a shield is fully consumed, splash-heal the lowest ally. */
    private fun applyAegisBursts(ctx: CastContext, before: List<Unit>, after: List<Unit>): LandResult {
        val ranks = ctx.ranks("aegis_burst")
        var party = after
        var eff = 0.0
        var oh = 0.0
        before.forEachIndexed { i, bu ->
            val au = after.getOrNull(i) ?: return@forEachIndexed
            if (bu.id != au.id || bu.shield <= 0 || au.shield > 0) return@forEachIndexed
            val absorbed = bu.shield - au.shield
            val splash = if (ranks <= 0 || absorbed <= 0) 0.0
            else absorbed * ctx.data.balance.combat.priest.aegisBurstHealPerAbsorbPerRank * ranks
            if (splash <= 0) return@forEachIndexed

            val lowest = party.filter { it.health > 0 && it.id != au.id }
                .minByOrNull { it.health / it.maxHealth } ?: return@forEachIndexed
            val applied = applyHealToUnit(lowest, splash)
            party = party.map { if (it.id == lowest.id) it.copy(health = applied.health) else it }
            eff += applied.effective
            oh += applied.overheal
        }
        return LandResult(party, emptyList(), eff, oh)
    }

    /** Shield Maintenance: haste while any ally is shielded. */
    override fun hasteBonusSum(ctx: CastContext): Double {
        if (ctx.cls != PlayerClass.PRIEST) return 0.0
        val ranks = ctx.talentRanks("p_r5c3")
        if (ranks <= 0) return 0.0
        if (ctx.party.none { it.health > 0 && it.shield > 0 }) return 0.0
        return ctx.data.balance.combat.priest.shieldMaintenanceHastePerRank * ranks
    }

    /** Gleaming Proclamation: extra Flash Heal crit, gated on Surge of Light. */
    override fun critBonusForHealRoll(ctx: CastContext, spellId: String, targetId: String?): Double {
        if (spellId != "flash_heal") return 0.0
        if (ctx.ranks("gleaming_proclamation") <= 0 || ctx.ranks("surge_of_light") <= 0) return 0.0
        return ctx.data.balance.combat.priest.gleamingProclamationFlashHealCritBonusPct
    }

    /** The healer own shield reduces damage taken — per unit, not party-wide. */
    override fun damageTakenMultiplier(ctx: CastContext, source: String, unit: Unit?): Double {
        if (ctx.cls != PlayerClass.PRIEST || unit == null || unit.role != UnitRole.HEALER) return 1.0
        val ranks = ctx.talentRanks("p_r3c3")
        if (ranks <= 0) return 1.0
        val healer = ctx.party.firstOrNull { it.role == UnitRole.HEALER }
        if (healer == null || healer.shield <= 0) return 1.0
        return max(0.0, 1 - ctx.data.balance.combat.priest.selfShieldDamageReductionPerRank * ranks)
    }

    override fun onShieldTransition(ctx: CastContext, before: List<Unit>, after: List<Unit>): LandResult =
        applyAegisBursts(ctx, before, after)

    /** Surge of Light: a Flash Heal can make the next finisher free. */
    fun rollSurgeOfLight(ctx: CastContext, spellId: String): Boolean {
        if (spellId != "flash_heal") return false
        val ranks = ctx.ranks("surge_of_light")
        if (ranks <= 0) return false
        return ctx.rng.nextDouble() < ctx.data.balance.combat.priest.surgeOfLightProcChancePerRank * ranks
    }

    // --- called directly by the cast pipeline, bypassing the registry ---------

    fun isSurgeFinisher(spell: Spell): Boolean = spell.hasTag(TAG_SURGE_FINISHER)

    fun archangelSkipsSpell(spell: Spell): Boolean = spell.hasTag(TAG_ARCHANGEL_SKIP)

    fun archangelEchoShieldBonus(ctx: CastContext, spell: Spell): Double {
        val s = ctx.state
        if (s.capstoneForm != "priest_archangel" ||
            !s.playerCombatBuffs.hasBuff(BUFF_ARCHANGEL) ||
            archangelSkipsSpell(spell) ||
            !spell.isDirectHeal()
        ) return 0.0
        val totalShield = s.party.sumOf { max(0.0, it.shield) }
        if (totalShield <= 0) return 0.0
        return totalShield * ctx.data.balance.combat.priest.archangelEchoShieldConsumeBonusFraction
    }

    fun graceHealMultiplier(ctx: CastContext, target: Unit, graceRanks: Int): Double {
        if (graceRanks <= 0) return 1.0
        val g = target.buffs.firstOrNull { it.sourceSpellId == GRACE_SOURCE_ID && it.remainingTicks > 0 }
        if (g == null || g.stacks <= 0) return 1.0
        val def = ctx.data.auras.partyUnitBuffs[GRACE_SOURCE_ID] ?: return 1.0
        return 1 + def.healingPerStackLinearBonus * graceRanks * min(def.maxStacks, g.stacks)
    }

    /** Divinity: converts overhealing from direct heals into an absorb shield. */
    fun divinityOverhealAbsorb(ctx: CastContext, overheal: Double, rating: Double): Double {
        if (overheal <= 0 || rating <= 0) return 0.0
        val perRating = ctx.data.balance.combat.priest.divinityOverhealToShieldPerRating
        return overheal * min(0.45, rating * perRating)
    }
}

// ---------------------------------------------------------------------------
// Druid
// ---------------------------------------------------------------------------

object DruidHooks : ClassHooks {

    override fun onHealManaCost(ctx: CastContext, spell: Spell, spellId: String, surgeFree: Boolean): Int? {
        if (ctx.state.playerCombatBuffs.hasBuff(BUFF_OMEN_CLEARCASTING) &&
            (spellId == "regrowth" || spellId == "healing_touch")
        ) return 0

        if (ctx.ranks("tree_of_life") > 0) {
            val druid = ctx.data.balance.combat.druid
            val isHot = spell.type == SpellType.HOT || ((spell.hotDuration ?: 0) > 0 && spell.healing > 0)
            if (isHot) return (spell.manaCost * druid.treeOfLifeHotManaCostFactor).roundToInt()
            if (spell.hasTag(TAG_TREE_OF_LIFE_BIG_DIRECT)) {
                return (spell.manaCost * druid.treeOfLifeBigDirectManaCostFactor).roundToInt()
            }
        }
        return null
    }

    override fun onHealLand(
        ctx: CastContext,
        land: LandContext,
        party: List<Unit>,
        buffs: List<PlayerBuff>,
    ): LandResult = LandResult(applyLivingSeed(ctx, party, land), buffs, 0.0, 0.0)

    /** Living Seed: a crit banks healing that releases the next time the target is hit. */
    private fun applyLivingSeed(ctx: CastContext, party: List<Unit>, land: LandContext): List<Unit> {
        if (!land.isCrit || ctx.ranks("living_seed") <= 0) return party
        val druid = ctx.data.balance.combat.druid
        var pct = druid.livingSeedPoolFraction
        if (ctx.ranks("natural_perfection") > 0) pct += druid.livingSeedNaturalPerfectionBonusFraction
        val amount = land.spell.healing * land.rankHealMult * land.healMultB * land.critH * land.tMod * pct
        return party.map { if (it.id == land.targetId) it.copy(livingSeedPool = amount) else it }
    }

    private fun activeHotCount(ctx: CastContext): Int =
        ctx.party.sumOf { u ->
            u.buffs.count { it.remainingTicks > 0 && ctx.data.spell(it.sourceSpellId)?.hasTag(TAG_DRUID_HOT) == true }
        }

    /** Ramp: haste and crit scale with how many HoTs are rolling. */
    override fun hasteBonusSum(ctx: CastContext): Double {
        if (ctx.cls != PlayerClass.DRUID) return 0.0
        val ranks = ctx.talentRanks("d_r4c3")
        if (ranks <= 0) return 0.0
        return activeHotCount(ctx) * ctx.data.balance.combat.druid.rampHastePerHotPerRank * ranks
    }

    override fun critBonusForHealRoll(ctx: CastContext, spellId: String, targetId: String?): Double {
        if (ctx.cls != PlayerClass.DRUID) return 0.0
        val ranks = ctx.talentRanks("d_r5c4")
        if (ranks <= 0) return 0.0
        return activeHotCount(ctx) * ctx.data.balance.combat.druid.rampCritPerHotPerRank * ranks
    }

    /** Harmony: direct heals amplified while any ally carries a druid HoT. */
    override fun castDirectHealMultiplier(ctx: CastContext, spell: Spell, spellId: String): Double {
        val h = ctx.ranks("druid_harmony")
        if (h <= 0) return 1.0
        val anyHot = ctx.party.any { u ->
            u.health > 0 && u.buffs.any { ctx.data.spell(it.sourceSpellId)?.hasTag(TAG_DRUID_HOT) == true }
        }
        if (!anyHot) return 1.0
        return 1 + ctx.data.balance.combat.druid.harmonyBonusPerRank * h
    }

    override fun hotTickAmount(ctx: CastContext, buff: UnitBuff, unit: Unit, healPerTick: Double): Double {
        val druid = ctx.data.balance.combat.druid
        val spell = ctx.data.spell(buff.sourceSpellId)
        var amt = healPerTick

        val cultivation = ctx.ranks("druid_path_cultivation")
        if (cultivation > 0 && spell?.hasTag(TAG_DRUID_CULTIVATION_HOT) == true) {
            amt *= 1 + druid.cultivationBonusPerRank * cultivation
        }
        val deepRoots = ctx.ranks("druid_path_deep_roots")
        if (deepRoots > 0 && unit.role == UnitRole.TANK && spell?.hasTag(TAG_DRUID_HOT) == true) {
            amt *= 1 + druid.deepRootsBonusPerRank * deepRoots
        }
        val harmony = ctx.ranks("druid_harmony")
        if (harmony > 0 && ctx.state.playerCombatBuffs.hasBuff(DRUID_HARMONY_HOT_BUFF)) {
            amt *= 1 + druid.harmonyBonusPerRank * harmony
        }
        return amt
    }

    /** Nature Grace capstone accelerates every druid HoT. */
    override fun hotTickRateMultiplier(ctx: CastContext, sourceSpellId: String): Double {
        if (ctx.state.capstoneForm != "druid_natures_grace") return 1.0
        if (!ctx.state.playerCombatBuffs.hasBuff("natures_grace_aura")) return 1.0
        if (ctx.data.spell(sourceSpellId)?.hasTag(TAG_DRUID_HOT) != true) return 1.0
        return ctx.data.balance.combat.druid.naturesGraceHotTickRateMultiplier
    }

    /** Verdant Reservoir: HoT ticks return mana. */
    override fun hotTickManaReturn(ctx: CastContext, sourceSpellId: String): Double {
        if (ctx.cls != PlayerClass.DRUID) return 0.0
        if (ctx.data.spell(sourceSpellId)?.hasTag(TAG_DRUID_HOT) != true) return 0.0
        val ranks = ctx.talentRanks("d_r0c4")
        if (ranks <= 0) return 0.0
        return ctx.data.balance.combat.druid.hotTickManaReturnPerRank * ranks
    }

    /** Barkskin: the healer converts damage taken back into health. */
    override fun selfHealOnDamage(ctx: CastContext, damageTaken: Double): Double {
        if (ctx.cls != PlayerClass.DRUID || damageTaken <= 0) return 0.0
        val ranks = ctx.talentRanks("d_r2c0")
        if (ranks <= 0) return 0.0
        return damageTaken * ctx.data.balance.combat.druid.barkskinSelfHealFractionPerRank * ranks
    }

    /** Prefers a swiftmend-prefer HoT, else any consumable one. */
    fun consumableHotIndex(ctx: CastContext, unit: Unit): Int {
        val prefer = unit.buffs.indexOfFirst {
            it.category == "helpful" && ctx.data.spell(it.sourceSpellId)?.hasTag(TAG_SWIFTMEND_PREFER) == true
        }
        if (prefer >= 0) return prefer
        return unit.buffs.indexOfFirst {
            it.category == "helpful" && ctx.data.spell(it.sourceSpellId)?.hasTag(TAG_SWIFTMEND_CONSUMABLE) == true
        }
    }

    /** Vitality Bloom: a HoT tick can bloom for extra healing and refund mana. */
    fun vitalityBloomTickExtras(ctx: CastContext, tickAmount: Double): Pair<Double, Double> {
        if (ctx.cls != PlayerClass.DRUID || tickAmount <= 0) return 0.0 to 0.0
        val rating = ctx.uniqueStatRating()
        if (rating <= 0) return 0.0 to 0.0
        val druid = ctx.data.balance.combat.druid
        val p = min(druid.vitalityBloomChanceCap, rating * druid.vitalityBloomChancePerRating)
        if (ctx.rng.nextDouble() >= p) return 0.0 to 0.0
        val mana =
            if (ctx.rng.nextDouble() < druid.vitalityBloomManaRefundChance) druid.vitalityBloomManaRefundAmount
            else 0.0
        return (tickAmount * druid.vitalityBloomHealFractionOfTick) to mana
    }

    // --- called directly by the tick loop, bypassing the registry -------------

    /** Omen of Clarity: a HoT tick can make the next Regrowth or Healing Touch free. */
    fun rollOmenOfClarityOnHotTick(
        ctx: CastContext,
        tickAmount: Double,
        sourceSpell: Spell?,
        buffs: List<PlayerBuff>,
    ): List<PlayerBuff> {
        if (ctx.cls != PlayerClass.DRUID || tickAmount <= 0) return buffs
        if (sourceSpell?.hasTag(TAG_DRUID_HOT) != true) return buffs
        val rating = ctx.uniqueStatRating()
        if (rating <= 0) return buffs
        val druid = ctx.data.balance.combat.druid
        val p = min(druid.passiveOmenProcChanceCap, rating * druid.passiveOmenProcPerHotTickPerRating)
        if (ctx.rng.nextDouble() >= p) return buffs
        return buffs.addBuff(BUFF_OMEN_CLEARCASTING, druid.passiveOmenClearcastingTicks, 1)
    }
}

// ---------------------------------------------------------------------------
// Paladin
// ---------------------------------------------------------------------------

object PaladinHooks : ClassHooks {

    override fun onHealLand(
        ctx: CastContext,
        land: LandContext,
        party: List<Unit>,
        buffs: List<PlayerBuff>,
    ): LandResult {
        var p = party
        var eff = 0.0
        var oh = 0.0

        if (land.spell.type != SpellType.AOE && land.spellId != "mana_potion") {
            val before = land.partyBeforeCast.firstOrNull { it.id == land.targetId }
            val after = p.firstOrNull { it.id == land.targetId }
            val primaryHealed =
                if (before != null && after != null && after.health > 0) max(0.0, after.health - before.health)
                else 0.0
            val beacon = applyBeaconEcho(ctx, p, land, primaryHealed)
            p = beacon.party; eff += beacon.healEffective; oh += beacon.healOverheal
        }

        val splash = applyLightbringerSplash(ctx, land.partyBeforeCast, p, land)
        return LandResult(splash.party, buffs, eff + splash.healEffective, oh + splash.healOverheal)
    }

    /** Beacon of Light: a fraction of every heal echoes onto the beacon target. */
    private fun applyBeaconEcho(
        ctx: CastContext,
        party: List<Unit>,
        land: LandContext,
        primaryHeal: Double,
    ): LandResult {
        if (ctx.ranks("beacon_of_light") <= 0) return LandResult(party, emptyList(), 0.0, 0.0)
        val beaconId = ctx.state.beaconTargetId
        if (land.targetId == beaconId || land.spell.type == SpellType.AOE || land.spellId == "mana_potion") {
            return LandResult(party, emptyList(), 0.0, 0.0)
        }
        val pal = ctx.data.balance.combat.paladin
        var mult = pal.beaconEchoBaseMultiplier
        val vow = ctx.ranks("paladin_vow_protector")
        if (vow > 0) mult += pal.beaconEchoVowBonusPerRank * vow

        val amount = if (land.spell.isDirectHeal() && primaryHeal > 0) primaryHeal * mult else 0.0
        if (amount <= 0) return LandResult(party, emptyList(), 0.0, 0.0)
        val tank = party.firstOrNull { it.id == beaconId }
        if (tank == null || tank.health <= 0) return LandResult(party, emptyList(), 0.0, 0.0)

        val applied = applyHealToUnit(tank, amount)
        return LandResult(
            party.map { if (it.id == beaconId && it.health > 0) it.copy(health = applied.health) else it },
            emptyList(), applied.effective, applied.overheal,
        )
    }

    /** Lightbringer: healing the tank splashes onto the lowest other ally. */
    private fun applyLightbringerSplash(
        ctx: CastContext,
        before: List<Unit>,
        party: List<Unit>,
        land: LandContext,
    ): LandResult {
        if (ctx.cls != PlayerClass.PALADIN || land.spellId == "mana_potion" || !land.spell.isDirectHeal()) {
            return LandResult(party, emptyList(), 0.0, 0.0)
        }
        if (land.spell.type == SpellType.AOE) return LandResult(party, emptyList(), 0.0, 0.0)
        val tank = party.firstOrNull { it.role == UnitRole.TANK && it.health > 0 }
            ?: return LandResult(party, emptyList(), 0.0, 0.0)
        if (land.targetId != tank.id) return LandResult(party, emptyList(), 0.0, 0.0)

        val beforeT = before.firstOrNull { it.id == tank.id } ?: return LandResult(party, emptyList(), 0.0, 0.0)
        val healed = tank.health - beforeT.health
        if (healed <= 0) return LandResult(party, emptyList(), 0.0, 0.0)

        val splash = healed * ctx.data.balance.combat.paladin.passiveLightbringerSplashFraction
        val lowest = party.filter { it.health > 0 && it.id != tank.id }
            .minByOrNull { if (it.maxHealth > 0) it.health / it.maxHealth else 1.0 }
            ?: return LandResult(party, emptyList(), 0.0, 0.0)

        val applied = applyHealToUnit(lowest, splash)
        return LandResult(
            party.map { if (it.id == lowest.id) it.copy(health = applied.health) else it },
            emptyList(), applied.effective, applied.overheal,
        )
    }

    /** Devotion Aura: party-wide damage reduction, floored. */
    override fun damageTakenMultiplier(ctx: CastContext, source: String, unit: Unit?): Double {
        if (ctx.cls != PlayerClass.PALADIN) return 1.0
        val r = ctx.ranks("devotion_aura")
        if (r <= 0) return 1.0
        val pal = ctx.data.balance.combat.paladin
        return max(pal.devotionDamageTakenFloor, 1 - pal.devotionDamageReductionPerRank * r)
    }

    /** The more hurt the target, the faster the next cast comes back. */
    override fun emergencyHasteBonus(ctx: CastContext, targetId: String?): Double {
        if (ctx.cls != PlayerClass.PALADIN) return 0.0
        val t = ctx.party.firstOrNull { it.id == targetId } ?: return 0.0
        if (t.maxHealth <= 0) return 0.0
        val missing = 1 - t.health / t.maxHealth
        if (missing <= 0) return 0.0
        return missing * ctx.data.balance.combat.paladin.emergencyHasteFromMissingHealthMax
    }

    /** Tower of Radiance: bonus crit on targets below the emergency threshold. */
    override fun critBonusForHealRoll(ctx: CastContext, spellId: String, targetId: String?): Double {
        if (ctx.cls != PlayerClass.PALADIN) return 0.0
        val t = ctx.party.firstOrNull { it.id == targetId } ?: return 0.0
        if (t.maxHealth <= 0) return 0.0
        val ranks = ctx.ranks("tower_of_radiance")
        if (ranks <= 0) return 0.0
        val pal = ctx.data.balance.combat.paladin
        if (t.health / t.maxHealth >= pal.emergencyCritHealthThreshold) return 0.0
        return pal.emergencyCritBonusPerRankBelowHealthFraction * ranks
    }

    /** Vow of the Crusader amplifies Light of Dawn. */
    override fun castDirectHealMultiplier(ctx: CastContext, spell: Spell, spellId: String): Double {
        if (spellId != "light_of_dawn") return 1.0
        val ranks = ctx.ranks("paladin_vow_crusader")
        if (ranks <= 0) return 1.0
        return 1 + ctx.data.balance.combat.paladin.vowCrusaderAoEBonusPerRank * ranks
    }

    /** Illumination refunds mana on a crit; Vow adds more on the beacon target. */
    override fun manaAfterHeal(ctx: CastContext, land: LandContext, initialMana: Double): Double {
        if (ctx.cls != PlayerClass.PALADIN || !land.isCrit) return initialMana
        val pal = ctx.data.balance.combat.paladin
        var m = initialMana
        if (land.spell.isDirectHeal() && ctx.ranks("illumination") > 0) {
            m = min(ctx.maxMana.toDouble(), m + land.needMana * pal.illuminationManaRefundFraction)
        }
        val vow = ctx.ranks("paladin_vow_protector")
        if (ctx.ranks("beacon_of_light") > 0 && vow > 0 &&
            land.spellId != "mana_potion" && land.spell.type != SpellType.AOE &&
            land.targetId == ctx.state.beaconTargetId
        ) {
            m = min(ctx.maxMana.toDouble(), m + land.needMana * pal.vowProtectorCritManaRefundFraction * vow)
        }
        return m
    }

    // --- called directly by the cast pipeline, bypassing the registry ---------

    fun avengingWrathSplashFraction(ctx: CastContext): Double {
        val s = ctx.state
        if (ctx.cls != PlayerClass.PALADIN ||
            s.capstoneForm != "paladin_avenging_wrath" ||
            !s.playerCombatBuffs.hasBuff("avenging_wrath_aura")
        ) return 0.0
        return ctx.data.balance.combat.paladin.avengingWrathSplashFraction
    }

    /** Radiance: heals are amplified by how injured the target is, up to a cap. */
    fun radianceHealMultiplier(ctx: CastContext, unit: Unit): Double {
        if (ctx.cls != PlayerClass.PALADIN || unit.maxHealth <= 0) return 1.0
        val pal = ctx.data.balance.combat.paladin
        val missing = max(0.0, 1 - unit.health / unit.maxHealth)
        val bonus = min(pal.radianceHealMultBonusCap, missing * ctx.uniqueStatRating() * pal.radianceHealMultPerMissingHealthPerRating)
        return 1 + bonus
    }
}

fun hooksFor(cls: PlayerClass?): ClassHooks = when (cls) {
    PlayerClass.PRIEST -> PriestHooks
    PlayerClass.DRUID -> DruidHooks
    PlayerClass.PALADIN -> PaladinHooks
    null -> object : ClassHooks {}
}
