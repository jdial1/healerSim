package com.jdial.aegis.sim

import com.jdial.aegis.data.AttackTemplate
import com.jdial.aegis.data.BossCombat
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Targeting
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Port of `src/gameTick.js` — one 100 ms simulation tick.
 *
 * Stage order is load-bearing and matches the web app exactly:
 *   1. boss AI / ability scheduling
 *   2. environmental damage, DoT ticks, HoT ticks, shield decay
 *   3. player systems (mana regen, buffs, capstones)
 *   4. death / wipe check
 *   5. encounter progression (trash -> boss -> reward)
 */
class GameTick(
    private val data: GameData,
    private val stats: PlayerStats,
    private val progression: Progression,
) {
    private val defaultMechanicMin = 2 * TICKS_PER_SECOND
    private val defaultMechanicMax = 5 * TICKS_PER_SECOND

    private fun combatProfile(dungeon: Dungeon): BossCombat {
        val c = dungeon.bossCombat
        return BossCombat(
            debuffTemplates = c?.debuffTemplates ?: emptyList(),
            selfBuffTemplates = c?.selfBuffTemplates ?: emptyList(),
            attackTemplates = c?.attackTemplates ?: emptyList(),
            mechanicIntervalTicksMin = c?.mechanicIntervalTicksMin ?: defaultMechanicMin,
            mechanicIntervalTicksMax = c?.mechanicIntervalTicksMax ?: defaultMechanicMax,
        )
    }

    // --- targeting -----------------------------------------------------------

    private fun selectTargets(party: List<Unit>, targeting: Targeting, rng: Rng): Set<String> {
        val living = party.filter { it.health > 0 }.map { it.id }
        if (living.isEmpty()) return emptySet()
        return when (targeting) {
            Targeting.ALL_LIVING -> living.toSet()
            Targeting.SINGLE_RANDOM -> setOf(rng.pick(living))
            Targeting.TWO_RANDOM -> rng.shuffled(living).take(2).toSet()
        }
    }

    // --- damage --------------------------------------------------------------

    private data class UnitDamage(
        val health: Double,
        val shield: Double,
        val shieldTicksRemaining: Int,
        val livingSeedPool: Double,
        val tookHealthDamage: Double,
        val naturalPerfectionTick: Boolean,
    )

    /** Shield first, then health; a Living Seed releases when health damage lands. */
    private fun applyDamageToUnit(u: Unit, damage: Double, naturalPerfectionRank: Int): UnitDamage {
        if (damage <= 0) {
            return UnitDamage(max(0.0, u.health), u.shield, u.shieldTicksRemaining, u.livingSeedPool, 0.0, false)
        }
        val hit = applyDamage(u.health, u.shield, damage)
        var hp = hit.health
        var seed = u.livingSeedPool
        var ticks = u.shieldTicksRemaining
        if (hit.shield <= 0) ticks = 0
        if (hit.tookHealthDamage > 0 && seed > 0 && hp > 0) {
            hp = min(u.maxHealth, hp + seed)
            seed = 0.0
        }
        val np = u.role == UnitRole.HEALER && hit.tookHealthDamage > 0 && naturalPerfectionRank > 0
        return UnitDamage(hp, hit.shield, ticks, seed, hit.tookHealthDamage, np)
    }

    // --- stage 1: boss AI ----------------------------------------------------

    private data class BossAi(
        val party: List<Unit>,
        val bossSelfBuffs: List<BossBuff>,
        val mechanicCooldown: Int,
        val mechanicOrdinal: Int,
        val naturalPerfectionAdd: Int,
    )

    /**
     * Mechanics fire in strict round-robin across the kinds present
     * (`debuff`, `buff`, `attack`), cycling within each kind.
     */
    private fun processBossAi(ctx: CastContext, rng: Rng): BossAi {
        val s = ctx.state
        var party = s.party
        var bossBuffs = if (s.combatPhase == CombatPhase.BOSS) s.bossSelfBuffs else emptyList()
        var cooldown = s.mechanicCooldown
        var ordinal = s.mechanicOrdinal
        var npAdd = 0

        val dungeon = s.currentDungeon
        if (s.combatPhase != CombatPhase.BOSS || dungeon == null) {
            return BossAi(party, bossBuffs, cooldown, ordinal, 0)
        }

        val profile = combatProfile(dungeon)
        val kinds = buildList {
            if (profile.debuffTemplates.isNotEmpty()) add("debuff")
            if (profile.selfBuffTemplates.isNotEmpty()) add("buff")
            if (profile.attackTemplates.isNotEmpty()) add("attack")
        }
        if (kinds.isEmpty()) return BossAi(party, bossBuffs, cooldown, ordinal, 0)

        cooldown -= 1
        if (cooldown > 0) return BossAi(party, bossBuffs, cooldown, ordinal, 0)

        val partyDamageMultPre = bossBuffs.maxOfOrNull { it.partyDamageMultiplier } ?: 1.0
        val kind = kinds[ordinal % kinds.size]
        val cycle = ordinal / kinds.size
        ordinal += 1

        when (kind) {
            "debuff" -> {
                val tpl = profile.debuffTemplates[cycle % profile.debuffTemplates.size]
                val targets = selectTargets(party, tpl.targeting, rng)
                if (targets.isNotEmpty()) {
                    // Note: a new debuff *replaces* the unit's whole debuff list.
                    party = party.map { u ->
                        if (u.id !in targets) u else u.copy(
                            debuffs = listOf(
                                UnitDebuff(
                                    // The web app mints an id here via generateCombatUid,
                                    // which draws from the same PRNG. The draw must happen
                                    // to keep the two streams aligned.
                                    id = "${tpl.abilityId}-${u.id}-${rng.nextUid()}",
                                    name = tpl.name,
                                    remainingTicks = tpl.durationTicks,
                                    damagePerTick = tpl.damagePerTick,
                                    icon = tpl.icon,
                                    sourceAbilityId = tpl.abilityId,
                                    dispellable = tpl.dispellable,
                                ),
                            ),
                        )
                    }
                }
            }

            "buff" -> {
                val tpl = profile.selfBuffTemplates[cycle % profile.selfBuffTemplates.size]
                val withoutSame = bossBuffs.filterNot { it.sourceAbilityId == tpl.abilityId }
                bossBuffs = withoutSame + BossBuff(
                    // Same as above: generateCombatUid consumes a PRNG draw.
                    id = "${tpl.abilityId}-${rng.nextUid()}",
                    name = tpl.name,
                    remainingTicks = tpl.durationTicks,
                    partyDamageMultiplier = tpl.partyDamageMultiplier,
                    icon = tpl.icon,
                    sourceAbilityId = tpl.abilityId,
                )
            }

            else -> {
                val tpl = profile.attackTemplates[cycle % profile.attackTemplates.size]
                val result = applyAttackTemplate(ctx, party, tpl, dungeon, partyDamageMultPre, rng)
                party = result.first
                npAdd += result.second
            }
        }

        cooldown = rng.nextInt(
            profile.mechanicIntervalTicksMin ?: defaultMechanicMin,
            profile.mechanicIntervalTicksMax ?: defaultMechanicMax,
        )
        return BossAi(party, bossBuffs, cooldown, ordinal, npAdd)
    }

    private fun applyAttackTemplate(
        ctx: CastContext,
        party: List<Unit>,
        tpl: AttackTemplate,
        dungeon: Dungeon,
        partyDamageMult: Double,
        rng: Rng,
    ): Pair<List<Unit>, Int> {
        val s = ctx.state
        val targets = selectTargets(party, tpl.targeting, rng)
        if (targets.isEmpty()) return party to 0

        val tank = party.firstOrNull { it.role == UnitRole.TANK }
        val tankDead = tank == null || tank.health <= 0
        val hooks = hooksFor(ctx.cls)
        val baseMult = progression.bossDamageMultiplier(dungeon.difficulty) *
            (if (dungeon.endless) progression.endlessMultiplier(s.endlessStacks) else 1.0) *
            partyDamageMult
        val natRank = ctx.ranks("natural_perfection")

        var npAdd = 0
        val next = party.map { u ->
            if (u.health <= 0 || u.id !in targets) return@map u
            var dmg = tpl.damage * baseMult * progression.levelGapDamageMultiplier(u.level, dungeon.levelMax)
            dmg *= hooks.damageTakenMultiplier(ctx, "boss_attack", u)
            // With the tank down, everyone else takes double.
            if (tankDead && (u.role == UnitRole.DPS || u.role == UnitRole.HEALER)) dmg *= 2
            val out = applyDamageToUnit(u, dmg, natRank)
            if (out.naturalPerfectionTick) npAdd = 1
            u.copy(
                health = out.health,
                shield = out.shield,
                shieldTicksRemaining = out.shieldTicksRemaining,
                livingSeedPool = out.livingSeedPool,
            )
        }
        return next to npAdd
    }

    // --- stage 2: environment, DoTs, HoTs ------------------------------------

    private data class EnvResult(
        val party: List<Unit>,
        val naturalPerfectionStacks: Int,
        val manaFromHotTicks: Double,
        val playerCombatBuffs: List<PlayerBuff>,
        val paladinResolveMana: Double,
        val paladinResolveHolyPower: Int,
        val healEffective: Double,
        val healOverheal: Double,
    )

    private fun processEnvironmentalTick(
        ctx: CastContext,
        partyAfterBossAi: List<Unit>,
        bossBuffs: List<BossBuff>,
        rng: Rng,
        startingNaturalPerfection: Int,
    ): EnvResult {
        val s = ctx.state
        val hooks = hooksFor(ctx.cls)
        val env = data.balance.environmentalDamage
        val pal = data.balance.combat.paladin

        val bossPartyDamageMult =
            if (s.combatPhase == CombatPhase.BOSS) bossBuffs.maxOfOrNull { it.partyDamageMultiplier } ?: 1.0
            else 1.0
        val tankIndex = partyAfterBossAi.indexOfFirst { it.role == UnitRole.TANK }
        val natRank = ctx.ranks("natural_perfection")
        // Ambient chip damage is bursty: it only rolls every N ticks.
        val allowAmbient = env.ambientChipEveryTicks <= 1 ||
            s.combatElapsedTicks % env.ambientChipEveryTicks == 0

        val out = mutableListOf<Unit>()
        var nextNat = startingNaturalPerfection
        var manaFromHots = 0.0
        var buffs = s.playerCombatBuffs
        var palMana = 0.0
        var palHolyPower = 0
        var healEff = 0.0
        var healOh = 0.0

        for (unit in partyAfterBossAi) {
            var damage = 0.0
            if (!s.isTutorialPaused) {
                val chance = rng.nextDouble()
                val diff = s.currentDungeon?.difficulty ?: 1
                if (allowAmbient) {
                    damage = when {
                        unit.role == UnitRole.TANK && chance < env.tankProcChance ->
                            (rng.nextDouble() * env.tankDamageRandomMax + diff) * env.ambientChipDamageMultiplier
                        unit.role != UnitRole.TANK && chance < env.nonTankProcChance ->
                            (rng.nextDouble() * env.nonTankDamageRandomMax + diff) * env.ambientChipDamageMultiplier
                        else -> 0.0
                    }
                }
                if (s.combatPhase == CombatPhase.BOSS && s.currentDungeon != null) {
                    damage *= progression.bossDamageMultiplier(s.currentDungeon.difficulty)
                    damage *= bossPartyDamageMult
                }
                if (s.currentDungeon?.endless == true) damage *= progression.endlessMultiplier(s.endlessStacks)
                if (s.currentDungeon != null) {
                    damage *= progression.levelGapDamageMultiplier(unit.level, s.currentDungeon.levelMax)
                }
                damage *= hooks.damageTakenMultiplier(ctx, "trash_tick", unit)
            }

            val tankHealthNow =
                if (tankIndex < 0) 1.0
                else out.getOrNull(tankIndex)?.health ?: partyAfterBossAi[tankIndex].health
            if (tankHealthNow <= 0 && (unit.role == UnitRole.DPS || unit.role == UnitRole.HEALER)) damage *= 2

            val vit = applyDamageToUnit(unit, damage, natRank)
            var health = vit.health
            var shield = vit.shield
            var shieldTicks = vit.shieldTicksRemaining
            if (vit.naturalPerfectionTick) nextNat = min(5, nextNat + 1)

            if (unit.role == UnitRole.HEALER && vit.tookHealthDamage > 0) {
                val selfHeal = hooks.selfHealOnDamage(ctx, vit.tookHealthDamage)
                if (selfHeal > 0) {
                    val applied = applyHealToUnit(unit.copy(health = health), selfHeal)
                    healEff += applied.effective
                    healOh += applied.overheal
                    health = applied.health
                }
                if (ctx.cls == PlayerClass.PALADIN) {
                    palMana += vit.tookHealthDamage * pal.passiveLightbringerEnvDamageManaPerHp
                    if (rng.nextDouble() < pal.passiveLightbringerEnvDamageHolyPowerChance) palHolyPower += 1
                }
            }

            // DoTs bypass shields and hit health directly.
            val dotLevelMult = s.currentDungeon
                ?.let { progression.levelGapDamageMultiplier(unit.level, it.levelMax) } ?: 1.0
            val activeDebuffs = mutableListOf<UnitDebuff>()
            for (d in unit.debuffs) {
                if (d.remainingTicks <= 0) continue
                var dot = d.damagePerTick * dotLevelMult
                if (s.currentDungeon?.endless == true) dot *= progression.endlessMultiplier(s.endlessStacks)
                health = max(0.0, health - dot)
                activeDebuffs += d.copy(remainingTicks = d.remainingTicks - 1)
            }

            val activeBuffs = mutableListOf<UnitBuff>()
            for (buff in unit.buffs) {
                if (buff.remainingTicks <= 0) continue
                // Grace is a pure-duration stack aura; it does not tick heals.
                if (buff.sourceSpellId == GRACE_SOURCE_ID) {
                    if (buff.remainingTicks > 1) activeBuffs += buff.copy(remainingTicks = buff.remainingTicks - 1)
                    continue
                }

                val sourceSpell = data.spell(buff.sourceSpellId)
                var acc = buff.tickAccumulator +
                    buff.tickIntervalScale * hooks.hotTickRateMultiplier(ctx, buff.sourceSpellId)
                var rem = buff.remainingTicks
                val bloomEligible = buff.bloomBurstHeal != null && health > 0

                // Haste raises the accumulator, so >100% haste yields extra ticks.
                while (acc >= 1 && rem > 0 && buff.healingPerTick > 0) {
                    acc -= 1
                    val tickAmt = hooks.hotTickAmount(ctx, buff, unit, buff.healingPerTick)
                    if (health > 0) {
                        val applied = applyHealToUnit(unit.copy(health = health), tickAmt)
                        healEff += applied.effective
                        healOh += applied.overheal
                        health = applied.health
                    }
                    // Vitality Bloom draws before Omen, matching the JS ordering —
                    // the two engines must consume the PRNG in the same order.
                    var bloomMana = 0.0
                    if (ctx.cls == PlayerClass.DRUID) {
                        val (extraHeal, mana) = DruidHooks.vitalityBloomTickExtras(ctx, tickAmt)
                        if (extraHeal > 0 && health > 0) {
                            val bloom = applyHealToUnit(unit.copy(health = health), extraHeal)
                            healEff += bloom.effective
                            healOh += bloom.overheal
                            health = bloom.health
                        }
                        bloomMana = mana
                    }
                    manaFromHots += hooks.hotTickManaReturn(ctx, buff.sourceSpellId) + bloomMana
                    if (ctx.cls == PlayerClass.DRUID) {
                        buffs = DruidHooks.rollOmenOfClarityOnHotTick(ctx, tickAmt, sourceSpell, buffs)
                    }
                }

                // Lifebloom bursts one tick early; other bloom HoTs burst on expiry.
                if (bloomEligible && buff.sourceSpellId == "lifebloom" && rem == 1) {
                    val applied = applyHealToUnit(unit.copy(health = health), buff.bloomBurstHeal!!)
                    healEff += applied.effective; healOh += applied.overheal; health = applied.health
                }
                rem -= 1
                if (rem <= 0 && bloomEligible && buff.sourceSpellId != "lifebloom") {
                    val applied = applyHealToUnit(unit.copy(health = health), buff.bloomBurstHeal!!)
                    healEff += applied.effective; healOh += applied.overheal; health = applied.health
                }
                if (rem > 0) activeBuffs += buff.copy(remainingTicks = rem, tickAccumulator = acc)
            }

            if (shield > 0 && shieldTicks > 0) {
                shieldTicks -= 1
                if (shieldTicks <= 0) shield = 0.0
            }

            out += unit.copy(
                health = health,
                buffs = activeBuffs,
                debuffs = activeDebuffs,
                shield = shield,
                shieldTicksRemaining = shieldTicks,
                livingSeedPool = vit.livingSeedPool,
            )
        }

        // A shield emptied during this tick can trigger Aegis Burst.
        val transition = hooks.onShieldTransition(ctx, partyAfterBossAi, out)
        return EnvResult(
            transition.party,
            nextNat,
            manaFromHots,
            buffs,
            palMana,
            palHolyPower,
            healEff + transition.healEffective,
            healOh + transition.healOverheal,
        )
    }

    /**
     * Floating combat text is presentation only — the engine records what changed
     * so the UI can animate it. Ids are a monotonic counter rather than the web
     * app's `Math.random`, so nothing here perturbs the shared PRNG stream.
     */
    private fun floatsFrom(
        before: List<Unit>,
        after: List<Unit>,
        crit: Boolean,
        combatTick: Int,
        startId: Long,
    ): List<FloatingText> {
        val out = mutableListOf<FloatingText>()
        var id = startId
        after.forEach { a ->
            val b = before.firstOrNull { it.id == a.id } ?: return@forEach
            val healed = a.health - b.health
            val absorbed = a.shield - b.shield
            // A fractional HoT tick rounds to zero; showing "0" is just noise.
            if (healed.roundToInt() > 0) {
                out += FloatingText(
                    id++, a.id, healed.roundToInt(), FloatingKind.HEAL, crit,
                    combatTick + FLOATING_TEXT_LIFETIME_TICKS,
                )
            }
            if (absorbed.roundToInt() > 0) {
                out += FloatingText(
                    id++, a.id, absorbed.roundToInt(), FloatingKind.ABSORB, false,
                    combatTick + FLOATING_TEXT_LIFETIME_TICKS,
                )
            }
        }
        return out
    }

    // --- stage 3: player systems --------------------------------------------

    private data class PlayerSystems(
        val party: List<Unit>,
        val mana: Double,
        val playerCombatBuffs: List<PlayerBuff>,
        val internalCooldowns: Map<String, Int>,
        val capstoneForm: String?,
        val holyPower: Int,
        val healEffective: Double,
        val healOverheal: Double,
    )

    /** Mana regen is suppressed for five seconds after any spend. */
    private fun manaRegenPerTick(spiritLockoutTicks: Int, spirit: Double): Double {
        if (spiritLockoutTicks > 0) return 0.0
        val rawPerTick = MANA_REGEN_PER_TICK * stats.spiritRegenMultiplier(spirit)
        val perSec = (rawPerTick * TICKS_PER_SECOND * 10).roundToInt() / 10.0
        return (perSec / TICKS_PER_SECOND * 1000).roundToInt() / 1000.0
    }

    private fun resolvePlayerSystems(ctx: CastContext, env: EnvResult): PlayerSystems {
        val s = ctx.state
        val hooks = hooksFor(ctx.cls)

        var icd = s.internalCooldowns.mapValues { (_, v) -> if (v > 0) v - 1 else v }
        val lockTicks = s.playerCombatBuffs.buffTicks(BUFF_SPIRIT_REGEN_LOCKOUT)
        val spirit = if (ctx.cls != null) stats.primaryStats(ctx.cls, s.level).spirit else 0.0

        val regen = manaRegenPerTick(lockTicks, spirit) +
            s.playerCombatBuffs.potionDrip() +
            hooks.manaReturnOnTick(ctx, lockTicks)
        val mana = min(s.maxMana.toDouble(), s.mana + regen + env.manaFromHotTicks + env.paladinResolveMana)

        var buffs = env.playerCombatBuffs.tickBuffs()
        var party = env.party
        var healEff = 0.0
        var healOh = 0.0

        // Spirit of Redemption: a one-off healing amp when the healer is nearly dead.
        val healer = party.firstOrNull { it.role == UnitRole.HEALER }
        if (ctx.cls != null && healer != null &&
            ctx.ranks("spirit_of_redemption") > 0 &&
            healer.health < healer.maxHealth * 0.3 &&
            icd.icdReady("spirit_redemption") &&
            !buffs.hasBuff("spirit_of_redemption_amp")
        ) {
            buffs = buffs.addBuff("spirit_of_redemption_amp", TICKS_SPIRIT_REDEMPTION, 1)
            icd = icd + ("spirit_redemption" to ICD_SPIRIT_REDEMPTION)
        }

        // Nature's Grace capstone: a steady party-wide heal every tick.
        if (s.capstoneForm == "druid_natures_grace" &&
            s.playerCombatBuffs.hasBuff("natures_grace_aura") && ctx.cls != null
        ) {
            val amount = 0.4 * s.level
            party = party.map { u ->
                if (u.health <= 0) return@map u
                val applied = applyHealToUnit(u, amount)
                healEff += applied.effective
                healOh += applied.overheal
                u.copy(health = applied.health)
            }
        }

        buffs = buffs.setNaturalPerfection(env.naturalPerfectionStacks)

        // A capstone form lapses when its aura drops.
        val capstoneForm = ctx.cls?.let { cls ->
            val prog = data.bundle(cls).meta.progression
            if (s.capstoneForm == prog.capstoneForm && buffs.hasBuff(prog.capstonePlayerBuffId)) s.capstoneForm
            else null
        }

        return PlayerSystems(
            party = party,
            mana = mana,
            playerCombatBuffs = buffs,
            internalCooldowns = icd,
            capstoneForm = capstoneForm,
            holyPower = min(3, s.holyPower + env.paladinResolveHolyPower),
            healEffective = healEff,
            healOverheal = healOh,
        )
    }

    // --- stage 5: progression ------------------------------------------------

    private fun runStats(s: GameState): RunStats {
        val sec = max(1e-3, s.combatElapsedTicks / TICKS_PER_SECOND.toDouble())
        val eff = s.runHealEffective
        val raw = eff + s.runHealOverheal
        return RunStats(
            totalHealing = eff,
            hps = eff / sec,
            overhealPct = if (raw > 0) 100 * s.runHealOverheal / raw else 0.0,
            hpm = if (s.runManaSpentHealing > 0) eff / s.runManaSpentHealing else 0.0,
        )
    }

    /** Recomputes level, talent points and mana pool after an XP award. */
    private fun withPostRunProgress(s: GameState, xpGained: Int): GameState {
        val newXp = s.xp + xpGained
        val level = progression.levelFromTotalXp(newXp)
        val maxMana = stats.maxMana(s.playerClass, level, s.talents)
        return s.copy(
            xp = newXp,
            level = level,
            talentPoints = progression.talentPoints(level, s.talents),
            maxMana = maxMana,
            mana = min(maxMana.toDouble(), s.mana),
        )
    }

    fun generateParty(cls: PlayerClass, playerLevel: Int, rng: Rng): List<Unit> {
        fun allyLevel() = max(1, playerLevel + (rng.nextDouble() * 3).toInt() - 1)

        val tankTpl = rng.pick(data.npcPools.tankPool)
        val dps = rng.shuffled(data.npcPools.dpsPool).take(3)

        val tankLevel = allyLevel()
        val tankHp = stats.maxHealthForRole("TANK", tankLevel).toDouble()
        val healerHp = stats.healerMaxHealth(max(1, playerLevel)).toDouble()

        return buildList {
            add(Unit("1", tankTpl.name, UnitRole.TANK, tankLevel, tankHp, tankHp))
            dps.forEachIndexed { i, tpl ->
                val lv = allyLevel()
                val hp = stats.maxHealthForRole("DPS", lv).toDouble()
                add(Unit("${i + 2}", tpl.name, UnitRole.DPS, lv, hp, hp))
            }
            add(Unit(HEALER_UNIT_ID, "Player (You)", UnitRole.HEALER, max(1, playerLevel), healerHp, healerHp))
        }
    }

    private fun resolveFailure(ctx: CastContext, s: GameState, party: List<Unit>, rng: Rng): GameState? {
        val allDead = party.all { it.health <= 0 }
        val healerDown = party.firstOrNull { it.role == UnitRole.HEALER }?.health == 0.0
        if (!allDead && !healerDown) return null

        val dungeon = s.currentDungeon
            ?: return s.endedRun().copy(party = party, dungeonOutcome = null)

        val pullsCleared = TRASH_PACK_COUNT - s.trashPullsRemaining
        val paceXp = s.dungeonPace?.let { progression.pace(it).xpMultiplier } ?: 1.0
        val xpGained = (progression.dungeonFailureXpGain(dungeon, s.level, pullsCleared) * paceXp).roundToInt()

        val stats0 = runStats(s)
        val advanced = withPostRunProgress(s, xpGained)
        return advanced.endedRun().copy(
            party = ctx.cls?.let { generateParty(it, advanced.level, rng) } ?: party,
            dungeonOutcome = DungeonOutcome(
                kind = if (allDead) DungeonOutcomeKind.PARTY_WIPE else DungeonOutcomeKind.HEALER_DOWN,
                dungeonId = dungeon.id,
                xpGained = xpGained,
                stats = stats0,
            ),
        )
    }

    private fun finalizeProgress(s: GameState): GameState {
        val trashHp = s.currentDungeon?.let { max(1.0, progression.trashMaxHealth(it)) } ?: 1.0
        val progress = if (s.combatPhase == CombatPhase.TRASH) {
            val cleared = (TRASH_PACK_COUNT - s.trashPullsRemaining) * 25.0
            val cap = if (s.enemyMaxHealth > 0) s.enemyMaxHealth else trashHp
            val current = if (cap > 0) max(0.0, (cap - s.enemyHealth) / cap) * 25 else 0.0
            min(75.0, cleared + current)
        } else {
            val cap = if (s.enemyMaxHealth > 0) s.enemyMaxHealth else 1.0
            75 + max(0.0, (cap - s.enemyHealth) / cap) * 25
        }
        return s.copy(dungeonProgress = progress)
    }

    private fun resolveOngoingCombat(
        ctx: CastContext,
        s: GameState,
        sys: PlayerSystems,
        boss: BossAi,
        bossBuffsNext: List<BossBuff>,
        dpsPaceMultiplier: Double,
        rng: Rng,
    ): GameState {
        val pd = data.balance.partyDps
        val partyDps = pd.base + s.level.toDouble().pow(pd.levelExponent) * pd.levelMultiplier
        val deadDps = sys.party.count { it.role == UnitRole.DPS && it.health <= 0 }
        // Losing DPS only slows the boss, not trash.
        val bossDpsMult = if (s.combatPhase == CombatPhase.BOSS) 0.7.pow(deadDps) else 1.0
        var enemyHealth = s.enemyHealth - partyDps * bossDpsMult * dpsPaceMultiplier * s.runDpsJitter

        val base = s.copy(
            party = sys.party,
            mana = sys.mana,
            playerCombatBuffs = sys.playerCombatBuffs,
            internalCooldowns = sys.internalCooldowns,
            capstoneForm = sys.capstoneForm,
            holyPower = sys.holyPower,
            mechanicCooldown = boss.mechanicCooldown,
            mechanicOrdinal = boss.mechanicOrdinal,
            bossSelfBuffs = if (s.combatPhase == CombatPhase.BOSS) bossBuffsNext else emptyList(),
        )

        if (enemyHealth > 0) return finalizeProgress(base.copy(enemyHealth = enemyHealth))

        val dungeon = s.currentDungeon
        if (s.combatPhase == CombatPhase.TRASH) {
            val remaining = s.trashPullsRemaining - 1
            if (remaining > 0) {
                val hp = dungeon?.let { max(1.0, progression.trashMaxHealth(it)) } ?: 1.0
                return finalizeProgress(
                    base.copy(trashPullsRemaining = remaining, enemyHealth = hp, enemyMaxHealth = hp),
                )
            }
            // Trash cleared: the boss engages and the mechanic rotation resets.
            val bossHp = max(1.0, dungeon?.bossHealth ?: 1000.0)
            val profile = dungeon?.let { combatProfile(it) }
            return finalizeProgress(
                base.copy(
                    trashPullsRemaining = 0,
                    combatPhase = CombatPhase.BOSS,
                    enemyHealth = bossHp,
                    enemyMaxHealth = bossHp,
                    mechanicCooldown = profile?.let {
                        rng.nextInt(
                            it.mechanicIntervalTicksMin ?: defaultMechanicMin,
                            it.mechanicIntervalTicksMax ?: defaultMechanicMax,
                        )
                    } ?: 0,
                    mechanicOrdinal = 0,
                ),
            )
        }

        // Boss down.
        if (dungeon == null) return finalizeProgress(base.copy(enemyHealth = 0.0))

        // Endless: each boss kill rolls a new wave instead of ending the run.
        if (dungeon.endless) return advanceEndlessWave(ctx, base, sys, dungeon, rng)

        val paceXp = s.dungeonPace?.let { progression.pace(it).xpMultiplier } ?: 1.0
        val xpGained = (progression.dungeonXpGain(dungeon, s.level) * paceXp).roundToInt()
        val stats0 = runStats(s)
        // On a clear the web app keeps the mana it had entering this tick, so the
        // final tick's regen is deliberately discarded.
        val advanced = withPostRunProgress(base.copy(mana = s.mana), xpGained)

        return advanced.endedRun().copy(
            dungeonProgress = 100.0,
            completedDungeonIds =
                if (!dungeon.endless && dungeon.id !in s.completedDungeonIds) s.completedDungeonIds + dungeon.id
                else s.completedDungeonIds,
            party = ctx.cls?.let { generateParty(it, advanced.level, rng) } ?: sys.party,
            dungeonOutcome = DungeonOutcome(
                kind = DungeonOutcomeKind.SUCCESS,
                dungeonId = dungeon.id,
                xpGained = xpGained,
                stats = stats0,
            ),
        )
    }

    /** Builds the next endless wave: a fresh boss, scaled, and the trash reset. */
    private fun advanceEndlessWave(
        ctx: CastContext,
        base: GameState,
        sys: PlayerSystems,
        dungeon: Dungeon,
        rng: Rng,
    ): GameState {
        val s = base
        val stacks = s.endlessStacks + 1

        // The boss is drawn from the dungeons the player has out-levelled.
        val core = data.dungeons.filter { !it.endless }
        val eligible = core.filter { s.level >= it.levelMin }.ifEmpty { core }
        val source = rng.pick(eligible)

        val template = data.dungeons.firstOrNull { it.endless } ?: return s
        val next = template.copy(
            bossName = source.bossName,
            bossHealth = max(1.0, (source.bossHealth * progression.endlessMultiplier(stacks)).roundToInt().toDouble()),
            bossIcon = source.bossIcon,
            bossCombat = source.bossCombat,
            levelMin = source.levelMin,
            levelMax = source.levelMax,
            difficulty = 1,
            endless = true,
        )

        val paceXp = s.dungeonPace?.let { progression.pace(it).xpMultiplier } ?: 1.0
        val waveXp = (progression.dungeonXpGain(source, s.level) *
            data.balance.endless.bossKillXpFraction * paceXp).roundToInt()

        val beforeLevel = s.level
        val advanced = withPostRunProgress(s, waveXp)
        val party =
            if (advanced.level > beforeLevel && ctx.cls != null) generateParty(ctx.cls!!, advanced.level, rng)
            else sys.party

        val trashHp = max(1.0, progression.trashMaxHealth(next))
        val profile = combatProfile(next)

        return finalizeProgress(
            advanced.copy(
                party = party,
                currentDungeon = next,
                endlessStacks = stacks,
                combatPhase = CombatPhase.TRASH,
                trashPullsRemaining = TRASH_PACK_COUNT,
                enemyHealth = trashHp,
                enemyMaxHealth = trashHp,
                dungeonProgress = 0.0,
                bossSelfBuffs = emptyList(),
                mechanicCooldown = rng.nextInt(
                    profile.mechanicIntervalTicksMin ?: defaultMechanicMin,
                    profile.mechanicIntervalTicksMax ?: defaultMechanicMax,
                ),
                mechanicOrdinal = 0,
                isCombatActive = true,
                mana = min(advanced.maxMana.toDouble(), sys.mana),
            ),
        )
    }

    // --- the tick ------------------------------------------------------------

    fun advance(state: GameState, rng: Rng, dpsMultiplierOverride: Double? = null): GameState {
        if (!state.isCombatActive) return state

        val s = state.copy(
            combatElapsedTicks = state.combatElapsedTicks + 1,
            floatingCombatTexts = state.floatingCombatTexts
                .filter { it.expiresAtCombatTick > state.combatElapsedTicks + 1 },
        )
        val ctx = CastContext(s, data, stats, rng)

        val dpsPace = dpsMultiplierOverride
            ?: s.dungeonPace?.let { progression.pace(it).dpsMultiplier }
            ?: 1.0

        val boss = processBossAi(ctx, rng)
        val withBoss = s.copy(
            bossSelfBuffs = boss.bossSelfBuffs,
            mechanicCooldown = boss.mechanicCooldown,
            mechanicOrdinal = boss.mechanicOrdinal,
        )

        val env = processEnvironmentalTick(
            ctx = CastContext(withBoss, data, stats, rng),
            partyAfterBossAi = boss.party,
            bossBuffs = boss.bossSelfBuffs,
            rng = rng,
            startingNaturalPerfection = min(
                5,
                s.playerCombatBuffs.naturalPerfectionStacks() + boss.naturalPerfectionAdd,
            ),
        )

        val bossBuffsNext =
            if (s.combatPhase == CombatPhase.BOSS)
                boss.bossSelfBuffs.map { it.copy(remainingTicks = it.remainingTicks - 1) }
                    .filter { it.remainingTicks > 0 }
            else emptyList()

        var acc = withBoss.copy(
            runHealEffective = s.runHealEffective + env.healEffective,
            runHealOverheal = s.runHealOverheal + env.healOverheal,
        )

        val sys = resolvePlayerSystems(CastContext(acc, data, stats, rng), env)
        acc = acc.copy(
            runHealEffective = acc.runHealEffective + sys.healEffective,
            runHealOverheal = acc.runHealOverheal + sys.healOverheal,
        )

        resolveFailure(ctx, acc, sys.party, rng)?.let { return it }

        // Presentation: record what healing landed this tick so the UI can float it.
        val floats = (s.floatingCombatTexts + floatsFrom(
            before = s.party,
            after = sys.party,
            crit = false,
            combatTick = s.combatElapsedTicks,
            startId = s.combatElapsedTicks.toLong() * 100,
        )).filter { it.expiresAtCombatTick > s.combatElapsedTicks }

        return resolveOngoingCombat(ctx, acc, sys, boss, bossBuffsNext, dpsPace, rng)
            .let { if (it.isCombatActive) it.copy(floatingCombatTexts = floats) else it }
    }
}
