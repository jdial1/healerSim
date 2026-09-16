package com.jdial.aegis.mp

import com.jdial.aegis.sim.UnitRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The wire format, and specifically what it does with garbage.
 *
 * Every document read here was written by another player's client. The reason
 * these parsers return null rather than throwing is that one person sending
 * junk must not be able to crash everybody else's app.
 */
class WireTest {
    private val entry = QueueEntry("alice", UnitRole.TANK, "d1", 1234L)
    private val room = Room(
        id = "d1_alice_bob",
        hostUid = "alice",
        dungeonId = "d1",
        pace = "normal",
        members = listOf(
            RoomMember("alice", "1", UnitRole.TANK),
            RoomMember("bob", "5", UnitRole.HEALER),
        ),
        memberUids = listOf("alice", "bob"),
        formedAtMs = 99L,
    )

    @Test
    fun `a queue entry survives a round trip`() {
        assertEquals(entry, queueEntryFrom(entry.toMap()))
    }

    @Test
    fun `a room survives a round trip`() {
        assertEquals(room, roomFrom(room.toMap()))
    }

    @Test
    fun `firestore hands numbers back as Long, and that still parses`() {
        // Firestore normalises every integer to Long. A parser that only
        // accepted Int would work in these tests and fail against the service.
        val m = entry.toMap() + ("enqueuedAt" to 7L)
        assertEquals(7L, queueEntryFrom(m)?.enqueuedAtMs)
    }

    @Test
    fun `a missing or malformed field yields null rather than an exception`() {
        for (key in entry.toMap().keys) {
            assertNull("dropping $key should not parse", queueEntryFrom(entry.toMap() - key))
        }
        assertNull(queueEntryFrom(entry.toMap() + ("role" to "GOD")))
        assertNull(queueEntryFrom(entry.toMap() + ("uid" to 5)))
    }

    @Test
    fun `a room with junk in its member list is rejected whole`() {
        assertNull(roomFrom(room.toMap() + ("members" to listOf("not a map"))))
        assertNull(roomFrom(room.toMap() + ("members" to "not a list")))
        assertNull(roomFrom(room.toMap() + ("memberUids" to listOf(1, 2))))
    }

    @Test
    fun `a room whose memberUids disagree with its members is rejected`() {
        // memberUids is what the security rules are evaluated against. If it
        // says someone is in the room and the members list does not, the two
        // are not describing the same room and neither should be trusted.
        assertNull(roomFrom(room.toMap() + ("memberUids" to listOf("alice", "mallory"))))
        assertNull(roomFrom(room.toMap() + ("memberUids" to listOf("alice"))))
    }
}
