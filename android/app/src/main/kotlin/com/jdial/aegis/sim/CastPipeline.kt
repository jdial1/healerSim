package com.jdial.aegis.sim

import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Spell
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Port of `src/spellCastPipeline.js`: validate a cast, then apply it.
 *
 * There is no cast time and no global cooldown in this game — a per-spell
 * cooldown in ticks is the only gate. A cast that fails validation is a silent
 * no-op, exactly as in the web app.
 */
class CastPipeline(
    private val data: GameData,
    private val stats: PlayerStats,
) {
    /** Effective combat stats, from `src/effectivePlayerCombat.js`. */
    data class Effective(
        val hastePercent: Double,
        val hasteTickScale: Double,
        val baseHealingMultiplier: Double,
        val spiritRedemptionHealingMultiplier: Double,
        val talentCritPercent: Double,
    ) {
        fun critChancePercent(naturalPerfectionStacks: Int, extraCrit: Double = 0.0): Double =
            talentCritPercent + naturalPerfectionStacks * 2 + extraCrit
    }

    fun effectiveStats(ctx: CastContext): Effective? {
        val cls = ctx.cls ?: return null
        val s = ctx.state
        val hooks = hooksFor(cls)
        val hastePercent = stats.talentStats(s.talents).hastePct + hooks.hasteBonusSum(ctx)
        return Effective(
            hastePercent = hastePercent,
            hasteTickScale = 1 + hastePercent / 100.0,
            baseHealingMultiplier = stats.healingMultiplier(cls, s.level, s.talents),
            spiritRedemptionHealingMultiplier =
                if (s.playerCombatBuffs.hasBuff("spirit_of_redemption_amp")) 1.5 else 1.0,
            talentCritPercent = stats.talentStats(s.talents).critChancePct,
        )
    }

    // --- mana cost -----------------------------------------------------------

    fun manaCost(ctx: CastContext, spell: Spell, spellId: String, surgeFree: Boolean): Int {
        val hooks = hooksFor(ctx.cls)
        val base = hooks.onHealManaCost(ctx, spell, spellId, surgeFree) ?: spell.manaCost
        if (base <= 0) return base
        val cls = ctx.cls ?: return base
        return (base * stats.rankCostMult(stats.spellRank(spellId, cls, ctx.level))).roundToInt()
    }

    // --- validation ----------------------------------------------------------

    sealed interface Ready {
        data class ManaPotion(val spell: Spell, val eff: Effective) : Ready

        /**
         * A damage cast. No spell in the game is one yet -- this is the
         * plumbing a DPS or tank class will be content on top of.
         */
        data class Damage(
            val spell: Spell,
            val spellId: String,
            val eff: Effective,
            val needMana: Int,
            val isCrit: Boolean,
        ) : Ready
        data class Swiftmend(
            val spell: Spell,
            val targetId: String?,
            val eff: Effective,
            val needMana: Int,
            val critRoll: Double,
        ) : Ready
        data class Standard(
            val spell: Spell,
            val spellId: String,
            val targetId: String?,
            val eff: Effective,
            val needMana: Int,
            val surgeFree: Boolean,
            val healMultB: Double,
            val isCrit: Boolean,
            val critH: Double,
            val tower2: Boolean,
            val tMod: Double,
            val archangel: Boolean,
            val emergencyHaste: Double,
            val buffsBaseline: List<PlayerBuff>,
            val rankHealMult: Double,
        ) : Ready
    }

    fun validate(ctx: CastContext, spellId: String, targetId: String?, critRoll: Double): Ready? {
        val s = ctx.state
        val spell = data.spell(spellId) ?: return null
        if (s.playerClass == null) return null
        if ((s.spellCooldowns[spellId] ?: 0) > 0) return null
        // The potion is off the global cooldown, as consumables conventionally
        // are -- being unable to drink because you just cast is the kind of
        // rule that only ever feels like a bug.
        if (s.globalCooldownRemaining > 0 && spellId != MANA_POTION_ID) return null
        if (spellId == MANA_POTION_ID && s.manaPotionsUsedThisDungeon >= MANA_POTION_USES_PER_DUNGEON) return null
        s.healer ?: return null

        val eff = effectiveStats(ctx) ?: return null
        val surgeFree = s.playerCombatBuffs.hasBuff(BUFF_SURGE_OF_LIGHT) && PriestHooks.isSurgeFinisher(spell)
        val needMana = manaCost(ctx, spell, spellId, surgeFree)
        if (s.mana < needMana) return null

        val target = s.party.firstOrNull { it.id == targetId }
        if (spell.type != SpellType.AOE && spell.isHeal() && target != null && target.health <= 0) return null

        if (spellId == MANA_POTION_ID) return Ready.ManaPotion(spell, eff)

        if (spell.isDamage || spell.school == SpellSchool.UTILITY) {
            val crit = critRoll < eff.critChancePercent(s.playerCombatBuffs.naturalPerfectionStacks(), 0.0)
            return Ready.Damage(spell, spellId, eff, needMana, crit)
        }

        val hooks = hooksFor(ctx.cls)

        // Swiftmend needs a consumable HoT on the target; without one the cast is
        // rejected rather than falling through to a standard heal.
        if (spellId == "swiftmend" && ctx.cls == PlayerClass.DRUID) {
            val target = s.party.firstOrNull { it.id == targetId }
            if (target == null || target.health <= 0) return null
            if (DruidHooks.consumableHotIndex(ctx, target) < 0) return null
            return Ready.Swiftmend(spell, targetId, eff, needMana, critRoll)
        }

        val healMultB = eff.baseHealingMultiplier * eff.spiritRedemptionHealingMultiplier
        val extraCrit = hooks.critBonusForHealRoll(ctx, spellId, targetId)
        val isCrit = critRoll < eff.critChancePercent(s.playerCombatBuffs.naturalPerfectionStacks(), extraCrit)
        val tower2 = s.holyPower >= 3 && spell.isDirectHeal()

        var baseline = s.playerCombatBuffs
        if (surgeFree) baseline = baseline.removeBuff(BUFF_SURGE_OF_LIGHT)
        if (s.playerClass == PlayerClass.DRUID &&
            s.playerCombatBuffs.hasBuff(BUFF_OMEN_CLEARCASTING) &&
            (spellId == "regrowth" || spellId == "healing_touch")
        ) baseline = baseline.removeBuff(BUFF_OMEN_CLEARCASTING)

        return Ready.Standard(
            spell = spell,
            spellId = spellId,
            targetId = targetId,
            eff = eff,
            needMana = needMana,
            surgeFree = surgeFree,
            healMultB = healMultB,
            isCrit = isCrit,
            critH = if (isCrit) 1.5 else 1.0,
            tower2 = tower2,
            tMod = if (tower2) 2.0 else 1.0,
            archangel = s.capstoneForm == "priest_archangel" && s.playerCombatBuffs.hasBuff(BUFF_ARCHANGEL),
            emergencyHaste = hooks.emergencyHasteBonus(ctx, targetId),
            buffsBaseline = baseline,
            rankHealMult = stats.rankHealMult(stats.spellRank(spellId, s.playerClass, s.level)),
        )
    }

    // --- application ---------------------------------------------------------

    fun tryCast(ctx: CastContext, spellId: String, targetId: String?, critRoll: Double): GameState {
        val ready = validate(ctx, spellId, targetId, critRoll) ?: return ctx.state
        val out = when (ready) {
            is Ready.ManaPotion -> applyManaPotion(ctx, ready)
            is Ready.Swiftmend -> applySwiftmend(ctx, ready)
            is Ready.Standard -> applyStandardHeal(ctx, ready)
            is Ready.Damage -> applyDamageCast(ctx, ready)
        }
        // Started here rather than in each apply path: there are four of them
        // and a fifth would silently forget.
        return if (ready is Ready.ManaPotion) {
            out
        } else {
            out.copy(globalCooldownRemaining = data.balance.combat.shared.globalCooldownTicks)
        }
    }

    /**
     * A damage cast: mana out, damage into the tick's accumulator, and a DoT on
     * the enemy if the spell has one.
     *
     * `healing` is the magnitude -- see the note on Spell.threatMultiplier for
     * why the field is reused rather than duplicated. Deliberately does not go
     * through the healing hooks: those are all shaped around a target unit, and
     * the enemy is not one.
     */
    private fun applyDamageCast(ctx: CastContext, ready: Ready.Damage): GameState {
        val s = ctx.state
        // Non-null by construction: validate() rejects a null class before it
        // can produce a Ready.Damage.
        val cls = s.playerClass ?: return s
        val spell = ready.spell
        val crit = if (ready.isCrit) 1.5 else 1.0
        val rank = stats.rankHealMult(stats.spellRank(ready.spellId, cls, s.level))
        val amount = spell.healing * ready.eff.baseHealingMultiplier * rank * crit

        val dots = spell.hotDuration?.takeIf { spell.school == SpellSchool.DAMAGE }?.let { dur ->
            val perTick = (spell.hotHealingPerTick ?: 0.0) * ready.eff.baseHealingMultiplier * rank
            // Refresh by ability rather than append, and never replace the whole
            // list -- the party-side equivalent of this does replace it, which
            // is a bug this must not inherit.
            s.enemyDebuffs.filterNot { it.sourceAbilityId == ready.spellId } + UnitDebuff(
                id = ready.spellId,
                name = spell.name,
                remainingTicks = dur,
                damagePerTick = perTick,
                icon = spell.icon,
                sourceAbilityId = ready.spellId,
            )
        } ?: s.enemyDebuffs

        // A UTILITY spell has no magnitude -- a bare taunt or defensive should
        // not quietly deal `healing` damage because the field is shared.
        val dealt = if (spell.school == SpellSchool.DAMAGE) amount else 0.0

        var buffs = s.playerCombatBuffs
        if (spell.damageReduction != null) {
            buffs = buffs.filterNot { it.id == BUFF_ACTIVE_MITIGATION } + PlayerBuff(
                id = BUFF_ACTIVE_MITIGATION,
                remainingTicks = spell.damageReductionTicks ?: 0,
                magnitude = spell.damageReduction,
            )
        }

        // Threat is not proportional to damage. A tank's Shield Slam is worth
        // three times its damage in threat; a taunt is worth a flat amount with
        // no damage at all. Both fields were declared on Spell and read by
        // nothing, which is why a "threat spell" moved the bar exactly as much
        // as any other spell of the same size.
        val threat = dealt * spell.threatMultiplier + spell.flatThreat

        val out = s.copy(
            mana = max(0.0, s.mana - ready.needMana),
            playerCombatBuffs = buffs,
            pendingEnemyDamage = s.pendingEnemyDamage + dealt,
            pendingPlayerThreat = s.pendingPlayerThreat + threat,
            enemyDebuffs = dots,
            spellCooldowns = s.spellCooldowns.withCooldown(
                ready.spellId,
                cooldownTicks(spell.cooldown, ready.eff.hastePercent, 0),
            ),
        )
        return if (spell.tauntTicks == null) out else out.copy(
            party = out.party.map {
                if (it.id != PLAYER_UNIT_ID) it
                else it.copy(
                    threat = max(
                        it.threat,
                        (out.party.filter { u -> u.isAlive }.maxOfOrNull { u -> u.threat } ?: 0.0) *
                            data.balance.threat.tauntOvertakeMultiplier,
                    ),
                )
            },
            enemyTargetId = PLAYER_UNIT_ID,
            tauntedById = PLAYER_UNIT_ID,
            tauntLockTicks = spell.tauntTicks,
        )
    }

    /** Cooldowns are the one place haste applies; Power Infusion halves them. */
    private fun cooldownTicks(rawTicks: Int, hastePct: Double, piStacks: Int): Int =
        (rawTicks * (1 - hastePct / 100.0) * (if (piStacks > 0) 0.5 else 1.0)).roundToInt()

    /** Only positive cooldowns are recorded — a zero entry is not stored at all. */
    private fun Map<String, Int>.withCooldown(spellId: String, ticks: Int): Map<String, Int> =
        if (ticks > 0) this + (spellId to ticks) else this

    private fun potionTier(level: Int) =
        data.consumables.getValue(MANA_POTION_ID).tiers.firstOrNull { level <= it.maxLevel }
            ?: data.consumables.getValue(MANA_POTION_ID).tiers.last()

    private fun applyManaPotion(ctx: CastContext, ready: Ready.ManaPotion): GameState {
        val s = ctx.state
        val spell = ready.spell
        val durTicks = spell.manaRegenBuffDurationTicks ?: 0
        val instant = potionTier(s.level).instant
        // The over-time portion is half the instant amount, spread across the buff.
        val drip = if (durTicks > 0) (instant * 0.5) / durTicks else 0.0

        val piStacks = s.playerCombatBuffs.buffStacks(BUFF_POWER_INFUSION)
        val cd = cooldownTicks(spell.cooldown, ready.eff.hastePercent, piStacks)
        val piLeft = max(0, piStacks - 1)

        var buffs = s.playerCombatBuffs.addBuff(BUFF_MANA_REGEN_POTION, durTicks, 1, drip)
        buffs = buffs.applyPowerInfusionAfterCast(piLeft)

        return s.copy(
            mana = min(s.maxMana.toDouble(), s.mana + instant),
            manaPotionsUsedThisDungeon = s.manaPotionsUsedThisDungeon + 1,
            playerCombatBuffs = buffs,
            spellCooldowns = s.spellCooldowns.withCooldown(spell.id, cd),
        )
    }

    /** Consumes a HoT on the target and converts it into an instant burst heal. */
    private fun applySwiftmend(ctx: CastContext, ready: Ready.Swiftmend): GameState {
        val s = ctx.state
        val idx = s.party.indexOfFirst { it.id == ready.targetId }
        if (idx < 0) return s
        val target = s.party[idx]
        val hotIdx = DruidHooks.consumableHotIndex(ctx, target)
        if (hotIdx < 0) return s

        val isCrit = ready.critRoll < ready.eff.critChancePercent(
            s.playerCombatBuffs.naturalPerfectionStacks(),
        )
        val raw = ready.spell.healing * ready.eff.baseHealingMultiplier * (if (isCrit) 1.5 else 1.0)
        val applied = applyHealToUnit(target, raw)

        val party = s.party.mapIndexed { i, u ->
            if (i != idx) u
            else u.copy(health = applied.health, buffs = u.buffs.filterIndexed { j, _ -> j != hotIdx })
        }

        val piStacks = s.playerCombatBuffs.buffStacks(BUFF_POWER_INFUSION)
        val cd = cooldownTicks(ready.spell.cooldown, ready.eff.hastePercent, piStacks)
        var buffs = s.playerCombatBuffs.addSpiritLockoutIfSpent(ready.needMana > 0)
        buffs = buffs.applyPowerInfusionAfterCast(max(0, piStacks - 1))

        return s.copy(
            party = party,
            mana = max(0.0, s.mana - ready.needMana),
            playerCombatBuffs = buffs,
            spellCooldowns = s.spellCooldowns.withCooldown(ready.spell.id, cd),
            runHealEffective = s.runHealEffective + applied.effective,
            runHealOverheal = s.runHealOverheal + applied.overheal,
            runManaSpentHealing = s.runManaSpentHealing + ready.needMana,
        )
    }

    private data class PartyPatch(val party: List<Unit>, val healEff: Double, val healOh: Double)

    /**
     * The direct-heal and HoT application. The heal formula multiplies, in order:
     * base × rank × healing multiplier × crit × Tower consumption × HoT synergy ×
     * Grace stacks × class hook × Radiance.
     */
    private fun patchDirectAndHot(ctx: CastContext, ready: Ready.Standard, healMultB: Double): PartyPatch {
        val s = ctx.state
        val spell = ready.spell
        val hooks = hooksFor(ctx.cls)
        val shared = data.balance.combat.shared

        val archShieldBonus = PriestHooks.archangelEchoShieldBonus(ctx, spell)
        val archEchoTargets = if (ready.archangel) s.party.count { it.health > 0 && it.id != ready.targetId } else 0
        val archEchoPerTarget = if (archEchoTargets > 0) archShieldBonus / archEchoTargets else 0.0
        val awSplash = PaladinHooks.avengingWrathSplashFraction(ctx)
        val graceRanks = ctx.ranks(GRACE_SOURCE_ID)

        var healEff = 0.0
        var healOh = 0.0

        fun synergyMultiplier(u: Unit): Double {
            if (!spell.hasTag(TAG_SYNERGY_DIRECT)) return 1.0
            val primed = u.buffs.any { data.spell(it.sourceSpellId)?.hasTag(TAG_SYNERGY_PRIMER_SOURCE) == true }
            if (!primed) return 1.0
            return spell.balance?.directHealSynergyMultiplier ?: shared.directHealSynergyMultiplierDefault
        }

        fun healOne(u: Unit): Unit {
            if (u.health <= 0) return u
            val amount = spell.healing * ready.rankHealMult * healMultB * ready.critH * ready.tMod *
                synergyMultiplier(u) *
                PriestHooks.graceHealMultiplier(ctx, u, graceRanks) *
                hooks.castDirectHealMultiplier(ctx, spell, ready.spellId) *
                if (ctx.cls == PlayerClass.PALADIN) PaladinHooks.radianceHealMultiplier(ctx, u) else 1.0

            val applied = applyHealToUnit(u, amount)
            healEff += applied.effective
            healOh += applied.overheal

            var shieldAdd = 0.0
            if (ctx.cls == PlayerClass.PRIEST && applied.overheal > 0) {
                shieldAdd = PriestHooks.divinityOverhealAbsorb(ctx, applied.overheal, ctx.uniqueStatRating())
            }
            val nextShield = u.shield + shieldAdd
            var ticks = u.shieldTicksRemaining
            if (shieldAdd > 0) ticks = shared.shieldDefaultTicks
            if (nextShield <= 0) ticks = 0
            return u.copy(health = applied.health, shield = nextShield, shieldTicksRemaining = ticks)
        }

        fun addHot(u: Unit): Unit {
            if (u.health <= 0) return u
            if (spell.type != SpellType.HOT && (spell.hotDuration ?: 0) <= 0) return u
            return applyHot(
                unit = u,
                spell = spell,
                healingPerTick = (spell.hotHealingPerTick ?: 0.0) * ready.rankHealMult * healMultB * ready.critH,
                pandemicCapMult = shared.hotPandemicDurationCapMultDefault,
                hasteTickScale = ready.eff.hasteTickScale,
                bloomBurstHeal = if (spell.id == "lifebloom") max(0.0, spell.healing * ready.rankHealMult) else null,
            )
        }

        val directBase = spell.healing * ready.rankHealMult * healMultB * ready.critH * ready.tMod
        var party: List<Unit>

        if (spell.type == SpellType.AOE) {
            party = s.party.map { if (it.health > 0) addHot(healOne(it)) else it }
        } else {
            party = s.party.map { u ->
                when {
                    u.id == ready.targetId -> addHot(healOne(u))
                    // Archangel echoes direct heals onto the rest of the party.
                    ready.archangel && !PriestHooks.archangelSkipsSpell(spell) &&
                        spell.isDirectHeal() && u.health > 0 -> {
                        val healed = healOne(u)
                        if (archEchoPerTarget <= 0) healed else {
                            val applied = applyHealToUnit(healed, archEchoPerTarget)
                            healEff += applied.effective
                            healOh += applied.overheal
                            healed.copy(health = applied.health)
                        }
                    }
                    else -> u
                }
            }

            // Avenging Wrath splashes a fraction onto the lowest other ally.
            if (awSplash > 0 && spell.isDirectHeal()) {
                val lowest = party.filter { it.id != ready.targetId && it.health > 0 }
                    .minByOrNull { it.health / it.maxHealth }
                if (lowest != null) {
                    val applied = applyHealToUnit(lowest, directBase * awSplash)
                    healEff += applied.effective
                    healOh += applied.overheal
                    party = party.map { if (it.id == lowest.id) it.copy(health = applied.health) else it }
                }
            }
        }

        if (ready.archangel && archShieldBonus > 0) {
            party = party.map { it.copy(shield = 0.0, shieldTicksRemaining = 0) }
        }
        return PartyPatch(party, healEff, healOh)
    }

    private fun applyStandardHeal(ctx: CastContext, ready: Ready.Standard): GameState {
        val s = ctx.state
        val spell = ready.spell
        val hooks = hooksFor(ctx.cls)

        // Priest weave: casts alternate between amplifying HoTs and direct heals.
        var castBuffs = ready.buffsBaseline
        var weaveDirect = 1.0
        var weaveHot = 1.0
        val leavesHots = spell.type == SpellType.HOT || (spell.hotDuration ?: 0) > 0
        if (ctx.cls == PlayerClass.PRIEST) {
            if (leavesHots && castBuffs.hasBuff("priest_weave_hot")) {
                weaveHot += ctx.data.balance.combat.priest.weaveHotBonus
                castBuffs = castBuffs.removeBuff("priest_weave_hot")
            }
            if (spell.isDirectHeal() && castBuffs.hasBuff("priest_weave_direct")) {
                weaveDirect += ctx.data.balance.combat.priest.weaveDirectBonus
                castBuffs = castBuffs.removeBuff("priest_weave_direct")
            }
        }
        val healMultB = ready.healMultB * (if (spell.isDirectHeal()) weaveDirect else weaveHot)

        val patch = patchDirectAndHot(ctx, ready, healMultB)

        val land = LandContext(
            spell = spell,
            spellId = ready.spellId,
            targetId = ready.targetId,
            partyBeforeCast = s.party,
            healMultB = ready.healMultB,
            critH = ready.critH,
            tMod = ready.tMod,
            isCrit = ready.isCrit,
            rankHealMult = ready.rankHealMult,
            needMana = ready.needMana.toDouble(),
            surgeFree = ready.surgeFree,
        )
        val landed = hooks.onCastLand(ctx, land, patch.party, castBuffs)
        var party = landed.party
        var buffs = landed.playerCombatBuffs

        if (ready.isCrit && spell.isHeal() && ctx.ranks("power_infusion") > 0) {
            buffs = buffs.addPowerInfusionCharges(3)
        }

        if (ctx.cls == PlayerClass.PRIEST) {
            buffs = if (leavesHots) buffs.addBuff("priest_weave_direct", 80, 1)
            else if (spell.isDirectHeal() && spell.type != SpellType.AOE) buffs.addBuff("priest_weave_hot", 80, 1)
            else buffs
        }

        // Photosynthesis: a Healing Touch crit extends every druid HoT.
        if (ctx.cls == PlayerClass.DRUID && ready.spellId == "healing_touch" &&
            ready.isCrit && ctx.ranks("photosynthesis") > 0
        ) {
            party = party.map { unit ->
                unit.copy(
                    buffs = unit.buffs.map { b ->
                        if (b.remainingTicks > 0 && data.spell(b.sourceSpellId)?.hasTag(TAG_DRUID_HOT) == true) {
                            b.copy(remainingTicks = b.remainingTicks + 20)
                        } else b
                    },
                )
            }
        }

        val manaOut = hooks.manaAfterHeal(ctx, land, s.mana - ready.needMana).let { m ->
            // Talents granting flat mana back on a direct heal are applied generically.
            val back = stats.talentStats(s.talents).manaReturnOnDirectHeal
            if (spell.isDirectHeal()) min(s.maxMana.toDouble(), m + back) else m
        }

        // Light of Dawn is free at 3 Holy Power with the capstone talent invested.
        val rawCooldown =
            if (ctx.cls == PlayerClass.PALADIN && ready.spellId == "light_of_dawn" &&
                s.holyPower >= 3 && ctx.talentRanks("h_r5c4") > 0
            ) 0 else spell.cooldown

        val piStacks = buffs.buffStacks(BUFF_POWER_INFUSION)
        val cd = cooldownTicks(rawCooldown, ready.eff.hastePercent + ready.emergencyHaste, piStacks)
        val piLeft = max(0, piStacks - 1)

        // Holy Power: Tower of Radiance grants on healing a badly hurt target.
        var holyPower = s.holyPower
        if (ready.targetId != null && spell.type != SpellType.AOE) {
            val pre = s.party.firstOrNull { it.id == ready.targetId }
            if (pre != null && pre.health < pre.maxHealth * 0.5 && ctx.ranks("tower_of_radiance") > 0) {
                val gain = if (s.capstoneForm == "paladin_avenging_wrath" &&
                    buffs.hasBuff("avenging_wrath_aura")
                ) 2 else 1
                holyPower = min(3, holyPower + gain)
            }
        }
        if (ctx.cls == PlayerClass.PALADIN && ready.isCrit && ctx.talentRanks("h_r5c4") > 0 &&
            ctx.rng.nextDouble() < 0.25
        ) holyPower = min(3, holyPower + 1)
        if (ready.tower2) holyPower = 0

        if (ctx.cls == PlayerClass.PRIEST && PriestHooks.rollSurgeOfLight(ctx, ready.spellId)) {
            buffs = buffs.addBuff(BUFF_SURGE_OF_LIGHT, SURGE_OF_LIGHT_TICKS, 1)
        }

        val spentMana = ready.needMana > 0 && !(ready.surgeFree && PriestHooks.isSurgeFinisher(spell))
        buffs = buffs.addSpiritLockoutIfSpent(spentMana)
        buffs = buffs.applyPowerInfusionAfterCast(piLeft)

        val healEff = patch.healEff + landed.healEffective
        val healOh = patch.healOh + landed.healOverheal
        val manaSpent = if (spell.isHeal()) max(0.0, s.mana - manaOut) else 0.0

        // A cast is the most important thing to show the player, so it floats too.
        val floats = s.floatingCombatTexts + party.mapIndexedNotNull { i, a ->
            val b = s.party.getOrNull(i) ?: return@mapIndexedNotNull null
            val healed = a.health - b.health
            if (healed.roundToInt() <= 0) null else FloatingText(
                id = s.combatElapsedTicks.toLong() * 100 + 50 + i,
                unitId = a.id,
                amount = healed.roundToInt(),
                kind = FloatingKind.HEAL,
                crit = ready.isCrit,
                expiresAtCombatTick = s.combatElapsedTicks + FLOATING_TEXT_LIFETIME_TICKS,
            )
        }

        return s.copy(
            party = party,
            mana = manaOut,
            playerCombatBuffs = buffs,
            holyPower = holyPower,
            floatingCombatTexts = floats,
            spellCooldowns = s.spellCooldowns.withCooldown(ready.spellId, cd),
            runHealEffective = s.runHealEffective + healEff,
            runHealOverheal = s.runHealOverheal + healOh,
            runManaSpentHealing = s.runManaSpentHealing + manaSpent,
        )
    }
}
