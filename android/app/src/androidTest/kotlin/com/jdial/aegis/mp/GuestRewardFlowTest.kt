package com.jdial.aegis.mp

import androidx.test.platform.app.InstrumentationRegistry
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Action
import com.jdial.aegis.sim.DungeonOutcomeKind
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.Rng
import com.jdial.aegis.sim.TRASH_PACK_COUNT
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Two real clients, from the queue to the result screen.
 *
 * Guests used to finish a whole dungeon with no XP and no result: the engine
 * rewarded only its own player, the frame carried neither, and the host
 * deleted the room as the run ended -- so even a frame that did carry them
 * might never have been sent. This drives the real code for all of it: two
 * players queue and are matched, the host ends the run through
 * Multiplayer.endRun, and the guest has to come out with its award.
 *
 * Needs the emulator suite and `adb reverse` (see the README).
 */
class GuestRewardFlowTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val data = GameData.load { path -> ctx.assets.open(path).bufferedReader().readText() }
    private val engine = Engine(data)

    private fun backend(appName: String) = FirebaseBackend.forEmulator(
        context = ctx,
        host = "127.0.0.1",
        authPort = 9099,
        firestorePort = 8080,
        databasePort = 9000,
        projectId = "overheal-local",
        appName = appName,
    )

    @Test
    fun aGuestComesOutOfARunWithItsXpAndAResult() = runBlocking {
        // A dungeon id nobody else queues for, so no other test's leftovers
        // join this group. No underscores: room ids are split on them.
        val dungeon = data.dungeons.first().let { it.copy(id = "e2e${System.currentTimeMillis()}") }
        val hostMp = Multiplayer(engine, data, isAvailable = true) { backend("reward-host") }
        val guestMp = Multiplayer(engine, data, isAvailable = true) { backend("reward-guest") }
        val hostLocal = engine.newCharacter(PlayerClass.PRIEST, Rng(1))
        val guestLocal = engine.newCharacter(PlayerClass.WARRIOR, Rng(2))

        // The longest wait hosts, so the priest queues first.
        val (hostSession, guestSession) = coroutineScope {
            val h = async { hostMp.joinQueue(dungeon, "normal", hostLocal) }
            delay(2_000)
            val g = async { guestMp.joinQueue(dungeon, "normal", guestLocal) }
            h.await() to g.await()
        }
        requireNotNull(hostSession) { "the host never got a room: ${hostMp.status.value}" }
        requireNotNull(guestSession) { "the guest never got a room: ${guestMp.status.value}" }
        assertEquals("both players must be in the same room", hostSession.room.id, guestSession.room.id)
        assertTrue(hostSession.isHost)
        assertTrue(!guestSession.isHost)
        val guestSlot = requireNotNull(guestSession.localUnitId)

        // The host plays the run: everyone's real character, two pulls in.
        val hostSlot = requireNotNull(hostSession.localUnitId)
        val others = hostSession.buildParticipants()
        assertTrue("the host must know the guest is a person", others[guestSlot]?.isHuman == true)
        var host = engine.reduce(hostLocal, Action.StartDungeon(dungeon, "normal"), Rng(3))
        host = host.copy(
            participants = others + (hostSlot to host.me.copy(unitId = hostSlot)),
            localUnitId = hostSlot,
            trashPullsRemaining = TRASH_PACK_COUNT - 2,
        )
        host = engine.reduce(host.copy(party = host.party.map { it.copy(health = 0.0) }), Action.Tick(1), Rng(3))
        val award = requireNotNull(host.runXpAwards[guestSlot]) { "the host credited nobody in $guestSlot" }
        assertTrue("the award must be worth something", award > 0)

        // The guest is mid-run, listening, when the host ends it.
        val guestStart = engine.reduce(guestLocal, Action.StartDungeon(dungeon, "normal"), Rng(4)).let {
            it.copy(participants = mapOf(guestSlot to it.me.copy(unitId = guestSlot)), localUnitId = guestSlot)
        }
        val finalFrame = async {
            withTimeout(30_000) { guestSession.frames().first { it.outcome != null } }
        }
        delay(1_000)
        hostMp.endRun(finished = true, finalState = host)

        val guest = guestSession.render(guestStart, finalFrame.await())
        assertEquals("the guest's xp must go up by its award", guestStart.xp + award, guest.xp)
        val outcome = requireNotNull(guest.dungeonOutcome) { "the guest got no result screen" }
        assertEquals(DungeonOutcomeKind.PARTY_WIPE, outcome.kind)
        assertEquals(award, outcome.xpGained)
        assertTrue(outcome.groupStats)

        // And only then is the room gone.
        assertTrue("the room must be deleted once the run is over", !EmulatorAdmin.databaseHas("rooms/${hostSession.room.id}"))
        assertTrue(!EmulatorAdmin.firestoreHas("rooms/${hostSession.room.id}"))
    }

    /**
     * A room deleted under a guest -- its host pressed "delete my data" -- used
     * to crash the guest's app: the frame listener fails with a permission
     * error, and nothing caught it. The guest here is the real view model; if it
     * crashes, so does this whole test run.
     */
    @Test
    fun aGuestWhoseRoomVanishesEndsTheRunInsteadOfCrashing() = runBlocking {
        val app = ctx.applicationContext as android.app.Application
        app.filesDir.listFiles()?.forEach { if (it.isFile) it.delete() }
        val dungeon = data.dungeons.first().let { it.copy(id = "lost${System.currentTimeMillis()}") }

        val hostMp = Multiplayer(engine, data, isAvailable = true) { backend("lost-host") }
        val hostJoin = async { hostMp.joinQueue(dungeon, "normal", engine.newCharacter(PlayerClass.PRIEST, Rng(1))) }
        delay(2_000)

        val vm = com.jdial.aegis.AegisViewModel(app)
        vm.selectClass(PlayerClass.WARRIOR)
        vm.updateSettings { it.copy(multiplayer = true) }
        vm.enterQueue(dungeon, "normal")
        withTimeout(40_000) { while (vm.queueStatus.value !is QueueStatus.Ready) delay(250) }
        assertTrue("the view model should be the guest", !(vm.queueStatus.value as QueueStatus.Ready).isHost)
        val hostSession = requireNotNull(hostJoin.await())
        // Keep the host alive, or the view model takes the room over after a
        // few quiet seconds -- and a host has no frame listener to lose, so the
        // test would pass without ever reaching the code it is for.
        val beating = launch {
            while (true) {
                runCatching { hostSession.reconcileHost() }
                delay(1_500)
            }
        }

        vm.startDungeon(dungeon, "normal")
        withTimeout(20_000) { while (!vm.state.value.isCombatActive) delay(100) }
        val host = engine.reduce(engine.newCharacter(PlayerClass.PRIEST, Rng(1)), Action.StartDungeon(dungeon, "normal"), Rng(3))
        hostSession.publish(host)
        delay(1_000)

        hostSession.reconcileHost()
        assertTrue("the host must still hold the room, or the guest path is not being tested", hostSession.isHost)
        // The host deletes the room with the guest still in it.
        beating.cancel()
        backend("lost-host").relay.deleteRoom(hostSession.room.id)
        backend("lost-host").deleteRoomRecord(hostSession.room.id)

        withTimeout(15_000) { while (vm.state.value.isCombatActive) delay(250) }
        assertTrue("a lost room is not a result", vm.state.value.dungeonOutcome == null)

        // Tidy up, and wait for it: this deletes the account the view model
        // shares with other test classes, and left running in the background
        // it signed the next test out part-way through.
        vm.forgetMultiplayerData()
        withTimeout(20_000) { while (vm.forgetResult.value == null) delay(100) }
    }
}
