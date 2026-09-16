package com.jdial.aegis.mp

import android.content.Context
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withTimeoutOrNull

/** What the queue is doing, as the lobby needs to show it. */
sealed interface QueueStatus {
    /** Multiplayer is off, or this build has no Firebase configuration. */
    data object Offline : QueueStatus
    data class Waiting(val humans: Int) : QueueStatus
    data class Ready(val humans: Int, val isHost: Boolean) : QueueStatus
    data class Failed(val reason: String) : QueueStatus
}

/**
 * The multiplayer half of the app, kept out of the view model.
 *
 * Everything here is optional by construction: [joinQueue] returns null when
 * multiplayer is unconfigured or anything goes wrong, and the caller carries on
 * with the single-player path it already had. There is no half-connected state
 * to reason about -- either there is a [session] or there is not. And until
 * somebody queues, the backend is not even built.
 */
class Multiplayer(
    private val engine: Engine,
    private val data: GameData,
    /** Whether this build can do multiplayer at all. Must not build a backend. */
    val isAvailable: Boolean,
    /**
     * Builds the backend. Called at most once, and only when somebody queues:
     * with multiplayer off it never runs, and neither does any Firebase code.
     */
    backendFactory: () -> FirebaseBackend?,
) {
    private val lazyBackend = lazy(backendFactory)
    private val backend: FirebaseBackend? get() = lazyBackend.value

    /** True once anything has touched Firebase. Offline, it stays false. */
    val backendCreated: Boolean get() = lazyBackend.isInitialized()

    private val _status = MutableStateFlow<QueueStatus>(QueueStatus.Offline)
    val status: StateFlow<QueueStatus> = _status.asStateFlow()

    var session: MultiplayerSession? = null
        private set

    private var uid: String? = null
    private var castSeq = 0L

    /** True while this client should be simulating: hosting, or playing alone. */
    val isHost: Boolean get() = session?.isHost ?: true

    /**
     * Backs out of the queue.
     *
     * Deleting the entry matters more than it looks: a stale entry keeps
     * appearing in everyone else's snapshot, so they hold a seat for somebody
     * who has gone. The room they eventually form would be one short for no
     * reason.
     */
    suspend fun cancel() {
        // Never queued, so nothing to take back -- and asking for the backend
        // here would build it for a player who never opted in.
        if (!backendCreated) return leave()
        val be = backend
        val me = uid
        if (be != null && me != null) runCatching { be.leaveQueue(me) }
        leave()
    }

    fun leave() {
        session = null
        _status.value = QueueStatus.Offline
    }

    /**
     * Joins the public queue and waits for a room.
     *
     * The wait ends either because enough people turned up or because the
     * deadline passed and the AI is filling the rest -- see [formRoom]. A
     * client that fails anywhere here returns null and the caller plays alone,
     * because "the queue is broken" must never mean "you cannot play".
     */
    suspend fun joinQueue(dungeon: Dungeon, pace: String, local: GameState): MultiplayerSession? {
        val be = backend ?: return null.also { _status.value = QueueStatus.Offline }
        return runCatching {
            val me = be.signIn().also { uid = it }
            // Times are placeholders: the backend stamps both on the server.
            val entry = QueueEntry(me, local.playerRole, dungeon.id, enqueuedAtMs = 0L)
            be.enqueue(entry)
            _status.value = QueueStatus.Waiting(1)

            val room = withTimeoutOrNull(QUEUE_TIMEOUT_MS) { awaitRoom(be, me, dungeon, pace, entry) }
                ?: return@runCatching null
            runCatching { be.leaveQueue(me) }

            val s = MultiplayerSession(be.relay, engine, data, room, me)
            if (s.isHost) be.relay.openAsHost(room.id, me, room.memberUids)
            s.publishProfile(local)
            s.reconcileHost()
            session = s
            _status.value = QueueStatus.Ready(room.members.size, s.isHost)
            s
        }.getOrElse {
            // Deliberately swallowed: the caller plays single player.
            _status.value = QueueStatus.Failed(it.message ?: "could not reach the queue")
            null
        }
    }

    /**
     * Polls until a group exists.
     *
     * Every client runs [formRoom] over the same snapshot and therefore agrees
     * on the group and on who hosts, so only the host writes the room; everyone
     * else waits for it to appear. That is why the room id is derived from the
     * members rather than generated.
     */
    private suspend fun awaitRoom(
        be: FirebaseBackend,
        me: String,
        dungeon: Dungeon,
        pace: String,
        entry: QueueEntry,
    ): Room? {
        var joinedAt: Long? = null
        var swept = false
        while (true) {
            // Say "still here" first, so the snapshot below carries a fresh
            // server time for us. If our entry has gone, join again.
            if (runCatching { be.touchQueue(me) }.isFailure) be.enqueue(entry)

            val waiting = be.queueFor(dungeon.id)
            val mine = waiting.firstOrNull { it.uid == me }
            if (mine != null) {
                // "Now" is our own lastSeen, just stamped: every time in the
                // snapshot is on the server's clock, so comparing against the
                // device clock would measure skew rather than waiting.
                val now = mine.lastSeenMs
                joinedAt = joinedAt ?: mine.enqueuedAtMs
                if (!swept) {
                    swept = true
                    runCatching { be.sweepAbandoned(now) }
                }

                // Somebody else may already have formed and published our room.
                be.roomFor(me, dungeon.id, formedSinceMs = joinedAt)?.let { return it }

                _status.value = QueueStatus.Waiting(selectMembers(waiting, dungeon.id, now).size.coerceAtLeast(1))
                val formed = formRoom(
                    waiting = waiting,
                    dungeonId = dungeon.id,
                    pace = pace,
                    nowMs = now,
                    maxWaitMs = GROUP_WAIT_MS,
                )
                if (formed != null && formed.hostUid == me) {
                    be.createRoom(formed)
                    return formed
                }
            }
            delay(POLL_MS)
        }
    }

    /** A cast this client cannot resolve itself, handed to whoever is hosting. */
    suspend fun requestCast(spellId: String, targetId: String?) {
        session?.requestCast(++castSeq, spellId, targetId)
    }

    companion object {
        /** How long a client waits before giving up and playing alone. */
        const val QUEUE_TIMEOUT_MS = 45_000L

        /**
         * How long a group waits for strangers before the AI fills the rest.
         *
         * Short on purpose. The queue is empty until it is not, and a player
         * who has to sit through a long timer to discover that will not queue
         * twice.
         */
        const val GROUP_WAIT_MS = 12_000L
        const val POLL_MS = 1_500L

        /**
         * The backend, or null when this build has no Firebase configuration.
         *
         * google-services.json is not committed, so a fresh clone gets null
         * here and plays offline. That is a supported state: the settings row
         * says multiplayer is unavailable rather than the app misbehaving.
         */
        fun forApp(engine: Engine, data: GameData, context: Context) = Multiplayer(
            engine = engine,
            data = data,
            isAvailable = FirebaseBackend.isConfigured(context),
            backendFactory = { FirebaseBackend.createOrNull(context) },
        )
    }
}
