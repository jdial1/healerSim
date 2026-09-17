package com.jdial.aegis.data

import com.jdial.aegis.sim.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parses the real content JSON synced out of the web app. This is the guard
 * against schema drift: if someone adds a required field or changes a shape in
 * the content JSON, this fails immediately rather than at runtime on a device.
 */
class GameDataTest {

    // Was a second hand-rolled loader that hardcoded build/generated/gameAssets
    // and ignored the aegis.assetsDir property the build actually sets, so it
    // only worked when the CWD happened to line up. Fixtures already does this.
    private val data: GameData get() = Fixtures.data

    @Test
    fun `parses every content file`() {
        assertNotNull(data.balance)
        assertEquals(17, data.dungeons.size)
        // Three from the frozen web app plus Android-only additions.
        assertEquals(PlayerClass.entries.size, data.classes.size)
        assertEquals(3, PlayerClass.webClasses.size)
        // 32 since druid_verdant_reservoir was registered; it was referenced by
        // talent d_r0c4 but missing from the registry.
        assertEquals(32, data.mechanics.size)
    }

    @Test
    fun `every class has a kit and a tree`() {
        // Counts, not a census: this used to name a number per class, and every
        // piece of content added since had to come here and change it. What it
        // is actually for is catching a class that failed to load at all.
        // The Android-owned classes: two per role beyond the healers, the third
        // of each new role deliberately unbuilt.
        for (cls in listOf(
            PlayerClass.MAGE, PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT,
            PlayerClass.ROGUE, PlayerClass.MONK, PlayerClass.WARLOCK,
        )) {
            assertEquals("$cls spells", if (cls == PlayerClass.WARRIOR) 5 else 4, data.bundle(cls).spells.size)
            assertTrue("$cls needs a full tree", data.bundle(cls).talents.size >= 15)
        }

        // Ids are a flat global namespace and the merged map silently lets one
        // shadow another, so every class spell, shared spell and utility spell
        // has to be unique -- bar the one known duplicate below.
        assertTrue("every class's spells are loaded", data.spells.size >= 38)
        assertTrue(PlayerClass.entries.none { cls -> data.bundle(cls).spells.keys.any { it in listOf("kick", "counterspell", "cleanse") } })
        val ids = PlayerClass.entries.flatMap { data.bundle(it).spells.keys }
        assertEquals(
            "spell ids must be unique except the known flash_heal duplicate",
            ids.size - 1,
            ids.toSet().size,
        )
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
