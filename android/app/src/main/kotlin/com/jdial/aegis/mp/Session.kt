package com.jdial.aegis.mp

import com.jdial.aegis.data.GameData
import com.jdial.aegis.sim.Action
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.Participant
import com.jdial.aegis.sim.Rng

/**
 * One player's seat in a running room.
 *
 * The asymmetry is the whole design: **exactly one client simulates.** The host
 * drains what everyone asked to do, advances the engine it already had, and
 * publishes the result. Everyone else applies frames and never calls the
 * engine at all, so there is no drift to reconcile -- there is only one
 * timeline, and it is the host's.
 *
 * Deliberately not a thread, a coroutine loop or a lifecycle observer. It is a
 * pair of suspend steps the caller drives, so the same code can be stepped by a
 * test and by the app's tick loop, and so that whatever ends up owning
 * backgrounding and host migration in phase 4 can own it without unpicking a
 * loop first.
 */
class MultiplayerSession(
    private val relay: Relay,
    private val engine: Engine,
    private val data: GameData,
    val room: Room,
    val uid: String,
) {
    /**
     * Who is hosting now. Starts as whoever the matchmaker elected and moves
     * when that phone stops answering -- see [reconcileHost].
     */
    var hostUid: String = room.hostUid
        private set

    val isHost: Boolean get() = hostUid == uid

    /** Which party slot this player occupies, if they are in the room at all. */
    val localUnitId: String? get() = room.members.firstOrNull { it.uid == uid }?.unitId

    private val unitIdByUid = room.members.associate { it.uid to it.unitId }

    /**
     * The last action sequence applied per player.
     *
     * A guest publishes its latest request at a fixed path, so the host reads
     * the same one repeatedly between casts. Without this, holding a spell
     * would cast it every tick until the guest sent something else.
     */
    private val appliedSeq = mutableMapOf<String, Long>()

    /**
     * One host tick: apply what the guests asked for, advance, publish.
     *
     * A request from somebody not in the room is ignored, and a spell the actor
     * cannot cast is rejected by the engine as it always was -- `castAs` drops
     * an unknown actor and `validate` still has to pass. Nothing here trusts a
     * guest beyond "this player would like to cast this at that".
     */
    suspend fun hostStep(state: GameState, rng: Rng): GameState {
        check(isHost) { "only the host simulates" }
        val s = engine.reduce(applyRequests(state, drainRequests(), rng), Action.Tick(1), rng)
        publish(s)
        return s
    }

    /**
     * The guests' new requests, as (party slot, request). Network only.
     *
     * Kept apart from [applyRequests] because the two must not share a
     * suspension: the app's state is read and written under a lock, and
     * anything written while a network call is in flight would be overwritten
     * by a result computed from the state before it. Against a real server that
     * window is hundreds of milliseconds, and it silently dropped the host's
     * own casts.
     */
    suspend fun drainRequests(): List<Pair<String, WireAction>> {
        check(isHost) { "only the host simulates" }
        return relay.pendingActions(room.id).mapNotNull { (actorUid, action) ->
            val unitId = unitIdByUid[actorUid] ?: return@mapNotNull null
            if (appliedSeq[actorUid]?.let { action.seq <= it } == true) return@mapNotNull null
            appliedSeq[actorUid] = action.seq
            unitId to action
        }
    }

    /**
     * Applies drained requests. Pure and immediate, so it can run inside the
     * state lock.
     *
     * critRoll is not on the wire and is redrawn inside the engine for any
     * actor that is not this client -- see Engine.castAs.
     */
    fun applyRequests(state: GameState, requests: List<Pair<String, WireAction>>, rng: Rng): GameState =
        requests.fold(state) { s, (unitId, action) ->
            engine.reduce(s, Action.CastSpell(action.spellId, action.targetId, 0.0, unitId), rng)
        }

    /** Broadcasts one frame of [state]. */
    suspend fun publish(state: GameState) {
        relay.publish(room.id, state.toSnapshot())
    }

    // --- surviving the host being a phone ------------------------------------

    /**
     * Says "still here", and works out whether the room needs a new host.
     *
     * Every client runs this over the same server-stamped heartbeats, so they
     * reach the same answer without negotiating -- the same property that lets
     * the queue form a group without a server. If the answer is this client, it
     * claims the room; the rules refuse the claim unless the sitting host has
     * genuinely gone quiet, so a client that gets the election wrong cannot act
     * on it.
     *
     * Returns true when this client is now the host and was not before, which
     * is the caller's cue to start ticking.
     */
    suspend fun reconcileHost(): Boolean {
        relay.heartbeat(room.id, uid)
        val was = isHost
        val seen = relay.heartbeats(room.id)
        // "Now" is this client's own heartbeat, just written and read straight
        // back. Every value in the map is stamped by the same server clock, so
        // comparing them to each other measures elapsed time; comparing them to
        // the device clock would measure the skew between two machines.
        val now = seen[uid] ?: System.currentTimeMillis()
        val elected = electHost(
            memberUids = room.memberUids,
            lastSeenMs = seen,
            currentHost = relay.hostUid(room.id) ?: hostUid,
            nowMs = now,
        )
        hostUid = elected
        if (elected == uid && !was) {
            // The rules refuse this unless the old host really has gone quiet,
            // judged on the server's clock rather than ours. A refusal means we
            // were wrong, so take the room's word for who is hosting rather
            // than believing our own election.
            if (runCatching { relay.claimHost(room.id, uid) }.isFailure) {
                hostUid = relay.hostUid(room.id) ?: room.hostUid
                return false
            }
            return true
        }
        return false
    }

    /**
     * The party as the host must simulate it: everyone's real character, and a
     * slot marked AI for anyone who has gone quiet.
     *
     * Built from the join profiles rather than from the frame, because the
     * frame carries no talents -- that is what keeps it at 1.4 KB. A player
     * whose profile is missing or malformed becomes an AI slot, which is the
     * same outcome as their having disconnected: a bad document from a stranger
     * must not be able to stop a run.
     */
    suspend fun buildParticipants(): Map<String, Participant> {
        relay.heartbeat(room.id, uid)
        val seen = relay.heartbeats(room.id)
        val now = seen[uid] ?: System.currentTimeMillis()
        return relay.profiles(room.id).mapNotNull { (memberUid, profile) ->
            val slot = unitIdByUid[memberUid] ?: return@mapNotNull null
            val p = profile.toParticipant(engine) ?: return@mapNotNull null
            val alive = seen[memberUid]?.let { now - it <= HEARTBEAT_TIMEOUT_MS } == true
            slot to p.copy(unitId = slot, isHuman = alive)
        }.toMap()
    }

    /** Publishes who this player is. Once, on joining. */
    suspend fun publishProfile(state: GameState) {
        val slot = localUnitId ?: return
        val profile = state.me.copy(unitId = slot).toProfile() ?: return
        relay.publishProfile(room.id, uid, profile)
    }

    /**
     * Whether any other player in the room is still beating.
     *
     * Decides what leaving does to the room: a host leaving people behind hands
     * it on; a host leaving an empty room deletes it.
     */
    suspend fun othersAlive(): Boolean {
        relay.heartbeat(room.id, uid)
        val seen = relay.heartbeats(room.id)
        val now = seen[uid] ?: return false
        return seen.any { (other, at) -> other != uid && other in room.memberUids && now - at <= HEARTBEAT_TIMEOUT_MS }
    }

    /** Frames from whoever is hosting. A guest renders these and nothing else. */
    fun frames() = relay.frames(room.id)

    /** A guest's request to cast. It does not resolve until the host says so. */
    suspend fun requestCast(seq: Long, spellId: String, targetId: String?) {
        relay.sendAction(room.id, uid, WireAction(seq = seq, spellId = spellId, targetId = targetId))
    }

    /**
     * Lays a frame over what this client already knows.
     *
     * The guest's own character -- class, level, talents, spells -- is kept
     * from [local] and never taken from the wire. A host has no authority over
     * who you are, only over what is happening.
     */
    fun render(local: GameState, frame: Snapshot): GameState {
        val shown = frame.applyTo(local, data.dungeon(frame.dungeonId))
        val slot = localUnitId ?: return shown
        return frame.rewardGuest(engine, before = local, shown = shown, slot = slot)
    }
}

/**
 * The host's seating, brought up to date with [built] from the latest profiles
 * and heartbeats.
 *
 * Someone who has just arrived is seated fresh. Someone already seated keeps
 * their mana, cooldowns and resources -- only whether a person is still
 * driving the slot changes, which is what hands a dropped player's slot to the
 * AI and back. The host's own seat is never touched.
 *
 * Seating used to be built once, when the run started. A guest publishes its
 * profile only after it has found the room, so a host that started first
 * never seated it: the guest's casts were dropped as coming from nobody, and
 * it finished the run with no XP.
 */
fun mergeSeats(
    current: Map<String, Participant>,
    built: Map<String, Participant>,
    localSlot: String,
): Map<String, Participant> {
    var out = current
    for ((slot, p) in built) {
        if (slot == localSlot) continue
        val seated = current[slot]
        out = out + (slot to (seated?.copy(isHuman = p.isHuman) ?: p))
    }
    return out
}
