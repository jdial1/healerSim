package com.jdial.aegis.mp

import androidx.test.platform.app.InstrumentationRegistry
import com.jdial.aegis.sim.UnitRole
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
        backend.enqueue(QueueEntry(uid, UnitRole.HEALER, dungeon, 1_000L))
        val waiting = backend.queueFor(dungeon)
        assertEquals(listOf(QueueEntry(uid, UnitRole.HEALER, dungeon, 1_000L)), waiting)
        backend.leaveQueue(uid)
        assertTrue("leaving should empty the queue", backend.queueFor(dungeon).isEmpty())
    }

    @Test
    fun anotherDungeonsQueueIsNotThisOne() = runBlocking {
        backend.enqueue(QueueEntry(uid, UnitRole.DPS, dungeon, 1L))
        assertTrue(backend.queueFor("$dungeon-elsewhere").isEmpty())
        backend.leaveQueue(uid)
    }

    /**
     * The whole cold-start path end to end: queue alone, wait out the timer,
     * form a room with four AI seats, publish it, and find it again.
     */
    @Test
    fun aSoloQueueFormsARoomAndThatRoomIsReadableByItsMember() = runBlocking {
        backend.enqueue(QueueEntry(uid, UnitRole.TANK, dungeon, 0L))
        val waiting = backend.queueFor(dungeon)

        assertNull(
            "before the deadline there is nothing to publish",
            formRoom(waiting, dungeon, "normal", nowMs = 5_000L, maxWaitMs = 20_000L),
        )
        val room = formRoom(waiting, dungeon, "normal", nowMs = 20_000L, maxWaitMs = 20_000L)
        assertNotNull("past the deadline a lone player must still get a room", room)

        backend.createRoom(room!!)
        val found = backend.roomFor(uid)
        assertEquals(room, found)
        assertEquals("the tank takes slot 1", "1", found!!.members.single().unitId)
        assertEquals("and hosts, being the only human", uid, found.hostUid)

        backend.leaveQueue(uid)
    }
}
