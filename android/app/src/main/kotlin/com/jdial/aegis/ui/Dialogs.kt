package com.jdial.aegis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import com.jdial.aegis.mp.QueueStatus
import com.jdial.aegis.sim.UnitRole
import com.jdial.aegis.sim.partyRoles
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import com.jdial.aegis.sim.UiSettings
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.sim.DungeonOutcome
import com.jdial.aegis.sim.DungeonOutcomeKind
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.ForgedPanel
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.GiltRule
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.ui.theme.Obsidian
import com.jdial.aegis.ui.theme.Vital
import kotlinx.coroutines.delay
import kotlin.random.Random

/** A dimmed, tap-to-dismiss ground for anything modal. */
@Composable
internal fun Scrim(onDismiss: (() -> kotlin.Unit)?, content: @Composable () -> kotlin.Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.72f))
            .then(if (onDismiss != null) Modifier.clickable(onClick = onDismiss) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.widthIn(max = 420.dp).padding(20.dp)) { content() }
    }
}

// --- dungeon queue ----------------------------------------------------------

/**
 * The pre-run sheet: pick a pace, watch the group form, then enter.
 *
 * The slots are the ones the engine will actually build — [partyRoles] is the
 * single definition, shared with `generateParty`. They used to be four
 * anonymous dots and a fifth captioned "the healer is you", which stopped being
 * true the moment tank and DPS became playable and would have gone on lying
 * quietly.
 *
 * Offline, the fill is local: there is nobody to wait for, so the delay is
 * pacing rather than matchmaking and every slot but yours becomes an AI. That is
 * also exactly what a real queue does at zero population, which is why there is
 * one lobby and not two.
 *
 * With the public queue on, [queueStatus] replaces the animation with the
 * people actually arriving, and entering is never blocked on them: the AI fills
 * whatever is still empty, so nobody waits for a group that may not exist.
 */
@Composable
fun DungeonQueueSheet(
    dungeon: Dungeon,
    data: GameData,
    playerRole: UnitRole,
    queueStatus: QueueStatus,
    onClose: () -> kotlin.Unit,
    onEnter: (pace: String) -> kotlin.Unit,
) {
    var pace by remember { mutableStateOf("normal") }
    val slots = remember(playerRole) { partyRoles(playerRole) }
    val yourSlot = slots.lastIndex
    var filled by remember(dungeon.id, playerRole) { mutableIntStateOf(0) }

    val online = queueStatus !is QueueStatus.Offline
    val humans = when (queueStatus) {
        is QueueStatus.Waiting -> queueStatus.humans
        is QueueStatus.Ready -> queueStatus.humans
        else -> 1
    }

    LaunchedEffect(dungeon.id, playerRole, online) {
        if (online) return@LaunchedEffect
        filled = 0
        repeat(yourSlot) {
            delay(350L + Random.nextLong(700))
            filled += 1
        }
    }
    // Online you may always enter: the AI takes the empty seats.
    val ready = online || filled >= yourSlot
    // Humans other than you occupy the earliest slots; the rest read as AI.
    val occupiedByOthers = if (online) (humans - 1).coerceAtLeast(0) else filled

    Scrim(onDismiss = onClose) {
        ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp)) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                GameIcon(dungeon.cardIcon, size = 46.dp, accent = Gilt.mid)
                Spacer(Modifier.height(10.dp))
                BasicText(
                    dungeon.name.uppercase(),
                    style = AegisType.title.copy(fontSize = 17.sp, textAlign = TextAlign.Center),
                )
                Spacer(Modifier.height(4.dp))
                BasicText("LV ${dungeon.levelMin}–${dungeon.levelMax}", style = AegisType.label)

                Spacer(Modifier.height(14.dp))
                GiltRule(Modifier.fillMaxWidth().height(1.dp))
                Spacer(Modifier.height(14.dp))

                BasicText(
                    if (online) "FINDING A GROUP" else "FORMING GROUP",
                    style = AegisType.label.copy(color = Gilt.mid),
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    slots.forEachIndexed { i, role ->
                        QueueSlot(
                            role = role,
                            isYou = i == yourSlot,
                            occupied = i == yourSlot || i < occupiedByOthers,
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                BasicText(
                    "YOU ARE THE ${roleLabel(playerRole)}",
                    style = AegisType.label.copy(color = LocalAccent.current.bright),
                )
                if (online) {
                    Spacer(Modifier.height(4.dp))
                    BasicText(
                        when (queueStatus) {
                            // Never "waiting for players": you are not blocked
                            // on them, and saying so invites people to sit here.
                            is QueueStatus.Failed -> "COULDN'T REACH THE QUEUE — PLAYING SOLO"
                            is QueueStatus.Ready ->
                                if (humans > 1) "$humans PLAYERS — THE AI TAKES THE REST"
                                else "NO ONE ELSE ABOUT — THE AI TAKES THE REST"
                            else -> "SEARCHING — THE AI FILLS ANY EMPTY SEAT"
                        },
                        style = AegisType.label.copy(
                            fontSize = 8.sp,
                            color = if (queueStatus is QueueStatus.Failed) Vital.hurt else Ink.muted,
                        ),
                    )
                }

                Spacer(Modifier.height(16.dp))
                BasicText("PACE", style = AegisType.label.copy(color = Gilt.mid))
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("fast", "normal", "slow").forEach { key ->
                        val def = data.pacing.paces.getValue(key)
                        PaceOption(
                            label = def.label,
                            xpMultiplier = def.xpMultiplier,
                            selected = pace == key,
                            modifier = Modifier.weight(1f),
                        ) { pace = key }
                    }
                }

                Spacer(Modifier.height(18.dp))
                if (ready) {
                    GiltButton("Enter Dungeon", onClick = { onEnter(pace) })
                } else {
                    BasicText("WAITING FOR GROUP…", style = AegisType.label.copy(color = Ink.muted))
                }
                Spacer(Modifier.height(10.dp))
                BasicText(
                    "CANCEL",
                    style = AegisType.label.copy(color = Ink.muted),
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable(onClickLabel = "Cancel", onClick = onClose)
                    .semantics { role = Role.Button }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
}

private fun roleLabel(role: UnitRole) = when (role) {
    UnitRole.TANK -> "TANK"
    UnitRole.DPS -> "DPS"
    UnitRole.HEALER -> "HEALER"
}

/** One party slot, labelled with the role it will hold. */
@Composable
private fun QueueSlot(role: UnitRole, isYou: Boolean, occupied: Boolean) {
    val accent = LocalAccent.current
    val ring = when {
        isYou -> accent.bright
        occupied -> Vital.healthy
        else -> Ink.muted.copy(alpha = 0.4f)
    }
    val fill = when {
        isYou -> accent.core.copy(alpha = 0.85f)
        occupied -> Vital.healthy.copy(alpha = 0.75f)
        else -> Obsidian.abyss
    }
    val state = if (isYou) ", you" else if (occupied) ", filled" else ", waiting"
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics { contentDescription = roleLabel(role) + state },
    ) {
        Box(Modifier.size(26.dp).clip(CircleShape).background(fill).border(1.dp, ring, CircleShape))
        Spacer(Modifier.height(3.dp))
        BasicText(
            // Three slots say DPS; abbreviating the healer keeps the row tight.
            if (role == UnitRole.HEALER) "HEAL" else roleLabel(role),
            style = AegisType.label.copy(fontSize = 8.sp, color = if (isYou) accent.bright else Ink.muted),
        )
    }
}

@Composable
private fun PaceOption(
    label: String,
    xpMultiplier: Double,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> kotlin.Unit,
) {
    val accent = LocalAccent.current
    val shape = RoundedCornerShape(5.dp)
    Column(
        modifier
            .clip(shape)
            .background(if (selected) Obsidian.raised else Obsidian.deep)
            .border(
                if (selected) 2.dp else 1.dp,
                if (selected) accent.core else Gilt.deep.copy(alpha = 0.45f),
                shape,
            )
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText(
            label.uppercase(),
            style = AegisType.label.copy(color = if (selected) Ink.primary else Ink.secondary),
        )
        Spacer(Modifier.height(3.dp))
        // The trade the player is actually making: speed against experience.
        BasicText(
            "${trimZeros(xpMultiplier)}× XP",
            style = AegisType.label.copy(fontSize = 11.sp, color = if (selected) accent.bright else Ink.muted),
        )
    }
}

private fun trimZeros(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

// --- run outcome ------------------------------------------------------------

@Composable
fun OutcomeDialog(
    outcome: DungeonOutcome,
    data: GameData,
    onDismiss: () -> kotlin.Unit,
) {
    val success = outcome.kind == DungeonOutcomeKind.SUCCESS
    val dungeon = data.dungeon(outcome.dungeonId)
    val headline = when (outcome.kind) {
        DungeonOutcomeKind.SUCCESS -> "Dungeon Cleared"
        DungeonOutcomeKind.PARTY_WIPE -> "Party Wiped"
        DungeonOutcomeKind.HEALER_DOWN -> "You Fell"
    }
    val accentColor = if (success) Gilt.core else Vital.critical

    Scrim(onDismiss = null) {
        ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(20.dp)) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText(
                    headline.uppercase(),
                    style = AegisType.title.copy(fontSize = 18.sp, color = accentColor),
                )
                if (dungeon != null) {
                    Spacer(Modifier.height(4.dp))
                    BasicText(dungeon.name.uppercase(), style = AegisType.label)
                }

                Spacer(Modifier.height(14.dp))
                GiltRule(Modifier.fillMaxWidth().height(1.dp))
                Spacer(Modifier.height(14.dp))

                StatRow("Experience", "+${outcome.xpGained}")
                StatRow("Healing done", outcome.stats.totalHealing.toInt().toString())
                StatRow("HPS", String.format("%.1f", outcome.stats.hps))
                StatRow("Overheal", "${outcome.stats.overhealPct.toInt()}%")
                StatRow("Healing per mana", String.format("%.2f", outcome.stats.hpm))

                // Levelling up can unlock a spell rank or a stronger potion. The
                // web app shows this; Android computed it and dropped it.
                val rewards = outcome.upgradedSpellIds
                if (outcome.leveledUp && (rewards.isNotEmpty() || outcome.upgradedPotion)) {
                    Spacer(Modifier.height(14.dp))
                    GiltRule(Modifier.fillMaxWidth().height(1.dp))
                    Spacer(Modifier.height(12.dp))
                    BasicText(
                        "REWARDS UNLOCKED",
                        style = AegisType.label.copy(color = Gilt.core),
                    )
                    Spacer(Modifier.height(8.dp))
                    rewards.forEach { id ->
                        val spell = data.spell(id)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            GameIcon(spell?.icon ?: "", size = 26.dp, accent = Gilt.deep)
                            Spacer(Modifier.width(8.dp))
                            BasicText(
                                "${spell?.name ?: id} rank up",
                                style = AegisType.body.copy(color = Ink.secondary),
                            )
                        }
                    }
                    if (outcome.upgradedPotion) {
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            GameIcon("wow/inv_potion_70", size = 26.dp, accent = Gilt.deep)
                            Spacer(Modifier.width(8.dp))
                            BasicText(
                                "Mana potion improved",
                                style = AegisType.body.copy(color = Ink.secondary),
                            )
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))
                GiltButton("Continue", onClick = onDismiss)
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(label.uppercase(), style = AegisType.label, modifier = Modifier.weight(1f))
        BasicText(value, style = AegisType.numeric.copy(fontSize = 14.sp))
    }
}

// --- confirmation -----------------------------------------------------------

/**
 * Two-button confirm, used for anything that throws away a run in progress.
 *
 * Leaving mid-dungeon used to be a single unguarded tap, and system back now
 * reaches the same action — a stray edge swipe should not cost a boss fight.
 */
@Composable
fun ConfirmDialog(
    headline: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> kotlin.Unit,
    onDismiss: () -> kotlin.Unit,
) {
    Scrim(onDismiss = onDismiss) {
        ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(20.dp)) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText(
                    headline.uppercase(),
                    style = AegisType.title.copy(fontSize = 17.sp, color = Vital.critical),
                )
                Spacer(Modifier.height(12.dp))
                BasicText(body, style = AegisType.body.copy(color = Ink.secondary))
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GiltButton(confirmLabel, onClick = onConfirm)
                    BasicText(
                        "STAY",
                        style = AegisType.label.copy(color = Ink.muted),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .clickable(onClickLabel = "Stay in the dungeon", onClick = onDismiss)
                            .semantics { role = Role.Button }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }
}


// --- display settings -------------------------------------------------------

/**
 * Five toggles, deliberately. HealBot's own guidance is that a small readable
 * setup beats enabling everything, and a five-unit party on a phone removes most
 * of the reason to configure anything at all.
 */
@Composable
fun SettingsDialog(
    settings: UiSettings,
    onChange: (UiSettings) -> kotlin.Unit,
    multiplayerAvailable: Boolean,
    onDismiss: () -> kotlin.Unit,
) {
    Scrim(onDismiss = onDismiss) {
        ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp)) {
            Column {
                BasicText("DISPLAY", style = AegisType.title.copy(fontSize = 16.sp))
                Spacer(Modifier.height(10.dp))
                GiltRule(Modifier.fillMaxWidth().height(1.dp))
                Spacer(Modifier.height(6.dp))

                SettingRow(
                    "Health as percent",
                    "Off shows current and maximum instead.",
                    settings.healthTextPercent,
                ) { onChange(settings.copy(healthTextPercent = it)) }

                SettingRow(
                    "Show committed healing",
                    "The pale band for healing your HoTs will still deliver.",
                    settings.showCommitted,
                ) { onChange(settings.copy(showCommitted = it)) }

                SettingRow(
                    "Colour-blind health bands",
                    "Swaps the green-to-red ramp for blue to magenta.",
                    settings.colourBlindBands,
                ) { onChange(settings.copy(colourBlindBands = it)) }

                SettingRow(
                    "Keep my frame first",
                    "Puts you at the top of the party instead of the bottom.",
                    settings.selfFirst,
                ) { onChange(settings.copy(selfFirst = it)) }

                SettingRow(
                    "Larger frames",
                    "Taller rows where there is room for them.",
                    settings.largeFrames,
                ) { onChange(settings.copy(largeFrames = it)) }

                Spacer(Modifier.height(14.dp))
                BasicText("MULTIPLAYER", style = AegisType.title.copy(fontSize = 16.sp))
                Spacer(Modifier.height(10.dp))
                GiltRule(Modifier.fillMaxWidth().height(1.dp))
                Spacer(Modifier.height(6.dp))

                SettingRow(
                    "Play with other people",
                    if (multiplayerAvailable) {
                        // Says what leaves the device, in the one place someone
                        // deciding whether to turn it on is actually looking.
                        "Queue publicly. Off, the game never connects at all. " +
                            "On, it signs in anonymously and shares your class, level and " +
                            "talents with the people you play with."
                    } else {
                        "Unavailable in this build: it has no server configuration."
                    },
                    settings.multiplayer && multiplayerAvailable,
                    enabled = multiplayerAvailable,
                ) { onChange(settings.copy(multiplayer = it)) }

                Spacer(Modifier.height(14.dp))
                GiltButton("Close", onClick = onDismiss)
            }
        }
    }
}

@Composable
private fun SettingRow(
    label: String,
    hint: String,
    checked: Boolean,
    /** A row that cannot do anything says so rather than silently ignoring taps. */
    enabled: Boolean = true,
    onToggle: (Boolean) -> kotlin.Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClickLabel = label) { onToggle(!checked) }
            .semantics { role = Role.Switch; toggleableState = ToggleableState(checked) }
            .padding(vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            BasicText(
                label,
                style = AegisType.body.copy(color = if (enabled) Ink.primary else Ink.muted),
            )
            Spacer(Modifier.height(2.dp))
            BasicText(hint, style = AegisType.body.copy(fontSize = 11.sp, color = Ink.muted))
        }
        Spacer(Modifier.width(12.dp))
        // A gilt pill rather than a Material Switch: there is no Material theme
        // wired in this app, and importing one for five toggles is a bad trade.
        val knob by animateDpAsState(if (checked) 22.dp else 2.dp, label = "knob")
        Box(
            Modifier
                .size(44.dp, 24.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (checked) Gilt.deep else Obsidian.abyss)
                .border(
                    1.dp,
                    if (checked) Gilt.core else Gilt.deep.copy(alpha = 0.5f),
                    RoundedCornerShape(12.dp),
                ),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = knob)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(if (checked) Gilt.bright else Ink.muted),
            )
        }
    }
}
