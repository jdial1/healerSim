package com.jdial.aegis.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.Engine
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.TalentRank
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.ForgedPanel
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.GiltRule
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.ui.theme.Obsidian
import com.jdial.aegis.ui.theme.Vital

/**
 * The talent tree: a grid of icons on the class's `gridX`/`gridY` coordinates.
 *
 * Tap an available talent to invest a point; tap an invested one again to see
 * it, and use REFUND to take the point back. Availability is computed by the
 * engine, so the rules here match the simulation exactly.
 */
@Composable
fun TalentScreen(
    state: GameState,
    engine: Engine,
    onInvest: (String) -> Unit,
    onRefund: (String) -> Unit,
    onRespec: () -> Unit,
) {
    val cls = state.playerClass ?: return
    var selectedId: String? by remember { mutableStateOf(null) }
    val accent = LocalAccent.current

    val columns = (state.talents.maxOfOrNull { it.talent.gridX } ?: 0) + 1
    val rows = (state.talents.maxOfOrNull { it.talent.gridY } ?: 0) + 1
    val byCell = state.talents.associateBy { it.talent.gridX to it.talent.gridY }

    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 14.dp, vertical = 16.dp),
        ) {
            ContentColumn(horizontalAlignment = Alignment.CenterHorizontally) {
                BasicText("TALENTS", style = AegisType.display.copy(fontSize = 26.sp, letterSpacing = 5.sp))
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(
                        "${state.talentPoints} POINT${if (state.talentPoints == 1) "" else "S"}",
                        style = AegisType.label.copy(
                            color = if (state.talentPoints > 0) accent.bright else Ink.muted,
                        ),
                    )
                    Spacer(Modifier.width(14.dp))
                    BasicText(
                        "RESPEC",
                        style = AegisType.label.copy(color = Ink.muted),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .clickable(onClickLabel = "Refund all talent points") { onRespec(); selectedId = null }
                    .semantics { role = Role.Button }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
                GiltRule(Modifier.fillMaxWidth(0.7f).height(1.dp))
            }

            Spacer(Modifier.height(14.dp))

            // The tree is wider than a phone at 6 columns, so it scrolls both ways.
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .verticalScroll(rememberScrollState()),
            ) {
                val cell = 56.dp
                val gap = 10.dp
                val byId = state.talents.associateBy { it.id }

                Box {
                    // Dependency edges are drawn under the nodes: a solid line to a
                    // prerequisite, a dashed one between mutually exclusive choices.
                    TalentEdges(
                        talents = state.talents,
                        byId = byId,
                        cell = cell,
                        gap = gap,
                        columns = columns,
                        rows = rows,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                        repeat(rows) { y ->
                            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                                repeat(columns) { x ->
                                    val rank = byCell[x to y]
                                    if (rank == null) {
                                        Spacer(Modifier.size(cell))
                                    } else {
                                        TalentNode(
                                            rank = rank,
                                            state = state,
                                            engine = engine,
                                            selected = selectedId == rank.id,
                                            onClick = { selectedId = rank.id },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            TalentDetail(
                rank = state.talents.firstOrNull { it.id == selectedId },
                state = state,
                engine = engine,
                onInvest = onInvest,
                onRefund = onRefund,
            )
        }
    }
}

/**
 * The lines between talents. Prerequisites are solid and light up once the
 * parent is invested; mutually exclusive pairs are dashed, because picking one
 * closes the other off.
 */
@Composable
private fun TalentEdges(
    talents: List<TalentRank>,
    byId: Map<String, TalentRank>,
    cell: Dp,
    gap: Dp,
    columns: Int,
    rows: Int,
) {
    val accent = LocalAccent.current
    Canvas(
        Modifier.size(
            width = cell * columns + gap * (columns - 1),
            height = cell * rows + gap * (rows - 1),
        ),
    ) {
        val step = (cell + gap).toPx()
        val half = cell.toPx() / 2f
        fun centre(t: TalentRank) = Offset(t.talent.gridX * step + half, t.talent.gridY * step + half)

        talents.forEach { t ->
            t.talent.prerequisites.forEach { id ->
                val parent = byId[id] ?: return@forEach
                val satisfied = parent.points > 0
                drawLine(
                    color = if (satisfied) accent.core.copy(alpha = 0.7f) else Gilt.deep.copy(alpha = 0.45f),
                    start = centre(parent),
                    end = centre(t),
                    strokeWidth = if (satisfied) 2.5f * density else 1.5f * density,
                )
            }
            t.talent.exclusiveWith.forEach { id ->
                val other = byId[id] ?: return@forEach
                // Draw each pair once.
                if (t.id > other.id) return@forEach
                drawLine(
                    color = Vital.critical.copy(alpha = 0.35f),
                    start = centre(t),
                    end = centre(other),
                    strokeWidth = 1.5f * density,
                    pathEffect = PathEffect.dashPathEffect(
                        floatArrayOf(6f * density, 6f * density),
                    ),
                )
            }
        }
    }
}

/** A talent is available when the engine would actually accept the point. */
private fun isAvailable(rank: TalentRank, state: GameState, engine: Engine): Boolean =
    state.talentPoints >= rank.talent.cost &&
        state.level >= rank.talent.levelReq &&
        rank.points < rank.talent.maxPoints &&
        engine.stats.prereqsSatisfied(state.talents, rank.talent)

@Composable
private fun TalentNode(
    rank: TalentRank,
    state: GameState,
    engine: Engine,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val accent = LocalAccent.current
    val invested = rank.points > 0
    val maxed = rank.points >= rank.talent.maxPoints
    val available = isAvailable(rank, state, engine)

    val border = when {
        selected -> accent.bright
        maxed -> Gilt.core
        invested -> accent.core
        available -> Gilt.mid.copy(alpha = 0.75f)
        else -> Gilt.deep.copy(alpha = 0.35f)
    }

    Box(
        Modifier
            .size(56.dp)
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "${rank.talent.name}, " +
                    "${rank.points} of ${rank.talent.maxPoints} points" +
                    when {
                        maxed -> ", fully learned"
                        available -> ", available to learn"
                        invested -> ""
                        else -> ", locked"
                    }
            },
    ) {
        GameIcon(
            iconPath = rank.talent.icon,
            size = 56.dp,
            accent = border,
            dimmed = !invested && !available,
        )
        // The rank badge is the only number here, so it carries the state.
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .clip(RoundedCornerShape(3.dp))
                .background(if (maxed) Gilt.core else Obsidian.abyss)
                .border(1.dp, border, RoundedCornerShape(3.dp))
                .padding(horizontal = 4.dp, vertical = 1.dp),
        ) {
            BasicText(
                "${rank.points}/${rank.talent.maxPoints}",
                style = AegisType.label.copy(
                    fontSize = 11.sp,
                    color = if (maxed) Obsidian.abyss else Ink.secondary,
                ),
            )
        }
    }
}

@Composable
private fun TalentDetail(
    rank: TalentRank?,
    state: GameState,
    engine: Engine,
    onInvest: (String) -> Unit,
    onRefund: (String) -> Unit,
) {
    ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(14.dp)) {
        if (rank == null) {
            BasicText(
                "Select a talent to view details.",
                style = AegisType.body.copy(color = Ink.muted),
            )
            return@ForgedPanel
        }

        val available = isAvailable(rank, state, engine)
        val unmet = engine.stats.unmetPrerequisites(state.talents, rank.talent)

        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicText(
                    rank.talent.name.uppercase(),
                    style = AegisType.title.copy(fontSize = 15.sp),
                    modifier = Modifier.weight(1f),
                )
                BasicText(
                    "${rank.points} / ${rank.talent.maxPoints}",
                    style = AegisType.numeric.copy(fontSize = 13.sp),
                )
            }
            Spacer(Modifier.height(6.dp))
            BasicText(rank.talent.description, style = AegisType.body)

            // Say plainly why a talent cannot be taken, rather than just greying out.
            val blocker = when {
                state.level < rank.talent.levelReq -> "Requires level ${rank.talent.levelReq}"
                unmet.isNotEmpty() -> "Requires ${unmet.joinToString { it.talent.name }}"
                rank.points >= rank.talent.maxPoints -> "Fully invested"
                state.talentPoints < rank.talent.cost -> "No points available"
                else -> null
            }
            if (blocker != null) {
                Spacer(Modifier.height(6.dp))
                BasicText(blocker.uppercase(), style = AegisType.label.copy(color = Gilt.mid))
            }

            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (available) GiltButton("Learn", onClick = { onInvest(rank.id) })
                if (rank.points > 0) {
                    BasicText(
                        "REFUND",
                        style = AegisType.label.copy(color = Ink.secondary),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .border(1.dp, Gilt.deep.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                            .clickable(onClickLabel = "Refund one point") { onRefund(rank.id) }
                    .semantics { role = Role.Button }
                            .padding(horizontal = 16.dp, vertical = 13.dp),
                    )
                }
            }
        }
    }
}

/**
 * The character sheet: derived stats and the class mastery, read straight from
 * the same functions the simulation uses.
 */
@Composable
fun CharacterScreen(state: GameState, engine: Engine, onChangeClass: () -> Unit) {
    val cls = state.playerClass ?: return
    var showCredits by remember { mutableStateOf(false) }
    val meta = engine.data.bundle(cls).meta
    val primary = engine.stats.primaryStats(cls, state.level)
    val talentStats = engine.stats.talentStats(state.talents)
    val healMult = engine.stats.healingMultiplier(cls, state.level, state.talents)
    val unique = engine.stats.uniqueStatRating(cls, state.level, state.talents)
    val progress = engine.progression.xpProgressWithinLevel(state.xp)
    val accent = LocalAccent.current

    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 16.dp, vertical = 18.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            ContentColumn(horizontalAlignment = Alignment.CenterHorizontally) {
                GameIcon(meta.passiveTraitIcon, size = 64.dp, accent = accent.core)
                Spacer(Modifier.height(10.dp))
                BasicText(meta.name.uppercase(), style = AegisType.title.copy(fontSize = 18.sp))
                Spacer(Modifier.height(4.dp))
                BasicText("LEVEL ${state.level}", style = AegisType.label.copy(color = accent.bright))

                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Obsidian.abyss)
                        .border(1.dp, Gilt.deep.copy(alpha = 0.5f), RoundedCornerShape(4.dp)),
                ) {
                    val pct = if (progress.needed > 0) progress.into.toFloat() / progress.needed else 0f
                    Box(
                        Modifier
                            .fillMaxWidth(pct.coerceIn(0f, 1f))
                            .height(8.dp)
                            .background(accent.core),
                    )
                }
                Spacer(Modifier.height(4.dp))
                BasicText(
                    "${progress.into} / ${progress.needed} XP",
                    style = AegisType.label.copy(fontSize = 11.sp, color = Ink.muted),
                )

                Spacer(Modifier.height(18.dp))
                StatPanel("Attributes") {
                    StatLine("Intellect", primary.intellect.toInt().toString())
                    StatLine("Spirit", primary.spirit.toInt().toString())
                    StatLine("Max Health", engine.stats.healerMaxHealth(state.level).toString())
                    StatLine("Max Mana", state.maxMana.toString())
                }

                Spacer(Modifier.height(12.dp))
                StatPanel("Affinities") {
                    // Spirit, not intellect, is this game's healing power stat.
                    StatLine("Bonus Healing", "+${((healMult - 1) * 100).toInt()}%")
                    StatLine("Crit Chance", "${talentStats.critChancePct.toInt()}%")
                    StatLine("Haste", "${talentStats.hastePct.toInt()}%")
                    StatLine(uniqueStatLabel(cls), String.format("%.1f", unique))
                }

                Spacer(Modifier.height(12.dp))
                ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(14.dp)) {
                    Column {
                        BasicText("CLASS MASTERY", style = AegisType.label.copy(color = Gilt.mid))
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GameIcon(meta.passiveTraitIcon, size = 36.dp, accent = accent.core)
                            Spacer(Modifier.width(10.dp))
                            BasicText(
                                meta.passiveTraitName,
                                style = AegisType.numeric.copy(fontSize = 14.sp, color = accent.bright),
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        BasicText(meta.passiveTraitDescription, style = AegisType.body)
                    }
                }
                Spacer(Modifier.height(18.dp))
                GiltButton("Change Class", onClick = onChangeClass)
                Spacer(Modifier.height(16.dp))
                BasicText(
                    "CREDITS",
                    style = AegisType.label.copy(fontSize = 11.sp, color = Ink.muted),
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable(onClickLabel = "Open credits") { showCredits = true }
                    .semantics { role = Role.Button }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
                Spacer(Modifier.height(20.dp))
            }
        }

        // Was declared and never called: the button set the flag and nothing
        // rendered. This is the app's only attribution surface, which CC BY
        // requires, so a dead button here is a licence problem too.
        if (showCredits) CreditsDialog(onDismiss = { showCredits = false })
    }
}

private fun uniqueStatLabel(cls: PlayerClass) = when (cls) {
    PlayerClass.PRIEST -> "Divinity"
    PlayerClass.DRUID -> "Vitality"
    PlayerClass.PALADIN -> "Radiance"
}

@Composable
private fun StatPanel(title: String, content: @Composable () -> Unit) {
    ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(14.dp)) {
        Column {
            BasicText(title.uppercase(), style = AegisType.label.copy(color = Gilt.mid))
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun StatLine(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(label, style = AegisType.body, modifier = Modifier.weight(1f))
        BasicText(value, style = AegisType.numeric.copy(fontSize = 14.sp))
    }
}

/**
 * Attribution for the bundled artwork. game-icons.net is CC BY 3.0, which
 * requires credit wherever the icons ship — so it ships with them.
 */
@Composable
private fun CreditsDialog(onDismiss: () -> Unit) {
    // Third hand-rolled copy of the same dim-and-dismiss scaffold; the one in
    // Dialogs.kt does exactly this. (TutorialOverlay's looks similar but anchors
    // its card top/centre/bottom, so it stays its own thing rather than growing
    // this one an alignment parameter used once.)
    Scrim(onDismiss = onDismiss) {
        Box(Modifier.padding(4.dp)) {
            ForgedPanel(Modifier.fillMaxWidth(), contentPadding = PaddingValues(18.dp)) {
                Column {
                    BasicText("CREDITS", style = AegisType.title.copy(fontSize = 16.sp))
                    Spacer(Modifier.height(12.dp))
                    GiltRule(Modifier.fillMaxWidth().height(1.dp))
                    Spacer(Modifier.height(12.dp))
                    BasicText(
                        "Interface icons by Lorc, Delapouite and contributors at " +
                            "game-icons.net, used under CC BY 3.0.",
                        style = AegisType.body,
                    )
                    Spacer(Modifier.height(10.dp))
                    BasicText(
                        "Cinzel typeface by Natanael Gama, SIL Open Font License 1.1.",
                        style = AegisType.body,
                    )
                    Spacer(Modifier.height(10.dp))
                    BasicText(
                        // The app is distributed publicly, so it cannot describe
                        // itself as personal, non-commercial use.
                        "Ability icons are World of Warcraft artwork. World of Warcraft " +
                            "and Blizzard Entertainment are trademarks of Blizzard " +
                            "Entertainment, Inc. This game is unofficial and is not " +
                            "affiliated with or endorsed by Blizzard Entertainment.",
                        style = AegisType.body.copy(color = Ink.muted),
                    )
                    Spacer(Modifier.height(16.dp))
                    GiltButton("Close", onClick = onDismiss)
                }
            }
        }
    }
}
