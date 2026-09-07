package com.jdial.aegis.mp

import com.jdial.aegis.sim.UnitRole
import kotlinx.serialization.Serializable

/**
 * Forming a group out of a public queue.
 *
 * Deliberately pure: no Firebase, no Android, no clock. The backend's job is to
 * hand this a list and store what comes back, and everything that decides *who
 * plays with whom* is a function of its arguments -- which is what makes it
 * testable without a network, and what would let the same code run on a server
 * if authority ever moves there.
 *
 * The rule the whole design rests on: **a group never fails to form.** Waiting
 * for four strangers in a queue nobody else is in is a dead feature, so past the
 * deadline the room starts with whoever turned up and the AI fills the rest.
 * A solo queue is therefore a normal room with four AI slots, which is also what
 * single player already is.
 */

/** A player waiting in the public queue. */
@Serializable
data class QueueEntry(
    val uid: String,
    val role: UnitRole,
    val dungeonId: String,
    val enqueuedAtMs: Long,
)

/** One human's seat in a formed room. AI slots are simply absent. */
@Serializable
data class RoomMember(val uid: String, val unitId: String, val role: UnitRole)

@Serializable
data class Room(
    val id: String,
    val hostUid: String,
    val dungeonId: String,
    val pace: String,
    val members: List<RoomMember>,
    /**
     * The uids in [members], flat.
     *
     * Redundant, and deliberately so: Firestore security rules and queries
     * cannot index into an array of maps, so "is the caller a member of this
     * room" is only expressible against a flat array of ids. Without it the
     * room document would have to be world-readable. Derived in [formRoom] and
     * asserted against [members] in the tests, so the two cannot drift.
     */
    val memberUids: List<String>,
    val formedAtMs: Long,
)

/**
 * Slot roles for a room, in slot order.
 *
 * Fixed, unlike `partyRoles(playerRole)`, which is written from one player's
 * point of view and always puts them in slot 5. That is fine when there is
 * exactly one human and it is what parity/golden.json records, but two humans
 * cannot both be last. Rooms therefore use an absolute layout and single player
 * keeps the relative one.
 */
val ROOM_PARTY_ROLES: List<UnitRole> = listOf(
    UnitRole.TANK, UnitRole.DPS, UnitRole.DPS, UnitRole.DPS, UnitRole.HEALER,
)

/** How many of each role a party has room for. */
private fun capacity(role: UnitRole) = ROOM_PARTY_ROLES.count { it == role }

/**
 * The queue in the order it will be served: longest wait first, ties broken by
 * uid so two clients running this on the same snapshot agree.
 */
private fun List<QueueEntry>.served() = sortedWith(compareBy({ it.enqueuedAtMs }, { it.uid }))

/**
 * Who gets a seat, given everyone waiting for one dungeon.
 *
 * Overflow stays in the queue rather than being dropped: a fourth DPS is not
 * rejected, they are simply not in *this* group.
 */
fun selectMembers(waiting: List<QueueEntry>, dungeonId: String): List<QueueEntry> {
    val taken = mutableMapOf<UnitRole, Int>()
    return waiting.filter { it.dungeonId == dungeonId }.served().filter { entry ->
        val used = taken.getOrDefault(entry.role, 0)
        if (used < capacity(entry.role)) {
            taken[entry.role] = used + 1
            true
        } else {
            false
        }
    }
}

/** Assigns each selected player the first free slot their role can hold. */
fun assignSlots(selected: List<QueueEntry>): List<RoomMember> {
    val unseated = selected.toMutableList()
    return ROOM_PARTY_ROLES.mapIndexedNotNull { i, role ->
        val entry = unseated.firstOrNull { it.role == role } ?: return@mapIndexedNotNull null
        unseated.remove(entry)
        RoomMember(uid = entry.uid, unitId = "${i + 1}", role = role)
    }
}

/**
 * A room, or null to keep waiting.
 *
 * Forms as soon as every seat is spoken for, and otherwise once the
 * longest-waiting player has been in the queue for [maxWaitMs] -- at which
 * point the empty seats become AI. The host is that longest-waiting player:
 * deterministic, so two clients computing this from the same snapshot pick the
 * same one, and it is the person who has already proved they are still here.
 */
/**
 * The room id a given group will use.
 *
 * Derived from the members rather than random, so every client that computes
 * the same group also computes the same id. Only the host is allowed to create
 * the document -- see firestore.rules -- and everyone else simply waits for
 * that id to appear, which is why nobody has to coordinate about it.
 */
fun roomIdFor(dungeonId: String, memberUids: List<String>): String =
    (listOf(dungeonId) + memberUids.sorted()).joinToString("_")

fun formRoom(
    waiting: List<QueueEntry>,
    dungeonId: String,
    pace: String,
    nowMs: Long,
    maxWaitMs: Long,
): Room? {
    val selected = selectMembers(waiting, dungeonId)
    if (selected.isEmpty()) return null
    val full = selected.size == ROOM_PARTY_ROLES.size
    val waited = nowMs - selected.first().enqueuedAtMs
    if (!full && waited < maxWaitMs) return null
    val members = assignSlots(selected)
    val uids = members.map { it.uid }
    return Room(
        id = roomIdFor(dungeonId, uids),
        hostUid = selected.first().uid,
        dungeonId = dungeonId,
        pace = pace,
        members = members,
        memberUids = uids,
        formedAtMs = nowMs,
    )
}

// --- staying alive -----------------------------------------------------------

/**
 * How long a client may go unheard from before it is presumed gone.
 *
 * Long enough to ride out a stall or a lock-screen, short enough that a room
 * does not sit frozen while everyone waits. The host writes its heartbeat every
 * tick; missing several in a row is what counts.
 */
const val HEARTBEAT_TIMEOUT_MS = 6_000L

/**
 * Who should be hosting now.
 *
 * Every client evaluates this over the same heartbeats, so they reach the same
 * answer without negotiating -- the same property that lets the queue form a
 * group without a server. Ties break on lowest uid, as the plan specifies,
 * because it is the only ordering every client already agrees on.
 *
 * The sitting host keeps the job while it is still being heard from, even if a
 * lower uid joins later: migrating on merely *seeing* a better candidate would
 * hand the room around for no reason, and every migration costs a rollback to
 * the last published frame.
 *
 * Returns the current host when nobody at all has been heard from recently --
 * including when the caller is the one whose clock has stopped. Someone
 * mistakenly keeping the job is recoverable; two clients each concluding they
 * are host, and publishing over each other, is not.
 */
fun electHost(
    memberUids: List<String>,
    lastSeenMs: Map<String, Long>,
    currentHost: String,
    nowMs: Long,
    timeoutMs: Long = HEARTBEAT_TIMEOUT_MS,
): String {
    fun alive(uid: String) = lastSeenMs[uid]?.let { nowMs - it <= timeoutMs } == true
    if (alive(currentHost)) return currentHost
    return memberUids.filter(::alive).minOrNull() ?: currentHost
}
