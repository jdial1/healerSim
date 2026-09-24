package com.jdial.aegis.mp

import com.jdial.aegis.sim.UnitRole

/**
 * Firestore documents in and out.
 *
 * Written by hand rather than through kotlinx.serialization or Firestore's
 * reflective `toObject`, for one reason: **every document here was written by
 * somebody else's client.** A stranger's queue entry is untrusted input, and a
 * mapper that throws on a missing field turns "one person sent junk" into
 * "everyone else's app crashes". These return null instead, and the caller
 * drops the row.
 *
 * It also keeps the field names in one visible place. R8 renaming a property
 * silently is already a known hazard here -- verifyMinifiedSaveContract exists
 * because of it -- and a reflective mapper would extend that from this device's
 * save to every client disagreeing with the host.
 */

private fun Map<String, Any?>.str(key: String): String? = this[key] as? String
private fun Map<String, Any?>.long(key: String): Long? = when (val v = this[key]) {
    is Long -> v
    is Int -> v.toLong()
    is Double -> v.toLong()
    else -> null
}

private fun roleOf(name: String?): UnitRole? =
    UnitRole.entries.firstOrNull { it.name == name }

/**
 * The time fields here are placeholders on the way out: the backend replaces
 * both with server timestamps, which the rules insist on. On the way in, the
 * backend has already turned those timestamps into epoch millis, which is what
 * keeps this file free of Firebase types and testable on the JVM.
 */
fun QueueEntry.toMap(): Map<String, Any> = mapOf(
    "uid" to uid,
    "role" to role.name,
    "dungeonId" to dungeonId,
    "enqueuedAt" to enqueuedAtMs,
    "lastSeen" to lastSeenMs,
)

fun queueEntryFrom(m: Map<String, Any?>): QueueEntry? = QueueEntry(
    uid = m.str("uid") ?: return null,
    role = roleOf(m.str("role")) ?: return null,
    dungeonId = m.str("dungeonId") ?: return null,
    enqueuedAtMs = m.long("enqueuedAt") ?: return null,
    lastSeenMs = m.long("lastSeen") ?: return null,
)

fun RoomMember.toMap(): Map<String, Any> =
    mapOf("uid" to uid, "unitId" to unitId, "role" to role.name)

fun roomMemberFrom(m: Map<String, Any?>): RoomMember? = RoomMember(
    uid = m.str("uid") ?: return null,
    unitId = m.str("unitId") ?: return null,
    role = roleOf(m.str("role")) ?: return null,
)

fun Room.toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "hostUid" to hostUid,
    "dungeonId" to dungeonId,
    "pace" to pace,
    "members" to members.map { it.toMap() },
    "memberUids" to memberUids,
    "formedAtMs" to formedAtMs,
)

@Suppress("UNCHECKED_CAST")
fun roomFrom(m: Map<String, Any?>): Room? {
    val rawMembers = m["members"] as? List<*> ?: return null
    val members = rawMembers.map { raw ->
        val map = raw as? Map<String, Any?> ?: return null
        roomMemberFrom(map) ?: return null
    }
    val uids = (m["memberUids"] as? List<*>)?.map { it as? String ?: return null } ?: return null
    // A room whose memberUids disagree with its members is not a room this
    // client should join: the security rule that decides who may read and write
    // it is evaluated against memberUids, so the two disagreeing means somebody
    // is trying to be in a room they are not in.
    if (uids != members.map { it.uid }) return null
    return Room(
        id = m.str("id") ?: return null,
        hostUid = m.str("hostUid") ?: return null,
        dungeonId = m.str("dungeonId") ?: return null,
        pace = m.str("pace") ?: return null,
        members = members,
        memberUids = uids,
        formedAtMs = m.long("formedAtMs") ?: return null,
    )
}
