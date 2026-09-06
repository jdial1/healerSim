package com.jdial.aegis.data

import com.jdial.aegis.sim.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Every icon a class refers to must exist in the synced asset tree.
 *
 * A missing reference does not crash and does not fail any other test -- the
 * loader falls back to a placeholder, so it ships as a blank square that only a
 * human looking at the right screen would notice. The Warrior's passive icon and
 * two of its talents did exactly that.
 */
class IconReferenceTest {
    private val assetsDir = File(System.getProperty("aegis.assetsDir") ?: "build/generated/gameAssets")

    private val available: Set<String> by lazy {
        val icons = File(assetsDir, "icons")
        check(icons.isDirectory) { "Missing ${icons.absolutePath}; run :app:syncGameData" }
        icons.walkTopDown()
            .filter { it.isFile }
            .map { it.relativeTo(icons).path.replace(File.separatorChar, '/').substringBeforeLast('.') }
            .toSet()
    }

    @Test
    fun `every class, spell and talent icon resolves`() {
        val missing = PlayerClass.entries.flatMap { cls ->
            val b = Fixtures.data.bundle(cls)
            val refs = buildList {
                add("class.passiveTraitIcon" to b.meta.passiveTraitIcon)
                b.spells.forEach { (id, sp) -> add("spell.$id" to sp.icon) }
                b.talents.forEach { t -> add("talent.${t.id}" to t.icon) }
            }
            refs.filter { (_, icon) -> icon.isNotBlank() && icon !in available }
                .map { (where, icon) -> "$cls/$where -> $icon" }
        }
        assertEquals(emptyList<String>(), missing)
    }

    @Test
    fun `the icon set was actually found`() {
        // Guards the test above from passing vacuously if the assets move.
        assertTrue("expected a populated icon tree", available.size > 100)
    }
}
