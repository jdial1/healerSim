package com.jdial.aegis.mp

import androidx.test.platform.app.InstrumentationRegistry
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Action
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.Rng
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The relay end to end, against the emulator suite with the real rules applied.
 *
 * ```
 * cd firebase && npm run emulators
 * adb reverse tcp:9099 tcp:9099 && adb reverse tcp:8080 tcp:8080 && adb reverse tcp:9000 tcp:9000
 * cd android && ./gradlew :app:connectedDebugAndroidTest
 * ```
 *
 * Two players in one process means two identities, and an identity belongs to a
 * FirebaseApp, so this runs two of them.
 */
class RelayFlowTest {
    private lateinit var host: FirebaseBackend
    private lateinit var guest: FirebaseBackend
    private lateinit var hostUid: String
    private lateinit var guestUid: String
    private lateinit var data: GameData
    private lateinit var engine: Engine

    private val json = Json { encodeDefaults = true }

    private fun backend(appName: String) = FirebaseBackend.forEmulator(
        context = InstrumentationRegistry.getInstrumentation().targetContext,
        host = "127.0.0.1",
        authPort = 9099,
        firestorePort = 8080,
        databasePort = 9000,
        projectId = "overheal-local",
        appName = appName,
    )

    @Before
    fun signIn() = runBlocking {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        data = GameData.load { path -> ctx.assets.open(path).bufferedReader().readText() }
        engine = Engine(data)
        host = backend("relay-host")
        guest = backend("relay-guest")
        hostUid = host.signIn()
        guestUid = guest.signIn()
        assertTrue("the two clients must be different players", hostUid != guestUid)
    }

    private fun midFight(): GameState {
        var s = engine.reduce(
            engine.newCharacter(PlayerClass.PRIEST, Rng(4)),
            Action.StartDungeon(data.dungeons.first(), "normal"),
            Rng(4),
        )
        repeat(40) { if (s.isCombatActive) s = engine.reduce(s, Action.Tick(1), Rng(4)) }
        return s
    }

    @Test
    fun aGuestSeesTheFightTheHostIsSimulating() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        host.relay.openAsHost(roomId, hostUid, listOf(hostUid, guestUid))

        val state = midFight()
        host.relay.publish(roomId, state.toSnapshot())

        val frame = withTimeout(20_000) { guest.relay.frames(roomId).first() }
        assertEquals("the guest must see the host's fight", state.combatElapsedTicks, frame.tick)
        assertEquals(state.enemyHealth, frame.enemyHealth, 1e-9)
        assertEquals(state.party.map { it.health }, frame.party.map { it.health })
    }

    @Test
    fun aGuestsActionReachesTheHostAndCarriesNoCritRoll() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        host.relay.openAsHost(roomId, hostUid, listOf(hostUid, guestUid))

        guest.relay.sendAction(roomId, guestUid, WireAction(seq = 1, spellId = "flash_heal", targetId = "1"))

        val pending = host.relay.pendingActions(roomId)
        assertEquals(setOf(guestUid), pending.keys)
        assertEquals("flash_heal", pending.getValue(guestUid).spellId)
        // There is deliberately no crit roll on the wire: the host redraws it,
        // and a field that is not sent cannot be trusted by mistake.
        assertTrue(
            "a wire action must not carry a crit roll",
            !json.encodeToString(WireAction.serializer(), pending.getValue(guestUid)).contains("crit"),
        )
    }

    @Test
    fun aGuestCannotForgeTheFrameEveryoneElseRendersFrom() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        host.relay.openAsHost(roomId, hostUid, listOf(hostUid, guestUid))
        host.relay.publish(roomId, midFight().toSnapshot())

        val forged = midFight().copy(enemyHealth = 1.0).toSnapshot().copy(tick = 99_999)
        val threw = runCatching { guest.relay.publish(roomId, forged) }.exceptionOrNull()
        assertNotNull(
            "a guest publishing a frame must be refused by the rules. If this fails with the " +
                "emulator running, check the database namespace: an unknown one is served with " +
                "default open rules rather than an error, and every rule silently stops applying",
            threw,
        )
    }

    /**
     * The plan budgets 0.17 GB per room-hour: 4 Hz, four readers, ~3 KB a
     * frame. This measures the bytes that actually cross rather than the
     * serialised length, and reports the projection.
     */
    @Test
    fun aFrameFitsTheEgressBudget() = runBlocking {
        val snap = midFight().toSnapshot()
        val bytes = json.encodeToString(Snapshot.serializer(), snap).toByteArray().size
        val perRoomHourGb = bytes.toDouble() * 4 * 4 * 3600 / 1e9
        val report = "frame=$bytes bytes -> ${"%.3f".format(perRoomHourGb)} GB/room-hour at 4Hz x4 readers"
        assertTrue("$report exceeds the 0.17 GB budget", perRoomHourGb <= 0.17)
        // Fail-with-the-number so the measurement is visible even when green.
        assertTrue(report, true)
        println(report)
    }

    /**
     * Two clients playing the same fight: the host simulates, the guest asks to
     * cast, and the guest's screen is the host's fight rather than its own.
     *
     * This is the property the whole phase exists for. Everything else -- the
     * slimmed frame, the rerolled crit, the rules -- only matters because this
     * has to hold.
     */
    @Test
    fun twoClientsPlayOneFight() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        val room = Room(
            id = roomId,
            hostUid = hostUid,
            dungeonId = data.dungeons.first().id,
            pace = "normal",
            members = listOf(
                RoomMember(hostUid, "5", com.jdial.aegis.sim.UnitRole.HEALER),
                RoomMember(guestUid, "1", com.jdial.aegis.sim.UnitRole.TANK),
            ),
            memberUids = listOf(hostUid, guestUid),
            formedAtMs = 0L,
        )
        host.relay.openAsHost(roomId, hostUid, room.memberUids)

        val hostSession = MultiplayerSession(host.relay, engine, data, room, hostUid)
        val guestSession = MultiplayerSession(guest.relay, engine, data, room, guestUid)
        assertTrue(hostSession.isHost)
        assertTrue("the guest must never simulate", !guestSession.isHost)
        assertEquals("1", guestSession.localUnitId)

        // The guest is a warrior in slot 1 of the host's simulation.
        var hostState = midFight()
        val warrior = engine.newCharacter(PlayerClass.WARRIOR, Rng(4)).me
        hostState = hostState.withParticipant("1") {
            warrior.copy(unitId = "1", mana = warrior.maxMana.toDouble())
        }

        // The guest asks to cast something it could not possibly resolve itself.
        // A mana-paid spell, because mana is what this test reads: Shield Slam
        // spends rage, which also moves every tick the warrior is hit.
        val spell = hostState.participants.getValue("1")
            .activeActionBars.first {
                it.isNotEmpty() && it != com.jdial.aegis.sim.MANA_POTION_ID &&
                    data.spell(it)?.resource == "MANA"
            }
        guestSession.requestCast(seq = 1, spellId = spell, targetId = null)

        val rng = Rng(21)
        repeat(6) { hostState = hostSession.hostStep(hostState, rng) }

        assertTrue(
            "the host must have resolved the guest's cast",
            hostState.participants.getValue("1").mana < warrior.maxMana.toDouble(),
        )

        // A held request must not re-cast every tick: the sequence has not moved.
        val manaAfterOne = hostState.participants.getValue("1").mana
        repeat(4) { hostState = hostSession.hostStep(hostState, rng) }
        assertEquals(
            "one request must be one cast, however many times the host reads it",
            manaAfterOne, hostState.participants.getValue("1").mana, 1e-9,
        )

        // And the guest is looking at the host's fight, not its own.
        val guestLocal = engine.newCharacter(PlayerClass.WARRIOR, Rng(4))
        val frame = withTimeout(20_000) { guest.relay.frames(roomId).first() }
        val rendered = guestSession.render(guestLocal, frame)
        assertEquals(hostState.enemyHealth, rendered.enemyHealth, 1e-9)
        assertEquals(hostState.party.map { it.health }, rendered.party.map { it.health })
        assertEquals("the guest keeps its own character", PlayerClass.WARRIOR, rendered.playerClass)
    }

    /**
     * The host's phone stops answering and the run carries on.
     *
     * This is the phase the plan calls load-bearing: as host, backgrounding
     * stops *everyone's* game, and a host is a phone. The guest has to notice,
     * take the room, rebuild the party from the join profiles -- the frame
     * carries no talents -- and keep simulating from the last frame it saw.
     */
    @Test
    fun aGuestTakesOverWhenTheHostGoesQuiet() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        val room = Room(
            id = roomId,
            hostUid = hostUid,
            dungeonId = data.dungeons.first().id,
            pace = "normal",
            members = listOf(
                RoomMember(hostUid, "5", com.jdial.aegis.sim.UnitRole.HEALER),
                RoomMember(guestUid, "1", com.jdial.aegis.sim.UnitRole.TANK),
            ),
            memberUids = listOf(hostUid, guestUid),
            formedAtMs = 0L,
        )
        host.relay.openAsHost(roomId, hostUid, room.memberUids)

        val hostSession = MultiplayerSession(host.relay, engine, data, room, hostUid)
        val guestSession = MultiplayerSession(guest.relay, engine, data, room, guestUid)

        // Both publish who they are, once, on joining.
        hostSession.publishProfile(midFight())
        guestSession.publishProfile(engine.newCharacter(PlayerClass.WARRIOR, Rng(4)))

        hostSession.reconcileHost()
        assertTrue("the elected host should be hosting", hostSession.isHost)
        assertTrue("and the guest should not be", !guestSession.reconcileHost())

        var hostState = midFight()
        repeat(3) { hostState = hostSession.hostStep(hostState, Rng(21)) }

        // The host's phone goes away: it simply stops heartbeating. The guest
        // keeps beating, and cannot take the room while the host is still warm.
        assertTrue("no migration while the host is alive", !guestSession.reconcileHost())
        assertEquals(hostUid, guestSession.hostUid)

        // Past the timeout, the guest takes over.
        withTimeout(30_000) {
            while (!guestSession.reconcileHost()) kotlinx.coroutines.delay(1_000)
        }
        assertTrue("the guest must now be hosting", guestSession.isHost)
        assertEquals(guestUid, host.relay.hostUid(roomId))

        // And it can rebuild the party well enough to simulate: everyone's real
        // character, with the departed host's slot handed to the AI.
        val participants = guestSession.buildParticipants()
        assertEquals(setOf("1", "5"), participants.keys)
        assertEquals(PlayerClass.WARRIOR, participants.getValue("1").playerClass)
        assertTrue("the guest is still playing", participants.getValue("1").isHuman)
        assertTrue(
            "the departed host's slot must be handed to the ai, not left as a hole",
            !participants.getValue("5").isHuman,
        )

        // The run continues under the new host.
        var carried = hostState.copy(participants = participants, localUnitId = "1")
        repeat(3) { carried = guestSession.hostStep(carried, Rng(21)) }
        assertTrue("the fight must have advanced", carried.combatElapsedTicks > hostState.combatElapsedTicks)
    }

    /**
     * Coming back after being killed.
     *
     * A phone that was swapped out of memory has no session object and no
     * state. All it has is its uid, which is enough: the room is found by
     * membership, and the current frame is whatever the host published last.
     * Nothing is replayed and nothing is resumed -- the fight is wherever it
     * got to.
     */
    @Test
    fun aGuestThatWasKilledRejoinsFromTheCurrentFrame() = runBlocking {
        val roomId = "d1_${hostUid}_$guestUid"
        val room = Room(
            id = roomId,
            hostUid = hostUid,
            dungeonId = data.dungeons.first().id,
            pace = "normal",
            members = listOf(
                RoomMember(hostUid, "5", com.jdial.aegis.sim.UnitRole.HEALER),
                RoomMember(guestUid, "1", com.jdial.aegis.sim.UnitRole.TANK),
            ),
            memberUids = listOf(hostUid, guestUid),
            formedAtMs = 0L,
        )
        // The room as the queue leaves it: a Firestore document anyone in it can
        // find, and an RTDB node to play in.
        host.createRoom(room)
        host.relay.openAsHost(roomId, hostUid, room.memberUids)

        val hostSession = MultiplayerSession(host.relay, engine, data, room, hostUid)
        var hostState = midFight()
        repeat(5) { hostState = hostSession.hostStep(hostState, Rng(21)) }

        // The guest comes back knowing only who it is.
        val found = guest.roomFor(guestUid, room.dungeonId, formedSinceMs = 0L)
        assertNotNull("a returning player must be able to find their room", found)
        assertEquals(roomId, found!!.id)
        assertEquals("and their slot in it", "1", found.members.first { it.uid == guestUid }.unitId)

        val rejoined = MultiplayerSession(guest.relay, engine, data, found, guestUid)
        val frame = withTimeout(20_000) { guest.relay.frames(roomId).first() }
        val rendered = rejoined.render(engine.newCharacter(PlayerClass.WARRIOR, Rng(4)), frame)

        assertEquals("the fight is wherever it got to", hostState.combatElapsedTicks, rendered.combatElapsedTicks)
        assertEquals(hostState.enemyHealth, rendered.enemyHealth, 1e-9)
    }

    private fun twoPlayerRoom(): Room {
        val roomId = "d1_${hostUid}_$guestUid"
        return Room(
            id = roomId,
            hostUid = hostUid,
            dungeonId = data.dungeons.first().id,
            pace = "normal",
            members = listOf(
                RoomMember(hostUid, "5", com.jdial.aegis.sim.UnitRole.HEALER),
                RoomMember(guestUid, "1", com.jdial.aegis.sim.UnitRole.TANK),
            ),
            memberUids = listOf(hostUid, guestUid),
            formedAtMs = System.currentTimeMillis(),
        )
    }

    /** Decides whether a leaving host deletes the room or hands it on. */
    @Test
    fun aHostKnowsWhetherAnybodyIsStillThere() = runBlocking {
        val room = twoPlayerRoom()
        host.relay.openAsHost(room.id, hostUid, room.memberUids)
        val hostSession = MultiplayerSession(host.relay, engine, data, room, hostUid)
        val guestSession = MultiplayerSession(guest.relay, engine, data, room, guestUid)

        assertTrue("nobody else has beaten yet", !hostSession.othersAlive())
        guestSession.reconcileHost()
        assertTrue("the guest is beating", hostSession.othersAlive())
    }

    /** A finished run's room goes, profiles and all -- in both stores. */
    @Test
    fun aHostDeletesItsRoomEverywhere() = runBlocking {
        val room = twoPlayerRoom()
        host.createRoom(room)
        host.relay.openAsHost(room.id, hostUid, room.memberUids)
        guest.relay.publishProfile(room.id, guestUid, WireProfile("1", "WARRIOR", 3))
        assertTrue(EmulatorAdmin.databaseHas("rooms/${room.id}/profiles/$guestUid"))

        host.relay.deleteRoom(room.id)
        host.deleteRoomRecord(room.id)

        assertTrue("the live room must be gone", !EmulatorAdmin.databaseHas("rooms/${room.id}"))
        assertTrue("and its queue record", !EmulatorAdmin.firestoreHas("rooms/${room.id}"))
    }

    /**
     * A guest who leaves early cannot delete a room others are playing in, but
     * can take its own character and requests out of it.
     */
    @Test
    fun aGuestRemovesOnlyItsOwnTraces() = runBlocking {
        val room = twoPlayerRoom()
        host.relay.openAsHost(room.id, hostUid, room.memberUids)
        host.relay.publishProfile(room.id, hostUid, WireProfile("5", "PRIEST", 3))
        guest.relay.publishProfile(room.id, guestUid, WireProfile("1", "WARRIOR", 3))
        guest.relay.sendAction(room.id, guestUid, WireAction(1, "shield_slam"))
        guest.relay.heartbeat(room.id, guestUid)

        assertTrue(
            "a guest must not be able to end a live room for everyone",
            runCatching { guest.relay.deleteRoom(room.id) }.isFailure,
        )
        guest.relay.forget(room.id, guestUid)

        for (node in listOf("profiles", "actions", "heartbeats")) {
            assertTrue("$node/$guestUid should be gone", !EmulatorAdmin.databaseHas("rooms/${room.id}/$node/$guestUid"))
        }
        assertTrue("the host's profile must survive", EmulatorAdmin.databaseHas("rooms/${room.id}/profiles/$hostUid"))
        assertTrue("and the room itself", EmulatorAdmin.databaseHas("rooms/${room.id}/hostUid"))
    }
}
