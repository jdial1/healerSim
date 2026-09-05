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
    data class Tick(val ticks: Int = 1) : Action
    data class StartDungeon(val dungeon: Dungeon, val pace: String) : Action
    data class CastSpell(val spellId: String, val targetId: String?, val critRoll: Double) : Action
    data class UnlockTalent(val talentId: String) : Action
    data class DecrementTalent(val talentId: String) : Action
    data object RespecTalents : Action
    data class ReorderActionBar(val from: Int, val to: Int) : Action
    data object AbandonDungeon : Action
    data object DismissDungeonOutcome : Action
    data class SetTutorialPaused(val paused: Boolean) : Action
}

class Engine(val data: GameData) {
    val stats = PlayerStats(data)
    val progression = Progression(data, stats)
    private val tick = GameTick(data, stats, progression)
    private val casts = CastPipeline(data, stats)

    /** A fresh character of [cls] at level 1. */
    fun newCharacter(cls: PlayerClass, rng: Rng): GameState {
        val talents = data.bundle(cls).talents.map { TalentRank(it, 0) }
        val loadout = progression.buildSpellLoadout(cls, talents)
        val maxMana = stats.maxMana(cls, 1, talents)
        return GameState(
            playerClass = cls,
            level = 1,
            xp = 0,
            talentPoints = progression.talentPoints(1, talents),
            talents = talents,
            unlockedSpells = loadout.unlockedSpells,
            activeActionBars = loadout.actionBar,
            maxMana = maxMana,
            mana = maxMana.toDouble(),
            party = tick.generateParty(cls, 1, rng),
        )
    }

    fun reduce(state: GameState, action: Action, rng: Rng): GameState = when (action) {
        is Action.Tick -> applyTicks(state, action.ticks, rng)
        is Action.StartDungeon -> startDungeon(state, action.dungeon, action.pace, rng)
        is Action.CastSpell -> casts.tryCast(
            CastContext(state, data, stats, rng),
            action.spellId,
            action.targetId,
            action.critRoll,
        )
        is Action.UnlockTalent -> unlockTalent(state, action.talentId)
        is Action.DecrementTalent -> decrementTalent(state, action.talentId)
        Action.RespecTalents -> respec(state)
        is Action.ReorderActionBar -> reorderActionBar(state, action.from, action.to)
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

    /** Cooldowns decrement every tick; entries reaching zero are dropped. */
    private fun tickCooldowns(s: GameState): GameState {
        if (s.spellCooldowns.isEmpty()) return s
        return s.copy(
            spellCooldowns = s.spellCooldowns
                .mapValues { (_, v) -> v - 1 }
                .filterValues { it > 0 },
        )
    }

    private fun startDungeon(state: GameState, dungeon: Dungeon, pace: String, rng: Rng): GameState {
        val cls = state.playerClass ?: return state
        if (dungeon.endless && state.level < dungeon.levelMin) return state

        val trashHp = max(1.0, progression.trashMaxHealth(dungeon))
        return state.clearedCombat().copy(
            currentDungeon = dungeon,
            dungeonPace = pace,
            combatPhase = CombatPhase.TRASH,
            trashPullsRemaining = TRASH_PACK_COUNT,
            enemyHealth = trashHp,
            enemyMaxHealth = trashHp,
            isCombatActive = true,
            party = tick.generateParty(cls, state.level, rng),
            mana = state.maxMana.toDouble(),
            dungeonOutcome = null,
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

        return s.copy(
            talentPoints = progression.talentPoints(s.level, s.talents),
            unlockedSpells = loadout.unlockedSpells,
            activeActionBars = bar,
            maxMana = maxMana,
            mana = min(s.mana, maxMana.toDouble()),
        )
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
        return refreshMeta(state.copy(talents = talents)).let { withCapstone(it, row.talent.mechanicId) }
    }

    private fun decrementTalent(state: GameState, talentId: String): GameState {
        val row = state.talents.firstOrNull { it.id == talentId } ?: return state
        if (row.points <= 0) return state
        // Refuse if another invested talent still depends on this one.
        val dependent = state.talents.any { it.points > 0 && talentId in it.talent.prerequisites }
        if (dependent) return state

        val talents = state.talents.map { if (it.id == talentId) it.copy(points = it.points - 1) else it }
        return refreshMeta(state.copy(talents = talents)).let { withCapstone(it, row.talent.mechanicId) }
    }

    private fun respec(state: GameState): GameState {
        val talents = state.talents.map { it.copy(points = 0) }
        return refreshMeta(state.copy(talents = talents, capstoneForm = null))
    }

    /** A capstone talent sets (or clears) the player's form. */
    private fun withCapstone(s: GameState, mechanicId: String?): GameState {
        val cls = s.playerClass ?: return s
        val prog = data.bundle(cls).meta.progression
        if (mechanicId != prog.capstoneMechanicId) return s
        val invested = s.talents.ranksOf(prog.capstoneMechanicId) > 0
        return s.copy(capstoneForm = if (invested) prog.capstoneForm else null)
    }

    private fun reorderActionBar(state: GameState, from: Int, to: Int): GameState {
        // Deliberately inert mid-run, matching the web app.
        if (state.currentDungeon != null) return state
        val bar = state.activeActionBars.toMutableList()
        if (from !in bar.indices || to !in bar.indices) return state
        bar.add(to, bar.removeAt(from))
        return state.copy(activeActionBars = bar)
    }
}
