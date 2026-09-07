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
        // The other four seats are simply absent, and become AI. A lone healer
        // sits in slot 5, which is where single player has always put them.
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
        // The tank hosts here (longest wait), so the layout is the tank's own:
        // three DPS, the healer, then the host last -- exactly what
        // generateParty builds for a tank in single player.
        assertEquals(
            listOf("1" to "d1", "2" to "d2", "3" to "d3", "4" to "heal", "5" to "tank"),
            room.members.map { it.unitId to it.uid },
        )
        room.members.forEach {
            assertEquals("slot ${it.unitId}", roomPartyRoles(UnitRole.TANK)[it.unitId.toInt() - 1], it.role)
        }
        assertEquals("the host takes the slot single player would", "5", room.members.last().unitId)
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
        // The tank hosts, so the tank is last and the healer takes slot 4.
        assertEquals(listOf("4", "5"), room.members.map { it.unitId })
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

    // --- host migration ------------------------------------------------------

    private val members = listOf("carol", "alice", "bob")

    @Test
    fun `a host that is still beating keeps the room`() {
        val seen = members.associateWith { 1_000L }
        assertEquals("carol", electHost(members, seen, "carol", nowMs = 1_500L))
    }

    @Test
    fun `a lower uid joining later does not take the room from a live host`() {
        // Migrating on merely seeing a better candidate would pass the room
        // around for no reason, and every migration costs a rollback to the
        // last published frame.
        val seen = members.associateWith { 1_000L }
        assertEquals("carol", electHost(members, seen, "carol", nowMs = 1_000L))
    }

    @Test
    fun `when the host goes quiet the lowest live uid takes over`() {
        val seen = mapOf("carol" to 0L, "alice" to 9_000L, "bob" to 9_000L)
        assertEquals("alice", electHost(members, seen, "carol", nowMs = 10_000L))
    }

    @Test
    fun `every client reaches the same answer from the same heartbeats`() {
        // Two clients each concluding they are host, and publishing over each
        // other, is the failure this has to make impossible.
        val seen = mapOf("carol" to 0L, "alice" to 9_000L, "bob" to 9_100L)
        val answers = listOf(members, members.reversed(), members.sorted())
            .map { electHost(it, seen, "carol", nowMs = 10_000L) }
        assertEquals(1, answers.toSet().size)
    }

    @Test
    fun `a dead host with nobody left alive keeps the job`() {
        // Including when the caller is the one whose clock stopped. Somebody
        // wrongly keeping the room is recoverable; nobody holding it is not.
        val seen = members.associateWith { 0L }
        assertEquals("carol", electHost(members, seen, "carol", nowMs = 100_000L))
    }

    @Test
    fun `a member who has never been heard from is not elected`() {
        val seen = mapOf("carol" to 0L, "bob" to 9_000L)
        assertEquals("bob", electHost(members, seen, "carol", nowMs = 10_000L))
    }
}
