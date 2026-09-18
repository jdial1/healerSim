package com.jdial.aegis.sim

import com.jdial.aegis.data.SpellSchool
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
    data class StartDungeon(
        val dungeon: Dungeon,
        val pace: String,
        val hard: Boolean = false,
        /** The keystone level to run it at; ignored unless [hard]. */
        val keystone: Int = 0,
        /** The consumable carried in, if any. The caller owns checking the stash. */
        val carry: String? = null,
    ) : Action
    data class CastSpell(
        val spellId: String,
        val targetId: String?,
        val critRoll: Double,
        override val actorId: String = PLAYER_UNIT_ID,
    ) : Action
    data class UnlockTalent(val talentId: String) : Action

    /** Wear a charm, or nothing. Out of combat only: it rewrites the rotation. */
    data class EquipCharm(val charmId: String?) : Action
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

    /** Ends a rest early, for the XP it is worth (Pressure.earlyPullXpPerTick). */
    data object PullNow : Action
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
        // A heal with nobody named lands on the caster. A tank or a damage
        // dealer cannot select party frames -- that is the healer's job and the
        // frames say so -- so without this their own self-heals would be
        // uncastable, and every class outside the healer seat would be stuck
        // with no answer to its own health bar.
        val spell = data.spell(action.spellId)
        val target = action.targetId
            ?: if (spell != null && spell.school == SpellSchool.HEAL) action.actorId else null
        val out = casts.tryCast(
            CastContext(acting, data, stats, rng),
            action.spellId,
            target,
            critRoll,
        )
        return out.actingAs(seat)
    }

    /** A fresh character of [cls] at level 1. */
    fun newCharacter(cls: PlayerClass, rng: Rng): GameState {
        val talents = data.bundle(cls).talents.map { TalentRank(it, 0) }
        val loadout = progression.buildSpellLoadout(cls, talents, 1)
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
        is Action.StartDungeon ->
            startDungeon(state, action.dungeon, action.pace, action.hard, action.keystone, rng, action.carry)
        is Action.CastSpell -> absorbHealing(state, castAs(state, action, rng))
        is Action.Taunt -> taunt(state, action.actorId, action.ticks)
        is Action.UnlockTalent -> unlockTalent(state, action.talentId)
        is Action.EquipCharm -> equipCharm(state, action.charmId)
        is Action.DecrementTalent -> decrementTalent(state, action.talentId)
        Action.RespecTalents -> respec(state)
        is Action.ReorderActionBar -> reorderActionBar(state, action.from, action.to)
        is Action.SetActionBarSlot -> setActionBarSlot(state, action.index, action.spellId)
        // Leaving pays nothing, but it still has to hand back the real level: a
        // clear and a wipe both do that through the XP award, and walking out
        // is the one exit that skips it.
        Action.AbandonDungeon -> tick.awardXp(state.clearedCombat().copy(isCombatActive = false), 0)
        Action.PullNow -> if (state.restTicks <= 0) state else tick.rushNextPull(state).copy(
            restTicks = 0,
            earlyPullBonus = state.earlyPullBonus + state.restTicks * data.encounters.pressure.earlyPullXpPerTick,
        )
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
            s = if (s.isTutorialPaused) tickCooldowns(s) else tickCooldowns(absorbHealing(s, tick.advance(s, rng)))
            if (!s.isCombatActive) return s
        }
        return s
    }

    /**
     * Heal absorb: whatever health a carrier gained since [before] is eaten
     * first. One place, after every step, rather than in each heal path.
     */
    private fun absorbHealing(before: GameState, after: GameState): GameState {
        if (after.party.none { u -> u.debuffs.any { it.absorbLeft > 0 } }) return after
        val was = before.party.associateBy { it.id }
        return after.copy(
            party = after.party.map { u ->
                val d = u.debuffs.firstOrNull { it.absorbLeft > 0 } ?: return@map u
                val gain = u.health - (was[u.id]?.health ?: u.health)
                if (gain <= 0) return@map u
                val eaten = min(gain, d.absorbLeft)
                val left = d.absorbLeft - eaten
                u.copy(
                    health = u.health - eaten,
                    debuffs = if (left <= 0) u.debuffs - d else u.debuffs.map { if (it == d) it.copy(absorbLeft = left) else it },
                )
            },
        )
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
        // Capped: nobody needs to know it has been a thousand ticks rather
        // than a hundred, and an unbounded counter is a field that never stops
        // changing in every snapshot.
        val idle = minOf(p.idleTicks + 1, 1_000)
        p.copy(
            globalCooldownRemaining = gcd,
            idleTicks = idle,
            spellCooldowns = if (p.spellCooldowns.isEmpty()) p.spellCooldowns else p.spellCooldowns
                .mapValues { (_, v) -> v - 1 }
                .filterValues { it > 0 },
        )
    }

    private fun startDungeon(
        state: GameState,
        dungeon: Dungeon,
        pace: String,
        hard: Boolean,
        keystone: Int,
        rng: Rng,
        carry: String? = null,
    ): GameState {
        val cls = state.playerClass ?: return state
        if (dungeon.endless && state.level < dungeon.levelMin) return state

        // One roll per run, so a dungeon does not clear in exactly the same time
        // twice. Rolled here (not per tick) to keep pacing steady within a run.
        val jitter = data.balance.partyDps.runJitter
        val runDpsJitter = 1 - jitter + rng.nextDouble() * (jitter * 2)

        // Level sync. More than one over the range and the run is played at
        // one over, so a level-25 tank and a level-1 healer can take the
        // Deadmines together and both be in the same fight. Endless has no
        // range to sync to. Everything below reads the synced level; XP reads
        // Participant.trueLevel and pays the real one.
        val synced = if (dungeon.endless) state.level else syncedLevel(state.level, dungeon.levelMax)
        val trashHp = max(1.0, progression.trashMaxHealth(dungeon) * tick.hardScale(dungeon, synced, hard, if (hard) keystone else 0))
        return state.clearedCombat().withEachParticipant {
            val lvl = if (dungeon.endless) it.level else syncedLevel(it.level, dungeon.levelMax)
            val mana = if (lvl == it.level) it.maxMana else stats.maxMana(it.playerClass, lvl, it.talents)
            it.copy(
                level = lvl,
                syncedFrom = if (lvl < it.level) it.level else 0,
                maxMana = mana,
                mana = mana.toDouble(),
                // Re-derived per run: a save written before roles existed decodes
                // with the HEALER default, and this corrects it on the next pull.
                role = it.playerClass?.let(::roleOf) ?: it.role,
                classResource = hooksFor(it.playerClass).startingResource(data.balance.classes),
            )
        }.copy(
            runDpsJitter = runDpsJitter,
            currentDungeon = dungeon,
            dungeonPace = pace,
            hardMode = hard,
            keystone = if (hard) keystone else 0,
            combatPhase = CombatPhase.TRASH,
            trashPullsRemaining = TRASH_PACK_COUNT,
            enemyHealth = trashHp,
            enemyMaxHealth = trashHp,
            adds = tick.pullAdds(dungeon.id, 0, trashHp, "p0"),
            mechanicCooldown = tick.firstMechanicIn(dungeon.id, 0),
            isCombatActive = true,
            party = tick.generateParty(cls, synced, rng),
            dungeonOutcome = null,
            // The AI healer starts a run full, like the player does. Zero while
            // the player is the healer, where there is no AI one.
            aiHealerMana = if (roleOf(cls) == UnitRole.HEALER) 0.0 else {
                data.balance.roles.aiHealerMaxMana(synced)
            },
            aiHealerManaMax = if (roleOf(cls) == UnitRole.HEALER) 0.0 else {
                data.balance.roles.aiHealerMaxMana(synced)
            },
        ).withMe { me ->
            // The consumable joins the bar for this run only, beside the potion,
            // and nothing carried over from the last run's stash survives.
            val item = carry?.takeIf { data.spell(it)?.isStashItem() == true }
            // Where the player put it on the profile is where it stays; anything
            // else consumable on the bar is not being carried, and goes.
            val bar = me.activeActionBars.map { id ->
                if (data.spell(id)?.isStashItem() == true && id != item) "" else id
            }
            me.copy(
                carried = item,
                carriedUsed = false,
                unlockedSpells = me.unlockedSpells.filterNot { data.spell(it)?.isStashItem() == true } +
                    listOfNotNull(item),
                activeActionBars = if (item == null || item in bar) bar else insertAfterPotion(bar, item),
            )
        }
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
        val loadout = progression.buildSpellLoadout(s.playerClass, s.talents, s.level)
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

    /** [item] in the first empty slot after the potion, else on the end. */
    private fun insertAfterPotion(bar: List<String>, item: String): List<String> {
        val potion = bar.indexOf(MANA_POTION_ID)
        val empty = bar.withIndex().firstOrNull { (i, id) -> id.isEmpty() && i > potion }?.index
        return when {
            empty != null -> bar.toMutableList().also { it[empty] = item }
            else -> bar + item
        }
    }

    /**
     * Wear [charmId], or take the charm off with null.
     *
     * Refused in combat: a charm changes cooldowns and costs, and swapping one
     * mid-fight would be a free reset of everything on cooldown. It has to be
     * a charm this class can use, so a save carrying another class's charm
     * cannot hand it over either.
     */
    private fun equipCharm(state: GameState, charmId: String?): GameState {
        if (state.isCombatActive) return state
        if (charmId == null) return state.withMe { it.copy(charm = null) }
        val charm = data.charms[charmId] ?: return state
        if (charm.cls != state.playerClass?.name) return state
        return state.withMe { it.copy(charm = charm) }
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
        // A swap, not a shift: dropping onto an occupied slot trades the two,
        // so moving one button never slides every button after it along.
        bar[from] = bar[to].also { bar[to] = bar[from] }
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
        val item = data.spell(spellId)?.isStashItem() == true
        if (spellId.isNotBlank()) {
            // A consumable is not "unlocked" the way a spell is; whether it is
            // held is the stash's to say, and the view model only offers what
            // is. Everything else must be learned.
            if (!item && spellId !in state.unlockedSpells) return state
            if (state.activeActionBars.any { it == spellId }) return state
        }
        val bar = state.activeActionBars.toMutableList()
        // One consumable on the bar at a time: carrying is one decision, so
        // putting a second one down takes the first off.
        if (item) bar.replaceAll { if (data.spell(it)?.isStashItem() == true) "" else it }
        bar[index] = spellId
        return state.withMe { it.copy(activeActionBars = bar) }
    }
}
