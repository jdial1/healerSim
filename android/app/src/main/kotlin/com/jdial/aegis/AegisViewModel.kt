package com.jdial.aegis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Action
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.Rng
import com.jdial.aegis.sim.Roster
import com.jdial.aegis.sim.SaveStore
import com.jdial.aegis.sim.UiSettings
import com.jdial.aegis.sim.SUSPEND_SNAPSHOT_TICK_INTERVAL
import com.jdial.aegis.sim.TICK_RATE_MS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

/**
 * Drives the simulation and owns all mutable game state.
 *
 * The tick loop mirrors `useGameEngine.js`: a wall-clock accumulator so the sim
 * advances by elapsed real time rather than by frame, with a backlog cap so a
 * long pause does not fast-forward the run. Unlike the web app's `setInterval`,
 * this is tied to the Android lifecycle — the game must not tick while the app
 * is backgrounded.
 */
class AegisViewModel(app: Application) : AndroidViewModel(app) {

    val data: GameData = GameData.load { path ->
        app.assets.open(path).bufferedReader().readText()
    }
    val engine = Engine(data)

    private val rng = Rng(System.nanoTime().toInt())
    private val store = SaveStore(File(app.filesDir, "aegis.roster.v2.json"), engine)

    private val _state = MutableStateFlow(GameState())
    val state: StateFlow<GameState> = _state.asStateFlow()

    private val _roster = MutableStateFlow(store.load())
    val roster: StateFlow<Roster> = _roster.asStateFlow()

    private var tickJob: Job? = null
    private var lastTickMs = 0L
    private var lastSnapshotTick = 0
    private var lastBossBracket = -1

    /** True when a boss fight was interrupted and can be resumed. */
    private val _resumable = MutableStateFlow(false)
    val resumable: StateFlow<Boolean> = _resumable.asStateFlow()

    val maxLevelAcrossRoster: Int get() = store.maxLevelAcrossRoster(_roster.value)

    // --- character lifecycle -------------------------------------------------

    fun selectClass(cls: PlayerClass) {
        // A boss fight interrupted by process death resumes where it left off.
        val resumed = store.takeSuspendedRun(cls)
        if (resumed != null) {
            _state.value = resumed
            _resumable.value = true
            startTicking()
            return
        }
        val saved = _roster.value.byClass[cls.name]
        _state.value = saved?.let { store.restore(it, rng) } ?: engine.newCharacter(cls, rng)
        _resumable.value = false
        persist()
    }

    fun leaveCharacter() {
        stopTicking()
        persist()
        _state.value = GameState()
    }

    private fun persist() {
        val next = store.merge(_roster.value, _state.value)
        _roster.value = next
        store.save(next)
    }

    // --- actions -------------------------------------------------------------

    private fun dispatch(action: Action) {
        _state.value = engine.reduce(_state.value, action, rng)
    }

    fun startDungeon(dungeon: Dungeon, pace: String) {
        persist()
        store.clearSuspendedRun()
        lastSnapshotTick = 0
        lastBossBracket = -1
        dispatch(Action.StartDungeon(dungeon, pace))
        startTicking()
    }

    fun abandonDungeon() {
        stopTicking()
        store.clearSuspendedRun()
        dispatch(Action.AbandonDungeon)
        persist()
    }

    fun castSpell(spellId: String, targetId: String?) {
        // Crit is rolled per cast on 0..100, matching the web app's contract.
        dispatch(Action.CastSpell(spellId, targetId, rng.nextDouble() * 100.0))
    }

    fun unlockTalent(id: String) { dispatch(Action.UnlockTalent(id)); persist() }
    fun decrementTalent(id: String) { dispatch(Action.DecrementTalent(id)); persist() }
    fun respecTalents() { dispatch(Action.RespecTalents); persist() }

    fun dismissOutcome() {
        store.clearSuspendedRun()
        dispatch(Action.DismissDungeonOutcome)
        persist()
    }

    // --- tutorial ------------------------------------------------------------

    private val _settings = MutableStateFlow(store.readSettings())
    val settings: StateFlow<UiSettings> = _settings.asStateFlow()

    fun updateSettings(transform: (UiSettings) -> UiSettings) {
        val next = transform(_settings.value)
        _settings.value = next
        store.writeSettings(next)
    }

    private val _tutorialSteps = MutableStateFlow(store.readTutorialSteps().toSet())
    val tutorialSteps: StateFlow<Set<String>> = _tutorialSteps.asStateFlow()

    fun completeTutorialStep(id: String) {
        if (id in _tutorialSteps.value) return
        val next = _tutorialSteps.value + id
        _tutorialSteps.value = next
        store.writeTutorialSteps(next.toList())
    }

    fun setTutorialPaused(paused: Boolean) = dispatch(Action.SetTutorialPaused(paused))

    // --- action bar ----------------------------------------------------------

    fun reorderActionBar(from: Int, to: Int) {
        dispatch(Action.ReorderActionBar(from, to))
        persist()
    }

    // --- the loop ------------------------------------------------------------

    private fun startTicking() {
        if (tickJob?.isActive == true) return
        lastTickMs = System.currentTimeMillis()
        tickJob = viewModelScope.launch(Dispatchers.Default) {
            while (true) {
                delay(TICK_RATE_MS / 2L)
                val now = System.currentTimeMillis()
                var ticks = ((now - lastTickMs) / TICK_RATE_MS).toInt()
                if (ticks <= 0) continue
                // Drop a backlog rather than fast-forwarding through it.
                if (ticks > 100) {
                    ticks = 100
                    lastTickMs = now
                } else {
                    lastTickMs += ticks.toLong() * TICK_RATE_MS
                }

                val current = _state.value
                if (!current.isCombatActive) {
                    // The run is over, so the snapshot must go — otherwise a wipe
                    // would still look resumable on the next class select.
                    store.clearSuspendedRun()
                    stopTicking()
                    persist()
                    break
                }
                val next = engine.reduce(current, Action.Tick(ticks), rng)
                _state.value = next
                maybeSnapshot(next)
            }
        }
    }

    /**
     * Persists a boss fight often enough to survive process death, without
     * writing every tick: every 8 ticks, or when the boss crosses a quarter of
     * its health — the same rule the web app uses.
     */
    private fun maybeSnapshot(state: GameState) {
        if (!store.isSuspendable(state)) return
        val frac = if (state.enemyMaxHealth > 0) state.enemyHealth / state.enemyMaxHealth else 1.0
        val bracket = minOf(3, ((1 - frac) * 4).toInt())
        val dueByTicks = state.combatElapsedTicks - lastSnapshotTick >= SUSPEND_SNAPSHOT_TICK_INTERVAL
        if (!dueByTicks && bracket == lastBossBracket) return
        lastSnapshotTick = state.combatElapsedTicks
        lastBossBracket = bracket
        store.writeSuspendedRun(state)
    }

    private fun stopTicking() {
        tickJob?.cancel()
        tickJob = null
    }

    /** Called from the activity lifecycle: never tick while backgrounded. */
    fun onEnterBackground() {
        stopTicking()
        // Backgrounding is the most likely prelude to being killed, so snapshot now.
        if (store.isSuspendable(_state.value)) store.writeSuspendedRun(_state.value)
        persist()
    }

    fun onEnterForeground() {
        if (_state.value.isCombatActive) startTicking()
    }
}
