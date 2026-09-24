package com.jdial.aegis.mp

import androidx.test.platform.app.InstrumentationRegistry
import com.jdial.aegis.sim.UnitRole
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The queue against a real Firestore, with the real security rules applied.
 *
 * Runs against the local emulator suite, so it needs no Firebase project and no
 * Google account:
 *
 * ```
 * cd firebase && npm run emulators                       # one terminal
 * adb reverse tcp:9099 tcp:9099 && adb reverse tcp:8080 tcp:8080
 * cd android && ./gradlew :app:connectedDebugAndroidTest
 * ```
 *
 * `adb reverse` rather than the usual 10.0.2.2: on this setup an app process
 * cannot reach the host through the emulator's NAT even though `adb shell` can,
 * and a forwarded port removes the NAT from the path entirely. It also means
 * the same test works on a physical device over USB.
 *
 * Cleartext to 127.0.0.1 is allowed by src/debug/res/xml/network_security_config.xml
 * and by nothing in a release build.
 *
 * The pure matchmaker is covered by MatchmakingTest and the rules by
 * firebase/rules.test.mjs. What is only reachable here is the seam between
 * them: that the documents this client writes are the documents the rules
 * expect, and the ones it reads back parse.
 *
 * 10.0.2.2 is the host machine as seen from inside an Android emulator.
 */
class QueueFlowTest {
    private lateinit var backend: FirebaseBackend
    private lateinit var uid: String

    private val dungeon = "androidtest-${System.currentTimeMillis()}"

    @Before
    fun signIn() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        backend = FirebaseBackend.forEmulator(
            context = ctx,
            host = "127.0.0.1",
            authPort = 9099,
            firestorePort = 8080,
            databasePort = 9000,
            projectId = "overheal-local",
        )
        uid = runBlocking { backend.signIn() }
    }

    @Test
    fun anonymousSignInYieldsAStableUid() {
        assertTrue("a uid should look like a uid, got '$uid'", uid.isNotEmpty())
        assertEquals("signing in twice must not mint a second identity", uid, runBlocking { backend.signIn() })
    }

    @Test
    fun aPlayerCanJoinTheQueueAndReadThemselvesBack() = runBlocking {
        val before = System.currentTimeMillis()
        backend.enqueue(QueueEntry(uid, UnitRole.HEALER, dungeon, enqueuedAtMs = 0L))
        val mine = backend.queueFor(dungeon).single()
        assertEquals(uid, mine.uid)
        assertEquals(UnitRole.HEALER, mine.role)
        // The placeholder time must not survive: the server stamps both.
        assertTrue(
            "join time should be the server's, got ${mine.enqueuedAtMs}",
            mine.enqueuedAtMs > before - CLOCK_SLACK_MS,
        )
        assertEquals("a fresh entry was last seen when it joined", mine.enqueuedAtMs, mine.lastSeenMs)
        backend.leaveQueue(uid)
        assertTrue("leaving should empty the queue", backend.queueFor(dungeon).isEmpty())
    }

    @Test
    fun anotherDungeonsQueueIsNotThisOne() = runBlocking {
        backend.enqueue(QueueEntry(uid, UnitRole.DPS, dungeon, enqueuedAtMs = 0L))
        assertTrue(backend.queueFor("$dungeon-elsewhere").isEmpty())
        backend.leaveQueue(uid)
    }

    @Test
    fun aRefreshMovesLastSeenButNotTheQueuePosition() = runBlocking {
        backend.enqueue(QueueEntry(uid, UnitRole.DPS, dungeon, enqueuedAtMs = 0L))
        val first = backend.queueFor(dungeon).single()
        delay(1_200)
        backend.touchQueue(uid)
        val second = backend.queueFor(dungeon).single()
        assertEquals("the queue position must not move", first.enqueuedAtMs, second.enqueuedAtMs)
        assertTrue("lastSeen must", second.lastSeenMs > first.lastSeenMs)
        backend.leaveQueue(uid)
    }

    /**
     * The whole cold-start path end to end, on the server's clock: queue
     * alone, keep refreshing past the group timer, form a room with four AI
     * seats, publish it, and find it again.
     */
    @Test
    fun aSoloQueueFormsARoomAndThatRoomIsReadableByItsMember() = runBlocking {
        val groupWait = 2_000L
        backend.enqueue(QueueEntry(uid, UnitRole.TANK, dungeon, enqueuedAtMs = 0L))
        val joined = backend.queueFor(dungeon).single()

        assertNull(
            "before the deadline there is nothing to publish",
            formRoom(listOf(joined), dungeon, "normal", nowMs = joined.lastSeenMs, maxWaitMs = groupWait),
        )

        // Wait out the timer as a real client does: still refreshing.
        delay(groupWait + 500)
        backend.touchQueue(uid)
        val waiting = backend.queueFor(dungeon)
        val now = waiting.single().lastSeenMs
        val room = formRoom(waiting, dungeon, "normal", nowMs = now, maxWaitMs = groupWait)
        assertNotNull("past the deadline a lone player must still get a room", room)

        backend.createRoom(room!!)
        val found = backend.roomFor(uid, dungeon, formedSinceMs = joined.enqueuedAtMs)
        assertEquals(room, found)
        // Slots come from the *host's* layout, so the host is last exactly as a
        // single player is -- generateParty builds that same shape.
        assertEquals("the host takes the slot single player would", "5", found!!.members.single().unitId)
        assertEquals("and hosts, being the only human", uid, found.hostUid)

        backend.leaveQueue(uid)
    }

    /**
     * An anonymous uid survives restarts and a room survives its run. A
     * returning player must be put in the room this queue formed, not straight
     * back into yesterday's.
     */
    @Test
    fun aReturningPlayerIsNotPutBackIntoAnOldRoom() = runBlocking {
        val old = Room(
            id = roomIdFor(dungeon, listOf(uid)) + "_old",
            hostUid = uid,
            dungeonId = dungeon,
            pace = "normal",
            members = listOf(RoomMember(uid, "5", UnitRole.TANK)),
            memberUids = listOf(uid),
            formedAtMs = 1L,
        )
        backend.createRoom(old.copy(id = "${dungeon}_$uid"))

        backend.enqueue(QueueEntry(uid, UnitRole.TANK, dungeon, enqueuedAtMs = 0L))
        val joined = backend.queueFor(dungeon).single()
        assertNull(
            "a room formed before this queue must not be joined",
            backend.roomFor(uid, dungeon, formedSinceMs = joined.enqueuedAtMs),
        )
        assertNull(
            "nor one for another dungeon",
            backend.roomFor(uid, "$dungeon-elsewhere", formedSinceMs = 0L),
        )
        backend.leaveQueue(uid)
    }

    /**
     * An abandoned entry, as a killed app leaves it, is swept by the next
     * client that queues -- and a live one survives the same sweep.
     *
     * The abandoned entry needs a second identity, and a server time an hour
     * old that no client is allowed to write, so it is seeded over the emulator's
     * admin REST endpoint, which bypasses the rules exactly as a stale document
     * left behind would.
     */
    @Test
    fun aSweepRemovesAbandonedEntriesAndLeavesLiveOnes() = runBlocking {
        val ghost = "ghost-${System.currentTimeMillis()}"
        seedAbandonedEntry(ghost)
        backend.enqueue(QueueEntry(uid, UnitRole.HEALER, dungeon, enqueuedAtMs = 0L))

        val before = backend.queueFor(dungeon)
        assertEquals("the seed should be visible", setOf(ghost, uid), before.map { it.uid }.toSet())
        val now = before.first { it.uid == uid }.lastSeenMs
        assertTrue(
            "matchmaking already ignores the ghost",
            selectMembers(before, dungeon, now).none { it.uid == ghost },
        )

        backend.sweepAbandoned(now)

        assertEquals(
            "the sweep removes the ghost and nobody else",
            listOf(uid), backend.queueFor(dungeon).map { it.uid },
        )
        backend.leaveQueue(uid)
    }

    private fun seedAbandonedEntry(ghostUid: String) {
        val hourAgo = java.time.Instant.ofEpochMilli(System.currentTimeMillis() - 3_600_000L).toString()
        val body = """{"fields":{
            "uid":{"stringValue":"$ghostUid"},
            "role":{"stringValue":"TANK"},
            "dungeonId":{"stringValue":"$dungeon"},
            "enqueuedAt":{"timestampValue":"$hourAgo"},
            "lastSeen":{"timestampValue":"$hourAgo"}}}"""
        val url = java.net.URL(
            "http://127.0.0.1:8080/v1/projects/overheal-local/databases/(default)/documents/queue" +
                "?documentId=$ghostUid",
        )
        val c = url.openConnection() as java.net.HttpURLConnection
        c.requestMethod = "POST"
        // The emulator treats this token as an admin, which skips the rules.
        c.setRequestProperty("Authorization", "Bearer owner")
        c.setRequestProperty("Content-Type", "application/json")
        c.doOutput = true
        c.outputStream.use { it.write(body.toByteArray()) }
        val code = c.responseCode
        check(code in 200..299) { "seeding failed: $code ${c.errorStream?.bufferedReader()?.readText()}" }
    }

    private companion object {
        /** Device and emulator clocks are close, not equal. */
        const val CLOCK_SLACK_MS = 60_000L
    }
}
