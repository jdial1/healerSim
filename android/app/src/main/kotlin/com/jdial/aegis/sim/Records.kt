package com.jdial.aegis.sim

import kotlinx.serialization.Serializable

/**
 * What a character has to show for a dungeon.
 *
 * Kept in the save beside the talents, never in [GameState]: a run does not
 * read its own history, and the parity corpus compares game state only.
 */
@Serializable
data class DungeonRecord(
    val clears: Int = 0,
    /** The fastest clear, in ticks; 0 until the first one. */
    val bestTicks: Int = 0,
    val lastTicks: Int = 0,
    val bestDps: Double = 0.0,
    val bestHps: Double = 0.0,
    /**
     * The most healing ever got out of a point of mana here.
     *
     * [bestDps] and [bestHps] are volume: a player who fires everything
     * constantly beats one who waited. This is the number that rewards the
     * waiting, and it is the only record a healer can improve without going
     * faster.
     */
    val bestHpm: Double = 0.0,
    /**
     * The least of this seat's own effort ever wasted here, as a percentage.
     *
     * -1 until the first clear, because nought percent waste is a real and
     * excellent reading and cannot double as "unset" the way [bestTicks]'s zero
     * can.
     *
     * Measured against this character's own history and nothing else. A single
     * threshold could not work: waste means overheal to a healer, a defensive
     * left ready to a tank and damage past the line to a damage dealer, and the
     * three do not live on the same scale. Your own best is the only comparison
     * that means the same thing in every seat -- and the only one this soul
     * allows.
     */
    val lowestWastePct: Double = -1.0,
    /** Cleared with nobody down. */
    val clean: Boolean = false,
    /** Cleared with every kickable cast kicked. */
    val sharp: Boolean = false,
)

/** What a finished run added: for the outcome screen to shout about. */
data class RunHighlights(
    val newBest: Boolean = false,
    val firstClear: Boolean = false,
    val clean: Boolean = false,
    val sharp: Boolean = false,
    /** The charm this clear handed over, if it was the first one here. */
    val charm: com.jdial.aegis.data.Charm? = null,
    /** The keystone level this clear unlocked, if it pushed one. */
    val keystone: Int = 0,
    /** The consumable this clear dropped. */
    val found: com.jdial.aegis.data.Spell? = null,
    /** Less of this seat's effort wasted here than ever before. */
    val leanest: Boolean = false,
) {
    val any: Boolean get() =
        newBest || firstClear || clean || sharp || leanest ||
            charm != null || keystone > 0 || found != null
}

/** A cleared dungeon's mark on the record, and what it was worth saying. */
fun Map<String, DungeonRecord>.withRun(outcome: DungeonOutcome): Pair<Map<String, DungeonRecord>, RunHighlights> {
    if (outcome.kind != DungeonOutcomeKind.SUCCESS) return this to RunHighlights()
    val key = recordKey(outcome.dungeonId, outcome.hardMode)
    val was = this[key] ?: DungeonRecord()
    val clean = outcome.deaths == 0
    val sharp = outcome.missedKicks == 0
    val newBest = outcome.clearTicks > 0 && (was.bestTicks == 0 || outcome.clearTicks < was.bestTicks)
    // Time and waste pull against each other -- firing everything is fast and
    // wasteful -- so they are kept as two records rather than combined. A run
    // can set one, the other, both, or neither, and there is deliberately no
    // score that says which clear was better.
    val leanest = was.lowestWastePct < 0 || outcome.stats.wastePct < was.lowestWastePct
    val now = was.copy(
        clears = was.clears + 1,
        bestTicks = if (newBest) outcome.clearTicks else was.bestTicks,
        lastTicks = outcome.clearTicks,
        bestDps = maxOf(was.bestDps, outcome.stats.dps),
        bestHps = maxOf(was.bestHps, outcome.stats.hps),
        bestHpm = maxOf(was.bestHpm, outcome.stats.hpm),
        lowestWastePct = if (leanest) outcome.stats.wastePct else was.lowestWastePct,
        clean = was.clean || clean,
        sharp = was.sharp || sharp,
    )
    return (this + (key to now)) to RunHighlights(
        newBest = newBest && was.clears > 0,
        firstClear = was.clears == 0,
        clean = clean && !was.clean,
        sharp = sharp && !was.sharp,
        leanest = leanest && was.clears > 0,
    )
}

/** Hard mode keeps its own record under the same dungeon. */
fun recordKey(dungeonId: String, hard: Boolean): String = if (hard) "$dungeonId+hard" else dungeonId

/** A clear time as a player reads it: 1:42. */
fun clearTimeLabel(ticks: Int): String = "%d:%02d".format(ticks / 600, (ticks / 10) % 60)

private val TITLES = listOf(
    1 to "the Delver",
    3 to "the Steady",
    8 to "the Unbroken",
)

/**
 * The name a character has earned, from the marks on its record. The highest
 * reached, so it reads as a rank rather than a list.
 */
fun titleFor(records: Map<String, DungeonRecord>, coreDungeons: Int): String? {
    val cleared = records.values.count { it.clears > 0 }
    val clean = records.values.count { it.clean }
    val sharp = records.values.count { it.sharp }
    if (coreDungeons > 0 && cleared >= coreDungeons) return "Dungeonmaster"
    if (sharp >= 8) return "the Merciless"
    if (sharp >= 3) return "the Sharp"
    return TITLES.lastOrNull { (need, _) -> clean >= need || (need == 1 && cleared >= 1) }?.second
}

/** The colour a character's own sprite wears, earned by clearing dungeons. */
fun sigilTint(records: Map<String, DungeonRecord>): Long? {
    val cleared = records.values.count { it.clears > 0 }
    return when {
        cleared >= 16 -> 0xFFC084FC
        cleared >= 12 -> 0xFFFFD700
        cleared >= 8 -> 0xFFCBD5E1
        cleared >= 4 -> 0xFFB87333
        else -> null
    }
}
