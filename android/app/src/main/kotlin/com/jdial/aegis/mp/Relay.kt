package com.jdial.aegis.mp

import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
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
                // The only clock the members' clean-up rule trusts.
                "startedAt" to ServerValue.TIMESTAMP,
            ),
        ).await()
    }

    /**
     * Removes the whole room. The host may do this at any time; any member may
     * once it is an hour old. Refused otherwise, which is the caller's cue to
     * fall back to [forget].
     */
    suspend fun deleteRoom(roomId: String) {
        room(roomId).removeValue().await()
    }

    /**
     * Removes what this player left in a room they cannot delete: their
     * character profile, their last request and their heartbeat. The room
     * stays for the people still playing in it.
     */
    suspend fun forget(roomId: String, uid: String) {
        for (node in listOf("profiles", "actions", "heartbeats")) {
            room(roomId).child(node).child(uid).removeValue().await()
        }
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

    // --- staying alive -------------------------------------------------------

    /**
     * "I am still here", stamped with the *server's* clock.
     *
     * ServerValue.TIMESTAMP rather than the device's time, and the security
     * rules require it: a client that could post a future timestamp would keep
     * a dead room alive forever, and one that could backdate another player's
     * would force a migration that should not happen.
     */
    suspend fun heartbeat(roomId: String, uid: String) {
        room(roomId).child("heartbeats").child(uid).setValue(ServerValue.TIMESTAMP).await()
    }

    /**
     * Everyone's last heartbeat, on the server's clock.
     *
     * Read these against your *own* entry rather than against
     * System.currentTimeMillis(): the values are server-stamped, so comparing
     * them to a device clock measures the gap between two clocks instead of how
     * long ago somebody was last heard from, and a phone an hour fast would
     * declare the host dead immediately.
     */
    suspend fun heartbeats(roomId: String): Map<String, Long> {
        val snap = room(roomId).child("heartbeats").get().await()
        return snap.children.mapNotNull { c ->
            val uid = c.key ?: return@mapNotNull null
            val at = c.getValue(Long::class.java) ?: return@mapNotNull null
            uid to at
        }.toMap()
    }

    suspend fun hostUid(roomId: String): String? =
        room(roomId).child("hostUid").get().await().getValue(String::class.java)

    /**
     * Takes the room over. Refused by the rules unless the sitting host's
     * heartbeat has actually gone stale, judged on the server's clock.
     */
    suspend fun claimHost(roomId: String, uid: String) {
        room(roomId).child("hostUid").setValue(uid).await()
    }

    // --- who is playing ------------------------------------------------------

    /** Published once on joining: see [WireProfile] for why it is not per frame. */
    suspend fun publishProfile(roomId: String, uid: String, profile: WireProfile) {
        room(roomId).child("profiles").child(uid).setValue(
            mapOf("json" to json.encodeToString(WireProfile.serializer(), profile)),
        ).await()
    }

    /** Everyone's profile, for whoever is simulating. Junk is dropped. */
    suspend fun profiles(roomId: String): Map<String, WireProfile> {
        val snap = room(roomId).child("profiles").get().await()
        return snap.children.mapNotNull { c ->
            val uid = c.key ?: return@mapNotNull null
            val raw = c.child("json").getValue(String::class.java) ?: return@mapNotNull null
            val p = runCatching { json.decodeFromString(WireProfile.serializer(), raw) }.getOrNull()
                ?: return@mapNotNull null
            uid to p
        }.toMap()
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
