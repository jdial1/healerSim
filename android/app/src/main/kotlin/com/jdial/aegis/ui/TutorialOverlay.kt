package com.jdial.aegis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.ForgedPanel
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.GiltRule
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.ui.theme.Obsidian

/**
 * The first-run tutorial.
 *
 * The web app uses spotlight cut-outs over live UI, which needs every target to
 * publish its bounds. On a phone the screen is small enough that a sequence of
 * anchored cards reads better and costs far less machinery — so this is a
 * deliberate mobile adaptation of the same idea: the same steps, in order,
 * pinned to the part of the screen each one is about.
 */
enum class TutorialAnchor { TOP, CENTER, BOTTOM }

data class TutorialStep(
    val id: String,
    val title: String,
    val body: String,
    val anchor: TutorialAnchor,
)

/** Shown once, in order, the first time a player reaches each screen. */
object Tutorial {
    val CLASS_SELECT = TutorialStep(
        id = "class-select",
        title = "Choose your path",
        body = "Each healer plays differently. The Priest heals in bursts, the Druid " +
            "keeps heals rolling over time. Your class colours the whole interface.",
        anchor = TutorialAnchor.CENTER,
    )

    val DUNGEONS = TutorialStep(
        id = "dungeons",
        title = "Pick a dungeon",
        body = "Three trash pulls, then the boss. Locked dungeons need a higher level — " +
            "clear what you can and the rest opens up.",
        anchor = TutorialAnchor.TOP,
    )

    val COMBAT = TutorialStep(
        id = "combat",
        title = "Keep them alive",
        body = "Tap an ally to target them, then tap a spell to heal. Watch the mana orb: " +
            "running dry is how runs are lost. Hold a spell to move it along the bar.",
        anchor = TutorialAnchor.BOTTOM,
    )

    val ALL = listOf(CLASS_SELECT, DUNGEONS, COMBAT)
}

@Composable
fun TutorialOverlay(step: TutorialStep, onDismiss: () -> Unit) {
    val accent = LocalAccent.current

    Box(
        Modifier
            .fillMaxSize()
            // The scrim dims the screen without hiding it — you can still see the
            // thing being explained behind the card.
            .background(Color.Black.copy(alpha = 0.62f))
            .clickable(onClick = onDismiss)
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(20.dp),
        contentAlignment = when (step.anchor) {
            TutorialAnchor.TOP -> Alignment.TopCenter
            TutorialAnchor.CENTER -> Alignment.Center
            TutorialAnchor.BOTTOM -> Alignment.BottomCenter
        },
    ) {
        ForgedPanel(
            Modifier.widthIn(max = 420.dp).fillMaxWidth(),
            accent = accent.core,
            contentPadding = PaddingValues(18.dp),
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(8.dp).clip(CircleShape).background(accent.core),
                    )
                    Spacer(Modifier.height(0.dp))
                    BasicText(
                        "  " + step.title.uppercase(),
                        style = AegisType.title.copy(fontSize = 15.sp),
                    )
                }
                Spacer(Modifier.height(10.dp))
                GiltRule(Modifier.fillMaxWidth().height(1.dp))
                Spacer(Modifier.height(10.dp))

                BasicText(step.body, style = AegisType.body)

                Spacer(Modifier.height(16.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(
                        "TAP ANYWHERE TO DISMISS",
                        style = AegisType.label.copy(fontSize = 11.sp, color = Ink.muted),
                    )
                    BasicText(
                        "GOT IT",
                        style = AegisType.label.copy(color = Obsidian.abyss),
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Gilt.core)
                            .clickable(onClick = onDismiss)
                            .padding(horizontal = 16.dp, vertical = 9.dp),
                    )
                }
            }
        }
    }
}
