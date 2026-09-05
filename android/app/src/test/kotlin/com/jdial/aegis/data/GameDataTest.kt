package com.jdial.aegis.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parses the real content JSON synced out of the web app. This is the guard
 * against schema drift: if someone adds a required field or changes a shape in
 * the content JSON, this fails immediately rather than at runtime on a device.
 */
class GameDataTest {

    private val data: GameData by lazy {
        val root = File("build/generated/gameAssets")
        assertTrue(
            "Content assets missing at ${root.absolutePath}. Run :app:syncGameData.",
            root.isDirectory,
        )
        GameData.load { path -> File(root, path).readText() }
    }

    @Test
    fun `parses every content file`() {
        assertNotNull(data.balance)
        assertEquals(17, data.dungeons.size)
        assertEquals(3, data.classes.size)
        assertEquals(31, data.mechanics.size)
    }

    @Test
    fun `talent and spell inventory matches the web app`() {
        assertEquals(32, data.bundle(PlayerClass.PRIEST).talents.size)
        assertEquals(32, data.bundle(PlayerClass.DRUID).talents.size)
        assertEquals(29, data.bundle(PlayerClass.PALADIN).talents.size)

        assertEquals(4, data.bundle(PlayerClass.PRIEST).spells.size)
        assertEquals(6, data.bundle(PlayerClass.DRUID).spells.size)
        assertEquals(3, data.bundle(PlayerClass.PALADIN).spells.size)

        // Priest and Paladin both define `flash_heal`, so 13 class spells collapse
        // to 12 unique ids, plus the shared mana_potion.
        assertEquals(13, data.spells.size)
    }

    @Test
    fun `flash heal is shared verbatim between priest and paladin`() {
        // The merged spell map silently lets one shadow the other. That is only safe
        // while they are identical, so pin it.
        val priest = data.bundle(PlayerClass.PRIEST).spells.getValue("flash_heal")
        val paladin = data.bundle(PlayerClass.PALADIN).spells.getValue("flash_heal")
        assertEquals(priest, paladin)
    }

    @Test
    fun `balance constants survive the round trip`() {
        assertEquals(1.08, data.balance.boss.damageMultiplierPerDifficultyStep, 1e-9)
        assertEquals(12.0, data.balance.playerStats.manaPerIntellect, 1e-9)
        assertEquals(0.5, data.balance.playerStats.healingPctPerSpirit, 1e-9)
        assertEquals(0.16667, data.balance.trash.maxHealthFractionOfBoss, 1e-9)
        assertEquals(1.5, data.balance.combat.druid.naturesGraceHotTickRateMultiplier, 1e-9)
    }

    @Test
    fun `every talent prerequisite and exclusion resolves`() {
        data.classes.forEach { (cls, bundle) ->
            val ids = bundle.talents.map { it.id }.toSet()
            bundle.talents.forEach { t ->
                (t.prerequisites + t.exclusiveWith).forEach { ref ->
                    assertTrue("$cls talent ${t.id} references unknown talent $ref", ref in ids)
                }
            }
        }
    }

    @Test
    fun `every talent spell unlock names a real spell`() {
        data.classes.forEach { (cls, bundle) ->
            bundle.talents.mapNotNull { it.spellId }.forEach { id ->
                assertNotNull("$cls talent unlocks unknown spell $id", data.spell(id))
            }
        }
    }

    @Test
    fun `class progression references real spells`() {
        data.classes.forEach { (cls, bundle) ->
            (bundle.meta.progression.starterSpells + bundle.meta.progression.spellOrder).forEach { id ->
                assertNotNull("$cls progression names unknown spell $id", data.spell(id))
            }
        }
    }

    @Test
    fun `every dungeon has three enemies and an attack template`() {
        data.dungeons.forEach { d ->
            assertEquals("${d.id} enemy count", 3, d.enemies.size)
            assertTrue("${d.id} has no attack templates", d.bossCombat!!.attackTemplates.isNotEmpty())
        }
    }
}
