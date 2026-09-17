package com.jdial.aegis.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import com.jdial.aegis.R
import com.jdial.aegis.sim.DungeonOutcomeKind
import com.jdial.aegis.sim.GameState
import kotlinx.coroutines.flow.Flow

/**
 * The game had no sound and never vibrated. For something built around
 * split-second triage, that was the cheapest missing feeling.
 *
 * Everything here is worked out on the screen side, from the state the
 * engine already produces, so the simulation -- and the recorded single-player
 * runs it has to reproduce exactly -- is untouched.
 *
 * Sounds are Kenney's CC0 packs (see ATTRIBUTION.md). Deliberately fantasy:
 * cloth, metal, bells, strings -- nothing from the sci-fi or digital packs.
 * There is no sound per hit or per heal tick; at ten ticks a second that is
 * noise, not feedback.
 */
enum class Cue(val sound: Int, val volume: Float) {
    /** Your cast went off. Quiet: it happens constantly. */
    CAST(R.raw.sfx_cast, 0.35f),

    /** Your cast was refused -- on cooldown, or out of mana. */
    REFUSED(R.raw.sfx_refused, 0.55f),
    CRIT(R.raw.sfx_crit, 0.6f),

    /** Somebody just dropped into the danger band. */
    DANGER(R.raw.sfx_danger, 0.6f),

    /** A boss attack started winding up. Quieter than a real danger. */
    TELEGRAPH(R.raw.sfx_danger, 0.3f),

    /** A boss cast was kicked before it landed. */
    INTERRUPT(R.raw.sfx_crit, 0.8f),
    DEATH(R.raw.sfx_death, 0.8f),
    CLEAR(R.raw.sfx_clear, 0.9f),
    WIPE(R.raw.sfx_wipe, 0.9f),
}

/** What a cast tap turned into, as the view model saw it. */
enum class CastFeedback { ACCEPTED, REFUSED, SENT }

/** Below this fraction of health an ally is in danger, once per crossing. */
const val DANGER_FRACTION = 0.3

/**
 * The cues a change from [prev] to [cur] should play.
 *
 * Pure, so the rules are tested without a device. Casts are not here: whether
 * a tap was accepted is known exactly where it happens, in the view model.
 */
fun cuesBetween(prev: GameState, cur: GameState): List<Cue> = buildList {
    val ended = prev.dungeonOutcome == null && cur.dungeonOutcome != null
    if (ended) {
        add(if (cur.dungeonOutcome!!.kind == DungeonOutcomeKind.SUCCESS) Cue.CLEAR else Cue.WIPE)
        // The run's last tick replaces the party, so nothing else about it is
        // worth comparing -- and a wipe already says everyone died.
        return@buildList
    }
    if (!prev.isCombatActive || !cur.isCombatActive) return@buildList

    val cast = cur.enemyCast
    val before = prev.enemyCast
    if (before != null && cast == null && before.remainingTicks > 1) add(Cue.INTERRUPT)
    if (cast != null && (before == null || before.abilityId != cast.abilityId || before.remainingTicks < cast.remainingTicks)) {
        add(Cue.TELEGRAPH)
    }

    val seen = prev.floatingCombatTexts.mapTo(HashSet()) { it.id }
    if (cur.floatingCombatTexts.any { it.crit && it.id !in seen }) add(Cue.CRIT)

    val lastHealth = prev.party.associateBy { it.id }
    var died = false
    var danger = false
    for (u in cur.party) {
        val was = lastHealth[u.id] ?: continue
        if (was.isAlive && !u.isAlive) died = true
        if (u.isAlive && u.maxHealth > 0 && was.maxHealth > 0 &&
            was.health / was.maxHealth >= DANGER_FRACTION &&
            u.health / u.maxHealth < DANGER_FRACTION
        ) {
            danger = true
        }
    }
    // A death outranks the warning that usually comes a moment before it.
    if (died) add(Cue.DEATH) else if (danger) add(Cue.DANGER)
}

private fun Cue.haptic(): HapticFeedbackType = when (this) {
    Cue.CAST, Cue.TELEGRAPH -> HapticFeedbackType.SegmentTick
    Cue.REFUSED -> HapticFeedbackType.Reject
    Cue.CRIT, Cue.INTERRUPT -> HapticFeedbackType.Confirm
    Cue.DANGER, Cue.DEATH, Cue.WIPE -> HapticFeedbackType.LongPress
    Cue.CLEAR -> HapticFeedbackType.Confirm
}

/**
 * Some cues arrive in bursts -- several allies dipping in one pull, a string of
 * crits -- and a phone that buzzes on every one teaches the player to ignore
 * it. This is the shortest gap between two of the same cue.
 */
private fun Cue.minGapMs(): Long = when (this) {
    Cue.DANGER -> 1_500
    Cue.CRIT -> 400
    Cue.CAST, Cue.REFUSED -> 80
    else -> 0
}

/** A small SoundPool holding the seven cues. */
private class SoundBoard(context: Context) {
    private val pool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    private val ids = Cue.entries.associateWith { pool.load(context, it.sound, 1) }
    private val ready = HashSet<Int>()

    init {
        pool.setOnLoadCompleteListener { _, id, status -> if (status == 0) ready += id }
    }

    fun play(cue: Cue) {
        val id = ids.getValue(cue)
        // A cue that has not finished loading is skipped, not queued: it would
        // otherwise play late, attached to nothing.
        if (id in ready) pool.play(id, cue.volume, cue.volume, 1, 0, 1f)
    }

    fun release() = pool.release()
}

/**
 * Plays sound and haptics for whatever happens in [state], and for cast taps
 * reported on [casts]. Place it once, alongside the combat screen.
 */
@Composable
fun CombatFeedback(state: GameState, casts: Flow<CastFeedback>, sound: Boolean, haptics: Boolean) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val board = remember { SoundBoard(context.applicationContext) }
    DisposableEffect(board) { onDispose { board.release() } }

    val soundOn by rememberUpdatedState(sound)
    val hapticsOn by rememberUpdatedState(haptics)
    val lastPlayed = remember { HashMap<Cue, Long>() }
    val fire: (Cue) -> Unit = remember {
        { cue ->
            val now = System.currentTimeMillis()
            val last = lastPlayed[cue] ?: 0L
            if (now - last >= cue.minGapMs()) {
                lastPlayed[cue] = now
                if (soundOn) board.play(cue)
                if (hapticsOn) haptic.performHapticFeedback(cue.haptic())
            }
        }
    }

    var previous by remember { mutableStateOf(state) }
    LaunchedEffect(state) {
        cuesBetween(previous, state).forEach(fire)
        previous = state
    }
    LaunchedEffect(casts) {
        casts.collect {
            when (it) {
                CastFeedback.ACCEPTED, CastFeedback.SENT -> fire(Cue.CAST)
                CastFeedback.REFUSED -> fire(Cue.REFUSED)
            }
        }
    }
}
