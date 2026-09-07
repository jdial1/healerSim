package com.jdial.aegis.mp

import com.jdial.aegis.data.GameData
import com.jdial.aegis.sim.Action
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
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
    val isHost: Boolean get() = room.hostUid == uid

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
