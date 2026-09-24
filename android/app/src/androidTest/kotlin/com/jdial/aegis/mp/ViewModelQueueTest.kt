package com.jdial.aegis.mp

import android.app.Application
import androidx.test.platform.app.InstrumentationRegistry
import com.jdial.aegis.AegisViewModel
import com.jdial.aegis.data.PlayerClass
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The view model actually reaching the queue.
 *
 * The session layer is covered by [RelayFlowTest]; what is only reachable here
 * is the wiring: that the settings toggle gates it, that opening the lobby
 * starts looking, that a run then begins seated in a room, and -- most
 * importantly -- that every one of those failing still leaves a playable game.
 *
 * Needs the emulator suite and `adb reverse` (see the README). The debug build
 * falls back to a local emulator when there is no google-services.json, which
 * is what makes this runnable without a Firebase project.
 */
class ViewModelQueueTest {
    private lateinit var app: Application

    @Before
    fun setUp() {
        app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as Application
        // A clean slate: these write real files in the app's data directory.
        app.filesDir.listFiles()?.forEach { if (it.isFile) it.delete() }
    }

    private fun vm() = AegisViewModel(app)

    @Test
    fun offlineByDefaultTheQueueIsNeverTouched() = runBlocking {
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        vm.enterQueue(vm.data.dungeons.first(), "normal")
        delay(2_000)
        assertEquals(
            "multiplayer is opt-in: nothing should have happened",
            QueueStatus.Offline, vm.queueStatus.value,
        )
    }

    /**
     * The privacy promise, made checkable: with multiplayer off, a whole
     * session -- settings, lobby open and closed, a run played and abandoned --
     * never builds the backend, so no Firebase code runs and nothing connects.
     *
     * Firebase's own startup provider is removed from the manifest, and the app
     * has no other networking code, so the backend is the only way out. Run
     * this with the device in airplane mode too; see the README.
     */
    @Test
    fun singlePlayerNeverBuildsTheBackend() = runBlocking {
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        val dungeon = vm.data.dungeons.first()

        // Everything the UI does on the way to a run.
        vm.multiplayerAvailable
        vm.enterQueue(dungeon, "normal")
        vm.cancelQueue()
        vm.enterQueue(dungeon, "normal")
        vm.startDungeon(dungeon, "normal")

        withTimeout(20_000) { while (!vm.state.value.isCombatActive) delay(100) }
        val at = vm.state.value.combatElapsedTicks
        withTimeout(20_000) { while (vm.state.value.combatElapsedTicks <= at + 20) delay(200) }
        vm.abandonDungeon()
        delay(500)

        assertTrue("single player built the multiplayer backend", !vm.touchedNetwork)
    }

    @Test
    fun withMultiplayerOnOpeningTheLobbyStartsLooking() = runBlocking {
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        vm.updateSettings { it.copy(multiplayer = true) }
        vm.enterQueue(vm.data.dungeons.first(), "normal")

        val status = withTimeout(40_000) {
            var s = vm.queueStatus.value
            while (s is QueueStatus.Offline) {
                delay(250)
                s = vm.queueStatus.value
            }
            s
        }
        assertTrue("expected the queue to engage, got $status", status !is QueueStatus.Offline)
        assertTrue("and not to fail outright: $status", status !is QueueStatus.Failed)
        vm.cancelQueue()
    }

    @Test
    fun aSoloQueueStartsARunSeatedInARoom() = runBlocking {
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        vm.updateSettings { it.copy(multiplayer = true) }
        val dungeon = vm.data.dungeons.first()
        vm.enterQueue(dungeon, "normal")

        // Nobody else is queueing, so this is the cold-start path: wait out the
        // group timer, then start with the AI filling every other seat.
        withTimeout(40_000) {
            while (vm.queueStatus.value !is QueueStatus.Ready) delay(250)
        }
        val ready = vm.queueStatus.value as QueueStatus.Ready
        assertEquals("alone in the queue", 1, ready.humans)
        assertTrue("and therefore hosting", ready.isHost)

        // The lobby already formed the room, so entering must use it rather
        // than queueing again -- which would make the player sit through the
        // whole group timer a second time after pressing Enter.
        val entered = System.currentTimeMillis()
        vm.startDungeon(dungeon, "normal")
        withTimeout(20_000) { while (!vm.state.value.isCombatActive) delay(100) }
        val waited = System.currentTimeMillis() - entered
        assertTrue("entering took ${waited}ms: the lobby's room was not reused", waited < 3_000)

        // The fight runs, and this client is simulating it.
        val at = vm.state.value.combatElapsedTicks
        withTimeout(20_000) { while (vm.state.value.combatElapsedTicks <= at) delay(200) }
        assertEquals("a healer hosts from slot 5", "5", vm.state.value.localUnitId)
        assertTrue("the party is real", vm.state.value.party.size == 5)
        vm.abandonDungeon()
    }

    @Test
    fun aQueueThatCannotBeReachedStillLetsYouPlay() = runBlocking {
        // The property that matters most: "the queue is broken" must never mean
        // "you cannot play".
        //
        // Note what this does and does not prove. In the normal suite the
        // emulators are reachable, so it only covers queueing inline from
        // startDungeon. It proves the unreachable case only when run with the
        // ports *not* forwarded:
        //   adb reverse --remove-all
        //   ./gradlew :app:connectedDebugAndroidTest \
        //     -Pandroid.testInstrumentationRunnerArguments.class=\
        //     com.jdial.aegis.mp.ViewModelQueueTest#aQueueThatCannotBeReachedStillLetsYouPlay
        // which was done when this was written: the run started within a second.
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        vm.updateSettings { it.copy(multiplayer = true) }
        val dungeon = vm.data.dungeons.first()

        // No enterQueue first: startDungeon has to cope with queueing inline,
        // and here there is no room to be had within its own timeout.
        vm.startDungeon(dungeon, "normal")
        withTimeout(60_000) { while (!vm.state.value.isCombatActive) delay(200) }
        val at = vm.state.value.combatElapsedTicks
        withTimeout(20_000) { while (vm.state.value.combatElapsedTicks <= at) delay(200) }
        assertTrue("the run must advance regardless", vm.state.value.combatElapsedTicks > at)
        vm.abandonDungeon()
    }

    /** The same app instance and identity the view model's debug backend uses. */
    private fun sameBackend() = FirebaseBackend.forEmulator(
        context = app,
        host = "127.0.0.1",
        authPort = 9099,
        firestorePort = 8080,
        databasePort = 9000,
        projectId = "overheal-local",
    )

    private suspend fun playSoloRoom(vm: AegisViewModel): String {
        vm.selectClass(PlayerClass.PRIEST)
        vm.updateSettings { it.copy(multiplayer = true) }
        val dungeon = vm.data.dungeons.first()
        vm.enterQueue(dungeon, "normal")
        withTimeout(40_000) { while (vm.queueStatus.value !is QueueStatus.Ready) delay(250) }
        vm.startDungeon(dungeon, "normal")
        withTimeout(20_000) { while (!vm.state.value.isCombatActive) delay(100) }
        val uid = sameBackend().currentUid()!!
        val roomId = roomIdFor(dungeon.id, listOf(uid))
        withTimeout(20_000) { while (!EmulatorAdmin.databaseHas("rooms/$roomId/hostUid")) delay(250) }
        return roomId
    }

    /** A host alone in its room deletes it on the way out; nobody is left to take over. */
    @Test
    fun abandoningASoloRoomLeavesNothingBehind() = runBlocking {
        val vm = vm()
        val roomId = playSoloRoom(vm)
        assertTrue(EmulatorAdmin.firestoreHas("rooms/$roomId"))

        vm.abandonDungeon()
        withTimeout(20_000) { while (EmulatorAdmin.databaseHas("rooms/$roomId")) delay(250) }
        withTimeout(20_000) { while (EmulatorAdmin.firestoreHas("rooms/$roomId")) delay(250) }
    }

    /** The deletion path: account, queue entry and hosted room, all gone. */
    @Test
    fun deletingMyDataRemovesTheAccountAndWhatItHeld() = runBlocking {
        val vm = vm()
        val roomId = playSoloRoom(vm)
        val uid = sameBackend().currentUid()!!

        vm.forgetMultiplayerData()
        val result = withTimeout(30_000) {
            var r = vm.forgetResult.value
            while (r == null) { delay(250); r = vm.forgetResult.value }
            r
        }
        assertEquals(ForgetResult.Deleted, result)
        assertTrue("multiplayer must be switched off", !vm.settings.value.multiplayer)
        assertTrue("the anonymous account must be gone", sameBackend().currentUid() == null)
        assertTrue("its hosted room must be gone", !EmulatorAdmin.databaseHas("rooms/$roomId"))
        assertTrue("and the room's queue record", !EmulatorAdmin.firestoreHas("rooms/$roomId"))
        assertTrue("and any queue entry", !EmulatorAdmin.firestoreHas("queue/$uid"))

        // A new queue must mint a new identity, not resurrect the old one.
        val fresh = sameBackend().signIn()
        assertTrue("a deleted account must not come back", fresh != uid)
        vm.abandonDungeon()
    }

    @Test
    fun deletingDataThatWasNeverCreatedTouchesNothing() = runBlocking {
        // A player who never queued has no account to delete, and pressing the
        // button must not create one to find that out.
        sameBackend().signOut()
        val vm = vm()
        vm.selectClass(PlayerClass.PRIEST)
        vm.forgetMultiplayerData()
        val result = withTimeout(20_000) {
            var r = vm.forgetResult.value
            while (r == null) { delay(100); r = vm.forgetResult.value }
            r
        }
        assertEquals(ForgetResult.NothingHeld, result)
        assertTrue("it must not have signed in to check", sameBackend().currentUid() == null)
    }
}
