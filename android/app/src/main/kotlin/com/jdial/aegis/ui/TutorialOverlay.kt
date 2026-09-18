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

    // --- small cards for things that arrive later ---------------------------
    // Each is shown once, the first time what it explains actually exists.

    val TALENT_POINTS = TutorialStep(
        id = "talent-points",
        title = "A talent point",
        body = "You levelled up and have a point to spend. The Talents tab shows a badge " +
            "while any are unspent. Points can be refunded any time out of combat.",
        anchor = TutorialAnchor.BOTTOM,
    )

    val TALENTS = TutorialStep(
        id = "talents",
        title = "Your talents",
        body = "Each row opens at a level. Some nodes teach a new spell; the capstone at " +
            "the bottom changes how the class plays. Below the tree: your action bar, " +
            "charms and consumables.",
        anchor = TutorialAnchor.TOP,
    )

    val CHARMS = TutorialStep(
        id = "charms",
        title = "A charm",
        body = "Clearing a dungeon earned a charm. Wear one at a time, from Charms on the " +
            "Talents tab. Each gives something and takes something. Charms belong to " +
            "every character you make.",
        anchor = TutorialAnchor.CENTER,
    )

    val STASH = TutorialStep(
        id = "stash",
        title = "A consumable",
        body = "The clear dropped a consumable. Put it on your action bar on the " +
            "Talents tab to take it into the next run. You get one use per run, off the " +
            "global cooldown, and using it spends it from your stash.",
        anchor = TutorialAnchor.CENTER,
    )

    val HARD_MODE = TutorialStep(
        id = "hard-mode",
        title = "Hard mode",
        body = "A cleared dungeon can be run on hard: enemies have more health and hit " +
            "harder, with an affix on top. It is worth more XP and drops its own consumables.",
        anchor = TutorialAnchor.TOP,
    )

    val KEYSTONES = TutorialStep(
        id = "keystones",
        title = "Keystones",
        body = "Each hard clear raises that dungeon's keystone by one. The next run is a " +
            "little tougher and carries one more affix. A wipe never lowers it. The queue " +
            "lists each affix before you commit.",
        anchor = TutorialAnchor.TOP,
    )

    val BREATHER = TutorialStep(
        id = "breather",
        title = "Breather",
        body = "Between pulls nothing attacks. Mana and health recover, and the timer shows " +
            "when the next pull comes.",
        anchor = TutorialAnchor.CENTER,
    )

    val ADDS = TutorialStep(
        id = "adds",
        title = "Adds",
        body = "The boss called help. Some hit hard, some heal the boss, some explode. " +
            "Their frames sit beside the boss, and killing the right one first is the fight.",
        anchor = TutorialAnchor.TOP,
    )

    val AGGRO = TutorialStep(
        id = "aggro",
        title = "It's coming for you",
        body = "You pulled threat off the tank. The enemy now hits you instead. Ease off " +
            "until the tank takes it back. Big heals and big crits count too.",
        anchor = TutorialAnchor.TOP,
    )

    val ALL = listOf(
        CLASS_SELECT, DUNGEONS, COMBAT, COMBAT_DAMAGE, COMBAT_TANK,
        TALENT_POINTS, TALENTS, CHARMS, STASH, HARD_MODE, KEYSTONES, BREATHER, ADDS, AGGRO,
    )

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
