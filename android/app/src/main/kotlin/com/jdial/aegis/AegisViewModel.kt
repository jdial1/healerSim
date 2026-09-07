package com.jdial.aegis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jdial.aegis.mp.Multiplayer
import com.jdial.aegis.mp.MultiplayerSession
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

    /**
     * How often a client says it is still here.
     *
     * Comfortably under HEARTBEAT_TIMEOUT_MS: missing one beat must not look
     * like a dead phone, and missing several in a row must.
     */
    private val heartbeatIntervalMs = 2_000L

    private var tickJob: Job? = null
    private var heartbeatJob: Job? = null
    private var queueJob: Job? = null
    private var renderJob: Job? = null

    /** Absent when this build has no Firebase configuration; then it is offline. */
    private val multiplayer = Multiplayer(engine, data, Multiplayer.backendFor(app))
    val queueStatus get() = multiplayer.status

    /** False when this build has no Firebase configuration; the row says so. */
    val multiplayerAvailable get() = multiplayer.isAvailable
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

    /**
     * Starts a run, alone or with whoever the queue found.
     *
     * The multiplayer path is strictly additive. It queues, and if that
     * produces a room the party is rebuilt from everyone's join profiles and
     * this client takes its allotted slot. If it produces nothing -- switched
     * off, unconfigured, nobody there, network down -- the run starts exactly
     * as it always did. "The queue is broken" must never mean "you cannot
     * play".
     */
    fun startDungeon(dungeon: Dungeon, pace: String) {
        persist()
        store.clearSuspendedRun()
        lastSnapshotTick = 0
        lastBossBracket = -1
        multiplayer.leave()

        if (!_settings.value.multiplayer || !multiplayer.isAvailable) {
            dispatch(Action.StartDungeon(dungeon, pace))
            startTicking()
            return
        }

        viewModelScope.launch {
            // Usually already formed: the lobby starts queueing when it opens,
            // so by the time the player commits there is a room waiting. This
            // only blocks when they were quicker than the queue.
            val session = multiplayer.session
                ?: multiplayer.joinQueue(dungeon, pace, _state.value)
            dispatch(Action.StartDungeon(dungeon, pace))
            if (session != null) {
                _state.value = seatIn(session, _state.value)
                startHeartbeat()
                if (!session.isHost) startRendering(session)
            }
            startTicking()
        }
    }

    /**
     * Starts looking for a group, from the moment the lobby opens.
     *
     * Queueing here rather than on "enter" is what lets the lobby show real
     * people arriving instead of an animation. Doing nothing at all is a
     * perfectly good outcome -- switched off, unconfigured, or nobody there --
     * and the run then starts alone.
     */
    fun enterQueue(dungeon: Dungeon, pace: String) {
        if (!_settings.value.multiplayer || !multiplayer.isAvailable) return
        if (queueJob?.isActive == true) return
        queueJob = viewModelScope.launch {
            multiplayer.joinQueue(dungeon, pace, _state.value)
        }
    }

    /** The player backed out of the lobby: stop holding a seat. */
    fun cancelQueue() {
        queueJob?.cancel()
        queueJob = null
        viewModelScope.launch { multiplayer.cancel() }
    }

    /**
     * Puts this client in its room slot and fills the others from the profiles
     * everyone published on joining.
     *
     * The party the engine generated is kept -- the units, their names and
     * levels -- and only the *participants* are replaced, because that is the
     * part that says who is a person rather than a script. A slot with no
     * usable profile stays AI, which is the same outcome as that player having
     * disconnected.
     */
    private suspend fun seatIn(session: MultiplayerSession, local: GameState): GameState {
        val slot = session.localUnitId ?: return local
        val others = runCatching { session.buildParticipants() }.getOrDefault(emptyMap())
        return local.copy(
            participants = others + (slot to local.me.copy(unitId = slot)),
            localUnitId = slot,
        )
    }

    /**
     * Says "still here", and takes the room over if the host has stopped.
     *
     * Runs for host and guest alike: a host has to keep beating to keep the
     * job, and a guest has to be beating to be eligible for it.
     */
    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = viewModelScope.launch(Dispatchers.IO) {
            while (true) {
                delay(heartbeatIntervalMs)
                val session = multiplayer.session ?: break
                val tookOver = runCatching { session.reconcileHost() }.getOrDefault(false)
                if (!tookOver) continue
                // Inherit the party as it stands, then simulate from here.
                runCatching { session.buildParticipants() }.getOrNull()?.let { built ->
                    val slot = session.localUnitId ?: return@let
                    _state.value = _state.value.let { s ->
                        s.copy(participants = built + (slot to s.me))
                    }
                }
                renderJob?.cancel()
                renderJob = null
            }
        }
    }

    /** A guest draws whatever the host published. It never runs the engine. */
    private fun startRendering(session: MultiplayerSession) {
        renderJob?.cancel()
        renderJob = viewModelScope.launch(Dispatchers.Default) {
            session.frames().collect { frame ->
                _state.value = session.render(_state.value, frame)
            }
        }
    }

    fun abandonDungeon() {
        stopTicking()
        multiplayer.leave()
        store.clearSuspendedRun()
        dispatch(Action.AbandonDungeon)
        persist()
    }

    /**
     * Casts, or asks whoever is hosting to.
     *
     * A guest does not simulate, so its tap is a request rather than a result.
     * The crit roll is deliberately not sent: the host draws its own for any
     * remote actor, and a roll that never crosses the wire cannot be trusted by
     * mistake. See `Engine.castAs`.
     */
    fun castSpell(spellId: String, targetId: String?) {
        if (!multiplayer.isHost) {
            viewModelScope.launch { runCatching { multiplayer.requestCast(spellId, targetId) } }
            return
        }
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

    fun setActionBarSlot(index: Int, spellId: String) {
        dispatch(Action.SetActionBarSlot(index, spellId))
        persist()
    }

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
                val session = multiplayer.session
                val next = when {
                    // A guest draws frames and never runs the engine, so there
                    // is exactly one timeline and nothing to reconcile.
                    session != null && !session.isHost -> current
                    session != null -> runCatching { session.hostStep(current, rng) }
                        // A failed publish must not stall the fight for the
                        // people who can still see it, this one included.
                        .getOrElse { engine.reduce(current, Action.Tick(1), rng) }
                    else -> engine.reduce(current, Action.Tick(ticks), rng)
                }
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
        heartbeatJob?.cancel()
        heartbeatJob = null
        renderJob?.cancel()
        renderJob = null
    }

    /**
     * Called from the activity lifecycle: never tick while backgrounded.
     *
     * In a multiplayer room this is also how the host stands down. Heartbeats
     * are written by [com.jdial.aegis.mp.MultiplayerSession.reconcileHost],
     * which the tick loop drives, so stopping the loop stops the heartbeat and
     * the remaining players elect a new host within
     * [com.jdial.aegis.mp.HEARTBEAT_TIMEOUT_MS]. That is a deliberate choice of
     * "migrate promptly" over "keep hosting in the background": holding a
     * foreground service open to keep simulating would cost a permanent
     * notification, and a backgrounded phone is exactly the one whose game is
     * about to be killed anyway.
     *
     * The visible cost is honest and worth stating: the room stalls for up to
     * that timeout before somebody else picks it up.
     */
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
