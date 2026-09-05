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
import androidx.compose.runtime.remember
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.Spell
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
    onReorder: (Int, Int) -> kotlin.Unit,
    onLeave: () -> kotlin.Unit,
) {
    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            EncounterHud(state, onLeave)
            Spacer(Modifier.height(10.dp))

            BoxWithConstraints(
                Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                // All five rows must always be visible — the healer is the last
                // one, and a run is lost when you cannot see or tap yourself. So
                // the row height is derived from the space available and the bar
                // shrinks with it, rather than rows keeping a size that clips.
                val gap = 7.dp
                val rowHeight = ((maxHeight - gap * 4) / 5).coerceIn(48.dp, PartyRowMaxHeight)
                val barHeight = (rowHeight * 0.40f).coerceIn(16.dp, HealthBarHeight)
                val auraSize = (rowHeight * 0.30f).coerceIn(16.dp, AuraStripHeight)

                Column(
                    Modifier.widthIn(max = 480.dp).fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(gap),
                ) {
                    state.party.forEach { unit ->
                        PartyRow(
                            unit = unit,
                            state = state,
                            selected = unit.id == targetId,
                            rowHeight = rowHeight,
                            barHeight = barHeight,
                            auraSize = auraSize,
                            onClick = { if (unit.isAlive) onTarget(unit.id) },
                        )
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            ActionBar(state, data, onCast, onReorder)
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
                        .clickable(onClick = onLeave)
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

            if (state.bossSelfBuffs.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.bossSelfBuffs.forEach { buff ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GameIcon(buff.icon, size = 24.dp, accent = Color(0xFFF87171))
                            Spacer(Modifier.width(4.dp))
                            BasicText(
                                "${ceil(buff.remainingTicks / 10.0).toInt()}s",
                                style = AegisType.label.copy(color = Color(0xFFFCA5A5)),
                            )
                        }
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
        filled -> Vital.healthy.copy(alpha = 0.7f)
        active -> Gilt.core
        else -> Ink.muted.copy(alpha = 0.35f)
    }
    Box(Modifier.size(if (boss) 11.dp else 8.dp).clip(CircleShape).background(color))
}

// --- heal grid --------------------------------------------------------------

// Row geometry. The row height is fixed and derived from these, so adding an
// aura can never change it: 5 + 18 (name) + 3 + bar + 3 + strip + 5.
private val HealthBarHeight = 32.dp
private val AuraStripHeight = 24.dp
private val PartyRowMaxHeight = 90.dp

/** Health colour is a hard signal, not decoration: four bands, no blending. */
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
    onClick: () -> kotlin.Unit,
) {
    val pct = if (unit.maxHealth > 0) (unit.health / unit.maxHealth).toFloat().coerceIn(0f, 1f) else 0f
    val animatedPct by animateFloatAsState(pct, tween(140), label = "hp")
    // The ghost trails the real bar, so a burst of damage stays visible for a
    // moment after it lands — you can see how much was just lost, not only that
    // the bar moved.
    val ghostPct by animateFloatAsState(pct, tween(620, delayMillis = 260), label = "ghost")
    val barColor by animateColorAsState(healthColor(pct), tween(240), label = "hpColor")
    val accent = LocalAccent.current
    val dead = !unit.isAlive

    ForgedPanel(
        modifier = Modifier
            .fillMaxWidth()
            // Fixed height: auras coming and going must not make the grid jump,
            // because a moving target is a mis-tap under pressure.
            .height(rowHeight)
            .clickable(enabled = !dead, onClick = onClick),
        selected = selected,
        accent = accent.core,
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
                    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        unit.buffs.take(4).forEach { HotRing(it, auraSize) }
                        unit.debuffs.take(2).forEach {
                            AuraRing(it.icon, it.remainingTicks, it.remainingTicks, Vital.critical, auraSize)
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    if (dead) {
                        BasicText("DEAD", style = AegisType.label.copy(color = Vital.critical))
                    } else {
                        BasicText(
                            "${unit.health.roundToInt()} / ${unit.maxHealth.roundToInt()}",
                            style = AegisType.numeric.copy(fontSize = 12.sp),
                        )
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
                    if (unit.shield > 0) {
                        val shieldPct = (unit.shield / unit.maxHealth).toFloat().coerceIn(0f, 1f)
                        Box(
                            Modifier
                                .fillMaxWidth(shieldPct)
                                .fillMaxHeight()
                                .background(Vital.shield.copy(alpha = 0.55f)),
                        )
                    }
                }

            }
            Column(Modifier.padding(end = 10.dp), horizontalAlignment = Alignment.End) {
                BasicText(
                    when (unit.role) {
                        UnitRole.TANK -> "TANK"
                        UnitRole.DPS -> "DPS"
                        UnitRole.HEALER -> "HEALER"
                    },
                    style = AegisType.label.copy(fontSize = 9.sp, color = Ink.muted),
                )
                BasicText("LV ${unit.level}", style = AegisType.label.copy(fontSize = 9.sp))
            }
        }

        // Numbers rise out of the row they belong to.
        FloatingLayer(state, unit.id)
    }
}

@Composable
private fun HotRing(buff: UnitBuff, ringSize: Dp) {
    val max = if (buff.durationTicksMax > 0) buff.durationTicksMax else buff.remainingTicks
    AuraRing(buff.icon, buff.remainingTicks, max, Vital.healthy, ringSize)
}

/**
 * An aura shown as a depleting ring around its icon — the remaining duration is
 * read at a glance from the arc, with the seconds beneath for precision.
 */
@Composable
private fun AuraRing(icon: String, remainingTicks: Int, maxTicks: Int, tint: Color, ringSize: Dp) {
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
                fontSize = 7.sp,
                color = if (urgent) Vital.hurt else tint,
            ),
            modifier = Modifier.align(Alignment.BottomCenter),
        )
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
) {
    val manaPct = if (state.maxMana > 0) (state.mana / state.maxMana).toFloat().coerceIn(0f, 1f) else 0f
    val animatedMana by animateFloatAsState(manaPct, tween(160), label = "mana")

    // Reorder is a long-press drag; the picked-up slot follows the finger.
    var dragFrom by remember { mutableIntStateOf(-1) }
    var dragDx by remember { mutableFloatStateOf(0f) }

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
                            width = slotWidth,
                            onClick = { if (spell != null) onCast(spell.id) },
                            onDragStart = { dragFrom = i; dragDx = 0f },
                            onDrag = { dragDx += it },
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
    width: Dp,
    onClick: () -> kotlin.Unit,
    onDragStart: () -> kotlin.Unit,
    onDrag: (Float) -> kotlin.Unit,
    onDragEnd: () -> kotlin.Unit,
) {
    val accent = LocalAccent.current
    val onCooldown = cooldownTicks > 0
    val usable = spell != null && !onCooldown && affordable
    val shape = RoundedCornerShape(6.dp)
    val dragDp = with(LocalDensity.current) { dragOffsetPx.toDp() }

    Box(
        Modifier
            .width(width)
            .height(66.dp)
            .offset(x = if (dragging) dragDp else 0.dp)
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
            .clickable(enabled = spell != null, onClick = onClick)
            .pointerInput(spell?.id, index) {
                if (spell == null) return@pointerInput
                detectDragGesturesAfterLongPress(
                    onDragStart = { onDragStart() },
                    onDrag = { change, amount -> change.consume(); onDrag(amount.x) },
                    onDragEnd = { onDragEnd() },
                    onDragCancel = { onDragEnd() },
                )
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
                style = AegisType.label.copy(fontSize = 9.sp, color = Ink.muted),
                modifier = Modifier.align(Alignment.TopStart).padding(3.dp),
            )
            BasicText(
                "${spell.manaCost}",
                style = AegisType.label.copy(fontSize = 9.sp, color = Vital.mana),
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
