package com.jdial.aegis.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.sim.DungeonRecord
import com.jdial.aegis.sim.clearTimeLabel
import com.jdial.aegis.sim.recordKey
import com.jdial.aegis.sim.sigilTint
import com.jdial.aegis.sim.titleFor
import com.jdial.aegis.R
import com.jdial.aegis.data.ClassBundle
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.ForgedPanel
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.GiltRule
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.Vital
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.ui.theme.Obsidian
import com.jdial.aegis.ui.theme.accentFor

// --- shared chrome ----------------------------------------------------------

/** The app ground: obsidian with a faint gilt bloom from above. */
@Composable
fun ObsidianBackdrop(content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Obsidian.abyss)
            .background(
                Brush.verticalGradient(
                    listOf(Obsidian.deep, Obsidian.abyss, Color.Black.copy(alpha = 0.6f)),
                ),
            ),
        content = content,
    )
}

/**
 * Phone-first content, centred and width-capped so a tablet shows the same
 * comfortable measure rather than stretching cards across 800dp.
 */
@Composable
fun ContentColumn(
    modifier: Modifier = Modifier,
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(
            modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
            horizontalAlignment = horizontalAlignment,
            content = content,
        )
    }
}

@Composable
private fun SectionHeading(text: String, subtitle: String? = null) {
    val compact = LocalCompactHeight.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        BasicText(
            text.uppercase(),
            style = AegisType.display.copy(
                textAlign = TextAlign.Center,
                fontSize = if (compact) 22.sp else AegisType.display.fontSize,
            ),
        )
        if (subtitle != null) {
            Spacer(Modifier.height(if (compact) 2.dp else 6.dp))
            BasicText(subtitle.uppercase(), style = AegisType.label.copy(textAlign = TextAlign.Center))
        }
        if (!compact) {
            Spacer(Modifier.height(14.dp))
            GiltRule(Modifier.fillMaxWidth(0.6f).height(1.dp), alpha = 0.5f)
        }
    }
}

/** Below this height a landscape window is "short": see MainActivity. */
const val COMPACT_HEIGHT_DP = 480

/** True in a short landscape window, where every row of height counts. */
val LocalCompactHeight = staticCompositionLocalOf { false }

// --- splash -----------------------------------------------------------------

@Composable
fun SplashScreen(version: String, onBegin: () -> Unit) {
    // Principle 6: the splash is the one place motion is allowed to be decorative.
    val shimmer by rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2600), RepeatMode.Reverse),
        label = "shimmerAlpha",
    )

    ObsidianBackdrop {
        // The source art is a vignetted disc with a light grey rim. Overscaling
        // pushes that rim outside the viewport at every aspect ratio, so the
        // artwork bleeds into the obsidian ground instead of ending in an arc.
        Image(
            painter = painterResource(R.drawable.splash_bg),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alpha = 0.55f,
            modifier = Modifier.fillMaxSize().scale(1.35f),
        )
        // Vignette: the artwork is a vignetted circle, so fade its edges into
        // the obsidian ground rather than letting them end in visible arcs.
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Obsidian.abyss,
                    0.18f to Color.Transparent,
                    0.72f to Color.Transparent,
                    1f to Obsidian.abyss,
                ),
            ),
        )
        // A gilt bloom breathing behind the crest in the artwork.
        Box(
            Modifier
                .align(Alignment.Center)
                .size(260.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        listOf(Gilt.core.copy(alpha = 0.18f * shimmer), Color.Transparent),
                    ),
                ),
        )

        // The wordmark sits in the lower third at every aspect ratio, over a
        // scrim so it never has to compete with the starburst behind it.
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.46f)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Obsidian.abyss.copy(alpha = 0.82f), Obsidian.abyss),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 28.dp)
                .padding(bottom = 56.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BasicText("OVERHEAL", style = AegisType.display.copy(fontSize = 34.sp, letterSpacing = 8.sp))
            Spacer(Modifier.height(10.dp))
            // Every role, not just the healer: the web app keeps its healer
            // tagline because it only has healers.
            BasicText("TANK  ·  HEAL  ·  DPS", style = AegisType.label)
            Spacer(Modifier.height(36.dp))
            GiltButton("Tap to Begin", onClick = onBegin)
            Spacer(Modifier.height(18.dp))
            BasicText(version, style = AegisType.body.copy(color = Ink.muted))
        }
    }
}

/** Principle 2: gold is reserved for the single most important action on screen. */
@Composable
fun GiltButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(5.dp)
    Box(
        modifier
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Gilt.bright, Gilt.mid, Gilt.deep)))
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = 30.dp, vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            label.uppercase(),
            style = AegisType.label.copy(color = Obsidian.abyss, fontSize = 13.sp),
        )
    }
}

// --- class select -----------------------------------------------------------

@Composable
fun ClassSelectScreen(
    data: GameData,
    maxLevel: Int,
    onPick: (PlayerClass) -> Unit,
) {
    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                // Three class cards do not fit a landscape phone, and this was
                // the one screen with no scroll — the third class was simply
                // unreachable. Tablets already hit this, since targetSdk 36+
                // ignores the portrait lock above 600dp.
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 22.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            ContentColumn(horizontalAlignment = Alignment.CenterHorizontally) {
                SectionHeading("The Order", "Select your path")
                Spacer(Modifier.height(24.dp))

                // The gate used to read a `locked` flag in class.json and compare
                // against a hardcoded 30, while the web app compared against 25.
                // Both now read the same number out of balance.json.
                val unlockLevel = data.balance.progression.paladinUnlockLevel

                // Grouped by role, so nine classes read as three choices rather
                // than one long list.
                val byRole = PlayerClass.entries.groupBy { data.bundle(it).meta.role }
                listOf("HEALER", "DPS", "TANK").forEach { role ->
                    // Unfinished classes are not shown at all. A card that
                    // can never be picked, with no way to change that, only
                    // makes the game look smaller than it is.
                    val classes = byRole[role].orEmpty().filterNot { data.bundle(it).meta.locked }
                    if (classes.isEmpty()) return@forEach

                    BasicText(
                        role,
                        style = AegisType.label.copy(
                            fontSize = 11.sp,
                            color = when (role) {
                                "TANK" -> Vital.shield
                                "DPS" -> Vital.hurt
                                else -> Vital.healthy
                            },
                        ),
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    classes.forEach { cls ->
                        val bundle = data.bundle(cls)
                        val levelGated = cls == PlayerClass.PALADIN && maxLevel < unlockLevel
                        ClassCard(cls, bundle, levelGated, unlockLevel) {
                            if (!levelGated) onPick(cls)
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    Spacer(Modifier.height(10.dp))
                }
            }
        }
    }
}

@Composable
private fun ClassCard(
    cls: PlayerClass,
    bundle: ClassBundle,
    levelGated: Boolean,
    unlockLevel: Int,
    onClick: () -> Unit,
) {
    val accent = accentFor(cls)
    val locked = levelGated
    ForgedPanel(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !locked, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = when {
                    levelGated -> "${bundle.meta.name}, locked, reach level $unlockLevel to unlock"
                    else -> {
                        "${bundle.meta.name}. ${bundle.meta.passiveTraitName}. " +
                            bundle.meta.description
                    }
                }
            },
        accent = accent.core,
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            // Principle 3: a class-coloured ribbon marks identity at a glance.
            Box(
                Modifier
                    .width(4.dp)
                    .height(84.dp)
                    .background(if (locked) Ink.muted.copy(alpha = 0.4f) else accent.core),
            )
            Spacer(Modifier.width(14.dp))
            GameIcon(
                iconPath = classPortrait(cls),
                size = 52.dp,
                accent = accent.core,
                dimmed = locked,
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f).padding(vertical = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(
                        bundle.meta.name.uppercase(),
                        // weight(fill = false) so a long name yields space to the
                        // badge rather than squeezing it into a vertical strip,
                        // which is what "PROTECTION WARRIOR" did.
                        modifier = Modifier.weight(1f, fill = false),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = AegisType.title.copy(
                            color = if (locked) Ink.muted else Ink.primary,
                        ),
                    )
                    // Which job this class does. With five classes across three
                    // roles the name alone no longer says it -- "Frost Mage"
                    // tells a WoW player, but the game should not require that.
                    Spacer(Modifier.width(8.dp))
                    RoleBadge(bundle.meta.role, dimmed = locked)
                }
                Spacer(Modifier.height(4.dp))
                if (locked) {
                    BasicText(
                        "REACH LVL $unlockLevel TO UNLOCK",
                        style = AegisType.label.copy(color = Gilt.mid),
                    )
                } else {
                    BasicText(bundle.meta.passiveTraitName, style = AegisType.body.copy(color = accent.bright))
                    Spacer(Modifier.height(3.dp))
                    BasicText(bundle.meta.description, style = AegisType.body.copy(color = Ink.secondary))
                }
            }
            Spacer(Modifier.width(12.dp))
        }
    }
}

/** TANK / DPS / HEALER, in the colour the rest of the UI uses for that idea. */
@Composable
private fun RoleBadge(role: String, dimmed: Boolean) {
    val colour = when (role) {
        "TANK" -> Vital.shield
        "DPS" -> Vital.hurt
        else -> Vital.healthy
    }.let { if (dimmed) it.copy(alpha = 0.35f) else it }

    BasicText(
        role,
        maxLines = 1,
        style = AegisType.label.copy(fontSize = 10.sp, color = colour),
        modifier = Modifier
            .border(1.dp, colour.copy(alpha = 0.55f), RoundedCornerShape(3.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

private fun classPortrait(cls: PlayerClass) = when (cls) {
    PlayerClass.PRIEST -> "class-icons/priest"
    PlayerClass.DRUID -> "class-icons/druid"
    PlayerClass.PALADIN -> "class-icons/paladin"
    PlayerClass.MAGE -> "class-icons/mage"
    PlayerClass.WARRIOR -> "class-icons/warrior"
    PlayerClass.DEATHKNIGHT -> "class-icons/death_knight"
    PlayerClass.ROGUE -> "class-icons/rogue"
    PlayerClass.MONK -> "class-icons/monk"
    PlayerClass.WARLOCK -> "class-icons/warlock"
}

// --- dungeon list -----------------------------------------------------------

@Composable
fun DungeonListScreen(
    data: GameData,
    playerLevel: Int,
    cls: PlayerClass,
    talentPoints: Int,
    records: Map<String, DungeonRecord>,
    onSelect: (Dungeon) -> Unit,
) {
    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 16.dp, vertical = if (LocalCompactHeight.current) 8.dp else 18.dp),
        ) {
            ContentColumn(horizontalAlignment = Alignment.CenterHorizontally) {
                SectionHeading(
                    "Dungeons",
                    data.bundle(cls).meta.name + "  ·  LV " + playerLevel +
                        if (talentPoints > 0) "  ·  " + talentPoints + " PT" else "",
                )
            }
            Spacer(Modifier.height(if (LocalCompactHeight.current) 8.dp else 16.dp))

            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
                ) {
                    items(data.dungeons, key = { it.id }) { dungeon ->
                        val locked = playerLevel < dungeon.levelMin
                        DungeonCard(dungeon, locked, records[dungeon.id], records[recordKey(dungeon.id, true)]) {
                            if (!locked) onSelect(dungeon)
                        }
                    }
                }
                // Fade the list into the ground so a card never ends in a hard
                // horizontal cut against the footer.
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .height(40.dp)
                        .background(
                            Brush.verticalGradient(listOf(Color.Transparent, Obsidian.abyss)),
                        ),
                )
            }

        }
    }
}

/**
 * What a character has brought back: one keepsake per dungeon it has cleared,
 * and the name those clears have earned it.
 */
@Composable
fun TrophyCase(records: Map<String, DungeonRecord>, data: GameData) {
    val won = data.dungeons.filter { (records[it.id]?.clears ?: 0) > 0 }
    if (won.isEmpty()) return
    val title = titleFor(records, data.dungeons.count { !it.endless })
    ForgedPanel(Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicText("TROPHIES", style = AegisType.label.copy(color = Gilt.mid))
                Spacer(Modifier.weight(1f))
                if (title != null) {
                    BasicText(title.uppercase(), style = AegisType.label.copy(color = Gilt.core))
                }
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                won.forEach { d ->
                    val r = records.getValue(d.id)
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp)) {
                        GameIcon(d.bossIcon, size = 34.dp, accent = if (r.sharp) Gilt.core else Gilt.deep)
                        BasicText(
                            clearTimeLabel(r.bestTicks),
                            style = AegisType.label.copy(fontSize = 9.sp, color = Ink.secondary),
                        )
                    }
                }
            }
        }
    }
    Spacer(Modifier.height(12.dp))
}

/** One earned mark on a dungeon card: lit when it has been done. */
@Composable
private fun Mark(label: String, earned: Boolean) {
    BasicText(
        label,
        style = AegisType.label.copy(
            fontSize = 8.sp,
            color = if (earned) Obsidian.abyss else Ink.muted,
        ),
        modifier = Modifier
            .clip(RoundedCornerShape(3.dp))
            .background(if (earned) Gilt.core else Obsidian.deep)
            .padding(horizontal = 5.dp, vertical = 2.dp),
    )
}

@Composable
private fun DungeonCard(
    dungeon: Dungeon,
    locked: Boolean,
    record: DungeonRecord?,
    hardRecord: DungeonRecord?,
    onClick: () -> Unit,
) {
    val accent = LocalAccent.current
    ForgedPanel(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (locked) 0.55f else 1f)
            .clickable(enabled = !locked, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "${dungeon.name}, levels ${dungeon.levelMin} to " +
                    "${dungeon.levelMax}, tier ${dungeon.difficulty}, " +
                    "boss ${dungeon.bossName}" + if (locked) ", locked" else ""
                if (locked) disabled()
            },
        accent = accent.core,
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GameIcon(dungeon.cardIcon, size = 42.dp, accent = Gilt.mid, dimmed = locked)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    BasicText(dungeon.name.uppercase(), style = AegisType.title.copy(fontSize = 16.sp))
                    Spacer(Modifier.height(3.dp))
                    BasicText(
                        "LV ${dungeon.levelMin}–${dungeon.levelMax}   ·   TIER ${dungeon.difficulty}",
                        style = AegisType.label,
                    )
                }
                if (locked) {
                    GameIcon("lorc/padlock", size = 26.dp, accent = Ink.muted)
                }
            }

            if (record != null && record.clears > 0) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BasicText(
                        "BEST ${clearTimeLabel(record.bestTicks)}   ·   ${record.clears} CLEAR" +
                            if (record.clears == 1) "" else "S",
                        style = AegisType.label.copy(color = Gilt.core),
                    )
                    Spacer(Modifier.weight(1f))
                    // Cleared, Clean, Sharp: what this dungeon has seen you do.
                    Mark("CLEARED", true)
                    Spacer(Modifier.width(6.dp))
                    Mark("CLEAN", record.clean)
                    Spacer(Modifier.width(6.dp))
                    Mark("SHARP", record.sharp)
                }
                if (hardRecord != null && hardRecord.clears > 0) {
                    Spacer(Modifier.height(4.dp))
                    BasicText(
                        "HARD ${clearTimeLabel(hardRecord.bestTicks)}   ·   ${hardRecord.clears}",
                        style = AegisType.label.copy(color = Vital.critical),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))
            GiltRule(Modifier.fillMaxWidth().height(1.dp))
            Spacer(Modifier.height(10.dp))

            // The boss is the threat: give it the accent and the largest type.
            Row(verticalAlignment = Alignment.CenterVertically) {
                GameIcon(dungeon.bossIcon, size = 34.dp, accent = accent.core, dimmed = locked)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    BasicText("BOSS", style = AegisType.label.copy(color = Gilt.mid))
                    BasicText(dungeon.bossName, style = AegisType.numeric)
                }
                Column(horizontalAlignment = Alignment.End) {
                    BasicText("HEALTH", style = AegisType.label.copy(color = Gilt.mid))
                    BasicText(dungeon.bossHealth.toInt().toString(), style = AegisType.numeric)
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                dungeon.enemies.forEach { enemy ->
                    GameIcon(enemy.icon, size = 26.dp, accent = Gilt.deep, dimmed = locked)
                }
            }
        }
    }
}
