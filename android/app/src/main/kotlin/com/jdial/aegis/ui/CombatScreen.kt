package com.jdial.aegis.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.Spell
import com.jdial.aegis.data.Targeting
import com.jdial.aegis.sim.CombatPhase
import com.jdial.aegis.sim.FLOATING_TEXT_LIFETIME_TICKS
import com.jdial.aegis.sim.FloatingKind
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.TRASH_PACK_COUNT
import com.jdial.aegis.sim.Unit
import com.jdial.aegis.sim.UnitBuff
import com.jdial.aegis.sim.UnitRole
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.ForgedPanel
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.sim.HEALER_UNIT_ID
import com.jdial.aegis.ui.theme.LocalUiSettings
import com.jdial.aegis.ui.theme.Obsidian
import com.jdial.aegis.ui.theme.Vital
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * The combat screen: encounter HUD, the party heal grid, and the action bar.
 *
 * Principle 4 governs everything here — health, mana and cooldown numerals are
 * the highest-contrast elements on screen and are never decorated.
 */
@Composable
fun CombatScreen(
    state: GameState,
    data: GameData,
    targetId: String?,
    onTarget: (String) -> kotlin.Unit,
    onCast: (String) -> kotlin.Unit,
    onCastAt: (String, String) -> kotlin.Unit,
    onReorder: (Int, Int) -> kotlin.Unit,
    onLeave: () -> kotlin.Unit,
) {
    // Drag-to-cast. VuhDo and HealBot collapse target and heal into one click;
    // on touch the honest analogue is dragging a spell onto a frame. The two-tap
    // path is untouched — this is an additional route, not a replacement.
    //
    // Row bounds are in window coordinates so the slot, which lives in a
    // different subtree, can hit-test against them.
    val rowBounds = remember { mutableStateMapOf<String, Rect>() }
    var dragPoint by remember { mutableStateOf<Offset?>(null) }
    val dropTargetId = dragPoint?.let { p ->
        rowBounds.entries.firstOrNull { it.value.contains(p) }?.key
    }?.takeIf { id -> state.party.firstOrNull { it.id == id }?.isAlive == true }

    ObsidianBackdrop {
        BoxWithConstraints(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            // Stacked, a landscape phone leaves about 200dp for five 48dp rows,
            // so the healer — the last row, and the one you die without — ends up
            // off-screen. Wide and short means side by side instead: the party
            // gets the full height, the HUD and action bar take a column.
            // Tablets and unfolded foldables land here too, since targetSdk 36+
            // ignores a portrait lock above 600dp.
            val wide = maxWidth > maxHeight

            @Composable
            fun PartyGrid(modifier: Modifier) = BoxWithConstraints(
                modifier,
                contentAlignment = Alignment.Center,
            ) {
                // All five rows must always be visible — the healer is the last
                // one, and a run is lost when you cannot see or tap yourself. So
                // the row height is derived from the space available and the bar
                // shrinks with it, rather than rows keeping a size that clips.
                val debuffMax = remember(state.currentDungeon?.id) { debuffDurations(state) }
                val ui = LocalUiSettings.current
                val gap = 7.dp
                val maxRow = if (ui.largeFrames) 110.dp else PartyRowMaxHeight
                val rowHeight = ((maxHeight - gap * 4) / 5).coerceIn(48.dp, maxRow)
                val barHeight = (rowHeight * 0.40f).coerceIn(16.dp, HealthBarHeight)
                val auraSize = (rowHeight * 0.30f).coerceIn(16.dp, AuraStripHeight)

                Column(
                    Modifier.widthIn(max = 480.dp).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(gap),
                ) {
                    // Sorted for display only — state.party is never reordered,
                    // because the engine and the save both index it positionally.
                    val ordered = if (ui.selfFirst) {
                        state.party.sortedBy { if (it.id == HEALER_UNIT_ID) 0 else 1 }
                    } else {
                        state.party
                    }
                    ordered.forEach { unit ->
                        PartyRow(
                            unit = unit,
                            state = state,
                            selected = unit.id == targetId,
                            rowHeight = rowHeight,
                            barHeight = barHeight,
                            auraSize = auraSize,
                            debuffMax = debuffMax,
                            dropTarget = unit.id == dropTargetId,
                            onBounds = { rowBounds[unit.id] = it },
                            onClick = { if (unit.isAlive) onTarget(unit.id) },
                        )
                    }
                }
            }

            if (wide) {
                Row(Modifier.fillMaxSize()) {
                    PartyGrid(Modifier.weight(1f).fillMaxHeight())
                    Spacer(Modifier.width(12.dp))
                    Column(
                        Modifier.width(360.dp).fillMaxHeight(),
                        verticalArrangement = Arrangement.SpaceBetween,
                    ) {
                        EncounterHud(state, onLeave)
                        ActionBar(state, data, onCast, onReorder, dropTargetId, { dragPoint = it }) { spellId ->
                            dropTargetId?.let { onCastAt(spellId, it) }
                        }
                    }
                }
            } else {
                Column(Modifier.fillMaxSize()) {
                    EncounterHud(state, onLeave)
                    Spacer(Modifier.height(10.dp))
                    PartyGrid(Modifier.weight(1f).fillMaxWidth())
                    Spacer(Modifier.height(10.dp))
                    ActionBar(state, data, onCast, onReorder, dropTargetId, { dragPoint = it }) { spellId ->
                            dropTargetId?.let { onCastAt(spellId, it) }
                        }
                }
            }
        }
    }
}

// --- encounter HUD ----------------------------------------------------------

@Composable
private fun EncounterHud(state: GameState, onLeave: () -> kotlin.Unit) {
    val dungeon = state.currentDungeon ?: return
    val isBoss = state.combatPhase == CombatPhase.BOSS
    val name = if (isBoss) dungeon.bossName else dungeon.enemies.firstOrNull()?.name ?: "Trash"
    val pct = if (state.enemyMaxHealth > 0) (state.enemyHealth / state.enemyMaxHealth).toFloat() else 0f

    ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(10.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val pullsCleared = TRASH_PACK_COUNT - state.trashPullsRemaining
                repeat(TRASH_PACK_COUNT) { i ->
                    // Exactly one pip is "active": the pull being fought right now.
                    EncounterPip(filled = i < pullsCleared, active = !isBoss && i == pullsCleared)
                    Spacer(Modifier.width(5.dp))
                }
                Spacer(Modifier.width(3.dp))
                EncounterPip(filled = false, active = isBoss, boss = true)

                if (state.endlessStacks > 0) {
                    Spacer(Modifier.width(10.dp))
                    BasicText(
                        "WAVE ${state.endlessStacks + 1}",
                        style = AegisType.label.copy(color = Gilt.core),
                    )
                }

                Spacer(Modifier.weight(1f))
                BasicText(
                    "LEAVE",
                    style = AegisType.label.copy(color = Ink.muted),
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable(onClickLabel = "Leave the dungeon", onClick = onLeave)
                        .semantics { role = Role.Button }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }

            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicText(
                    (if (isBoss) "BOSS · " else "").plus(name).uppercase(),
                    style = AegisType.label.copy(color = if (isBoss) Gilt.core else Ink.secondary),
                    modifier = Modifier.weight(1f),
                )
                BasicText(
                    "${state.enemyHealth.roundToInt()} / ${state.enemyMaxHealth.roundToInt()}",
                    style = AegisType.numeric.copy(fontSize = 13.sp),
                )
            }

            Spacer(Modifier.height(6.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(12.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Obsidian.abyss)
                    .border(1.dp, Gilt.deep.copy(alpha = 0.5f), RoundedCornerShape(3.dp)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(pct.coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(
                            Brush.horizontalGradient(
                                listOf(Color(0xFF7F1D1D), Color(0xFFDC2626), Color(0xFFF87171)),
                            ),
                        ),
                )
            }

            // The pre-damage warning a healer plans around. mechanicCooldown
            // has always been in the state and was never shown.
            // Reserved whatever the phase, so the telegraph appearing at the
            // boss does not resize the card either.
            val next = nextMechanic(state)
            Spacer(Modifier.height(8.dp))
            Box(Modifier.height(22.dp)) {
                if (next != null && state.mechanicCooldown > 0) {
                    val secs = ceil(state.mechanicCooldown / 10.0).toInt()
                    val imminent = state.mechanicCooldown <= 20
                    val everyone = next.whom == "everyone"
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                    GameIcon(next.icon, size = 22.dp, accent = if (imminent) Gilt.core else Gilt.deep)
                    Spacer(Modifier.width(6.dp))
                    BasicText(
                        next.name.uppercase(),
                        maxLines = 1,
                        style = AegisType.label.copy(
                            color = if (imminent) Gilt.bright else Ink.secondary,
                        ),
                    )
                    Spacer(Modifier.width(6.dp))
                    BasicText(
                        next.whom,
                        style = AegisType.body.copy(
                            // An incoming raid-wide hit is the one cue worth
                            // shouting: it is the difference between a single
                            // heal and a cooldown.
                            color = if (everyone) Gilt.core else Ink.muted,
                        ),
                    )
                    Spacer(Modifier.weight(1f))
                    // The boss's own buffs share this strip rather than claiming
                    // a second reserved row — both answer "what is the boss
                    // doing?", and one reserved row is enough hollow on trash.
                    state.bossSelfBuffs.forEach { buff ->
                        GameIcon(buff.icon, size = 18.dp, accent = Color(0xFFF87171))
                        Spacer(Modifier.width(3.dp))
                        BasicText(
                            "${ceil(buff.remainingTicks / 10.0).toInt()}s",
                            style = AegisType.label.copy(color = Color(0xFFFCA5A5)),
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    BasicText(
                        "${secs}s",
                        style = AegisType.numeric.copy(
                            fontSize = 13.sp,
                            color = if (imminent) Gilt.bright else Ink.secondary,
                        ),
                    )
                    }
                }
            }

        }
    }
}

@Composable
private fun EncounterPip(filled: Boolean, active: Boolean, boss: Boolean = false) {
    val color = when {
        boss && active -> Gilt.core
        boss -> Gilt.deep.copy(alpha = 0.5f)
        filled -> Vital.critical.copy(alpha = 0.5f)
        active -> Gilt.core
        else -> Ink.muted.copy(alpha = 0.35f)
    }
    val size = if (boss) 11.dp else 8.dp
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().clip(CircleShape).background(color))
        // A beaten pull reads as struck out rather than merely coloured in —
        // "done" is a different idea from "in progress" and should not be left
        // to a hue difference alone.
        if (filled) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 1.6f * density
                val i = stroke
                drawLine(
                    color = Vital.critical,
                    start = Offset(i, i),
                    end = Offset(this.size.width - i, this.size.height - i),
                    strokeWidth = stroke,
                )
                drawLine(
                    color = Vital.critical,
                    start = Offset(this.size.width - i, i),
                    end = Offset(i, this.size.height - i),
                    strokeWidth = stroke,
                )
            }
        }
    }
}

// --- heal grid --------------------------------------------------------------

// Row geometry. The row height is fixed and derived from these, so adding an
// aura can never change it: 5 + 18 (name) + 3 + bar + 3 + strip + 5.
/** The boss's next mechanic: what it is, and who it can land on. */
private data class NextMechanic(val icon: String, val name: String, val whom: String)

/**
 * Reads the boss's next move off the state. The engine picks mechanics in
 * strict round-robin (`kinds[ordinal % kinds.size]`, then
 * `templates[cycle % size]` — GameTick.processBossAi), so *which* ability comes
 * next is fully determined and can be shown honestly.
 *
 * Only the victims are drawn from the RNG, at the moment it fires. So this says
 * "two of you", never "these two" — naming the targets would be a guess, and
 * peeking at the RNG would desync the parity stream.
 */
private fun nextMechanic(state: GameState): NextMechanic? {
    if (state.combatPhase != CombatPhase.BOSS) return null
    val c = state.currentDungeon?.bossCombat ?: return null

    val kinds = buildList {
        if (c.debuffTemplates.isNotEmpty()) add("debuff")
        if (c.selfBuffTemplates.isNotEmpty()) add("buff")
        if (c.attackTemplates.isNotEmpty()) add("attack")
    }
    if (kinds.isEmpty()) return null

    val cycle = state.mechanicOrdinal / kinds.size
    fun whom(t: Targeting) = when (t) {
        Targeting.SINGLE_RANDOM -> "one of you"
        Targeting.TWO_RANDOM -> "two of you"
        Targeting.ALL_LIVING -> "everyone"
    }
    return when (kinds[state.mechanicOrdinal % kinds.size]) {
        "debuff" -> c.debuffTemplates[cycle % c.debuffTemplates.size]
            .let { NextMechanic(it.icon, it.name, whom(it.targeting)) }
        "buff" -> c.selfBuffTemplates[cycle % c.selfBuffTemplates.size]
            .let { NextMechanic(it.icon, it.name, "empowers itself") }
        else -> c.attackTemplates[cycle % c.attackTemplates.size]
            .let { NextMechanic(it.icon, it.name, whom(it.targeting)) }
    }
}

/**
 * A debuff's original duration, needed for the depleting ring. UnitDebuff only
 * carries what is left, but every debuff in the game is minted from the boss's
 * debuffTemplates, so the full duration is a content lookup rather than new
 * serialized state (which would land in the parity-covered GameState).
 */
private fun debuffDurations(state: GameState): Map<String, Int> =
    state.currentDungeon?.bossCombat?.debuffTemplates
        ?.associate { it.abilityId to it.durationTicks }
        ?: emptyMap()

/**
 * Healing already committed to a unit by its active heal-over-time effects.
 *
 * There are no cast times in this game (Content.kt), so nothing is ever in
 * flight and classic incoming-heal prediction has nothing to predict. What a
 * healer can still be told is how much healing is already on the way — which is
 * what stops you stacking a second HoT onto a target that is about to cap.
 *
 * `remainingTicks` counts heal ticks, not seconds, so haste does not enter into
 * it. Class hooks can scale an individual tick at execution time, so this is an
 * estimate and can read low; it is the same estimate in both apps.
 *
 * Shields are excluded on purpose: shieldTicksRemaining expires them, so they
 * are absorb rather than healing, and they get their own band on the bar.
 */
private fun committedHealing(unit: Unit): Double =
    unit.buffs.sumOf { it.healingPerTick * it.remainingTicks + (it.bloomBurstHeal ?: 0.0) }

private val HealthBarHeight = 32.dp
private val AuraStripHeight = 24.dp
private val PartyRowMaxHeight = 90.dp

/** Health colour is a hard signal, not decoration: four bands, no blending. */
/**
 * Colour-blind ramp. The four-band structure is unchanged — only the hues move,
 * from a green/red ramp that deuteranopia flattens to a blue/magenta one that
 * survives it.
 */
private fun healthColorCb(pct: Float): Color = when {
    pct < 0.25f -> Color(0xFFE040FB)
    pct < 0.50f -> Color(0xFFFF8A65)
    pct < 0.75f -> Color(0xFF64B5F6)
    else -> Color(0xFF4DD0E1)
}

private fun healthColor(pct: Float): Color = when {
    pct < 0.25f -> Vital.critical
    pct < 0.50f -> Vital.hurt
    pct < 0.75f -> Vital.fair
    else -> Vital.healthy
}

@Composable
private fun PartyRow(
    unit: Unit,
    state: GameState,
    selected: Boolean,
    rowHeight: Dp,
    barHeight: Dp,
    auraSize: Dp,
    debuffMax: Map<String, Int>,
    dropTarget: Boolean,
    onBounds: (Rect) -> kotlin.Unit,
    onClick: () -> kotlin.Unit,
) {
    val pct = if (unit.maxHealth > 0) (unit.health / unit.maxHealth).toFloat().coerceIn(0f, 1f) else 0f
    val animatedPct by animateFloatAsState(pct, tween(140), label = "hp")
    // The ghost trails the real bar, so a burst of damage stays visible for a
    // moment after it lands — you can see how much was just lost, not only that
    // the bar moved.
    val ghostPct by animateFloatAsState(pct, tween(620, delayMillis = 260), label = "ghost")
    val ui = LocalUiSettings.current
    val barColor by animateColorAsState(
        if (ui.colourBlindBands) healthColorCb(pct) else healthColor(pct),
        tween(240),
        label = "hpColor",
    )
    // Note the health band still comes from `pct` alone. If the colour brightened
    // because a HoT is pending, the signal would lie at the moment it matters.
    val committed = if (ui.showCommitted) committedHealing(unit) else 0.0
    val committedFrac = if (unit.maxHealth > 0) (committed / unit.maxHealth).toFloat() else 0f
    val animatedCommitted by animateFloatAsState(committedFrac, tween(140), label = "committed")
    val overhealing = pct + committedFrac > 1f
    val committedEnd = (pct + animatedCommitted).coerceIn(0f, 1f)
    val shieldFrac = if (unit.maxHealth > 0) {
        (unit.shield / unit.maxHealth).toFloat().coerceIn(0f, 1f)
    } else {
        0f
    }
    // Absorb sits past current health, as it does in the game this apes — it was
    // drawn from the left edge over the health fill, which read as "some of your
    // health is blue" rather than "you have a shield on top".
    val shieldEnd = (committedEnd + shieldFrac).coerceIn(0f, 1f)
    val accent = LocalAccent.current
    val dead = !unit.isAlive

    ForgedPanel(
        modifier = Modifier
            .fillMaxWidth()
            // Fixed height: auras coming and going must not make the grid jump,
            // because a moving target is a mis-tap under pressure.
            .height(rowHeight)
            .onGloballyPositioned { onBounds(it.boundsInWindow()) }
            .clickable(enabled = !dead, onClick = onClick)
            .semantics {
                role = Role.Button
                val pct = if (unit.maxHealth > 0) {
                    (unit.health / unit.maxHealth * 100).roundToInt()
                } else {
                    0
                }
                // Named roleLabel, not role: `role` is a semantics property here.
                val roleLabel = when (unit.role) {
                    UnitRole.TANK -> "tank"
                    UnitRole.DPS -> "damage"
                    UnitRole.HEALER -> "healer"
                }
                // Aura rings carry a 9sp countdown that is too small to read and
                // has no text equivalent, so the auras are spoken here instead.
                val auras = buildList {
                    if (unit.debuffs.isNotEmpty()) add("${unit.debuffs.size} debuffs")
                    if (unit.buffs.isNotEmpty()) add("${unit.buffs.size} heal over time")
                    if (unit.shield > 0) add("shielded")
                }
                contentDescription = if (dead) {
                    "${unit.name}, $roleLabel, dead"
                } else {
                    "${unit.name}, $roleLabel, $pct percent health" +
                        (if (auras.isEmpty()) "" else ", " + auras.joinToString(", ")) +
                        (if (selected) ", targeted" else "")
                }
                if (dead) disabled()
            },
        selected = selected || dropTarget,
        accent = if (dropTarget) accent.bright else accent.core,
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            // The role stripe doubles as the selection marker: it widens and
            // brightens, so selection reads from the edge of the screen.
            Box(
                Modifier
                    .width(if (selected) 7.dp else 4.dp)
                    .fillMaxHeight()
                    .background(
                        when {
                            dead -> Ink.muted.copy(alpha = 0.3f)
                            selected -> accent.bright
                            unit.role == UnitRole.TANK -> Vital.shield
                            unit.role == UnitRole.HEALER -> accent.core
                            else -> Gilt.deep
                        },
                    ),
            )
            Column(
                Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 5.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                Row(
                    Modifier.height(auraSize),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(
                        unit.name,
                        maxLines = 1,
                        style = AegisType.numeric.copy(
                            fontSize = 13.sp,
                            color = if (dead) Ink.muted else Ink.primary,
                        ),
                    )
                    Spacer(Modifier.weight(1f))
                    // Auras sit on the name line: present or absent, the row is
                    // the same height either way.
                    //
                    // Debuffs come first because the alarm outranks the
                    // reassurance, and HoTs are sorted by time remaining so the
                    // one about to fall off is never the one that gets truncated.
                    val cap = if (auraSize < 20.dp) 4 else 6
                    val shownDebuffs = unit.debuffs.take(cap)
                    val shownBuffs = unit.buffs
                        .sortedBy { it.remainingTicks }
                        .take(cap - shownDebuffs.size)
                    val hidden = unit.buffs.size + unit.debuffs.size -
                        shownBuffs.size - shownDebuffs.size

                    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        shownDebuffs.forEach { d ->
                            AuraRing(
                                icon = d.icon,
                                remainingTicks = d.remainingTicks,
                                // Was passing remainingTicks as the max as well, so
                                // every debuff ring sat at a full sweep forever and
                                // the arc conveyed nothing.
                                maxTicks = debuffMax[d.sourceAbilityId] ?: d.remainingTicks,
                                tint = Vital.critical,
                                ringSize = auraSize,
                            )
                        }
                        shownBuffs.forEach { HotRing(it, auraSize) }
                        // Rows compress to 48dp so the cap stays, but a hidden
                        // aura must not be a silent one.
                        if (hidden > 0) {
                            BasicText(
                                "+$hidden",
                                style = AegisType.label.copy(fontSize = 10.sp, color = Ink.muted),
                            )
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    if (dead) {
                        BasicText("DEAD", style = AegisType.label.copy(color = Vital.critical))
                    } else {
                        // Percent for urgency, deficit for which heal covers the
                        // gap. "1240 / 1450" makes the player do arithmetic under
                        // pressure; these are the two numbers they act on.
                        if (ui.healthTextPercent) {
                            val deficit = (unit.maxHealth - unit.health).roundToInt()
                            if (deficit > 0) {
                                BasicText(
                                    "-$deficit",
                                    style = AegisType.numeric.copy(
                                        fontSize = 11.sp,
                                        color = Vital.hurt,
                                    ),
                                )
                                Spacer(Modifier.width(5.dp))
                            }
                            BasicText(
                                "${(pct * 100).roundToInt()}%",
                                style = AegisType.numeric.copy(fontSize = 12.sp, color = barColor),
                            )
                        } else {
                            BasicText(
                                "${unit.health.roundToInt()} / ${unit.maxHealth.roundToInt()}",
                                style = AegisType.numeric.copy(fontSize = 12.sp),
                            )
                        }
                    }
                }

                Spacer(Modifier.height(3.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(barHeight)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Obsidian.abyss)
                        .border(1.dp, Gilt.deep.copy(alpha = 0.45f), RoundedCornerShape(3.dp)),
                ) {
                    // Bands are layered widest-first and each is drawn from the
                    // left, so the narrower one on top leaves the previous band
                    // showing as the segment beyond it. That gives health |
                    // committed | absorb without measuring the bar.
                    if (shieldEnd > committedEnd) {
                        Box(
                            Modifier
                                .fillMaxWidth(shieldEnd)
                                .fillMaxHeight()
                                .background(Vital.shield.copy(alpha = 0.55f)),
                        )
                    }
                    if (committedEnd > animatedPct) {
                        Box(
                            Modifier
                                .fillMaxWidth(committedEnd)
                                .fillMaxHeight()
                                .background(Vital.healthy.copy(alpha = 0.34f)),
                        )
                    }
                    if (ghostPct > animatedPct) {
                        Box(
                            Modifier
                                .fillMaxWidth(ghostPct)
                                .fillMaxHeight()
                                .background(Vital.critical.copy(alpha = 0.42f)),
                        )
                    }
                    Box(
                        Modifier
                            .fillMaxWidth(animatedPct)
                            .fillMaxHeight()
                            .background(
                                Brush.verticalGradient(
                                    listOf(barColor.copy(alpha = 0.95f), barColor.copy(alpha = 0.6f)),
                                ),
                            ),
                    )
                    // The game is called Overheal. When committed healing runs
                    // past the top of the bar, the surplus is being thrown away —
                    // say so with a gilt cap rather than a number.
                    if (overhealing) {
                        Box(
                            Modifier
                                .align(Alignment.CenterEnd)
                                .width(2.dp)
                                .fillMaxHeight()
                                .background(Gilt.core),
                        )
                    }
                }

            }
            Column(Modifier.padding(end = 10.dp), horizontalAlignment = Alignment.End) {
                // On short rows the role word yields its width to the health
                // numerals. Role is already carried by the coloured stripe at the
                // left edge, so the word is the redundant half of the pair.
                if (rowHeight > 56.dp) {
                    BasicText(
                        when (unit.role) {
                            UnitRole.TANK -> "TANK"
                            UnitRole.DPS -> "DPS"
                            UnitRole.HEALER -> "HEALER"
                        },
                        style = AegisType.label.copy(fontSize = 11.sp, color = Ink.muted),
                    )
                }
                BasicText("LV ${unit.level}", style = AegisType.label.copy(fontSize = 11.sp))
            }
        }

        // Numbers rise out of the row they belong to.
        FloatingLayer(state, unit.id)
    }
}

@Composable
private fun HotRing(buff: UnitBuff, ringSize: Dp) {
    val max = if (buff.durationTicksMax > 0) buff.durationTicksMax else buff.remainingTicks
    AuraRing(buff.icon, buff.remainingTicks, max, Vital.healthy, ringSize, stacks = buff.stacks)
}

/**
 * An aura shown as a depleting ring around its icon — the remaining duration is
 * read at a glance from the arc, with the seconds beneath for precision.
 */
@Composable
private fun AuraRing(
    icon: String,
    remainingTicks: Int,
    maxTicks: Int,
    tint: Color,
    ringSize: Dp,
    stacks: Int = 0,
) {
    val sweep = if (maxTicks > 0) (remainingTicks.toFloat() / maxTicks).coerceIn(0f, 1f) else 0f
    val seconds = ceil(remainingTicks / 10.0).toInt()
    val urgent = remainingTicks <= 30

    Box(Modifier.size(ringSize), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 2.5f * density
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(
                color = tint.copy(alpha = 0.18f),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke),
            )
            drawArc(
                color = if (urgent) Vital.hurt else tint,
                startAngle = -90f,
                sweepAngle = 360f * sweep,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke),
            )
        }
        GameIcon(icon, size = ringSize * 0.62f, accent = Color.Transparent)
        BasicText(
            "$seconds",
            style = AegisType.label.copy(
                fontSize = 9.sp,
                color = if (urgent) Vital.hurt else tint,
            ),
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        // The engine has always tracked stacks; nothing ever showed them.
        if (stacks > 1) {
            BasicText(
                "$stacks",
                style = AegisType.label.copy(fontSize = 10.sp, color = Gilt.bright),
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
    }
}

/**
 * Floating combat text. Progress comes from the engine's own tick clock rather
 * than an animation, so it stays in step with the simulation.
 */
@Composable
private fun androidx.compose.foundation.layout.BoxScope.FloatingLayer(state: GameState, unitId: String) {
    // Cap the stack: a rolling HoT can otherwise queue two dozen numbers at once.
    val entries = state.floatingCombatTexts.filter { it.unitId == unitId }.takeLast(3)
    if (entries.isEmpty()) return

    entries.forEachIndexed { i, f ->
        val remaining = (f.expiresAtCombatTick - state.combatElapsedTicks)
            .coerceIn(0, FLOATING_TEXT_LIFETIME_TICKS)
        val progress = 1f - remaining.toFloat() / FLOATING_TEXT_LIFETIME_TICKS
        BasicText(
            (if (f.kind == FloatingKind.ABSORB) "+" else "") + f.amount,
            style = AegisType.numeric.copy(
                fontSize = if (f.crit) 18.sp else 14.sp,
                color = if (f.kind == FloatingKind.ABSORB) Vital.shield else Vital.healthy,
            ),
            modifier = Modifier
                // Centred over the row rather than pinned to an edge, so it never
                // lands on the role label on a narrow screen.
                .align(Alignment.Center)
                .offset(x = (i * 30 - 30).dp, y = (-10 - 26 * progress).dp)
                .alpha((1f - progress * progress).coerceIn(0f, 1f)),
        )
    }
}

// --- action bar -------------------------------------------------------------

@Composable
private fun ActionBar(
    state: GameState,
    data: GameData,
    onCast: (String) -> kotlin.Unit,
    onReorder: (Int, Int) -> kotlin.Unit,
    dropTargetId: String?,
    onDragPoint: (Offset?) -> kotlin.Unit,
    onDropCast: (String) -> kotlin.Unit,
) {
    val manaPct = if (state.maxMana > 0) (state.mana / state.maxMana).toFloat().coerceIn(0f, 1f) else 0f
    val animatedMana by animateFloatAsState(manaPct, tween(160), label = "mana")

    // Reorder is a long-press drag; the picked-up slot follows the finger.
    var dragFrom by remember { mutableIntStateOf(-1) }
    var dragDx by remember { mutableFloatStateOf(0f) }
    var dragDy by remember { mutableFloatStateOf(0f) }

    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 480.dp).fillMaxWidth()) {
            ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ManaOrb(animatedMana, size = 44.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        BasicText("MANA", style = AegisType.label.copy(color = Vital.mana))
                        Spacer(Modifier.height(2.dp))
                        BasicText(
                            "${state.mana.roundToInt()} / ${state.maxMana}",
                            style = AegisType.numeric.copy(fontSize = 15.sp),
                        )
                    }
                    // Holy Power: a Paladin-only resource, shown only when held.
                    if (state.holyPower > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            repeat(3) { i ->
                                Box(
                                    Modifier
                                        .size(9.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (i < state.holyPower) Gilt.core
                                            else Gilt.deep.copy(alpha = 0.4f),
                                        ),
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val gap = 8.dp
                val slotWidth = (maxWidth - gap * 4) / 5
                val slotPx = with(LocalDensity.current) { slotWidth.toPx() }

                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    state.activeActionBars.forEachIndexed { i, spellId ->
                        val spell = data.spell(spellId)
                        SpellSlot(
                            index = i + 1,
                            spell = spell,
                            cooldownTicks = state.spellCooldowns[spellId] ?: 0,
                            affordable = spell != null && state.mana >= spell.manaCost,
                            dragging = dragFrom == i,
                            dragOffsetPx = if (dragFrom == i) dragDx else 0f,
                            dragOffsetYPx = if (dragFrom == i) dragDy else 0f,
                            width = slotWidth,
                            reorderable = !state.isCombatActive,
                            onClick = { if (spell != null) onCast(spell.id) },
                            onDragStart = { dragFrom = i; dragDx = 0f; dragDy = 0f },
                            onDrag = { dragDx += it },
                            onDragPoint = onDragPoint,
                            onCastDrop = {
                                // An invalid drop — dead unit, released off the
                                // grid, or an unusable spell — casts nothing and
                                // spends nothing. Falling back to the current
                                // target would fire a cast the player did not aim.
                                val usable = spell != null &&
                                    (state.spellCooldowns[spellId] ?: 0) <= 0 &&
                                    state.mana >= spell.manaCost
                                if (usable && dropTargetId != null) onDropCast(spell.id)
                                onDragPoint(null)
                                dragFrom = -1
                                dragDx = 0f
                                dragDy = 0f
                            },
                            onDragEnd = {
                                val target = (i + (dragDx / slotPx).roundToInt())
                                    .coerceIn(0, state.activeActionBars.lastIndex)
                                if (target != i) onReorder(i, target)
                                dragFrom = -1
                                dragDx = 0f
                            },
                        )
                    }
                }
            }
        }
    }
}

/** Principle 5: mana is a filled vessel, not a progress bar. */
@Composable
private fun ManaOrb(fill: Float, size: Dp) {
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val radius = this.size.minDimension / 2f
            val centre = Offset(this.size.width / 2f, this.size.height / 2f)

            drawCircle(color = Obsidian.abyss, radius = radius, center = centre)
            // The fluid rises from the bottom of the vessel.
            val level = this.size.height * (1f - fill)
            clipRect(left = 0f, top = level, right = this.size.width, bottom = this.size.height) {
                drawCircle(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFF93C5FD), Vital.mana, Color(0xFF1E3A8A)),
                        startY = level,
                        endY = this@Canvas.size.height,
                    ),
                    radius = radius,
                    center = centre,
                )
            }
            // A gilt rim so the orb reads as set into the panel.
            drawCircle(
                color = Gilt.deep,
                radius = radius - density,
                center = centre,
                style = Stroke(width = 1.5f * density),
            )
        }
    }
}

@Composable
private fun SpellSlot(
    index: Int,
    spell: Spell?,
    cooldownTicks: Int,
    affordable: Boolean,
    dragging: Boolean,
    dragOffsetPx: Float,
    dragOffsetYPx: Float,
    width: Dp,
    reorderable: Boolean,
    onClick: () -> kotlin.Unit,
    onDragStart: () -> kotlin.Unit,
    onDrag: (Float) -> kotlin.Unit,
    onDragPoint: (Offset?) -> kotlin.Unit,
    onDragEnd: () -> kotlin.Unit,
    onCastDrop: () -> kotlin.Unit,
) {
    val accent = LocalAccent.current
    val onCooldown = cooldownTicks > 0
    val usable = spell != null && !onCooldown && affordable
    val shape = RoundedCornerShape(6.dp)
    val dragDp = with(LocalDensity.current) { dragOffsetPx.toDp() }
    val dragDpY = with(LocalDensity.current) { dragOffsetYPx.toDp() }
    // Window position of this slot, so a pointer offset local to it can be
    // resolved against the party rows, which live in another subtree.
    var origin by remember { mutableStateOf(Offset.Zero) }
    // pointerInput is keyed on the spell, so its coroutine keeps whatever
    // callback existed when it started. Without this the drop handler still
    // closed over the drop target from first composition — always null — so the
    // drag highlighted correctly and then cast nothing.
    val currentDrop by rememberUpdatedState(onCastDrop)

    Box(
        Modifier
            .width(width)
            .height(66.dp)
            .onGloballyPositioned { origin = it.boundsInWindow().topLeft }
            .offset(
                x = if (dragging) dragDp else 0.dp,
                y = if (dragging) dragDpY else 0.dp,
            )
            .clip(shape)
            .background(if (dragging) Obsidian.raised else Obsidian.deep)
            .border(
                width = if (usable || dragging) 2.dp else 1.dp,
                color = when {
                    dragging -> accent.bright
                    spell == null -> Gilt.deep.copy(alpha = 0.25f)
                    usable -> accent.core
                    else -> Gilt.deep.copy(alpha = 0.4f)
                },
                shape = shape,
            )
            .pointerInput(spell?.id, index, reorderable) {
                if (spell == null) return@pointerInput
                if (reorderable) {
                    // Out of combat: long-press to rearrange the bar.
                    detectDragGesturesAfterLongPress(
                        onDragStart = { onDragStart() },
                        onDrag = { change, amount -> change.consume(); onDrag(amount.x) },
                        onDragEnd = { onDragEnd() },
                        onDragCancel = { onDragEnd() },
                    )
                } else {
                    // In combat: drag straight onto a frame to cast there. No
                    // long press first — a hold before every cast is latency the
                    // whole feature exists to remove. The tap path still works:
                    // Compose cancels the click once a drag passes touch slop.
                    detectDragGestures(
                        onDragStart = { onDragStart() },
                        onDrag = { change, amount ->
                            change.consume()
                            onDrag(amount.x)
                            onDragPoint(origin + change.position)
                        },
                        onDragEnd = { currentDrop() },
                        onDragCancel = { currentDrop() },
                    )
                }
            }
            .clickable(enabled = spell != null, onClick = onClick)
            // The action bar is pure iconography: without this a spell is an
            // unlabelled box and the game cannot be played by ear at all.
            .semantics {
                role = Role.Button
                contentDescription = when {
                    spell == null -> "Empty action slot $index"
                    onCooldown -> "${spell.name}, slot $index, " +
                        "ready in ${ceil(cooldownTicks / 10.0).toInt()} seconds"
                    !affordable -> "${spell.name}, slot $index, not enough mana"
                    else -> "${spell.name}, slot $index, ${spell.manaCost} mana"
                }
                if (!usable) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (spell != null) {
            GameIcon(spell.icon, size = 46.dp, accent = Color.Transparent, dimmed = !usable)

            // Cooldown is a radial sweep over the icon, with the seconds on top.
            if (onCooldown) {
                val maxTicks = if (spell.cooldown > 0) spell.cooldown else cooldownTicks
                val sweep = (cooldownTicks.toFloat() / maxTicks).coerceIn(0f, 1f)
                Canvas(Modifier.fillMaxSize()) {
                    drawArc(
                        color = Obsidian.abyss.copy(alpha = 0.72f),
                        startAngle = -90f,
                        sweepAngle = 360f * sweep,
                        useCenter = true,
                    )
                }
                BasicText(
                    "${ceil(cooldownTicks / 10.0).toInt()}",
                    style = AegisType.numeric.copy(fontSize = 18.sp, color = Gilt.bright),
                )
            } else if (!affordable) {
                Box(Modifier.fillMaxSize().background(Vital.mana.copy(alpha = 0.22f)))
            }

            BasicText(
                "$index",
                style = AegisType.label.copy(fontSize = 11.sp, color = Ink.muted),
                modifier = Modifier.align(Alignment.TopStart).padding(3.dp),
            )
            BasicText(
                "${spell.manaCost}",
                style = AegisType.label.copy(fontSize = 11.sp, color = Vital.mana),
                modifier = Modifier.align(Alignment.BottomEnd).padding(3.dp),
            )
        } else {
            BasicText(
                "$index",
                style = AegisType.label.copy(
                    fontSize = 10.sp,
                    color = Ink.muted.copy(alpha = 0.5f),
                    textAlign = TextAlign.Center,
                ),
            )
        }
    }
}
