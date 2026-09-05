package com.jdial.aegis.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.R
import com.jdial.aegis.data.PlayerClass

/**
 * The Aegis design system.
 *
 * Six principles drive every screen:
 *  1. Forged, not flat — panels are framed objects with a bevelled metal edge.
 *  2. Obsidian and gilt — gold is reserved for the interactive and the important.
 *  3. Class colour is the accent — the app changes character with your class.
 *  4. Legibility is combat-critical — vitals are the highest-contrast elements.
 *  5. Diegetic gauges — orbs and forged strips, not progress bars.
 *  6. Motion signals state — animation is reserved for what must be noticed.
 */

// --- palette ----------------------------------------------------------------

object Obsidian {
    val abyss = Color(0xFF05070F)
    val deep = Color(0xFF0A1024)
    val panel = Color(0xFF121A33)
    val panelHigh = Color(0xFF1A2340)
    val raised = Color(0xFF232E4F)
}

object Gilt {
    val bright = Color(0xFFF2D398)
    val core = Color(0xFFE8C879)
    val mid = Color(0xFFC9A24E)
    val deep = Color(0xFF8A6A2B)
    val shadow = Color(0xFF4A3714)
}

object Ink {
    val primary = Color(0xFFEDE6D6)
    val secondary = Color(0xFFA9B2C9)
    val muted = Color(0xFF6E7A99)
}

object Vital {
    val healthy = Color(0xFF4ADE80)
    val fair = Color(0xFFFACC15)
    val hurt = Color(0xFFF97316)
    val critical = Color(0xFFEF4444)
    val mana = Color(0xFF4C8BF5)
    val shield = Color(0xFF9EC5D6)
}

/** Per-class accents, carried over from `src/classTheme.js`. */
data class ClassAccent(val bright: Color, val core: Color, val deep: Color)

val PriestAccent = ClassAccent(Color(0xFFFCD34D), Color(0xFFFBBF24), Color(0xFF92610A))
val DruidAccent = ClassAccent(Color(0xFF6EE7B7), Color(0xFF10B981), Color(0xFF065F46))
val PaladinAccent = ClassAccent(Color(0xFFF0ABFC), Color(0xFFE879F9), Color(0xFF86198F))

fun accentFor(cls: PlayerClass?): ClassAccent = when (cls) {
    PlayerClass.PRIEST -> PriestAccent
    PlayerClass.DRUID -> DruidAccent
    PlayerClass.PALADIN -> PaladinAccent
    null -> ClassAccent(Gilt.bright, Gilt.core, Gilt.deep)
}

val LocalAccent = staticCompositionLocalOf { ClassAccent(Gilt.bright, Gilt.core, Gilt.deep) }

@Composable
fun AegisTheme(cls: PlayerClass? = null, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAccent provides accentFor(cls), content = content)
}

// --- type -------------------------------------------------------------------

/**
 * Cinzel carries the display register; body and numerals stay on the system
 * sans, which is already well-tuned per device and costs nothing to ship.
 *
 * Cinzel is a variable font, so each weight is the same file with different
 * variation settings rather than a separate face.
 */
private val Cinzel = FontFamily(
    Font(
        R.font.cinzel,
        FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
    Font(
        R.font.cinzel,
        FontWeight.Bold,
        variationSettings = FontVariation.Settings(FontVariation.weight(700)),
    ),
)

object AegisType {
    val display = TextStyle(
        fontFamily = Cinzel,
        fontWeight = FontWeight.Bold,
        fontSize = 30.sp,
        letterSpacing = 5.sp,
        color = Ink.primary,
    )
    val title = TextStyle(
        fontFamily = Cinzel,
        fontWeight = FontWeight.Bold,
        fontSize = 19.sp,
        letterSpacing = 1.5.sp,
        color = Ink.primary,
    )
    val label = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 1.6.sp,
        color = Ink.secondary,
    )
    val body = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        color = Ink.secondary,
    )
    val numeric = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        color = Ink.primary,
    )
}

// --- the forged frame -------------------------------------------------------

val FrameShape: Shape = RoundedCornerShape(6.dp)

/**
 * Principle 1 made concrete: a dark ground, a bevelled gilt edge, and a top
 * highlight so the panel reads as struck metal rather than a drawn rectangle.
 */
@Composable
fun ForgedPanel(
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    accent: Color = LocalAccent.current.core,
    contentPadding: PaddingValues = PaddingValues(14.dp),
    content: @Composable BoxScope.() -> Unit,
) {
    // Selection has to survive a glance mid-fight, so it is carried by three
    // cues at once: a thicker edge, the accent at full strength, and a warmer
    // interior — not by a single faint border colour.
    Box(
        modifier = modifier
            .clip(FrameShape)
            .background(
                if (selected) {
                    Brush.verticalGradient(listOf(accent, accent.copy(alpha = 0.75f)))
                } else {
                    Brush.verticalGradient(
                        listOf(Gilt.shadow.copy(alpha = 0.9f), Gilt.deep.copy(alpha = 0.2f)),
                    )
                },
            )
            .padding(if (selected) 2.dp else 1.dp)
            .clip(FrameShape)
            .background(
                if (selected) {
                    Brush.verticalGradient(
                        listOf(
                            Obsidian.raised,
                            Obsidian.panelHigh,
                            accent.copy(alpha = 0.10f).compositeOver(Obsidian.panel),
                        ),
                    )
                } else {
                    Brush.verticalGradient(listOf(Obsidian.panelHigh, Obsidian.panel, Obsidian.deep))
                },
            )
            .padding(contentPadding),
        content = content,
    )
}

/** A hairline gilt divider — used to separate a panel's header from its body. */
@Composable
fun GiltRule(modifier: Modifier = Modifier, alpha: Float = 0.35f) {
    Box(
        modifier
            .background(
                Brush.horizontalGradient(
                    listOf(Color.Transparent, Gilt.mid.copy(alpha = alpha), Color.Transparent),
                ),
            ),
    )
}
