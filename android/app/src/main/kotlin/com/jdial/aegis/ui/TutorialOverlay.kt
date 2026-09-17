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
import com.jdial.aegis.sim.UnitRole
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
        body = "Every class plays a different job. Healers keep the party standing, " +
            "tanks keep the enemy's attention, and damage dealers burn it down. Your " +
            "class colours the whole interface.",
        anchor = TutorialAnchor.CENTER,
    )

    val DUNGEONS = TutorialStep(
        id = "dungeons",
        title = "Pick a dungeon",
        body = "Three trash pulls, then the boss. Locked dungeons need a higher level — " +
            "clear what you can and the rest opens up.",
        anchor = TutorialAnchor.TOP,
    )

    // Reordering is now an out-of-combat action, so neither card teaches it as
    // a combat gesture. Both read the frame numbers, which are the point of the
    // screen: percent for urgency, deficit for which heal fits.
    val COMBAT = TutorialStep(
        id = "combat",
        title = "Keep them alive",
        body = "Tap an ally to target them, then tap a spell to heal. Each frame shows " +
            "health percent and, when hurt, how much is missing. Watch the mana orb: " +
            "running dry is how runs are lost.",
        anchor = TutorialAnchor.BOTTOM,
    )

    /**
     * The same slot, for a class that does not heal. Telling a Mage to "tap an
     * ally to target them, then tap a spell to heal" is simply wrong, and a
     * first-run card that is wrong is worse than none.
     */
    val COMBAT_DAMAGE = TutorialStep(
        id = "combat",
        title = "Burn it down",
        body = "Spells hit the enemy — no target needed. Watch the threat bar: pull " +
            "ahead of the tank and the enemy comes for you. Your healer is one of the " +
            "party frames, and their mana runs out too.",
        anchor = TutorialAnchor.BOTTOM,
    )

    /**
     * And for a tank, whom the damage card would tell to stay *behind* the
     * tank.
     */
    val COMBAT_TANK = TutorialStep(
        id = "combat",
        title = "Hold its attention",
        body = "Spells hit the enemy — no target needed. Your attacks build threat: keep " +
            "the enemy on you, and taunt it back when it turns on someone else. Your " +
            "class's resource sits beside the mana orb.",
        anchor = TutorialAnchor.BOTTOM,
    )

    val ALL = listOf(CLASS_SELECT, DUNGEONS, COMBAT, COMBAT_DAMAGE, COMBAT_TANK)

    /** The combat card that matches what this player actually does. */
    fun combatFor(role: UnitRole): TutorialStep = when (role) {
        UnitRole.HEALER -> COMBAT
        UnitRole.TANK -> COMBAT_TANK
        UnitRole.DPS -> COMBAT_DAMAGE
    }
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
