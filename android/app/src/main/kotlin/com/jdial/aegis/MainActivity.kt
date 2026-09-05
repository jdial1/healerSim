package com.jdial.aegis

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.HEALER_UNIT_ID
import com.jdial.aegis.ui.CharacterScreen
import com.jdial.aegis.ui.ClassSelectScreen
import com.jdial.aegis.ui.ConfirmDialog
import com.jdial.aegis.ui.GameIcon
import com.jdial.aegis.ui.TalentScreen
import com.jdial.aegis.ui.CombatScreen
import com.jdial.aegis.ui.DungeonListScreen
import com.jdial.aegis.ui.DungeonQueueSheet
import com.jdial.aegis.ui.OutcomeDialog
import com.jdial.aegis.ui.SplashScreen
import com.jdial.aegis.ui.Tutorial
import com.jdial.aegis.ui.TutorialOverlay
import com.jdial.aegis.ui.theme.AegisTheme
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.Ink
import com.jdial.aegis.ui.theme.LocalAccent
import com.jdial.aegis.ui.theme.Obsidian

class MainActivity : ComponentActivity() {

    private val vm: AegisViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Hold the system splash until the content JSON has parsed, so the first
        // frame is the real app rather than an empty ground.
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { !contentReady }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { AegisApp(onReady = { contentReady = true }) }
    }

    private var contentReady = false

    // The simulation is wall-clock driven, so it must not run while backgrounded
    // or the player returns to a run that advanced without them.
    override fun onPause() {
        super.onPause()
        vm.onEnterBackground()
    }

    override fun onResume() {
        super.onResume()
        vm.onEnterForeground()
    }
}

/**
 * Navigation mirrors the web app's flat model in `App.jsx` — a screen value and a
 * `when`. There is no back stack worth modelling, so no navigation library.
 */
private sealed interface Screen {
    data object Splash : Screen
    data object ClassSelect : Screen
    data object Dungeons : Screen
    data object Talents : Screen
    data object Character : Screen
    data object Combat : Screen
}

/** The three out-of-combat tabs, mirroring the web app's bottom nav. */
private val MENU_TABS = listOf(
    Triple("Character", Screen.Character, "lorc/winged-shield"),
    Triple("Talents", Screen.Talents, "lorc/burning-book"),
    Triple("Dungeons", Screen.Dungeons, "lorc/crossed-swords"),
)

@Composable
private fun AegisApp(onReady: () -> Unit = {}) {
    val vm: AegisViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()
    // GameData parsed in the ViewModel's initialiser, so by here we are ready.
    LaunchedEffect(Unit) { onReady() }

    var screen: Screen by remember { mutableStateOf(Screen.Splash) }
    var queued: Dungeon? by remember { mutableStateOf(null) }
    var confirmAbandon by remember { mutableStateOf(false) }
    var targetId: String? by remember { mutableStateOf(HEALER_UNIT_ID) }
    val seenTutorial by vm.tutorialSteps.collectAsStateWithLifecycle()

    // One tutorial card per screen, the first time that screen is reached.
    val tutorialStep = when (screen) {
        Screen.ClassSelect -> Tutorial.CLASS_SELECT
        Screen.Dungeons -> Tutorial.DUNGEONS
        Screen.Combat -> Tutorial.COMBAT
        else -> null
    }?.takeIf { it.id !in seenTutorial }

    // Entering and leaving a run drives the screen, so the two never disagree.
    LaunchedEffect(state.isCombatActive) {
        screen = when {
            state.isCombatActive -> Screen.Combat
            screen == Screen.Combat -> Screen.Dungeons
            else -> screen
        }
    }

    AegisTheme(cls = state.playerClass) {
        Box(Modifier.fillMaxSize().background(Obsidian.abyss)) {
            // System back used to quit the app from every screen, including
            // mid-boss. Overlays unwind first — they can be up on any screen —
            // then the screen stack.
            //
            // `enabled` is computed rather than always true: on Dungeons with
            // nothing open, back must reach the system and exit, because that is
            // the app's home. A handler that is enabled and does nothing swallows
            // the gesture and traps the user.
            // A wipe can end the run while the confirm is open, so it is only
            // live while there is still a run to abandon.
            val abandoning = confirmAbandon && state.isCombatActive

            BackHandler(
                enabled = abandoning ||
                    state.dungeonOutcome != null ||
                    queued != null ||
                    tutorialStep != null ||
                    screen == Screen.Combat ||
                    screen == Screen.Talents ||
                    screen == Screen.Character ||
                    screen == Screen.ClassSelect,
            ) {
                when {
                    abandoning -> confirmAbandon = false
                    state.dungeonOutcome != null -> vm.dismissOutcome()
                    queued != null -> queued = null
                    tutorialStep != null -> vm.completeTutorialStep(tutorialStep.id)
                    // Ask, never act: a run is too expensive to lose to a swipe.
                    screen == Screen.Combat -> confirmAbandon = true
                    screen == Screen.ClassSelect -> screen = Screen.Splash
                    else -> screen = Screen.Dungeons
                }
            }

            val tabbed = screen == Screen.Dungeons || screen == Screen.Talents || screen == Screen.Character

            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when (screen) {
                        Screen.Splash -> SplashScreen(
                            version = "v${BuildConfig.VERSION_NAME}",
                            onBegin = { screen = Screen.ClassSelect },
                        )

                        Screen.ClassSelect -> ClassSelectScreen(
                            data = vm.data,
                            maxLevel = vm.maxLevelAcrossRoster,
                            onPick = { cls: PlayerClass ->
                                vm.selectClass(cls)
                                screen = Screen.Dungeons
                            },
                        )

                        Screen.Dungeons -> DungeonListScreen(
                            data = vm.data,
                            playerLevel = state.level,
                            cls = state.playerClass ?: PlayerClass.PRIEST,
                            talentPoints = state.talentPoints,
                            onSelect = { queued = it },
                        )

                        Screen.Talents -> TalentScreen(
                            state = state,
                            engine = vm.engine,
                            onInvest = vm::unlockTalent,
                            onRefund = vm::decrementTalent,
                            onRespec = vm::respecTalents,
                        )

                        Screen.Character -> CharacterScreen(
                            state = state,
                            engine = vm.engine,
                            onChangeClass = {
                                vm.leaveCharacter()
                                screen = Screen.ClassSelect
                            },
                        )

                        Screen.Combat -> CombatScreen(
                            state = state,
                            data = vm.data,
                            targetId = targetId,
                            onTarget = { targetId = it },
                            onCast = { spellId -> vm.castSpell(spellId, targetId) },
                            onReorder = vm::reorderActionBar,
                            onLeave = { confirmAbandon = true },
                        )
                    }
                }

                if (tabbed) {
                    MenuTabs(
                        current = screen,
                        talentPoints = state.talentPoints,
                        onSelect = { screen = it },
                    )
                }
            }

            queued?.let { dungeon ->
                DungeonQueueSheet(
                    dungeon = dungeon,
                    data = vm.data,
                    onClose = { queued = null },
                    onEnter = { pace ->
                        queued = null
                        targetId = HEALER_UNIT_ID
                        vm.startDungeon(dungeon, pace)
                    },
                )
            }

            // The tutorial sits above everything except a run outcome.
            // The engine already honours isTutorialPaused and stops advancing
            // combat, but nothing ever set it — so the combat tutorial card
            // appeared while the boss kept swinging, unlike the web app. The
            // whole mechanism was one call away from working.
            val tutorialBlocking = tutorialStep != null &&
                state.dungeonOutcome == null &&
                queued == null
            LaunchedEffect(tutorialBlocking, state.isCombatActive) {
                vm.setTutorialPaused(tutorialBlocking && state.isCombatActive)
            }

            if (tutorialBlocking) {
                TutorialOverlay(
                    step = tutorialStep,
                    onDismiss = { vm.completeTutorialStep(tutorialStep.id) },
                )
            }

            state.dungeonOutcome?.let { outcome ->
                OutcomeDialog(
                    outcome = outcome,
                    data = vm.data,
                    onDismiss = { vm.dismissOutcome() },
                )
            }

            if (abandoning) {
                ConfirmDialog(
                    headline = "Abandon Run",
                    body = "Leaving now forfeits this dungeon. No experience is awarded.",
                    confirmLabel = "Abandon",
                    // Only close the run — the isCombatActive effect above does
                    // the navigation, so setting `screen` here would race it.
                    onConfirm = { confirmAbandon = false; vm.abandonDungeon() },
                    onDismiss = { confirmAbandon = false },
                )
            }
        }
    }
}

/** Bottom tab bar: a forged strip, with a badge when talent points are unspent. */
@Composable
private fun MenuTabs(
    current: Screen,
    talentPoints: Int,
    onSelect: (Screen) -> Unit,
) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .widthIn(max = 480.dp)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MENU_TABS.forEach { (label, target, icon) ->
                val selected = current == target
                val accent = LocalAccent.current
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(5.dp))
                        .background(if (selected) Obsidian.raised else Obsidian.panel.copy(alpha = 0.92f))
                        .border(
                            if (selected) 2.dp else 1.dp,
                            if (selected) accent.core else Gilt.deep.copy(alpha = 0.5f),
                            RoundedCornerShape(5.dp),
                        )
                        .clickable(onClickLabel = "Open $label") { onSelect(target) }
                        .semantics {
                            role = Role.Tab
                            this.selected = selected
                            if (target == Screen.Talents && talentPoints > 0) {
                                stateDescription = "$talentPoints unspent talent points"
                            }
                        }
                        .padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        GameIcon(icon, size = 18.dp, accent = Color.Transparent, dimmed = !selected)
                        Spacer(Modifier.width(6.dp))
                        BasicText(
                            label.uppercase(),
                            style = AegisType.label.copy(
                                fontSize = 11.sp,
                                color = if (selected) Ink.primary else Ink.muted,
                            ),
                        )
                        if (target == Screen.Talents && talentPoints > 0) {
                            Spacer(Modifier.width(5.dp))
                            Box(
                                Modifier
                                    .size(14.dp)
                                    .clip(RoundedCornerShape(7.dp))
                                    .background(Gilt.core),
                                contentAlignment = Alignment.Center,
                            ) {
                                BasicText(
                                    talentPoints.toString(),
                                    style = AegisType.label.copy(fontSize = 11.sp, color = Obsidian.abyss),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
