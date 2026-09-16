package com.jdial.aegis.mp

import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.sim.BossBuff
import com.jdial.aegis.sim.CombatPhase
import com.jdial.aegis.sim.DungeonOutcomeKind
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.DungeonOutcome
import com.jdial.aegis.sim.FloatingText
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.Participant
import com.jdial.aegis.sim.PlayerBuff
import com.jdial.aegis.sim.Unit
import com.jdial.aegis.sim.UnitDebuff
import kotlinx.serialization.Serializable

/**
 * What the host broadcasts, and all a guest needs to draw a frame.
 *
 * Not GameState. Two reasons, one of them measured and one structural.
 *
 * **Measured.** A mid-combat GameState serialises to 17,839 bytes, of which
 * 14,753 -- 83% -- is the talent tree: every [com.jdial.aegis.data.TalentRank]
 * embeds its whole Talent definition. Talents do not change during a run and
 * every client already holds the same tree in its assets, so sending them four
 * times a second is the entire payload problem. They travel once, in the join
 * handshake, and never again. `currentDungeon` is a further 915 bytes and is
 * likewise a constant; the wire carries its id.
 *
 * **Structural.** A guest does not simulate, so it has no business receiving
 * the host's rng, its accumulators, or its own copy of anyone's progression. A
 * snapshot that is a subset by *construction* cannot leak those by accident the
 * way "GameState minus a few fields" eventually would.
 *
 * The types inside are the engine's own -- Unit, PlayerBuff, BossBuff -- rather
 * than parallel wire copies. Those are already small and already serialisable,
 * and a second definition of a party member is a second thing to keep in step.
 */
@Serializable
data class Snapshot(
    /** Monotonic, so a frame that arrives out of order can be dropped. */
    val tick: Int,
    val dungeonId: String,
    val pace: String,
    val phase: CombatPhase,
    val trashPullsRemaining: Int,
    val progress: Double,
    val combatActive: Boolean,
    val enemyHealth: Double,
    val enemyMaxHealth: Double,
    val enemyTargetId: String?,
    val bossSelfBuffs: List<BossBuff> = emptyList(),
    val enemyDebuffs: List<UnitDebuff> = emptyList(),
    val party: List<Unit> = emptyList(),
    val players: List<WirePlayer> = emptyList(),
    val floats: List<FloatingText> = emptyList(),
    /**
     * XP awarded this run so far, per party slot -- the host's ledger. A guest
     * applies the increase over what it has already applied. See
     * GameState.runXpAwards.
     */
    val xpAwarded: Map<String, Int> = emptyMap(),
    /**
     * How the run ended, in the final frame only. The host's own copy: a guest
     * rebuilds its outcome around it with its own XP and level-up.
     */
    val outcome: DungeonOutcome? = null,
)

/**
 * One player's resources, as everyone else's client needs to see them.
 *
 * Carries no class, level, talents or spell list: those are static, arrived in
 * the handshake, and are what made the payload large.
 */
@Serializable
data class WirePlayer(
    val unitId: String,
    val mana: Double,
    val maxMana: Int,
    val spellCooldowns: Map<String, Int> = emptyMap(),
    val globalCooldownRemaining: Int = 0,
    val playerCombatBuffs: List<PlayerBuff> = emptyList(),
    val holyPower: Int = 0,
    val capstoneForm: String? = null,
    /** Rage, energy or recent damage -- a guest has to see what it can spend. */
    val classResource: Double = 0.0,
    val comboPoints: Int = 0,
)

fun Participant.toWire() = WirePlayer(
    unitId = unitId,
    mana = mana,
    maxMana = maxMana,
    spellCooldowns = spellCooldowns,
    globalCooldownRemaining = globalCooldownRemaining,
    playerCombatBuffs = playerCombatBuffs,
    holyPower = holyPower,
    capstoneForm = capstoneForm,
    classResource = classResource,
    comboPoints = comboPoints,
)

fun GameState.toSnapshot(): Snapshot = Snapshot(
    tick = combatElapsedTicks,
    dungeonId = currentDungeon?.id.orEmpty(),
    pace = dungeonPace.orEmpty(),
    phase = combatPhase,
    trashPullsRemaining = trashPullsRemaining,
    progress = dungeonProgress,
    combatActive = isCombatActive,
    enemyHealth = enemyHealth,
    enemyMaxHealth = enemyMaxHealth,
    enemyTargetId = enemyTargetId,
    bossSelfBuffs = bossSelfBuffs,
    enemyDebuffs = enemyDebuffs,
    party = party,
    // Sorted so two hosts serialising the same state produce the same bytes,
    // which is what lets a test compare frames rather than parse them.
    players = participants.values.sortedBy { it.unitId }.map { it.toWire() },
    floats = floatingCombatTexts,
    xpAwarded = runXpAwards,
    outcome = dungeonOutcome,
)

/**
 * A guest's renderable state: this snapshot laid over what it already knows.
 *
 * The guest's own class, level, talents and spell loadout are kept from [local]
 * and never taken from the wire -- they are its own character, the host has no
 * authority over them, and they are not sent. Everything the fight consists of
 * comes from the host.
 *
 * [dungeon] is looked up from the client's own content by [Snapshot.dungeonId],
 * which is why the dungeon is not on the wire.
 */
fun Snapshot.applyTo(local: GameState, dungeon: Dungeon?): GameState {
    val byId = players.associateBy { it.unitId }
    val merged = local.participants.mapValues { (id, p) ->
        val w = byId[id] ?: return@mapValues p
        p.copy(
            mana = w.mana,
            maxMana = w.maxMana,
            spellCooldowns = w.spellCooldowns,
            globalCooldownRemaining = w.globalCooldownRemaining,
            playerCombatBuffs = w.playerCombatBuffs,
            holyPower = w.holyPower,
            capstoneForm = w.capstoneForm,
            classResource = w.classResource,
            comboPoints = w.comboPoints,
        )
    }
    return local.copy(
        participants = merged,
        currentDungeon = dungeon,
        dungeonPace = pace.ifEmpty { null },
        combatPhase = phase,
        trashPullsRemaining = trashPullsRemaining,
        dungeonProgress = progress,
        isCombatActive = combatActive,
        enemyHealth = enemyHealth,
        enemyMaxHealth = enemyMaxHealth,
        enemyTargetId = enemyTargetId,
        bossSelfBuffs = bossSelfBuffs,
        enemyDebuffs = enemyDebuffs,
        party = party,
        combatElapsedTicks = tick,
        floatingCombatTexts = floats,
    )
}

/**
 * What the host awarded this player, applied once.
 *
 * The award is the host's to decide -- that is the accepted trade of a
 * host-authoritative room -- but the progression is this client's own:
 * its level, talent points and mana pool move exactly as the engine moves
 * them for a player who earned the XP locally, and the result is saved like
 * any other run. Only the *increase* over what was already applied is
 * added, so a frame seen twice adds nothing.
 */
fun Snapshot.rewardGuest(engine: Engine, before: GameState, shown: GameState, slot: String): GameState {
    val awarded = xpAwarded[slot] ?: 0
    val applied = before.runXpAwards[slot] ?: 0
    var s = shown
    if (awarded > applied) {
        s = engine.awardXp(s, awarded - applied)
            .copy(runXpAwards = before.runXpAwards + (slot to awarded))
    }

    val hostOutcome = outcome
    if (hostOutcome == null || before.dungeonOutcome != null) return s

    // The run just ended for this player. Build the result around the
    // host's -- same ending, same dungeon, the group's numbers -- with this
    // player's own XP and whatever their own level-up unlocked.
    val cls = s.playerClass
    val rewards = if (cls != null && s.level > before.level) {
        engine.progression.levelUpRewards(cls, s.talents, before.level, s.level)
    } else {
        null
    }
    return s.copy(
        dungeonOutcome = hostOutcome.copy(
            xpGained = awarded,
            leveledUp = s.level > before.level,
            upgradedSpellIds = rewards?.upgradedSpellIds.orEmpty(),
            upgradedPotion = rewards?.upgradedPotion == true,
            groupStats = true,
        ),
        completedDungeonIds =
            if (hostOutcome.kind == DungeonOutcomeKind.SUCCESS && hostOutcome.dungeonId !in s.completedDungeonIds) {
                s.completedDungeonIds + hostOutcome.dungeonId
            } else {
                s.completedDungeonIds
            },
    )
}
