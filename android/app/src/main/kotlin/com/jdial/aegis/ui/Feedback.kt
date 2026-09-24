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
import com.jdial.aegis.data.Spell
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
import com.jdial.aegis.sim.CONSUMABLE_TAG
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
 * Sounds are CC0 and CC BY packs (see ATTRIBUTION.md). Deliberately fantasy:
 * cloth, metal, bells, strings, and a few real spell sounds -- nothing from
 * the sci-fi or digital packs. There is no sound per hit or per heal tick; at
 * ten ticks a second that is noise, not feedback.
 *
 * A cast sounds like what it does, because a healer's hands are on the party
 * frames and their eyes are on health bars: one sound for every spell told you
 * only that the tap registered, which you could already feel.
 */
enum class Cue(val sound: Int, val volume: Float) {
    /** A cast with nothing more specific to say -- utility. Quiet: constant. */
    CAST(R.raw.sfx_cast, 0.35f),

    // What you cast. Heals are the loudest of these because they are the job.
    HEAL(R.raw.sfx_heal, 0.5f),
    HEAL_GROUP(R.raw.sfx_heal_group, 0.55f),
    HOT(R.raw.sfx_hot, 0.45f),
    DISPEL(R.raw.sfx_dispel, 0.5f),
    DEFENSIVE(R.raw.sfx_defensive, 0.6f),

    /** A damage spell, and the same thing swung rather than cast. */
    SPELL(R.raw.sfx_spell, 0.4f),
    SWING(R.raw.sfx_swing, 0.45f),

    /** An absorb landed on somebody. Not a cast: no spell applies one. */
    SHIELD(R.raw.sfx_shield, 0.45f),

    // The window, and the enemy side of it.
    /** You picked a different target. */
    SELECT(R.raw.sfx_select, 0.3f),

    /** A pack engaged -- walked into, or dragged in early. */
    PULL(R.raw.sfx_pull, 0.5f),

    /** An add went down. The thing a DPS is told to watch for. */
    ENEMY_DOWN(R.raw.sfx_enemy_down, 0.5f),

    /** The boss changed phase. */
    PHASE(R.raw.sfx_phase, 0.7f),

    // Variants, so each spell in a class has a sound of its own. Named by what
    // they are, and chosen per spell in content through Spell.sound.
    HEAL_B(R.raw.sfx_heal_b, 0.5f),
    HEAL_C(R.raw.sfx_heal_c, 0.5f),
    HEAL_D(R.raw.sfx_heal_d, 0.5f),
    HEAL_GROUP_B(R.raw.sfx_heal_group_b, 0.55f),
    HOT_B(R.raw.sfx_hot_b, 0.45f),
    MANA(R.raw.sfx_mana, 0.5f),
    WALL_B(R.raw.sfx_wall_b, 0.6f),
    WALL_C(R.raw.sfx_wall_c, 0.55f),
    TAUNT(R.raw.sfx_taunt, 0.55f),
    KICK(R.raw.sfx_kick, 0.6f),
    SWING_B(R.raw.sfx_swing_b, 0.45f),
    STRIKE(R.raw.sfx_strike, 0.5f),
    BOLT_B(R.raw.sfx_bolt_b, 0.4f),
    BOLT_C(R.raw.sfx_bolt_c, 0.45f),
    CLEAVE(R.raw.sfx_cleave, 0.5f),
    CLEAVE_B(R.raw.sfx_cleave_b, 0.5f),
    STORM(R.raw.sfx_storm, 0.45f),
    STORM_B(R.raw.sfx_storm_b, 0.45f),
    DOT(R.raw.sfx_dot, 0.45f),
    DOT_B(R.raw.sfx_dot_b, 0.45f),

    /** Every consumable, the mana potion included: a potion sounds like a potion. */
    POTION(R.raw.sfx_potion, 0.55f),

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
enum class CastResult { ACCEPTED, REFUSED, SENT }

/** A cast tap: what was cast, and what came of it. */
data class CastFeedback(val spellId: String, val result: CastResult)

/**
 * The cue a cast of [spell] makes.
 *
 * Read off what the spell does rather than a table of ids, so a new spell is
 * audible the day it is added and nothing here has to be kept in step with
 * content. A damage spell splits on its resource: mana is cast, rage and
 * energy are swung.
 */
fun castCue(spell: Spell?): Cue = when {
    spell == null -> Cue.CAST
    // Every consumable shares one sound, whatever it does.
    spell.hasTag(CONSUMABLE_TAG) -> Cue.POTION
    // Content names its own, so a class's spells can each sound different.
    spell.sound != null -> cueNamed(spell.sound) ?: effectCue(spell)
    else -> effectCue(spell)
}

/** The cue called [name] in content: the lower-case of its constant. */
fun cueNamed(name: String): Cue? = CUES_BY_NAME[name.lowercase()]

private val CUES_BY_NAME = Cue.entries.associateBy { it.name.lowercase() }

/** The fallback, for a spell content gave no sound: one from what it does. */
private fun effectCue(spell: Spell): Cue = when {
    spell.dispels -> Cue.DISPEL
    spell.damageReduction != null -> Cue.DEFENSIVE
    spell.school == SpellSchool.DAMAGE -> if (spell.resource == "MANA") Cue.SPELL else Cue.SWING
    spell.school != SpellSchool.HEAL -> Cue.CAST
    spell.type == SpellType.AOE -> Cue.HEAL_GROUP
    spell.hotDuration != null -> Cue.HOT
    else -> Cue.HEAL
}

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
    val menderKicked = prev.adds.any { was -> was.casting && was.timer > 1 && cur.adds.any { it.id == was.id && !it.casting } }
    if ((before != null && cast == null && before.remainingTicks > 1) || menderKicked) add(Cue.INTERRUPT)
    if (cast != null && (before == null || before.abilityId != cast.abilityId || before.remainingTicks < cast.remainingTicks)) {
        add(Cue.TELEGRAPH)
    }

    val seen = prev.floatingCombatTexts.mapTo(HashSet()) { it.id }
    if (cur.floatingCombatTexts.any { it.crit && it.id !in seen }) add(Cue.CRIT)

    if (cur.bossPhase > prev.bossPhase) add(Cue.PHASE)

    // An add going down, and a pack arriving. Both are things a player is
    // asked to react to and neither was audible.
    val standing = prev.adds.count { it.isAlive }
    if (standing > 0 && cur.adds.count { it.isAlive } < standing) add(Cue.ENEMY_DOWN)
    if (cur.trashPullsRemaining < prev.trashPullsRemaining || cur.extraPulls > prev.extraPulls) {
        add(Cue.PULL)
    }

    val lastHealth = prev.party.associateBy { it.id }
    var died = false
    var danger = false
    var shielded = false
    for (u in cur.party) {
        val was = lastHealth[u.id] ?: continue
        if (was.isAlive && !u.isAlive) died = true
        if (u.shield > was.shield) shielded = true
        if (u.isAlive && u.maxHealth > 0 && was.maxHealth > 0 &&
            was.health / was.maxHealth >= DANGER_FRACTION &&
            u.health / u.maxHealth < DANGER_FRACTION
        ) {
            danger = true
        }
    }
    if (shielded) add(Cue.SHIELD)
    // A death outranks the warning that usually comes a moment before it.
    if (died) add(Cue.DEATH) else if (danger) add(Cue.DANGER)
}

private fun Cue.haptic(): HapticFeedbackType = when (this) {
    Cue.POTION, Cue.MANA, Cue.HOT_B, Cue.DOT, Cue.DOT_B -> HapticFeedbackType.SegmentTick
    Cue.HEAL_B, Cue.HEAL_C, Cue.HEAL_D, Cue.HEAL_GROUP_B, Cue.SWING_B, Cue.STRIKE,
    Cue.BOLT_B, Cue.BOLT_C, Cue.CLEAVE, Cue.CLEAVE_B, Cue.STORM, Cue.STORM_B, Cue.KICK ->
        HapticFeedbackType.Confirm
    Cue.WALL_B, Cue.WALL_C, Cue.TAUNT -> HapticFeedbackType.LongPress
    Cue.CAST, Cue.TELEGRAPH, Cue.HOT, Cue.SELECT, Cue.ENEMY_DOWN, Cue.SHIELD ->
        HapticFeedbackType.SegmentTick
    Cue.REFUSED -> HapticFeedbackType.Reject
    Cue.CRIT, Cue.INTERRUPT, Cue.HEAL, Cue.HEAL_GROUP, Cue.DISPEL, Cue.SPELL, Cue.SWING ->
        HapticFeedbackType.Confirm
    Cue.DANGER, Cue.DEATH, Cue.WIPE, Cue.PHASE, Cue.PULL, Cue.DEFENSIVE ->
        HapticFeedbackType.LongPress
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
    // Heals are spammed, and a heal sound layered over itself ten times a
    // second is a drone. One per cast, but never two inside a cast's own sound.
    Cue.HEAL, Cue.HEAL_GROUP, Cue.SPELL -> 220
    Cue.SHIELD, Cue.ENEMY_DOWN -> 300
    Cue.CAST, Cue.REFUSED, Cue.HOT, Cue.SWING, Cue.SELECT -> 80
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
fun CombatFeedback(
    state: GameState,
    casts: Flow<CastFeedback>,
    sound: Boolean,
    haptics: Boolean,
    /** Looks a cast up, so the cue can be the spell's rather than one for all. */
    spell: (String) -> Spell?,
    /** Who the player has targeted; a change is a tap worth hearing. */
    target: String?,
) {
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
            when (it.result) {
                CastResult.ACCEPTED, CastResult.SENT -> fire(castCue(spell(it.spellId)))
                CastResult.REFUSED -> fire(Cue.REFUSED)
            }
        }
    }

    // Not on first composition: the opening target is one nobody picked.
    var lastTarget by remember { mutableStateOf(target) }
    LaunchedEffect(target) {
        if (target != lastTarget) {
            lastTarget = target
            if (target != null) fire(Cue.SELECT)
        }
    }
}
