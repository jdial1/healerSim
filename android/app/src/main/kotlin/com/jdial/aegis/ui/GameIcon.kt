package com.jdial.aegis.ui

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.jdial.aegis.ui.theme.Gilt
import com.jdial.aegis.ui.theme.Obsidian
import java.util.concurrent.ConcurrentHashMap

/**
 * Loads icons straight out of `assets/icons`, mirroring the candidate-path logic
 * in `src/gameIcons.js`.
 *
 * No image library: these are a fixed set of ~178 small bundled files, so decode
 * once and hold them in a map. There is no network path — an icon that is not on
 * disk falls back to the question-mark, exactly as the web app does.
 */
object IconLoader {
    private const val FALLBACK = "wow/inv_misc_questionmark"
    private val cache = ConcurrentHashMap<String, ImageBitmap>()
    private val missing = ConcurrentHashMap.newKeySet<String>()

    /** `wow/foo` -> icons/wow/foo.{jpg,png}; `lorc/bar` -> icons/game-icons/lorc/bar.png. */
    fun candidatePaths(iconPath: String): List<String> {
        val normalized = iconPath.trim().lowercase()
        if (normalized.isEmpty()) return candidatePaths(FALLBACK)

        // Class portraits live in their own folder, not under game-icons.
        if (normalized.startsWith("class-icons/")) {
            return listOf("icons/$normalized.png")
        }
        if (normalized.startsWith("wow/")) {
            val icon = normalized.removePrefix("wow/").replace(" ", "")
            if (icon.isEmpty()) return candidatePaths(FALLBACK)
            return listOf("icons/wow/$icon.jpg", "icons/wow/$icon.png")
        }
        if (!normalized.contains("/")) {
            val icon = normalized.replace(" ", "")
            return listOf("icons/wow/$icon.jpg", "icons/wow/$icon.png")
        }
        val (author, icon) = normalized.split("/", limit = 2)
        if (author.isEmpty() || icon.isEmpty()) return candidatePaths(FALLBACK)
        return listOf("icons/game-icons/$author/$icon.png")
    }

    fun load(context: Context, iconPath: String): ImageBitmap? {
        cache[iconPath]?.let { return it }
        if (iconPath in missing) return null

        val paths = candidatePaths(iconPath) +
            if (iconPath != FALLBACK) candidatePaths(FALLBACK) else emptyList()

        for (path in paths) {
            val bitmap = runCatching {
                context.assets.open(path).use { BitmapFactory.decodeStream(it) }
            }.getOrNull()
            if (bitmap != null) {
                val image = bitmap.asImageBitmap()
                cache[iconPath] = image
                return image
            }
        }
        missing += iconPath
        return null
    }
}

private val DesaturateFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0.15f) })

/**
 * An icon in a socketed frame — the recurring unit of the design system. Icons
 * are always framed so they read as set into the UI rather than pasted on it.
 */
@Composable
fun GameIcon(
    iconPath: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    accent: Color = Gilt.deep,
    dimmed: Boolean = false,
) {
    val context = LocalContext.current
    val image = remember(iconPath) { IconLoader.load(context, iconPath) }
    val shape = RoundedCornerShape(5.dp)

    Box(
        modifier
            .size(size)
            .clip(shape)
            .background(Obsidian.abyss)
            .border(1.dp, accent.copy(alpha = if (dimmed) 0.25f else 0.6f), shape),
    ) {
        if (image == null) {
            // The web app falls back to a remote URL; offline there is nothing to
            // fetch, and the bundled question-mark is not guaranteed to be present.
            // Draw a visible sigil so a missing icon reads as a gap, not a void.
            Box(
                Modifier
                    .align(Alignment.Center)
                    .size(size / 3)
                    .clip(RoundedCornerShape(2.dp))
                    .background(accent.copy(alpha = if (dimmed) 0.15f else 0.35f)),
            )
        } else {
            Image(
                bitmap = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alpha = if (dimmed) 0.45f else 1f,
                // Locked content is drained of colour as well as dimmed, so it
                // reads as unavailable rather than merely faint.
                colorFilter = if (dimmed) DesaturateFilter else null,
                modifier = Modifier.size(size).clip(shape),
            )
        }
    }
}
