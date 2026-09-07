package com.jdial.aegis.mp

import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * One player's request to cast, as it crosses the wire.
 *
 * **There is no critRoll on it.** The engine takes one as action data because
 * the web app rolled crit client-side, and `validate` only ever compares it
 * against the caster's crit chance -- so a relayed `0.0` would crit every cast
 * forever. The host redraws it either way (see `Engine.castAs`); leaving the
 * field off the wire entirely means there is nothing to be tempted to trust.
 *
 * [seq] is the guest's own counter. The host applies an action only when the
 * sequence advances, so a frame that arrives twice is not cast twice.
 */
@Serializable
data class WireAction(val seq: Long, val spellId: String, val targetId: String? = null)

/**
 * The live relay: one host publishing frames, guests reading them and posting
 * what they would like to do.
 *
 * Realtime Database rather than Firestore, for a reason that is not the cost
 * argument in the plan: Firestore's sustained write limit is about one per
 * second per document, and this publishes at 3-4 Hz. A frame-rate document in
 * Firestore would be throttled by design. Firestore keeps the queue and the
 * room, which change at human speed.
 *
 * Payloads are stored as a JSON string under the node rather than as a tree of
 * children. RTDB charges for the key names too, and `{"tick":N,"json":"..."}`
 * is both smaller and immune to a partially-applied frame -- a guest either has
 * the whole snapshot or the previous one.
 */
class Relay(private val db: FirebaseDatabase) {
    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }

    private fun room(roomId: String): DatabaseReference = db.getReference("rooms").child(roomId)

    /**
     * Opens the room for business.
     *
     * Writes the membership the security rules are evaluated against: RTDB
     * cannot read the Firestore room document, so the group the queue formed
     * has to be mirrored here. Only the elected host may do this, and only for
     * a room id that names them.
     */
    suspend fun openAsHost(roomId: String, hostUid: String, memberUids: List<String>) {
        room(roomId).setValue(
            mapOf(
                "hostUid" to hostUid,
                "members" to memberUids.associateWith { true },
                "state" to mapOf("tick" to 0, "json" to ""),
            ),
        ).await()
    }

    /** Publishes one frame. Host only -- the rules refuse anyone else. */
    suspend fun publish(roomId: String, snapshot: Snapshot) {
        room(roomId).child("state").setValue(
            mapOf(
                "tick" to snapshot.tick,
                "json" to json.encodeToString(Snapshot.serializer(), snapshot),
            ),
        ).await()
    }

    /**
     * Frames as they arrive.
     *
     * A frame that does not parse, or that is older than one already seen, is
     * dropped rather than rendered: out-of-order delivery is normal, and the
     * host is the only writer but not the only thing that can go wrong.
     */
    fun frames(roomId: String): Flow<Snapshot> = callbackFlow {
        var latest = Int.MIN_VALUE
        val ref = room(roomId).child("state")
        val listener = object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) {
                val raw = s.child("json").getValue(String::class.java) ?: return
                if (raw.isEmpty()) return
                val frame = runCatching { json.decodeFromString(Snapshot.serializer(), raw) }.getOrNull()
                    ?: return
                if (frame.tick <= latest) return
                latest = frame.tick
                trySend(frame)
            }

            override fun onCancelled(error: DatabaseError) {
                close(error.toException())
            }
        }
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener) }
    }

    /** A guest asking to cast. Writes only to its own uid; the rules enforce it. */
    suspend fun sendAction(roomId: String, uid: String, action: WireAction) {
        room(roomId).child("actions").child(uid).setValue(
            mapOf("seq" to action.seq, "json" to json.encodeToString(WireAction.serializer(), action)),
        ).await()
    }

    /**
     * Every guest's latest request, for the host to apply.
     *
     * Returns the actor's uid alongside the action so the host can resolve it
     * as that participant rather than as itself. Junk is dropped: these
     * documents were written by other people's clients.
     */
    suspend fun pendingActions(roomId: String): Map<String, WireAction> {
        val snap = room(roomId).child("actions").get().await()
        return snap.children.mapNotNull { child ->
            val uid = child.key ?: return@mapNotNull null
            val raw = child.child("json").getValue(String::class.java) ?: return@mapNotNull null
            val action = runCatching { json.decodeFromString(WireAction.serializer(), raw) }.getOrNull()
                ?: return@mapNotNull null
            uid to action
        }.toMap()
    }
}
