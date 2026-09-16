package com.jdial.aegis.mp

import android.content.Context
import com.google.firebase.FirebaseApp
import com.jdial.aegis.BuildConfig
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Filter
import kotlinx.coroutines.tasks.await

/**
 * The queue and room documents, over Firestore.
 *
 * Deliberately thin. Everything that decides *who plays with whom* is in
 * [formRoom], which is pure and tested without a network; this reads documents,
 * writes documents, and drops anything that does not parse. Nothing here should
 * ever need to be reasoned about to answer "why was I put in that group".
 *
 * Identity is Firebase Anonymous Auth: a verifiable uid with no sign-in and no
 * personal data. A hand-rolled id in filesDir would be cheaper and wrong --
 * `allowBackup="true"` means it would be cloned onto a restored device, so two
 * installs would claim the same player.
 *
 * **Single player never constructs this.** Multiplayer is opt-in; offline is the
 * default and does not touch the network.
 */
class FirebaseBackend private constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    /** The live relay. Null until a room exists; see [Relay]. */
    val relay: Relay,
) {
    companion object {
        private const val APP_NAME = "overheal-mp"

        /**
         * The backend, or null when this build has no Firebase configuration.
         *
         * google-services.json is not committed -- it is per-project config --
         * so a fresh clone builds and runs with multiplayer simply unavailable
         * rather than crashing on launch. That is a supported state, not a
         * broken one.
         */
        /**
         * Whether multiplayer can work in this build, without starting it.
         *
         * Reads the generated resources and nothing else. The settings screen
         * asks this on every open, and asking must not be what initialises
         * Firebase -- with multiplayer off, nothing of it runs.
         */
        fun isConfigured(context: Context): Boolean =
            BuildConfig.FIREBASE_EMULATOR || FirebaseOptions.fromResource(context) != null

        fun createOrNull(context: Context): FirebaseBackend? {
            // Debug builds use the local emulator suite unless built with
            // -Paegis.firebase=prod: the instrumented tests create and delete
            // real accounts and rooms, and must never do it to production.
            // When the emulators are not running, queueing fails and the lobby
            // says so before playing solo -- the same path a dropped network
            // takes.
            if (BuildConfig.FIREBASE_EMULATOR) {
                return runCatching {
                    forEmulator(
                        context = context,
                        host = "127.0.0.1",
                        authPort = 9099,
                        firestorePort = 8080,
                        databasePort = 9000,
                        projectId = "overheal-local",
                    )
                }.getOrNull()
            }
            // The startup provider is removed from the manifest, so the default
            // app exists only if this has run before in this process. No
            // google-services.json means null: the game plays offline, which is
            // a supported state rather than a broken one.
            val app = runCatching { FirebaseApp.getInstance() }.getOrNull()
                ?: runCatching { FirebaseApp.initializeApp(context) }.getOrNull()
                ?: return null
            return FirebaseBackend(
                FirebaseAuth.getInstance(app),
                FirebaseFirestore.getInstance(app),
                Relay(FirebaseDatabase.getInstance(app)),
            )
        }

        /**
         * A backend pointed at a locally running emulator suite.
         *
         * Used by the instrumented tests, which is the only way any of this is
         * verified: the rules are tested from Node against the same emulator,
         * and this exercises the client half against it. Takes explicit options
         * so no google-services.json is involved.
         */
        fun forEmulator(
            context: Context,
            host: String,
            authPort: Int,
            firestorePort: Int,
            databasePort: Int,
            projectId: String,
            // Two players in one test process need two identities, and an
            // identity belongs to a FirebaseApp -- so they need two of those.
            appName: String = APP_NAME,
        ): FirebaseBackend {
            val options = FirebaseOptions.Builder()
                .setProjectId(projectId)
                .setApplicationId("1:0:android:0")
                .setApiKey("emulator-does-not-check-this")
                // The namespace must be the project's *default instance*, which
                // real Firebase names "<projectId>-default-rtdb" -- not the
                // project id. Get it wrong and the emulator does not fail: it
                // serves the unknown namespace with default open rules, so
                // every security test passes for the wrong reason. That is how
                // a guest was briefly able to forge the broadcast frame.
                .setDatabaseUrl("http://$host:$databasePort/?ns=$projectId-default-rtdb")
                .build()
            val app = runCatching { FirebaseApp.getInstance(appName) }
                .getOrElse { FirebaseApp.initializeApp(context, options, appName)!! }
            val auth = FirebaseAuth.getInstance(app).apply {
                runCatching { useEmulator(host, authPort) }
            }
            val db = FirebaseFirestore.getInstance(app).apply {
                runCatching { useEmulator(host, firestorePort) }
            }
            val rtdb = FirebaseDatabase.getInstance(app).apply {
                runCatching { useEmulator(host, databasePort) }
            }
            return FirebaseBackend(auth, db, Relay(rtdb))
        }
    }

    /** Signs out, so a test can take a second identity. */
    fun signOut() = auth.signOut()

    /** Who this installation is, without signing in to find out. */
    fun currentUid(): String? = auth.currentUser?.uid

    /**
     * Deletes the anonymous account. Everything the server still holds under
     * its uid is no longer tied to an account anybody can sign in as.
     */
    suspend fun deleteAccount() {
        auth.currentUser?.delete()?.await()
        auth.signOut()
    }

    /** Every room this player is recorded in, however old. */
    suspend fun roomsOf(uid: String): List<Room> =
        db.collection("rooms")
            .where(Filter.arrayContains("memberUids", uid))
            .get().await()
            .documents.mapNotNull { doc -> doc.data?.let { roomFrom(it) } }

    /**
     * Deletes a room's queue record. The host may at any time; any member once
     * it is an hour old.
     */
    suspend fun deleteRoomRecord(roomId: String) {
        db.collection("rooms").document(roomId).delete().await()
    }

    /** The current uid, signing in anonymously if this is the first time. */
    suspend fun signIn(): String =
        auth.currentUser?.uid ?: auth.signInAnonymously().await().user!!.uid

    /**
     * Joins the queue, or re-joins over a leftover entry of our own.
     *
     * Both times are server timestamps, whatever [entry] carries -- the rules
     * refuse anything else. The longest wait hosts, so a device clock would let
     * a player make themselves host of every group they joined.
     */
    suspend fun enqueue(entry: QueueEntry) {
        val stamped = entry.toMap() + mapOf(
            "enqueuedAt" to FieldValue.serverTimestamp(),
            "lastSeen" to FieldValue.serverTimestamp(),
        )
        db.collection("queue").document(entry.uid).set(stamped).await()
    }

    /**
     * "Still here." An entry that stops being refreshed is ignored by every
     * client within QUEUE_ENTRY_TTL_MS, which is what stops a killed app from
     * hosting groups it will never create.
     *
     * Fails if the entry has gone -- swept, or removed by hand -- and the
     * caller re-joins.
     */
    suspend fun touchQueue(uid: String) {
        db.collection("queue").document(uid).update("lastSeen", FieldValue.serverTimestamp()).await()
    }

    /**
     * Deletes entries nobody has refreshed for QUEUE_ENTRY_SWEEP_MS.
     *
     * This is how an abandoned entry actually leaves the database. The rules
     * let anyone do it, judged on the server's clock, and only past a point
     * where every client is already ignoring the entry -- so a sweep can never
     * remove somebody who is still waiting. Best effort: a failure here costs
     * nothing but tidiness.
     */
    suspend fun sweepAbandoned(nowMs: Long, limit: Long = 20) {
        val cutoff = Timestamp(java.util.Date(nowMs - QUEUE_ENTRY_SWEEP_MS))
        val stale = db.collection("queue")
            .whereLessThan("lastSeen", cutoff)
            .limit(limit)
            .get().await()
        for (doc in stale.documents) runCatching { doc.reference.delete().await() }
    }

    suspend fun leaveQueue(uid: String) {
        db.collection("queue").document(uid).delete().await()
    }

    /**
     * Everyone waiting for one dungeon.
     *
     * Rows that do not parse are dropped rather than failing the read: these
     * were written by other people's clients, and one bad row must not stop
     * everybody else being matched.
     */
    suspend fun queueFor(dungeonId: String): List<QueueEntry> =
        db.collection("queue")
            .whereEqualTo("dungeonId", dungeonId)
            .get().await()
            .documents.mapNotNull { doc -> doc.data?.let { queueEntryFrom(it.withEpochMillis()) } }

    /**
     * Firestore hands server timestamps back as its own Timestamp type. Wire.kt
     * takes plain epoch millis so it can stay free of Firebase and be tested on
     * the JVM; this is the one place the two meet.
     */
    private fun Map<String, Any?>.withEpochMillis(): Map<String, Any?> =
        mapValues { (_, v) -> if (v is Timestamp) v.toDate().time else v }

    /**
     * Publishes a formed room. Only its host may do this -- see
     * firestore.rules -- and the id is derived from the group, so the other
     * members are already waiting for exactly this document.
     */
    suspend fun createRoom(room: Room) {
        db.collection("rooms").document(room.id).set(room.toMap()).await()
    }

    /**
     * The room this player has been placed in *by this queue*, if one has
     * formed yet.
     *
     * Filtered on dungeon and formation time, because an anonymous uid survives
     * app restarts and a room document survives its run: without the filter a
     * returning player was put straight back into yesterday's dead room, for
     * whichever dungeon that was.
     */
    suspend fun roomFor(uid: String, dungeonId: String, formedSinceMs: Long): Room? =
        db.collection("rooms")
            .where(Filter.arrayContains("memberUids", uid))
            .get().await()
            .documents.mapNotNull { doc -> doc.data?.let { roomFrom(it) } }
            .filter { it.dungeonId == dungeonId && it.formedAtMs >= formedSinceMs }
            .maxByOrNull { it.formedAtMs }
}
