package com.jdial.aegis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jdial.aegis.mp.ForgetResult
import com.jdial.aegis.mp.Multiplayer
import com.jdial.aegis.mp.MultiplayerSession
import com.jdial.aegis.mp.mergeSeats
import com.jdial.aegis.sim.Participant
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import com.jdial.aegis.ui.CastFeedback
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
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

    /**
     * How often a host takes in requests and broadcasts a frame: 4 Hz, the
     * rate the egress budget in SnapshotTest is written against. The fight
     * itself still ticks at 10 Hz; guests see every fourth-of-a-second.
     */
    private val relayIntervalMs = 250L

    private var tickJob: Job? = null
    private var heartbeatJob: Job? = null
    private var queueJob: Job? = null
    private var relayJob: Job? = null
    private var renderJob: Job? = null

    /** Absent when this build has no Firebase configuration; then it is offline. */
    private val multiplayer = Multiplayer.forApp(engine, data, app)

    private val _forgetResult = MutableStateFlow<ForgetResult?>(null)

    /** The outcome of the last "delete my multiplayer data", for the settings row. */
    val forgetResult: StateFlow<ForgetResult?> = _forgetResult.asStateFlow()

    /**
     * Deletes everything multiplayer holds about this player, and switches it
     * off so the next lobby does not quietly create a new account.
     */
    fun forgetMultiplayerData() {
        updateSettings { it.copy(multiplayer = false) }
        viewModelScope.launch {
            _forgetResult.value = runCatching { multiplayer.forgetMe() }.getOrDefault(ForgetResult.Failed)
        }
    }

    /** For the test that single player never touches the network. */
    internal val touchedNetwork: Boolean get() = multiplayer.backendCreated
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

    /**
     * Guards every read-reduce-write of [_state], and the shared [rng].
     *
     * The tick loop, the host's relay job, frame rendering and the UI all
     * update the state from different threads. Without this, one of them
     * reading the state, doing something else, and writing its result back
     * silently discards whatever the others wrote in between -- which, once a
     * network call sat in that gap, lost the host's own casts. Nothing that
     * suspends may run while it is held.
     */
    private val stateLock = Any()

    private inline fun mutate(f: (GameState) -> GameState): GameState =
        synchronized(stateLock) { f(_state.value).also { _state.value = it } }

    private fun dispatch(action: Action) {
        mutate { engine.reduce(it, action, rng) }
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

        // Keep the room the lobby formed -- discarding it here made every player
        // sit through the whole group timer again after pressing Enter. Only a
        // room for some other dungeon is stale.
        if (multiplayer.session?.room?.dungeonId != dungeon.id) multiplayer.leave()

        if (!_settings.value.multiplayer || !multiplayer.isAvailable) {
            multiplayer.leave()
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
                // Build the seating over the network first, then apply it under
                // the lock -- never await with the state in hand.
                val others = runCatching { session.buildParticipants() }.getOrDefault(emptyMap())
                mutate { seatIn(session, it, others) }
                startHeartbeat()
                if (session.isHost) startRelay(session) else startRendering(session)
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
    private fun seatIn(
        session: MultiplayerSession,
        local: GameState,
        others: Map<String, Participant>,
    ): GameState {
        val slot = session.localUnitId ?: return local
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
                if (!tookOver) {
                    // A host keeps its seating current: guests whose profile
                    // arrived after the run began, and guests who went quiet.
                    if (session.isHost) {
                        val slot = session.localUnitId ?: continue
                        runCatching { session.buildParticipants() }.getOrNull()?.let { built ->
                            mutate { s -> s.copy(participants = mergeSeats(s.participants, built, slot)) }
                        }
                    }
                    continue
                }
                // Inherit the party as it stands, then simulate from here.
                runCatching { session.buildParticipants() }.getOrNull()?.let { built ->
                    val slot = session.localUnitId ?: return@let
                    mutate { s -> s.copy(participants = built + (slot to s.me)) }
                }
                renderJob?.cancel()
                renderJob = null
                startRelay(session)
            }
        }
    }

    /** A guest draws whatever the host published. It never runs the engine. */
    private fun startRendering(session: MultiplayerSession) {
        renderJob?.cancel()
        renderJob = viewModelScope.launch(Dispatchers.Default) {
            try {
                session.frames().collect { frame ->
                    mutate { session.render(it, frame) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The room went away under us: deleted by its host, or by a
                // "delete my data". The listener fails with a permission error
                // rather than ending, and uncaught here it crashed the app.
                // A run whose result already arrived is left alone; otherwise
                // the run ends as if the player had left it.
                if (_state.value.isCombatActive) onRoomLost()
            }
        }
    }

    /** A guest whose room no longer exists: end the run rather than freeze on it. */
    private fun onRoomLost() {
        stopTicking()
        multiplayer.leave()
        store.clearSuspendedRun()
        dispatch(Action.AbandonDungeon)
        persist()
    }

    /**
     * The host's side of the relay, at [relayIntervalMs]: take in what the
     * guests asked for, and broadcast the fight.
     *
     * Deliberately not part of the tick loop. When it was, every tick waited on
     * two network round trips, so against a real server the fight ran at about
     * half speed, and a frame went out every tick -- up to ten a second, where
     * the egress budget assumes four. The simulation now keeps real time on its
     * own, and the network works at the rate the budget was written for.
     */
    private fun startRelay(session: MultiplayerSession) {
        relayJob?.cancel()
        relayJob = viewModelScope.launch(Dispatchers.IO) {
            while (session.isHost) {
                runCatching {
                    val requests = session.drainRequests()
                    val frame = mutate { session.applyRequests(it, requests, rng) }
                    session.publish(frame)
                }
                // A failure here costs the guests a frame, never the host its
                // fight: the tick loop does not wait on any of this.
                delay(relayIntervalMs)
            }
        }
    }

    fun abandonDungeon() {
        stopTicking()
        viewModelScope.launch { runCatching { multiplayer.endRun(finished = false) } }
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
            // A guest cannot know yet whether the host will accept it.
            _castFeedback.tryEmit(CastFeedback.SENT)
            viewModelScope.launch { runCatching { multiplayer.requestCast(spellId, targetId) } }
            return
        }
        // Crit is rolled per cast on 0..100, matching the web app's contract --
        // inside the lock, because the tick loop draws from the same stream.
        var accepted = false
        mutate { s ->
            engine.reduce(s, Action.CastSpell(spellId, targetId, rng.nextDouble() * 100.0), rng)
                // The engine hands back the very same state when it refuses a
                // cast, so identity is exactly "did anything happen".
                .also { accepted = it !== s }
        }
        _castFeedback.tryEmit(if (accepted) CastFeedback.ACCEPTED else CastFeedback.REFUSED)
    }

    private val _castFeedback = MutableSharedFlow<CastFeedback>(extraBufferCapacity = 8)

    /** Whether each cast tap went off, for sound and vibration. */
    val castFeedback: SharedFlow<CastFeedback> = _castFeedback.asSharedFlow()

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

    /**
     * Pauses for a tutorial card -- alone.
     *
     * An online fight is shared, so one player reading a card must not freeze
     * everyone else's. In a room the card still shows; the fight carries on.
     */
    fun setTutorialPaused(paused: Boolean) {
        if (paused && multiplayer.session != null) return
        dispatch(Action.SetTutorialPaused(paused))
    }

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

                if (!_state.value.isCombatActive) {
                    // The run is over, so the snapshot must go — otherwise a wipe
                    // would still look resumable on the next class select.
                    store.clearSuspendedRun()
                    // A finished run is over for everyone in the room; its
                    // host deletes it, profiles and all. Launched before
                    // stopTicking, which cancels this very loop.
                    val finalState = _state.value
                    viewModelScope.launch { runCatching { multiplayer.endRun(finished = true, finalState) } }
                    stopTicking()
                    persist()
                    break
                }
                // A guest draws frames and never runs the engine, so there is
                // exactly one timeline and nothing to reconcile. Everyone else
                // -- single player and host alike -- simulates locally in real
                // time; the host's network work happens in startRelay.
                if (multiplayer.isHost) {
                    val next = mutate { engine.reduce(it, Action.Tick(ticks), rng) }
                    maybeSnapshot(next)
                }
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
        relayJob?.cancel()
        relayJob = null
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
