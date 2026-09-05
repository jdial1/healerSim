package com.jdial.aegis.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        BasicText(text.uppercase(), style = AegisType.display.copy(textAlign = TextAlign.Center))
        if (subtitle != null) {
            Spacer(Modifier.height(6.dp))
            BasicText(subtitle.uppercase(), style = AegisType.label.copy(textAlign = TextAlign.Center))
        }
        Spacer(Modifier.height(14.dp))
        GiltRule(Modifier.fillMaxWidth(0.6f).height(1.dp), alpha = 0.5f)
    }
}

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
            BasicText("THE HEALER'S OATH", style = AegisType.label)
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
                PlayerClass.entries.forEachIndexed { i, cls ->
                    val bundle = data.bundle(cls)
                    val locked = cls == PlayerClass.PALADIN && maxLevel < unlockLevel
                    ClassCard(cls, bundle, locked, unlockLevel) { if (!locked) onPick(cls) }
                    if (i < PlayerClass.entries.lastIndex) Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
private fun ClassCard(
    cls: PlayerClass,
    bundle: ClassBundle,
    locked: Boolean,
    unlockLevel: Int,
    onClick: () -> Unit,
) {
    val accent = accentFor(cls)
    ForgedPanel(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !locked, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = if (locked) {
                    "${bundle.meta.name}, locked, reach level $unlockLevel to unlock"
                } else {
                    "${bundle.meta.name}. ${bundle.meta.passiveTraitName}. ${bundle.meta.description}"
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
                BasicText(
                    bundle.meta.name.uppercase(),
                    style = AegisType.title.copy(
                        color = if (locked) Ink.muted else Ink.primary,
                    ),
                )
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

private fun classPortrait(cls: PlayerClass) = when (cls) {
    PlayerClass.PRIEST -> "class-icons/priest"
    PlayerClass.DRUID -> "class-icons/druid"
    PlayerClass.PALADIN -> "class-icons/paladin"
}

// --- dungeon list -----------------------------------------------------------

@Composable
fun DungeonListScreen(
    data: GameData,
    playerLevel: Int,
    cls: PlayerClass,
    talentPoints: Int,
    onSelect: (Dungeon) -> Unit,
) {
    ObsidianBackdrop {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars)
                .padding(horizontal = 16.dp, vertical = 18.dp),
        ) {
            ContentColumn(horizontalAlignment = Alignment.CenterHorizontally) {
                SectionHeading(
                    "Dungeons",
                    data.bundle(cls).meta.name + "  ·  LV " + playerLevel +
                        if (talentPoints > 0) "  ·  " + talentPoints + " PT" else "",
                )
            }
            Spacer(Modifier.height(16.dp))

            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
                ) {
                    items(data.dungeons, key = { it.id }) { dungeon ->
                        val locked = playerLevel < dungeon.levelMin
                        DungeonCard(dungeon, locked) { if (!locked) onSelect(dungeon) }
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

@Composable
private fun DungeonCard(dungeon: Dungeon, locked: Boolean, onClick: () -> Unit) {
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
