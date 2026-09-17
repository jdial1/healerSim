package com.jdial.aegis.sim

import com.jdial.aegis.data.AttackTemplate
import com.jdial.aegis.data.BossCombat
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.DebuffMechanic
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

    // --- threat --------------------------------------------------------------
    //
    // Dormant in this increment: the table is built and carried, but no dungeon
    // opts into Targeting.HIGHEST_THREAT, so nothing consults it. Building it
    // first lets the model settle against the parity corpus before any content
    // depends on it.

    /**
     * Who the enemy is on, from the threat table as it stood at the end of last
     * tick.
     *
     * Draws nothing from the rng, and must never start doing so: every parity
     * scenario is a recording of one seeded stream, and an extra draw per tick
     * would desynchronise all of them. Ties break on ascending id so the answer
     * cannot depend on party list order either.
     */
    internal fun resolveEnemyTarget(s: GameState): String? {
        val living = s.party.filter { it.isAlive }
        if (living.isEmpty()) return null

        if (s.tauntLockTicks > 0) {
            living.firstOrNull { it.id == s.tauntedById }?.let { return it.id }
        }

        val best = living.minWith(compareByDescending<Unit> { it.threat }.thenBy { it.id })
        val current = living.firstOrNull { it.id == s.enemyTargetId } ?: return best.id
        // Hysteresis: you have to beat the current target by a margin, not tie
        // it, or the enemy flickers between two units trading the lead.
        val margin = data.balance.threat.overtakeMultiplier
        return if (best.threat > current.threat * margin) best.id else current.id
    }

    /**
     * Adds this tick's threat to the table.
     *
     * Healing counts only where it landed -- overheal generates none, which is
     * the one piece of threat a healer can actually play around. Scripted party
     * damage is attributed to the units notionally dealing it, so a tank builds
     * a lead a player has to respect once content starts using it.
     */
    internal fun accrueThreat(
        party: List<Unit>,
        healEffective: Double,
        scriptedPartyDamage: Double,
        /**
         * Threat each participant generated this tick from their own casts,
         * keyed by unit id and already scaled by each spell's threatMultiplier.
         * Not their damage -- see Participant.pendingPlayerThreat.
         */
        threatByActor: Map<String, Double> = emptyMap(),
        /**
         * Effective healing done by the party's AI healer this tick, credited to
         * whichever healer slot is not the player's. Without this the AI healer
         * is the one unit in the game that can heal all fight and never appear
         * on the table, so a player tank could never lose aggro to their healer
         * -- exactly the situation the coefficient exists to create.
         */
        aiHealerHealing: Double = 0.0,
        /** Which slot the passive and HoT healing in [healEffective] belongs to. */
        localUnitId: String = PLAYER_UNIT_ID,
    ): List<Unit> {
        val cfg = data.balance.threat
        val living = party.filter { it.isAlive }
        // No early return on an empty party: the corpse-zeroing below still has
        // to run, or a wipe leaves the last unit to die holding the top of the
        // table when the pull resets.
        val tank = living.firstOrNull { it.role == UnitRole.TANK }
        val dps = living.filter { it.role == UnitRole.DPS }
        val tankDamage = if (tank != null) scriptedPartyDamage * cfg.tankDamageShare else 0.0
        val perDps = if (dps.isEmpty()) 0.0 else (scriptedPartyDamage - tankDamage) / dps.size

        fun mult(role: UnitRole) = cfg.roleMultiplier[role.name] ?: 1.0

        return party.map { u ->
            if (!u.isAlive) {
                // A corpse holds no threat; it would otherwise still be leading
                // the table when it is resurrected or the pull resets.
                if (u.threat == 0.0) u else u.copy(threat = 0.0)
            } else {
                val damage = when {
                    u.role == UnitRole.TANK -> tankDamage
                    u.role == UnitRole.DPS -> perDps
                    else -> 0.0
                }
                // Healing is worth half its landed value in threat, as in
                // WotLK, and overheal is worth nothing -- the caller only ever
                // passes effective healing. Cast heals arrive via
                // threatByActor with the coefficient already applied; what
                // reaches healEffective here is passive and HoT healing, which
                // is still resolved for this client's participant only.
                val healing = when {
                    u.id == localUnitId -> healEffective * cfg.healingCoefficient
                    u.role == UnitRole.HEALER -> aiHealerHealing * cfg.healingCoefficient
                    else -> 0.0
                }
                // The player's own threat is theirs alone, and is what lets a
                // DPS pull off a tank that only generates scripted threat.
                val own = threatByActor[u.id] ?: 0.0
                val gained = (damage + healing + own) * mult(u.role)
                if (gained == 0.0) u else u.copy(threat = u.threat + gained)
            }
        }
    }

    /**
     * How much of the party's scripted damage the AI is still responsible for.
     *
     * Each human takes over one slot, so the scripted pool shrinks by whatever
     * that role was contributing. The three balance constants are the *result*
     * for exactly one human, so the generalisation has to reproduce them
     * exactly rather than approximately -- see the identity below.
     *
     * This is also what hands a slot back when somebody disconnects. A dropped
     * player is marked `isHuman = false` rather than removed, so they stop
     * subtracting here and the AI simply resumes doing their damage. There is
     * no separate handover path to get wrong, and a run does not end because
     * one phone lost signal.
     *
     * The arithmetic is deliberately `1.0 - Σ(1 - share)`: with a single healer
     * that is `1.0 - (1.0 - 1.0)`, which is bit-identical to 1.0 in IEEE-754,
     * so the enemy-damage expression stays the exact identity parity/golden.json
     * was recorded against. [DamageTest] pins that.
     */
    internal fun aiDamageShare(s: GameState): Double {
        val roles = data.balance.roles
        fun shareFor(role: UnitRole) = when (role) {
            UnitRole.HEALER -> roles.aiShareWhenHealer
            UnitRole.DPS -> roles.aiShareWhenDps
            UnitRole.TANK -> roles.aiShareWhenTank
        }
        // Single player is a map of one, so this is one subtraction of zero.
        val taken = s.participants.values
            .filter { it.isHuman }
            .sumOf { 1.0 - shareFor(it.role) }
        return (1.0 - taken).coerceIn(0.0, 1.0)
    }

    /**
     * A cast defensive cooldown's reduction, for the player's own unit only.
     *
     * Applied here rather than through damageTakenMultiplier because that hook
     * is per-class and this is not: any class with a spell carrying
     * `damageReduction` gets it, which is what makes active mitigation content
     * rather than code.
     */
    internal fun activeMitigation(s: GameState, u: Unit): Double {
        // Whoever occupies the slot, not slot 5: a defensive is the caster's own
        // and every participant carries their own buff list.
        val buff = s.participants[u.id]?.playerCombatBuffs
            ?.firstOrNull { it.id == BUFF_ACTIVE_MITIGATION }
            ?: return 1.0
        val reduction = buff.magnitude ?: return 1.0
        return (1.0 - reduction).coerceIn(0.0, 1.0)
    }

    /**
     * The AI tank taking the enemy back.
     *
     * A DPS player doing the damage they are meant to do out-threats an AI
     * tank, whose share of the scripted damage is small -- so the boss turned
     * to them and stayed there, and a player playing well died for it. The
     * setting for this existed (aiTauntCooldownTicks) and nothing read it.
     *
     * Only when the player is not the healer: healer runs never target by
     * threat, and the recorded ones must not change. Draws nothing from the rng.
     */
    internal fun aiTankTaunt(s: GameState): GameState {
        if (s.playerRole == UnitRole.HEALER) return s
        val cooldown = max(0, s.aiTauntCooldown - 1)
        val tank = s.party.firstOrNull { it.role == UnitRole.TANK && it.isAlive && !s.isHuman(it.id) }
        if (tank == null || cooldown > 0 || s.enemyTargetId == null || s.enemyTargetId == tank.id) {
            return if (cooldown == s.aiTauntCooldown) s else s.copy(aiTauntCooldown = cooldown)
        }
        val cfg = data.balance.threat
        val top = s.party.filter { it.isAlive }.maxOfOrNull { it.threat } ?: 0.0
        return s.copy(
            party = s.party.map {
                if (it.id == tank.id) it.copy(threat = max(it.threat, top * cfg.tauntOvertakeMultiplier)) else it
            },
            enemyTargetId = tank.id,
            tauntedById = tank.id,
            tauntLockTicks = cfg.aiTauntLockTicks,
            aiTauntCooldown = cfg.aiTauntCooldownTicks,
        )
    }

    /**
     * An AI DPS interrupting the boss.
     *
     * Only with no human DPS in the run -- then it is the people's job, and
     * "who kicks?" is theirs to settle. It lets the first interruptible cast
     * through and kicks every second one, a moment after it starts, so a
     * healer or tank sees both what a cast does and what a kick saves them.
     * Deterministic: no rng.
     */
    internal fun aiKick(s: GameState): GameState {
        val cast = s.enemyCast ?: return s
        if (!cast.interruptible || s.interruptibleCasts % 2 != 0) return s
        if (s.participants.values.any { it.isHuman && it.role == UnitRole.DPS }) return s
        if (cast.totalTicks - cast.remainingTicks < data.encounters.aiKickDelayTicks) return s
        val kicker = s.party.firstOrNull { it.role == UnitRole.DPS && it.isAlive && !s.isHuman(it.id) } ?: return s
        return s.copy(enemyCast = null, lastInterruptBy = kicker.id, exposedTicks = data.encounters.pressure.exposedTicks)
    }

    // --- the AI healer -------------------------------------------------------

    internal data class AiHealResult(
        val party: List<Unit>,
        val manaLeft: Double,
        val healed: Double,
    )

    /**
     * One tick of the party's AI healer.
     *
     * Exists only when the player is not the healer -- when they are, slot "5"
     * is them and there is no AI one. Triage, not a rotation: it tops up the
     * unit furthest from full and stops there, so chip damage accumulates and
     * a real spike still kills someone. When the budget runs dry, people die,
     * which is the whole tension of the role the player just stopped playing.
     *
     * Draws nothing from the rng, for the same reason nothing else added since
     * increment 1 does.
     */
    internal fun aiHealerTick(s: GameState, party: List<Unit>): AiHealResult {
        val cfg = data.balance.roles
        val healer = party.firstOrNull {
            // Any healer slot no human is driving. Excluding only slot 5 was the
            // same assumption everywhere else made: that the human is always
            // there. A second human joining as the healer in slot 4 would have
            // been played by the AI and by their owner at once.
            it.role == UnitRole.HEALER && !s.isHuman(it.id) && it.isAlive
        } ?: return AiHealResult(party, s.aiHealerMana, 0.0)

        val mana = min(
            cfg.aiHealerMaxMana(healer.level),
            s.aiHealerMana + cfg.aiHealerRegen(healer.level),
        )

        // Lowest health fraction, ties broken by id so the choice cannot depend
        // on party order.
        val hurt = party.filter { it.isAlive && it.maxHealth > 0 }
            .filter { it.health / it.maxHealth < cfg.aiHealerHealBelowFraction }
            .minWithOrNull(compareBy<Unit> { it.health / it.maxHealth }.thenBy { it.id })
            ?: return AiHealResult(party, mana, 0.0)

        val amount = cfg.aiHealerHeal(healer.level)
        val effective = min(amount, hurt.maxHealth - hurt.health)
        val cost = effective * cfg.aiHealerManaPerHealPoint
        if (effective <= 0 || cost > mana) return AiHealResult(party, mana, 0.0)

        return AiHealResult(
            party = party.map { if (it.id == hurt.id) it.copy(health = it.health + effective) else it },
            manaLeft = mana - cost,
            healed = effective,
        )
    }

    // --- targeting -----------------------------------------------------------

    /**
     * Threat targeting turns on when somebody is playing a threat role.
     *
     * No dungeon opts in via its JSON, deliberately: doing that would change
     * how the boss picks victims for a *healer* too, removing an rng draw and
     * desynchronising every recorded parity scenario. Gating on the player's
     * role instead means the healer game the goldens describe is bit-identical,
     * while a tank or DPS gets a boss that actually responds to the table.
     *
     * Only single-target attacks convert. A raid-wide hit lands on everyone
     * whoever is holding aggro.
     */
    private fun effectiveTargeting(s: GameState, t: Targeting): Targeting =
        if (s.playerRole != UnitRole.HEALER && t == Targeting.SINGLE_RANDOM) {
            Targeting.HIGHEST_THREAT
        } else {
            t
        }

    private fun selectTargets(
        party: List<Unit>,
        targeting: Targeting,
        rng: Rng,
        enemyTargetId: String?,
    ): Set<String> {
        val living = party.filter { it.health > 0 }.map { it.id }
        if (living.isEmpty()) return emptySet()
        return when (targeting) {
            Targeting.ALL_LIVING -> living.toSet()
            Targeting.SINGLE_RANDOM -> setOf(rng.pick(living))
            Targeting.TWO_RANDOM -> rng.shuffled(living).take(2).toSet()
            // Note this consumes no rng, unlike every mode above. That is why
            // no existing dungeon may opt in: doing so would remove a draw from
            // the seeded stream and desynchronise every later tick from the
            // parity corpus. Falls back to the front of the list only if
            // nothing has generated threat yet.
            Targeting.HIGHEST_THREAT ->
                setOf(enemyTargetId?.takeIf { id -> living.any { it == id } } ?: living.first())
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
        val enemyCast: EnemyCast? = null,
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

        // A cast in progress holds the rotation: it counts down, and lands on
        // the targets it chose when it started. Mechanics never overlap.
        s.enemyCast?.let { cast ->
            if (cast.remainingTicks > 1) {
                return BossAi(party, bossBuffs, cooldown, ordinal, 0, cast.copy(remainingTicks = cast.remainingTicks - 1))
            }
            val tpl = profile.attackTemplates.firstOrNull { it.abilityId == cast.abilityId }
                ?: return BossAi(party, bossBuffs, cooldown, ordinal, 0, null)
            val multNow = bossBuffs.maxOfOrNull { it.partyDamageMultiplier } ?: 1.0
            val (landed, np) = hitTargets(ctx, party, tpl, dungeon, multNow, cast.targets.toSet())
            return BossAi(landed, bossBuffs, cooldown, ordinal, np, null)
        }

        cooldown -= 1
        if (cooldown > 0) return BossAi(party, bossBuffs, cooldown, ordinal, 0)

        val partyDamageMultPre = bossBuffs.maxOfOrNull { it.partyDamageMultiplier } ?: 1.0
        var newCast: EnemyCast? = null
        val kind = kinds[ordinal % kinds.size]
        val cycle = ordinal / kinds.size
        ordinal += 1

        when (kind) {
            "debuff" -> {
                val tpl = profile.debuffTemplates[cycle % profile.debuffTemplates.size]
                val targets = selectTargets(
                    party,
                    effectiveTargeting(ctx.state, tpl.targeting),
                    rng,
                    ctx.state.enemyTargetId,
                )
                if (targets.isNotEmpty()) {
                    val mech = data.encounters.mechanics[tpl.abilityId]
                    // Note: a new debuff *replaces* the unit's whole debuff list --
                    // except the puzzle debuffs, which stay until dealt with.
                    party = party.map { u ->
                        if (u.id !in targets) u else u.copy(
                            debuffs = u.debuffs.filter { it.sourceAbilityId != tpl.abilityId && data.encounters.mechanics[it.sourceAbilityId] != null } + listOf(
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
                                    stacks = if (mech?.kind == DebuffMechanic.POISON || mech?.kind == DebuffMechanic.WOUND) 1 else 0,
                                    clearedByDefensive = mech?.kind == DebuffMechanic.WOUND,
                                    armedTicks = if (mech?.kind == DebuffMechanic.BOMB) mech.safeBelowTicks else 0,
                                    charm = mech?.kind == DebuffMechanic.MIND_CONTROL,
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
                if (tpl.castTicks > 0) {
                    // The same draw an instant attack makes, at the same point:
                    // only when the damage lands has changed.
                    val targets = selectTargets(party, effectiveTargeting(s, tpl.targeting), rng, s.enemyTargetId)
                    if (targets.isNotEmpty()) {
                        newCast = EnemyCast(
                            abilityId = tpl.abilityId,
                            name = tpl.name,
                            icon = tpl.icon,
                            targets = party.map { it.id }.filter { it in targets },
                            remainingTicks = tpl.castTicks,
                            totalTicks = tpl.castTicks,
                            interruptible = tpl.interruptible,
                        )
                    }
                } else {
                    val result = applyAttackTemplate(ctx, party, tpl, dungeon, partyDamageMultPre, rng)
                    party = result.first
                    npAdd += result.second
                }
            }
        }

        cooldown = rng.nextInt(
            profile.mechanicIntervalTicksMin ?: defaultMechanicMin,
            profile.mechanicIntervalTicksMax ?: defaultMechanicMax,
        )
        return BossAi(party, bossBuffs, cooldown, ordinal, npAdd, newCast)
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
        val targets = selectTargets(party, effectiveTargeting(s, tpl.targeting), rng, s.enemyTargetId)
        return hitTargets(ctx, party, tpl, dungeon, partyDamageMult, targets)
    }

    /**
     * An attack landing on [targets]. Shared by instant attacks and casts, so a
     * telegraphed hit is the same hit, a moment later -- with the mitigation
     * that is up when it lands, which is what makes a well-timed defensive count.
     */
    private fun hitTargets(
        ctx: CastContext,
        party: List<Unit>,
        tpl: AttackTemplate,
        dungeon: Dungeon,
        partyDamageMult: Double,
        targets: Set<String>,
    ): Pair<List<Unit>, Int> {
        val s = ctx.state
        if (targets.isEmpty()) return party to 0

        val tank = party.firstOrNull { it.role == UnitRole.TANK }
        val tankDead = tank == null || tank.health <= 0
        val hooks = hooksFor(ctx.cls)
        val baseMult = progression.bossDamageMultiplier(dungeon.difficulty) *
            (if (dungeon.endless) progression.endlessMultiplier(s.endlessStacks) else 1.0) *
            partyDamageMult * enrageMultiplier(s)
        val natRank = ctx.ranks("natural_perfection")

        var npAdd = 0
        val next = party.map { u ->
            if (u.health <= 0 || u.id !in targets) return@map u
            var dmg = tpl.damage * baseMult * progression.levelGapDamageMultiplier(u.level, dungeon.levelMax)
            dmg *= hooks.damageTakenMultiplier(ctx, "boss_attack", u)
            dmg *= activeMitigation(s, u)
            if (s.playerRole != UnitRole.HEALER && u.role == UnitRole.TANK) {
                dmg *= data.balance.roles.tankBossDamageTaken
            }
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
        /** What each unit took this tick, absorbed included, by unit id. */
        val damageTaken: Map<String, Double> = emptyMap(),
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
        val taken = HashMap<String, Double>()

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
                damage *= activeMitigation(ctx.state, unit)
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
            var dotTaken = 0.0
            for (d in unit.debuffs) {
                if (d.remainingTicks <= 0) continue
                var dot = d.damagePerTick * dotLevelMult * max(1, d.stacks)
                if (s.currentDungeon?.endless == true) dot *= progression.endlessMultiplier(s.endlessStacks)
                dot *= enrageMultiplier(s)
                val mech = data.encounters.mechanics[d.sourceAbilityId]
                // A wound is gone the moment its carrier raises a defensive; an
                // AI carrier raises one just before it would burst.
                if (mech?.kind == DebuffMechanic.WOUND &&
                    (activeMitigation(s, unit) < 1.0 || (!s.isHuman(unit.id) && d.stacks >= mech.maxStacks - 1))
                ) continue
                var next = d.copy(remainingTicks = d.remainingTicks - 1)
                when (mech?.kind) {
                    // Never runs out: every few ticks another stack, and the clock restarts.
                    DebuffMechanic.POISON, DebuffMechanic.WOUND -> {
                        val full = mech.durationTicks ?: d.remainingTicks
                        if (next.remainingTicks <= full - mech.everyTicks) {
                            val burst = mech.kind == DebuffMechanic.WOUND && d.stacks >= mech.maxStacks
                            if (burst) dot += mech.burstDamage * dotLevelMult
                            val stacks = if (burst) 1 else min(mech.maxStacks, d.stacks + 1)
                            next = next.copy(remainingTicks = full, stacks = stacks)
                        }
                    }
                    // Left alone, it goes off on whoever carries it.
                    DebuffMechanic.BOMB -> if (next.remainingTicks <= 0) dot += mech.burstDamage * dotLevelMult
                }
                health = max(0.0, health - dot)
                dotTaken += dot
                if (mech == null || next.remainingTicks > 0) activeDebuffs += next
            }
            // Only read by the tank and DPS mechanics, and summed on the side,
            // so the healer arithmetic above is untouched.
            if (damage + dotTaken > 0) taken[unit.id] = damage + dotTaken

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
                    val applied = applyHealToUnit(unit.copy(health = health), buff.bloomBurstHeal)
                    healEff += applied.effective; healOh += applied.overheal; health = applied.health
                }
                rem -= 1
                if (rem <= 0 && bloomEligible && buff.sourceSpellId != "lifebloom") {
                    val applied = applyHealToUnit(unit.copy(health = health), buff.bloomBurstHeal)
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
        val transition = hooks.onShieldTransition(ctx, partyAfterBossAi, spreadDebuffs(out))
        return EnvResult(
            transition.party,
            nextNat,
            manaFromHots,
            buffs,
            palMana,
            palHolyPower,
            healEff + transition.healEffective,
            healOh + transition.healOverheal,
            taken,
        )
    }

    /**
     * One tick of every participant's class resource: rage from the hits they
     * took, energy refilling, a Death Knight's memory of recent damage.
     *
     * Draws nothing from the rng. For a healer class the hook is the identity,
     * so the recorded runs see exactly the participant they saw before.
     */
    internal fun classTick(s: GameState, damageTaken: Map<String, Double>): GameState {
        val b = data.balance.classes
        return s.withEachParticipant { p ->
            if (p.role == UnitRole.HEALER) {
                p
            } else {
                hooksFor(p.playerClass).classTick(
                    ClassTick(
                        participant = p,
                        unit = s.party.firstOrNull { it.id == p.unitId },
                        damageTaken = damageTaken[p.unitId] ?: 0.0,
                        rating = stats.uniqueStatRating(p.playerClass, p.level, p.talents),
                        balance = b,
                    ),
                )
            }
        }
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
        val rawPerTick = data.balance.playerStats.manaRegenPerTick * stats.spiritRegenMultiplier(spirit)
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
            hooks.resourceReturnOnTick(ctx, lockTicks)
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
            val amount = data.balance.combat.druid.naturesGraceHealPerLevelPerTick * s.level
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
            damageDone = s.runDamageDealt,
            dps = s.runDamageDealt / sec,
        )
    }

    /**
     * Adds this award to the run's ledger for every human in the room.
     *
     * The local player's share is exactly [localXp] -- the number the engine
     * already applied -- so single player records what it always awarded and
     * nothing else moves. Everyone else is credited by [xpForLevel] on their
     * own level, since the XP curve depends on it.
     */
    private fun creditEveryone(s: GameState, localXp: Int, xpForLevel: (Int) -> Int): Map<String, Int> {
        val credited = s.participants.values.filter { it.isHuman }.associate { p ->
            p.unitId to if (p.unitId == s.localUnitId) localXp else xpForLevel(p.level)
        }
        return s.runXpAwards + credited.mapValues { (id, xp) -> (s.runXpAwards[id] ?: 0) + xp }
    }

    /** An XP award applied to this client's player, as a guest receives one. */
    internal fun awardXp(s: GameState, xp: Int): GameState = withPostRunProgress(s, xp)

    /** Recomputes level, talent points and mana pool after an XP award. */
    private fun withPostRunProgress(s: GameState, xpGained: Int): GameState {
        val newXp = s.xp + xpGained
        val level = progression.levelFromTotalXp(newXp)
        val maxMana = stats.maxMana(s.playerClass, level, s.talents)
        val learned = s.playerClass?.let { data.grantsFor(it, level) }.orEmpty() - s.unlockedSpells.toSet()
        return s.withMe {
            var bar = it.activeActionBars
            for (spell in learned) {
                val free = bar.indexOf("")
                if (free >= 0) bar = bar.toMutableList().also { b -> b[free] = spell }
            }
            it.copy(
                level = level,
                maxMana = maxMana,
                mana = min(maxMana.toDouble(), it.mana),
                unlockedSpells = it.unlockedSpells + learned,
                activeActionBars = bar,
            )
        }.copy(
            xp = newXp,
            talentPoints = progression.talentPoints(level, s.talents),
        )
    }

    /**
     * The party: one tank, three DPS, one healer, with the player in whichever
     * role their class plays and the AI filling the other four.
     *
     * The player is always [PLAYER_UNIT_ID]. Ids are positional and load-bearing
     * across the engine, the UI and the save, so the roles move between slots
     * and the slots themselves never do.
     *
     * The rng draw order is deliberately unchanged from the healer-only version
     * -- pick a tank, shuffle three DPS, then one level roll per AI slot in
     * order. Adding or reordering a draw here would desynchronise every
     * recorded parity scenario.
     */
    fun generateParty(cls: PlayerClass, playerLevel: Int, rng: Rng): List<Unit> {
        fun allyLevel() = max(1, playerLevel + (rng.nextDouble() * 3).toInt() - 1)

        val playerRole = runCatching { UnitRole.valueOf(data.bundle(cls).meta.role) }
            .getOrDefault(UnitRole.HEALER)

        val tankTpl = rng.pick(data.npcPools.tankPool)
        val dpsTpls = rng.shuffled(data.npcPools.dpsPool).take(3)

        // The four AI roles are the full group minus whatever the player is.
        // partyRoles is the shared definition -- the queue lobby draws the same
        // list, so what it shows you forming is what the engine actually builds.
        val aiRoles = partyRoles(playerRole).dropLast(1)

        var dpsUsed = 0
        val party = aiRoles.mapIndexed { i, role ->
            val id = "${i + 1}"
            val lv = allyLevel()
            when (role) {
                UnitRole.TANK -> stats.maxHealthForRole("TANK", lv).toDouble().let {
                    Unit(id, tankTpl.name, role, lv, it, it)
                }
                UnitRole.DPS -> stats.maxHealthForRole("DPS", lv).toDouble().let {
                    Unit(id, dpsTpls[dpsUsed++].name, role, lv, it, it)
                }
                // Named off the pool by level rather than a draw, so no new
                // randomness enters the stream.
                UnitRole.HEALER -> stats.healerMaxHealth(lv).toDouble().let {
                    val pool = data.npcPools.healerPool
                    val name = if (pool.isEmpty()) "Field Medic" else pool[lv % pool.size].name
                    Unit(id, name, role, lv, it, it)
                }
            }
        }

        val selfLevel = max(1, playerLevel)
        val selfHp = stats.playerMaxHealth(playerRole, selfLevel).toDouble()
        return party + Unit(PLAYER_UNIT_ID, "Player (You)", playerRole, selfLevel, selfHp, selfHp)
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
        val rewards = progression.levelUpRewards(ctx.cls, s.talents, s.level, advanced.level)
        return advanced.endedRun().copy(
            party = ctx.cls?.let { generateParty(it, advanced.level, rng) } ?: party,
            runXpAwards = creditEveryone(s, xpGained) { level ->
                (progression.dungeonFailureXpGain(dungeon, level, pullsCleared) * paceXp).roundToInt()
            },
            dungeonOutcome = DungeonOutcome(
                kind = if (allDead) DungeonOutcomeKind.PARTY_WIPE else DungeonOutcomeKind.HEALER_DOWN,
                dungeonId = dungeon.id,
                xpGained = xpGained,
                stats = stats0,
                leveledUp = advanced.level > s.level,
                upgradedSpellIds = rewards.upgradedSpellIds,
                upgradedPotion = rewards.upgradedPotion,
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
        healEffectiveThisTick: Double,
        aiHealerHealingThisTick: Double,
        damageTaken: Map<String, Double> = emptyMap(),
    ): GameState {
        val pd = data.balance.partyDps
        val partyDps = pd.base + s.level.toDouble().pow(pd.levelExponent) * pd.levelMultiplier
        val deadDps = sys.party.count { it.role == UnitRole.DPS && it.health <= 0 }
        // Losing DPS only slows the boss, not trash.
        val bossDpsMult = if (s.combatPhase == CombatPhase.BOSS) 0.7.pow(deadDps) else 1.0
        // The scripted formula is not replaced, it is reinterpreted: it was
        // always "what the party does to the enemy", and now it is "what the
        // *AI* part of the party does", with the player making up the rest.
        //
        // The association here is load-bearing. aiShare is exactly 1.0 while the
        // player heals, and pendingEnemyDamage is exactly 0.0 while no spell has
        // school = DAMAGE, so this reduces to `x * 1.0 + 0.0` -- an exact
        // IEEE-754 identity, not an approximation within some epsilon. That is
        // what lets parity/golden.json still be compared byte-for-byte now that
        // player damage exists. Do not "simplify" this into a form that
        // reorders the multiply.
        val aiShare = aiDamageShare(s)
        val scriptedDamage = partyDps * bossDpsMult * dpsPaceMultiplier * s.runDpsJitter * aiShare
        val enemyDots = s.enemyDebuffs.sumOf { it.damagePerTick }
        val playerDamage = s.pendingEnemyDamage + enemyDots
        // DoT ticks are worth their damage in threat; direct casts carry
        // whatever their spell declared.
        // Per caster, so a DPS pulls off the tank on their own threat and not
        // on the party's. Enemy DoT ticks go to the local participant:
        // UnitDebuff records the ability that applied it but not who cast it,
        // which is the next thing a second damage-dealing human will need.
        val threatByActor = s.participants.mapValues { (id, p) ->
            p.pendingPlayerThreat + if (id == s.localUnitId) enemyDots else 0.0
        }
        val pressure = data.encounters.pressure
        // Exposed, everything hits harder. Off, this is `x * 1.0`: exact.
        val exposed = if (s.exposedTicks > 0) pressure.exposedDamageMultiplier else 1.0
        var enemyHealth = s.enemyHealth - (scriptedDamage + playerDamage) * exposed
        val exposeNow = s.combatPhase == CombatPhase.BOSS && pressure.exposedBelowHealth > 0 && !s.exposedAtHalf &&
            enemyHealth > 0 && enemyHealth <= s.enemyMaxHealth * pressure.exposedBelowHealth

        val base = s.withEachParticipant {
            // Drained every tick: what each participant dealt has now landed.
            it.copy(pendingEnemyDamage = 0.0, pendingPlayerThreat = 0.0)
        }.withMe {
            it.copy(
                mana = sys.mana,
                playerCombatBuffs = sys.playerCombatBuffs,
                internalCooldowns = sys.internalCooldowns,
                capstoneForm = sys.capstoneForm,
                holyPower = sys.holyPower,
            )
        }.let { classTick(it.copy(party = sys.party), damageTaken) }.copy(
            party = accrueThreat(
                sys.party,
                healEffective = healEffectiveThisTick,
                scriptedPartyDamage = scriptedDamage,
                threatByActor = threatByActor,
                aiHealerHealing = aiHealerHealingThisTick,
                localUnitId = s.localUnitId,
            ),
            enemyDebuffs = s.enemyDebuffs
                .map { it.copy(remainingTicks = it.remainingTicks - 1) }
                .filter { it.remainingTicks > 0 },
            mechanicCooldown = boss.mechanicCooldown,
            mechanicOrdinal = boss.mechanicOrdinal,
            bossSelfBuffs = if (s.combatPhase == CombatPhase.BOSS) bossBuffsNext else emptyList(),
            // This client's own damage: its casts and its DoTs (see threatByActor).
            runDamageDealt = s.runDamageDealt + s.me.pendingEnemyDamage + enemyDots,
            exposedTicks = if (exposeNow) pressure.exposedTicks else max(0, s.exposedTicks - 1),
            exposedAtHalf = s.exposedAtHalf || exposeNow,
        )

        if (enemyHealth > 0) return finalizeProgress(base.copy(enemyHealth = enemyHealth))

        val dungeon = s.currentDungeon
        if (s.combatPhase == CombatPhase.TRASH) {
            val remaining = s.trashPullsRemaining - 1
            if (remaining > 0) {
                val hp = dungeon?.let { max(1.0, progression.trashMaxHealth(it)) } ?: 1.0
                return finalizeProgress(
                    base.copy(trashPullsRemaining = remaining, enemyHealth = hp, enemyMaxHealth = hp, restTicks = pressure.restTicks),
                )
            }
            // Trash cleared: the boss engages and the mechanic rotation resets.
            val bossHp = max(1.0, dungeon?.bossHealth ?: 1000.0)
            val profile = dungeon?.let { combatProfile(it) }
            return finalizeProgress(
                base.copy(
                    trashPullsRemaining = 0,
                    combatPhase = CombatPhase.BOSS,
                    restTicks = pressure.restTicks,
                    bossTicks = 0,
                    enemyHealth = bossHp,
                    enemyMaxHealth = bossHp,
                    enemyCast = null,
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
        // Pulling early pays; with nothing banked this is `* 1.0`, exact.
        val xpGained = (progression.dungeonXpGain(dungeon, s.level) * paceXp * (1 + s.earlyPullBonus)).roundToInt()
        val stats0 = runStats(s)
        // On a clear the web app keeps the mana it had entering this tick, so the
        // final tick's regen is deliberately discarded.
        val advanced = withPostRunProgress(base.withMe { it.copy(mana = s.mana) }, xpGained)
        val rewards = progression.levelUpRewards(ctx.cls, s.talents, s.level, advanced.level)

        return advanced.endedRun().copy(
            dungeonProgress = 100.0,
            completedDungeonIds =
                if (!dungeon.endless && dungeon.id !in s.completedDungeonIds) s.completedDungeonIds + dungeon.id
                else s.completedDungeonIds,
            party = ctx.cls?.let { generateParty(it, advanced.level, rng) } ?: sys.party,
            runXpAwards = creditEveryone(s, xpGained) { level ->
                (progression.dungeonXpGain(dungeon, level) * paceXp).roundToInt()
            },
            dungeonOutcome = DungeonOutcome(
                kind = DungeonOutcomeKind.SUCCESS,
                dungeonId = dungeon.id,
                xpGained = xpGained,
                stats = stats0,
                leveledUp = advanced.level > s.level,
                upgradedSpellIds = rewards.upgradedSpellIds,
                upgradedPotion = rewards.upgradedPotion,
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

        val credited = creditEveryone(s, waveXp) { level ->
            (progression.dungeonXpGain(source, level) * data.balance.endless.bossKillXpFraction * paceXp).roundToInt()
        }

        return finalizeProgress(
            advanced.copy(
                party = party,
                runXpAwards = credited,
                currentDungeon = next,
                endlessStacks = stacks,
                combatPhase = CombatPhase.TRASH,
                trashPullsRemaining = TRASH_PACK_COUNT,
                enemyHealth = trashHp,
                enemyMaxHealth = trashHp,
                dungeonProgress = 0.0,
                bossSelfBuffs = emptyList(),
                enemyCast = null,
                mechanicCooldown = rng.nextInt(
                    profile.mechanicIntervalTicksMin ?: defaultMechanicMin,
                    profile.mechanicIntervalTicksMax ?: defaultMechanicMax,
                ),
                mechanicOrdinal = 0,
                isCombatActive = true,
            ).withMe { it.copy(mana = min(it.maxMana.toDouble(), sys.mana)) },
        )
    }

    /** The boss's hits, read off the party it changed, plus the environment's. */
    private fun damageTakenThisTick(
        before: List<Unit>,
        afterBoss: List<Unit>,
        env: Map<String, Double>,
    ): Map<String, Double> {
        val out = HashMap(env)
        for (a in afterBoss) {
            val b = before.firstOrNull { it.id == a.id } ?: continue
            val hit = (b.health + b.shield) - (a.health + a.shield)
            if (hit > 0) out[a.id] = (out[a.id] ?: 0.0) + hit
        }
        return out
    }

    /**
     * The debuffs that reach past their carrier: a curse that jumps to the
     * next ally, and a mind-controlled ally hitting the most hurt one. Runs on
     * the timers the tick loop has just advanced; no rng.
     */
    private fun spreadDebuffs(party: List<Unit>): List<Unit> {
        if (data.encounters.mechanics.isEmpty()) return party
        var out = party
        for (u in party) {
            if (u.health <= 0) continue
            for (d in u.debuffs) {
                val m = data.encounters.mechanics[d.sourceAbilityId] ?: continue
                val full = m.durationTicks ?: continue
                val elapsed = full - d.remainingTicks
                if (m.everyTicks <= 0 || elapsed <= 0 || elapsed % m.everyTicks != 0) continue
                when (m.kind) {
                    DebuffMechanic.CURSE_CHAIN -> {
                        val next = out.firstOrNull { it.isAlive && it.debuffs.none { x -> x.sourceAbilityId == d.sourceAbilityId } }
                            ?: continue
                        val copy = d.copy(id = "${d.id}>${next.id}", remainingTicks = full)
                        out = out.map { if (it.id == next.id) it.copy(debuffs = it.debuffs + copy) else it }
                    }
                    DebuffMechanic.MIND_CONTROL -> {
                        val victim = out.filter { it.isAlive && it.id != u.id }
                            .minByOrNull { it.health / it.maxHealth } ?: continue
                        out = out.map {
                            if (it.id != victim.id) it
                            else it.copy(health = max(0.0, it.health - m.hitDamage))
                        }
                    }
                }
            }
        }
        return out
    }

    /** Boss damage grows once the boss has lasted past its enrage timer. */
    internal fun enrageMultiplier(s: GameState): Double {
        val p = data.encounters.pressure
        val after = s.currentDungeon?.let { data.encounters.bosses[it.id]?.enrageAfterTicks } ?: p.enrageAfterTicks
        if (after <= 0 || s.bossTicks <= after) return 1.0
        return 1 + (s.bossTicks - after) * p.enrageRampPerTick
    }

    /**
     * A breather between pulls: nothing attacks, nobody deals damage, and the
     * party drinks. Cooldowns still run (Engine.tickCooldowns).
     */
    private fun rest(s: GameState): GameState {
        val p = data.encounters.pressure
        return s.copy(
            restTicks = s.restTicks - 1,
            combatElapsedTicks = s.combatElapsedTicks + 1,
            floatingCombatTexts = s.floatingCombatTexts.filter { it.expiresAtCombatTick > s.combatElapsedTicks + 1 },
            party = s.party.map {
                if (!it.isAlive) it else it.copy(health = min(it.maxHealth, it.health + it.maxHealth * p.restHealthPerTick))
            },
        ).withEachParticipant {
            it.copy(mana = min(it.maxMana.toDouble(), it.mana + it.maxMana * p.restManaPerTick))
        }
    }

    /**
     * The AI healer's dispel, when no human is healing: the first ally with
     * something safe to take, on a cooldown. It waits out a bomb. No rng.
     */
    internal fun aiDispel(s: GameState, party: List<Unit>): Pair<List<Unit>, Int> {
        val every = data.encounters.aiDispelEveryTicks
        val cooldown = max(0, s.aiDispelCooldown - 1)
        if (every <= 0 || cooldown > 0) return party to cooldown
        if (s.participants.values.any { it.isHuman && it.role == UnitRole.HEALER }) return party to cooldown
        if (party.none { it.role == UnitRole.HEALER && it.isAlive }) return party to cooldown
        val target = party.firstOrNull { it.isAlive && it.debuffs.toDispel(safeOnly = true) != null }
            ?: return party to cooldown
        val gone = target.debuffs.toDispel(safeOnly = true)!!
        return party.map { if (it.id == target.id) it.copy(debuffs = it.debuffs - gone) else it } to every
    }

    // --- the tick ------------------------------------------------------------

    fun advance(state: GameState, rng: Rng, dpsMultiplierOverride: Double? = null): GameState {
        if (!state.isCombatActive) return state
        if (state.restTicks > 0) return rest(state)

        // Threat is resolved first, off the table as it stood when last tick
        // committed. Reading committed state rather than this tick's accrual is
        // what makes the answer independent of evaluation order -- and what
        // would let two machines that agree on tick N agree on tick N+1 without
        // negotiating, if co-op ever happens.
        val s = aiTankTaunt(
            state.copy(
                combatElapsedTicks = state.combatElapsedTicks + 1,
                bossTicks = if (state.combatPhase == CombatPhase.BOSS) state.bossTicks + 1 else state.bossTicks,
                floatingCombatTexts = state.floatingCombatTexts
                    .filter { it.expiresAtCombatTick > state.combatElapsedTicks + 1 },
                enemyTargetId = resolveEnemyTarget(state),
                tauntLockTicks = max(0, state.tauntLockTicks - 1),
            ),
        )
        val ctx = CastContext(s, data, stats, rng)

        val dpsPace = dpsMultiplierOverride
            ?: s.dungeonPace?.let { progression.pace(it).dpsMultiplier }
            ?: 1.0

        val boss = processBossAi(ctx, rng)
        val castStarted = boss.enemyCast != null && s.enemyCast == null
        val withBoss = aiKick(
            s.copy(
                bossSelfBuffs = boss.bossSelfBuffs,
                mechanicCooldown = boss.mechanicCooldown,
                mechanicOrdinal = boss.mechanicOrdinal,
                enemyCast = boss.enemyCast,
                interruptibleCasts = s.interruptibleCasts + if (castStarted && boss.enemyCast?.interruptible == true) 1 else 0,
            ),
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

        // Before the failure check, so a heal that lands this tick actually
        // saves the unit rather than being applied to a corpse.
        val ai = aiHealerTick(acc, sys.party)
        val (partyAfterAi, dispelCooldown) = aiDispel(acc, ai.party)
        acc = acc.copy(aiHealerMana = ai.manaLeft, aiDispelCooldown = dispelCooldown)

        resolveFailure(ctx, acc, partyAfterAi, rng)?.let { return it }

        // Presentation: record what healing landed this tick so the UI can float it.
        val floats = (s.floatingCombatTexts + floatsFrom(
            before = s.party,
            after = partyAfterAi,
            crit = false,
            combatTick = s.combatElapsedTicks,
            startId = s.combatElapsedTicks.toLong() * 100,
        )).filter { it.expiresAtCombatTick > s.combatElapsedTicks }

        return resolveOngoingCombat(
            ctx, acc, sys.copy(party = partyAfterAi), boss, bossBuffsNext, dpsPace, rng,
            // The AI healer's output is kept separate rather than excluded: it
            // is threat, but it belongs to the AI healer's slot, not the
            // player's.
            healEffectiveThisTick = env.healEffective + sys.healEffective,
            aiHealerHealingThisTick = ai.healed,
            damageTaken = damageTakenThisTick(s.party, boss.party, env.damageTaken),
        )
            .let { if (it.isCombatActive) it.copy(floatingCombatTexts = floats) else it }
    }
}
