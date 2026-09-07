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
        var s = state
        for ((actorUid, action) in relay.pendingActions(room.id)) {
            val unitId = unitIdByUid[actorUid] ?: continue
            if (appliedSeq[actorUid]?.let { action.seq <= it } == true) continue
            appliedSeq[actorUid] = action.seq
            // critRoll is not on the wire and is redrawn inside the engine for
            // any actor that is not this client -- see Engine.castAs.
            s = engine.reduce(s, Action.CastSpell(action.spellId, action.targetId, 0.0, unitId), rng)
        }
        s = engine.reduce(s, Action.Tick(1), rng)
        relay.publish(room.id, s.toSnapshot())
        return s
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
    fun render(local: GameState, frame: Snapshot): GameState =
        frame.applyTo(local, data.dungeon(frame.dungeonId))
}
