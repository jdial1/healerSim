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
    fun `talent and spell inventory matches the web app`() {
        assertEquals(32, data.bundle(PlayerClass.PRIEST).talents.size)
        assertEquals(32, data.bundle(PlayerClass.DRUID).talents.size)
        assertEquals(29, data.bundle(PlayerClass.PALADIN).talents.size)

        assertEquals(4, data.bundle(PlayerClass.PRIEST).spells.size)
        assertEquals(6, data.bundle(PlayerClass.DRUID).spells.size)
        assertEquals(3, data.bundle(PlayerClass.PALADIN).spells.size)

        assertEquals(4, data.bundle(PlayerClass.MAGE).spells.size)
        assertEquals(16, data.bundle(PlayerClass.MAGE).talents.size)
        // The Warrior carries a rage dump the other kits do not need.
        assertEquals(5, data.bundle(PlayerClass.WARRIOR).spells.size)
        assertEquals(16, data.bundle(PlayerClass.WARRIOR).talents.size)

        // The Android-owned classes: two per role beyond the healers, the third
        // of each new role deliberately unbuilt.
        for (cls in listOf(
            PlayerClass.MAGE, PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT,
            PlayerClass.ROGUE, PlayerClass.MONK, PlayerClass.WARLOCK,
        )) {
            assertEquals("$cls spells", if (cls == PlayerClass.WARRIOR) 5 else 4, data.bundle(cls).spells.size)
            assertTrue("$cls needs a full tree", data.bundle(cls).talents.size >= 15)
        }

        // Priest and Paladin both define `flash_heal`, so the web app's 13 class
        // spells collapse to 12 unique ids, plus the shared mana_potion. The
        // Mage adds four more, none of which may collide -- ids are a flat
        // global namespace and the merged map silently lets one shadow another.
        // Plus the Android-owned utility spells (content/utility_spells.json),
        // which must not shadow a class spell either.
        val utility = com.jdial.aegis.sim.Fixtures.sharedData.spells.size.let { data.spells.size - it }
        assertTrue("utility spells are loaded", utility > 0)
        assertEquals(38, data.spells.size - utility)
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
