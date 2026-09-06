package com.jdial.aegis.mp

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
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
        fun createOrNull(context: Context): FirebaseBackend? {
            val app = runCatching { FirebaseApp.initializeApp(context) }.getOrNull() ?: return null
            return FirebaseBackend(FirebaseAuth.getInstance(app), FirebaseFirestore.getInstance(app))
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
            projectId: String,
        ): FirebaseBackend {
            val options = FirebaseOptions.Builder()
                .setProjectId(projectId)
                .setApplicationId("1:0:android:0")
                .setApiKey("emulator-does-not-check-this")
                .build()
            val app = runCatching { FirebaseApp.getInstance(APP_NAME) }
                .getOrElse { FirebaseApp.initializeApp(context, options, APP_NAME)!! }
            val auth = FirebaseAuth.getInstance(app).apply {
                runCatching { useEmulator(host, authPort) }
            }
            val db = FirebaseFirestore.getInstance(app).apply {
                runCatching { useEmulator(host, firestorePort) }
            }
            return FirebaseBackend(auth, db)
        }
    }

    /** The current uid, signing in anonymously if this is the first time. */
    suspend fun signIn(): String =
        auth.currentUser?.uid ?: auth.signInAnonymously().await().user!!.uid

    /** Joins the queue. The document id is the uid, so joining twice replaces. */
    suspend fun enqueue(entry: QueueEntry) {
        db.collection("queue").document(entry.uid).set(entry.toMap()).await()
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
            .documents.mapNotNull { doc -> doc.data?.let { queueEntryFrom(it) } }

    /**
     * Publishes a formed room. Only its host may do this -- see
     * firestore.rules -- and the id is derived from the group, so the other
     * members are already waiting for exactly this document.
     */
    suspend fun createRoom(room: Room) {
        db.collection("rooms").document(room.id).set(room.toMap()).await()
    }

    /** The room this player has been placed in, if one has formed yet. */
    suspend fun roomFor(uid: String): Room? =
        db.collection("rooms")
            .where(Filter.arrayContains("memberUids", uid))
            .get().await()
            .documents.firstNotNullOfOrNull { doc -> doc.data?.let { roomFrom(it) } }
}
