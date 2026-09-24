package com.jdial.aegis.data

import com.jdial.aegis.ui.IconLoader
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The APK carries the images the app uses, and nothing else.
 *
 * The icon folder the content draws from holds 23,474 files; the app uses a
 * few hundred. The build filters them (see syncGameData), and this checks the
 * packaged result from the other side -- the synced content, the Kotlin
 * sources, and the app's own resolver -- so a filter that drifts either way
 * fails here rather than in the store's size report or on a blank icon.
 *
 * The bundled battle sprites get the same treatment: every one must be drawn.
 */
class IconPruneTest {
    private val assetsDir = File(System.getProperty("aegis.assetsDir") ?: "build/generated/gameAssets")
    private val iconsDir = File(assetsDir, "icons")
    private val sources = File("src/main/kotlin")

    private val shipped: Set<String> by lazy {
        check(iconsDir.isDirectory) { "Missing ${iconsDir.absolutePath}; run :app:syncGameData" }
        iconsDir.walkTopDown().filter { it.isFile }
            .map { it.relativeTo(iconsDir).path.replace(File.separatorChar, '/') }
            .toSet()
    }

    /** Every icon name the app can ask for. */
    private val referenced: Set<String> by lazy {
        val names = mutableSetOf<String>()
        fun walk(e: JsonElement) {
            when (e) {
                is JsonObject -> e.forEach { (k, v) ->
                    if ((k == "icon" || k.endsWith("Icon")) && k != "portraitIcon" && v is JsonPrimitive) {
                        v.contentOrNull?.takeIf { it.isNotBlank() }?.let(names::add)
                    }
                    walk(v)
                }
                is JsonArray -> e.forEach(::walk)
                else -> Unit
            }
        }
        listOf(File(assetsDir, "data"), File(assetsDir, "classes"))
            .flatMap { it.walkTopDown().filter { f -> f.extension == "json" }.toList() }
            // Its icons are the web app's component names (Gauge, Zap), which
            // Android never draws.
            .filter { it.name != "pacing.json" }
            .forEach { walk(Json.parseToJsonElement(it.readText())) }

        val literal = Regex("\"((?:wow|class-icons|lorc|delapouite)/[A-Za-z0-9_ .-]+)\"")
        sources.walkTopDown().filter { it.extension == "kt" }.forEach { f ->
            literal.findAll(f.readText()).forEach { names += it.groupValues[1] }
        }
        names
    }

    private fun resolves(name: String): List<String> =
        IconLoader.candidatePaths(name).map { it.removePrefix("icons/") }

    @Test
    fun `no image ships that nothing refers to`() {
        val wanted = referenced.flatMap(::resolves).toSet() + resolves("wow/inv_misc_questionmark")
        assertEquals(emptyList<String>(), (shipped - wanted).sorted().take(20))
    }

    @Test
    fun `every image something refers to ships`() {
        val missing = referenced.filter { name -> resolves(name).none { it in shipped } }
        assertEquals(emptyList<String>(), missing.sorted())
    }

    @Test
    fun `the icon set is the used few hundred, not the whole folder`() {
        assertTrue("expected some icons", shipped.size > 100)
        assertTrue("${shipped.size} icons packaged", shipped.size < 1_000)
    }

    @Test
    fun `every bundled sprite is drawn`() {
        val code = sources.walkTopDown().filter { it.extension == "kt" }.joinToString("\n") { it.readText() }
        val unused = File("src/main/res/drawable-nodpi").listFiles().orEmpty()
            .map { it.nameWithoutExtension }
            .filter { "R.drawable.$it" !in code && "drawable.$it" !in code }
        assertEquals(emptyList<String>(), unused.sorted())
    }
}
