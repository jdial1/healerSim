package com.jdial.aegis.mp

import com.jdial.aegis.sim.UnitRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The queue, with no network anywhere near it.
 *
 * The point of keeping this pure is that the interesting failures -- a group
 * that never forms, two clients disagreeing about who hosts, a fourth DPS
 * silently deleted -- are all reachable from a list and a clock reading.
 */
class MatchmakingTest {
    private val wait = 20_000L
    private val dungeon = "d1"

    private fun q(uid: String, role: UnitRole, at: Long, d: String = dungeon) =
        QueueEntry(uid = uid, role = role, dungeonId = d, enqueuedAtMs = at)

    private fun fullQueue(at: Long = 0) = listOf(
        q("tank", UnitRole.TANK, at),
        q("d1", UnitRole.DPS, at + 1),
        q("d2", UnitRole.DPS, at + 2),
        q("d3", UnitRole.DPS, at + 3),
        q("heal", UnitRole.HEALER, at + 4),
    )

    @Test
    fun `a full group forms immediately, without waiting out the timer`() {
        val room = formRoom(fullQueue(), dungeon, "normal", nowMs = 1, maxWaitMs = wait)
        assertEquals(5, room?.members?.size)
    }

    @Test
    fun `an incomplete group waits`() {
        val room = formRoom(
            listOf(q("tank", UnitRole.TANK, 0)), dungeon, "normal",
            nowMs = wait - 1, maxWaitMs = wait,
        )
        assertNull("nobody has waited long enough yet", room)
    }

    @Test
    fun `a lone player starts anyway once the timer expires`() {
        // The cold-start answer. A public queue nobody else is in must still
        // produce a dungeon, or the feature is dead on arrival.
        val room = formRoom(
            listOf(q("solo", UnitRole.HEALER, 0)), dungeon, "normal",
            nowMs = wait, maxWaitMs = wait,
        )
        assertEquals(1, room?.members?.size)
        assertEquals("solo", room?.hostUid)
        // The other four seats are simply absent, and become AI.
        assertEquals("5", room?.members?.single()?.unitId)
    }

    @Test
    fun `overflow stays in the queue rather than being dropped`() {
        val waiting = fullQueue() + q("d4", UnitRole.DPS, 99)
        val selected = selectMembers(waiting, dungeon)
        assertEquals(5, selected.size)
        assertTrue("the fourth dps is not in this group", selected.none { it.uid == "d4" })
    }

    @Test
    fun `only this dungeon's queue is considered`() {
        val waiting = fullQueue() + q("elsewhere", UnitRole.TANK, -1, d = "other")
        val room = formRoom(waiting, dungeon, "normal", 1, wait)
        assertTrue(room!!.members.none { it.uid == "elsewhere" })
        // And the longest wait in *this* queue hosts, not the global one.
        assertEquals("tank", room.hostUid)
    }

    @Test
    fun `slots follow the room layout, and each role lands on a slot that holds it`() {
        val room = formRoom(fullQueue(), dungeon, "normal", 1, wait)!!
        assertEquals(
            listOf("1" to "tank", "2" to "d1", "3" to "d2", "4" to "d3", "5" to "heal"),
            room.members.map { it.unitId to it.uid },
        )
        room.members.forEach {
            assertEquals("slot ${it.unitId}", ROOM_PARTY_ROLES[it.unitId.toInt() - 1], it.role)
        }
    }

    @Test
    fun `two clients computing from the same snapshot agree`() {
        // Both sides run this; if the order of the snapshot could change the
        // answer they would disagree about who hosts and form two rooms.
        val shuffled = fullQueue().reversed()
        val a = formRoom(fullQueue(), dungeon, "normal", 1, wait)
        val b = formRoom(shuffled, dungeon, "normal", 1, wait)
        assertEquals(a, b)
    }

    @Test
    fun `ties on enqueue time break on uid rather than on list order`() {
        val same = listOf(q("zeta", UnitRole.TANK, 5), q("alpha", UnitRole.TANK, 5))
        assertEquals("alpha", selectMembers(same, dungeon).first().uid)
        assertEquals("alpha", selectMembers(same.reversed(), dungeon).first().uid)
    }

    @Test
    fun `an empty queue forms nothing`() {
        assertNull(formRoom(emptyList(), dungeon, "normal", 999_999, wait))
    }

    @Test
    fun `a partial group past the deadline takes everyone who is there`() {
        val waiting = listOf(q("tank", UnitRole.TANK, 0), q("heal", UnitRole.HEALER, 100))
        val room = formRoom(waiting, dungeon, "normal", nowMs = wait, maxWaitMs = wait)!!
        assertEquals(2, room.members.size)
        assertEquals(listOf("1", "5"), room.members.map { it.unitId })
    }

    @Test
    fun `memberUids always matches members`() {
        // It exists only so a security rule can ask "am I in this room" -- if it
        // ever disagrees with members, the rule is protecting the wrong people.
        for (waiting in listOf(fullQueue(), listOf(q("solo", UnitRole.DPS, 0)))) {
            val room = formRoom(waiting, dungeon, "normal", nowMs = wait, maxWaitMs = wait)!!
            assertEquals(room.members.map { it.uid }, room.memberUids)
        }
    }

    @Test
    fun `the room id is derived from the group, so every client computes the same one`() {
        // Only the host may create the room document; the others wait for that
        // id to appear. If the id were random they would wait forever.
        val a = formRoom(fullQueue(), dungeon, "normal", 1, wait)!!
        val b = formRoom(fullQueue().reversed(), dungeon, "normal", 1, wait)!!
        assertEquals(a.id, b.id)
        assertEquals(roomIdFor(dungeon, a.memberUids), a.id)
        // And a different group is a different room.
        val solo = formRoom(listOf(q("solo", UnitRole.TANK, 0)), dungeon, "normal", wait, wait)!!
        assertTrue(solo.id != a.id)
    }
}
