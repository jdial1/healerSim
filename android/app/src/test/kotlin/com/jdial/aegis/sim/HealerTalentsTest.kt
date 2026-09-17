package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Talent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The healers' trees, which Android now owns (content/classes-overrides).
 *
 * The web app and the parity corpus keep the shared trees: that is the point
 * of the override, and the first test here is what proves the seam holds.
 */
class HealerTalentsTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val healers = listOf(PlayerClass.PRIEST, PlayerClass.DRUID, PlayerClass.PALADIN)

    private fun fight(cls: PlayerClass, vararg talents: Pair<String, Int>): GameState {
        val rng = Rng(3)
        val tree = data.bundle(cls).talents
        var s = engine.newCharacter(cls, rng)
        s = s.withMe { p ->
            p.copy(
                unlockedSpells = p.unlockedSpells + data.bundle(cls).spells.keys,
                talents = talents.map { (id, n) -> TalentRank(tree.first { it.id == id }, n) },
            )
        }
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), rng)
            .let { it.copy(party = it.party.map { u -> u.copy(maxHealth = 1e6, health = 1e6 / 2) }) }
    }

    private fun healed(s: GameState, id: String, target: String = "1"): Double {
        val before = s.unit(target)!!.health
        return engine.reduce(s, Action.CastSpell(id, target, 99.9), Rng(1)).unit(target)!!.health - before
    }

    @Test
    fun `the app plays its own trees, the parity corpus keeps the shared ones`() {
        for (cls in healers) {
            val mine = data.bundle(cls).talents
            val shared = Fixtures.sharedData.bundle(cls).talents
            assertNotEquals("$cls should differ from the frozen tree", shared, mine)
            // Same tree, not a new one: the ids a save holds still mean something.
            assertTrue("$cls keeps its ids", mine.map { it.id }.all { it in shared.map { s -> s.id } })
        }
        // The classes Android already owned are untouched by the seam.
        assertEquals(
            Fixtures.sharedData.bundle(PlayerClass.MAGE).talents,
            data.bundle(PlayerClass.MAGE).talents,
        )
    }

    @Test
    fun `no healer tree repeats a job, and the filler is gone`() {
        for (cls in healers) {
            // A mechanic talent may carry a small stat rider; the plain nodes
            // are the ones that used to be five copies of "Healing Focus".
            val plain = data.bundle(cls).talents.filter { it.mechanicId == null && it.spellId == null }
            val jobs = plain.map { job(it) }
            assertTrue("$cls: every talent does something", jobs.none { it.isEmpty() })
            assertEquals("$cls repeats: $jobs", jobs.size, jobs.toSet().size)
            assertTrue("$cls still has filler names", plain.none { it.name.contains("Focus I") })
        }
    }

    @Test
    fun `the dead curse talents are now the dispel's`() {
        for (cls in healers) {
            val tree = data.bundle(cls).talents
            assertTrue("$cls still carries a dead curse talent", tree.none { it.mechanicId in DEAD })
            val cleanse = tree.filter { t -> t.effects.keys.any { it.endsWith(":cleanse") } }
            assertEquals("$cls should have exactly one Cleanse talent", 1, cleanse.size)
        }
    }

    /** The talent that does [key], whatever id the generator gave it. */
    private fun holding(cls: PlayerClass, key: String): String =
        data.bundle(cls).talents.first { it.effects.containsKey(key) }.id

    @Test
    fun `a healer's talent can name a spell`() {
        // Healing.
        val plain = healed(fight(PlayerClass.PRIEST), "flash_heal")
        val improved = healed(fight(PlayerClass.PRIEST, holding(PlayerClass.PRIEST, "heal:flash_heal") to 3), "flash_heal")
        assertEquals(plain * 1.12, improved, 1e-6)

        // Cost.
        val cost = { s: GameState ->
            s.mana - engine.reduce(s, Action.CastSpell("flash_heal", "1", 99.9), Rng(1)).mana
        }
        val base = data.spell("flash_heal")!!.manaCost.toDouble()
        assertEquals(base, cost(fight(PlayerClass.PRIEST)), 1e-9)
        assertEquals(base - 4, cost(fight(PlayerClass.PRIEST, holding(PlayerClass.PRIEST, "cost:flash_heal") to 2)), 1e-9)

        // Cooldown.
        val cd = { s: GameState ->
            engine.reduce(s, Action.CastSpell("greater_heal", "1", 99.9), Rng(1)).spellCooldowns["greater_heal"] ?: 0
        }
        val withTalent = fight(PlayerClass.PRIEST, holding(PlayerClass.PRIEST, "cooldown:greater_heal") to 2).withMe {
            it.copy(unlockedSpells = it.unlockedSpells + "greater_heal")
        }
        val without = fight(PlayerClass.PRIEST).withMe { it.copy(unlockedSpells = it.unlockedSpells + "greater_heal") }
        assertTrue("${cd(withTalent)} < ${cd(without)}", cd(withTalent) < cd(without))
    }

    private fun job(t: Talent): List<String> {
        val b = t.statBonus
        val stats = listOfNotNull(
            "healing".takeIf { b != null && b.healingBoost != 0.0 },
            "crit".takeIf { b != null && b.critChance != 0.0 },
            "haste".takeIf { b != null && b.haste != 0.0 },
            "mana".takeIf { b != null && b.manaPool != 0.0 },
            "signature".takeIf { b != null && b.uniqueStat != 0.0 },
            "return".takeIf { b != null && b.manaReturnOnDirectHeal != 0.0 },
        )
        return (stats + t.effects.keys).sorted()
    }

    private companion object {
        val DEAD = setOf("absolve", "purify", "naturalize")
    }
}
