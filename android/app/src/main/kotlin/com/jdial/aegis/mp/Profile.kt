package com.jdial.aegis.mp

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.PLAYER_MAX_LEVEL
import com.jdial.aegis.sim.Participant
import com.jdial.aegis.sim.TalentRank
import com.jdial.aegis.sim.UnitRole
import kotlinx.serialization.Serializable

/**
 * Who a player is, sent once when they join a room.
 *
 * The frame deliberately carries no class, level, talents or spell list: they
 * do not change during a run, and sending the talent tree four times a second
 * was 83% of the payload. But somebody has to know them -- the host simulates
 * everyone, and after a migration that host is a different phone. So they go
 * once, here, and any member can reconstruct the party from them.
 *
 * Stored the way the save file stores a character: an id and a rank count per
 * talent, with the loadout *derived* on the other side rather than transmitted.
 * That is the same trick `SaveStore.restore` already uses, it keeps a profile
 * to a few hundred bytes, and it means a client cannot claim spells its talents
 * do not grant -- the receiver rebuilds the loadout from the tree it holds
 * itself rather than believing a list.
 */
@Serializable
data class WireProfile(
    val unitId: String,
    val playerClass: String,
    val level: Int,
    val talentRanks: Map<String, Int> = emptyMap(),
    /** Bar order only. Honoured when it holds the same spells the loadout grants. */
    val actionBar: List<String> = emptyList(),
)

fun Participant.toProfile(): WireProfile? {
    val cls = playerClass ?: return null
    return WireProfile(
        unitId = unitId,
        playerClass = cls.name,
        level = level,
        talentRanks = talents.filter { it.points > 0 }.associate { it.id to it.points },
        actionBar = activeActionBars,
    )
}

/**
 * Rebuilds a participant from a profile, using this client's own content.
 *
 * Everything derivable is derived: talents are looked up in the local tree,
 * the spell loadout is built from them, and the mana pool comes from the stats
 * table. A malformed or unknown profile yields null and the slot stays AI,
 * which is the same outcome as that player having disconnected -- a stranger's
 * bad document must not be able to stop a run.
 */
fun WireProfile.toParticipant(engine: Engine): Participant? {
    val cls = PlayerClass.entries.firstOrNull { it.name == playerClass } ?: return null
    val level = level.coerceIn(1, PLAYER_MAX_LEVEL)
    val talents = engine.data.bundle(cls).talents.map { t ->
        TalentRank(t, (talentRanks[t.id] ?: 0).coerceIn(0, t.maxPoints))
    }
    val loadout = engine.progression.buildSpellLoadout(cls, talents)
    val bar = actionBar.takeIf {
        it.size == loadout.actionBar.size && it.sorted() == loadout.actionBar.sorted()
    } ?: loadout.actionBar
    val maxMana = engine.stats.maxMana(cls, level, talents)
    val role = runCatching { UnitRole.valueOf(engine.data.bundle(cls).meta.role) }
        .getOrDefault(UnitRole.HEALER)
    return Participant(
        unitId = unitId,
        playerClass = cls,
        level = level,
        talents = talents,
        unlockedSpells = loadout.unlockedSpells,
        activeActionBars = bar,
        role = role,
        maxMana = maxMana,
        mana = maxMana.toDouble(),
        isHuman = true,
    )
}
