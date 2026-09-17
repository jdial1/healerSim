package com.jdial.aegis.sim

import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import kotlin.math.max
import kotlin.math.min

/**
 * Port of `src/gameEngineReducer.js`: the actions that drive the simulation.
 *
 * Pure with respect to the injected [Rng], exactly like the web app's reducer,
 * which is what lets the parity harness replay both engines against the same
 * seeded stream.
 */
sealed interface Action {
    /**
     * Who this action came from — a party unit id, defaulting to the local
     * player ([PLAYER_UNIT_ID]).
     *
     * Nothing reads it yet and single-player never needs it. It exists now
     * because retrofitting an identity field onto a sealed hierarchy after
     * other players can send actions is a rewrite, whereas defaulting it today
     * costs one line and no behaviour: every existing construction site keeps
     * compiling, and the reducer keeps ignoring it.
     */
    val actorId: String get() = PLAYER_UNIT_ID

    data class Tick(val ticks: Int = 1) : Action
    data class StartDungeon(val dungeon: Dungeon, val pace: String) : Action
    data class CastSpell(
        val spellId: String,
        val targetId: String?,
        val critRoll: Double,
        override val actorId: String = PLAYER_UNIT_ID,
    ) : Action
    data class UnlockTalent(val talentId: String) : Action
    data class DecrementTalent(val talentId: String) : Action
    data object RespecTalents : Action
    data class ReorderActionBar(val from: Int, val to: Int) : Action

    /**
     * Puts [spellId] in an action bar slot, or clears it when blank.
     *
     * Reordering could only ever shuffle what was already there; this is what
     * lets a player choose which of their unlocked spells they carry at all.
     */
    data class SetActionBarSlot(val index: Int, val spellId: String) : Action
    data object AbandonDungeon : Action
    data object DismissDungeonOutcome : Action
    data class SetTutorialPaused(val paused: Boolean) : Action

    /**
     * Puts [actorId] at the top of the threat table and pins the enemy there
     * for [ticks].
     *
     * No spell grants this yet -- the action exists so the threat model is
     * complete and testable before a tank class needs it. It is also the first
     * action whose actorId is load-bearing rather than decorative: taunting is
     * inherently "this unit, not the local player".
     */
    data class Taunt(val ticks: Int, override val actorId: String = PLAYER_UNIT_ID) : Action
}

class Engine(val data: GameData) {
    val stats = PlayerStats(data)
    val progression = Progression(data, stats)
    private val tick = GameTick(data, stats, progression)
    private val casts = CastPipeline(data, stats)

    /**
     * What a class plays as. Read from its ClassMeta rather than stored on the
     * character, so it cannot drift from the content and needs no migration.
     */
    fun roleOf(cls: PlayerClass): UnitRole =
        runCatching { UnitRole.valueOf(data.bundle(cls).meta.role) }.getOrDefault(UnitRole.HEALER)

    /**
     * Resolves a cast as [Action.CastSpell.actorId] rather than as "the player".
     *
     * The whole pipeline -- and the class hooks under it -- reads the caster
     * through GameState's participant accessors, so pointing the state at the
     * actor for the duration is enough to make every one of those sites address
     * the right person. The seat is always handed back, including when the cast
     * is rejected and tryCast returns the state unchanged.
     *
     * A cast from a participant who is not in the run is dropped rather than
     * silently creating one: that is the shape a malformed relayed action takes.
     *
     * **The crit roll of a remote actor is thrown away and redrawn here.** It
     * arrives as action data because the web app rolled it client-side, and
     * `validate` only ever compares it against the caster's crit chance -- so a
     * guest sending `critRoll = 0.0` would crit every single cast, forever, and
     * nothing downstream would find that odd. Whoever is running the simulation
     * draws it from their own stream instead.
     *
     * This does not stop the *host* cheating, including on other people's
     * rewards. That is the accepted trade of a host-authoritative v1 and is
     * recorded in the multiplayer plan; it is not something this can fix.
     *
     * Single player never takes the reroll branch -- there is one participant
     * and it is the local one -- so no draw is added to the stream the parity
     * corpus recorded.
     */
    private fun castAs(state: GameState, action: Action.CastSpell, rng: Rng): GameState {
        if (action.actorId !in state.participants) return state
        val seat = state.localUnitId
        val acting = state.actingAs(action.actorId)
        val critRoll =
            if (action.actorId == state.localUnitId) action.critRoll else rng.nextDouble() * 100.0
        val out = casts.tryCast(
            CastContext(acting, data, stats, rng),
            action.spellId,
            action.targetId,
            critRoll,
        )
        return out.actingAs(seat)
    }

    /** A fresh character of [cls] at level 1. */
    fun newCharacter(cls: PlayerClass, rng: Rng): GameState {
        val talents = data.bundle(cls).talents.map { TalentRank(it, 0) }
        val loadout = progression.buildSpellLoadout(cls, talents)
        val maxMana = stats.maxMana(cls, 1, talents)
        return GameState(
            participants = mapOf(
                PLAYER_UNIT_ID to Participant(
                    unitId = PLAYER_UNIT_ID,
                    playerClass = cls,
                    level = 1,
                    talents = talents,
                    unlockedSpells = loadout.unlockedSpells,
                    activeActionBars = loadout.actionBar,
                    role = roleOf(cls),
                    maxMana = maxMana,
                    mana = maxMana.toDouble(),
                ),
            ),
            xp = 0,
            talentPoints = progression.talentPoints(1, talents),
            party = tick.generateParty(cls, 1, rng),
        )
    }

    /**
     * Applies XP a host awarded to this client's player: level, talent points
     * and mana pool, exactly as the engine does for its own player.
     */
    fun awardXp(state: GameState, xp: Int): GameState = tick.awardXp(state, xp)

    fun reduce(state: GameState, action: Action, rng: Rng): GameState = when (action) {
        is Action.Tick -> applyTicks(state, action.ticks, rng)
        is Action.StartDungeon -> startDungeon(state, action.dungeon, action.pace, rng)
        is Action.CastSpell -> castAs(state, action, rng)
        is Action.Taunt -> taunt(state, action.actorId, action.ticks)
        is Action.UnlockTalent -> unlockTalent(state, action.talentId)
        is Action.DecrementTalent -> decrementTalent(state, action.talentId)
        Action.RespecTalents -> respec(state)
        is Action.ReorderActionBar -> reorderActionBar(state, action.from, action.to)
        is Action.SetActionBarSlot -> setActionBarSlot(state, action.index, action.spellId)
        Action.AbandonDungeon -> state.clearedCombat().copy(isCombatActive = false)
        Action.DismissDungeonOutcome -> state.copy(dungeonOutcome = null)
        is Action.SetTutorialPaused -> state.copy(isTutorialPaused = action.paused)
    }

    /**
     * Advances [ticks] simulation steps. While the tutorial is paused only
     * cooldowns advance, and the loop stops early once combat ends.
     */
    private fun applyTicks(state: GameState, ticks: Int, rng: Rng): GameState {
        var s = state
        repeat(ticks) {
            s = if (s.isTutorialPaused) tickCooldowns(s) else tickCooldowns(tick.advance(s, rng))
            if (!s.isCombatActive) return s
        }
        return s
    }

    /**
     * Cooldowns decrement every tick; entries reaching zero are dropped.
     *
     * Every participant's, not just this client's. A remote player whose
     * cooldowns only advanced on their own device would be able to cast
     * whenever their machine said so.
     */
    private fun tickCooldowns(s: GameState): GameState = s.withEachParticipant { p ->
        val gcd = if (p.globalCooldownRemaining > 0) p.globalCooldownRemaining - 1 else 0
        if (p.spellCooldowns.isEmpty()) {
            if (gcd == p.globalCooldownRemaining) p else p.copy(globalCooldownRemaining = gcd)
        } else {
            p.copy(
                globalCooldownRemaining = gcd,
                spellCooldowns = p.spellCooldowns
                    .mapValues { (_, v) -> v - 1 }
                    .filterValues { it > 0 },
            )
        }
    }

    private fun startDungeon(state: GameState, dungeon: Dungeon, pace: String, rng: Rng): GameState {
        val cls = state.playerClass ?: return state
        if (dungeon.endless && state.level < dungeon.levelMin) return state

        // One roll per run, so a dungeon does not clear in exactly the same time
        // twice. Rolled here (not per tick) to keep pacing steady within a run.
        val jitter = data.balance.partyDps.runJitter
        val runDpsJitter = 1 - jitter + rng.nextDouble() * (jitter * 2)

        val trashHp = max(1.0, progression.trashMaxHealth(dungeon))
        return state.clearedCombat().withEachParticipant {
            it.copy(
                mana = it.maxMana.toDouble(),
                // Re-derived per run: a save written before roles existed decodes
                // with the HEALER default, and this corrects it on the next pull.
                role = it.playerClass?.let(::roleOf) ?: it.role,
                classResource = hooksFor(it.playerClass).startingResource(data.balance.classes),
            )
        }.copy(
            runDpsJitter = runDpsJitter,
            currentDungeon = dungeon,
            dungeonPace = pace,
            combatPhase = CombatPhase.TRASH,
            trashPullsRemaining = TRASH_PACK_COUNT,
            enemyHealth = trashHp,
            enemyMaxHealth = trashHp,
            isCombatActive = true,
            party = tick.generateParty(cls, state.level, rng),
            dungeonOutcome = null,
            // The AI healer starts a run full, like the player does. Zero while
            // the player is the healer, where there is no AI one.
            aiHealerMana = if (roleOf(cls) == UnitRole.HEALER) 0.0 else {
                val r = data.balance.roles
                r.aiHealerMaxMana(state.level)
            },
        )
    }

    /**
     * Forces the enemy onto [actorId] for [ticks].
     *
     * Two parts, and both matter: the lock pins the target regardless of the
     * table, and the threat bump means the taunter is still on top when the
     * lock expires. Without the bump a taunt would hand the enemy straight back
     * the instant it ran out, which is the classic mistake.
     */
    private fun taunt(state: GameState, actorId: String, ticks: Int): GameState {
        val actor = state.party.firstOrNull { it.id == actorId && it.isAlive } ?: return state
        val top = state.party.filter { it.isAlive }.maxOfOrNull { it.threat } ?: 0.0
        val target = top * data.balance.threat.tauntOvertakeMultiplier
        return state.copy(
            party = state.party.map {
                if (it.id == actor.id) it.copy(threat = max(it.threat, target)) else it
            },
            enemyTargetId = actor.id,
            tauntedById = actor.id,
            tauntLockTicks = ticks,
        )
    }

    // --- talents -------------------------------------------------------------

    private fun refreshMeta(s: GameState): GameState {
        val loadout = progression.buildSpellLoadout(s.playerClass, s.talents)
        val maxMana = stats.maxMana(s.playerClass, s.level, s.talents)
        // Keep the player's chosen bar order when it still holds the same spells.
        val bar = if (s.activeActionBars.size == loadout.actionBar.size &&
            s.activeActionBars.sorted() == loadout.actionBar.sorted()
        ) s.activeActionBars else loadout.actionBar

        return s.withMe {
            it.copy(
                unlockedSpells = loadout.unlockedSpells,
                activeActionBars = bar,
                maxMana = maxMana,
                mana = min(it.mana, maxMana.toDouble()),
            )
        }.copy(talentPoints = progression.talentPoints(s.level, s.talents))
    }

    private fun unlockTalent(state: GameState, talentId: String): GameState {
        val row = state.talents.firstOrNull { it.id == talentId } ?: return state
        if (row.points >= row.talent.maxPoints) return state
        if (state.talentPoints < row.talent.cost) return state
        if (state.level < row.talent.levelReq) return state
        if (!stats.prereqsSatisfied(state.talents, row.talent)) return state

        // Investing in a talent zeroes any it is mutually exclusive with.
        val exclusive = row.talent.exclusiveWith.toSet()
        val talents = state.talents.map { t ->
            when {
                t.id == talentId -> t.copy(points = t.points + 1)
                t.id in exclusive -> t.copy(points = 0)
                else -> t
            }
        }
        return refreshMeta(state.withMe { it.copy(talents = talents) }).let { withCapstone(it, row.talent.mechanicId) }
    }

    private fun decrementTalent(state: GameState, talentId: String): GameState {
        val row = state.talents.firstOrNull { it.id == talentId } ?: return state
        if (row.points <= 0) return state
        // Refuse if another invested talent still depends on this one.
        val dependent = state.talents.any { it.points > 0 && talentId in it.talent.prerequisites }
        if (dependent) return state

        val talents = state.talents.map { if (it.id == talentId) it.copy(points = it.points - 1) else it }
        return refreshMeta(state.withMe { it.copy(talents = talents) }).let { withCapstone(it, row.talent.mechanicId) }
    }

    private fun respec(state: GameState): GameState {
        val talents = state.talents.map { it.copy(points = 0) }
        return refreshMeta(state.withMe { it.copy(talents = talents, capstoneForm = null) })
    }

    /** A capstone talent sets (or clears) the player's form. */
    private fun withCapstone(s: GameState, mechanicId: String?): GameState {
        val cls = s.playerClass ?: return s
        val prog = data.bundle(cls).meta.progression
        if (mechanicId != prog.capstoneMechanicId) return s
        val invested = s.talents.ranksOf(prog.capstoneMechanicId) > 0
        return s.withMe { it.copy(capstoneForm = if (invested) prog.capstoneForm else null) }
    }

    private fun reorderActionBar(state: GameState, from: Int, to: Int): GameState {
        // Deliberately inert mid-run, matching the web app.
        if (state.currentDungeon != null) return state
        val bar = state.activeActionBars.toMutableList()
        if (from !in bar.indices || to !in bar.indices) return state
        bar.add(to, bar.removeAt(from))
        return state.withMe { it.copy(activeActionBars = bar) }
    }

    /**
     * Assigns or clears one action bar slot.
     *
     * Rejects anything that would put the bar in a state the player could not
     * have reached legitimately: an unknown or still-locked spell, or the same
     * spell twice. A duplicate would be the more annoying bug -- two slots
     * sharing one cooldown, with no way to tell from looking.
     */
    private fun setActionBarSlot(state: GameState, index: Int, spellId: String): GameState {
        // Inert mid-run, like reordering: rebuilding your bar mid-pull is not a
        // decision this game asks you to make.
        if (state.currentDungeon != null) return state
        if (index !in state.activeActionBars.indices) return state
        if (spellId.isNotBlank()) {
            if (spellId !in state.unlockedSpells) return state
            if (state.activeActionBars.any { it == spellId }) return state
        }
        val bar = state.activeActionBars.toMutableList()
        bar[index] = spellId
        return state.withMe { it.copy(activeActionBars = bar) }
    }
}
