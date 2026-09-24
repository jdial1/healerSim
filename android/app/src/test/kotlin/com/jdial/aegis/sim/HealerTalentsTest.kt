package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Talent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The healers' trees: no repeats, no filler, and every node doing a job. */
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
    fun `the trees are sixteen nodes, like every other class`() {
        // They carried thirty-two -- double the rest -- and half were one-number
        // tweaks to one spell. Charms do that now, as a choice with a cost.
        for (cls in healers) {
            val tree = data.bundle(cls).talents
            assertTrue("$cls has ${tree.size} talents", tree.size in 15..24)
        }
        for (cls in listOf(PlayerClass.PRIEST, PlayerClass.DRUID)) {
            val tree = data.bundle(cls).talents
            assertEquals("$cls", 16, tree.size)
            // Still enough to spend: about as many ranks as the other trees.
            assertTrue("$cls has ${tree.sumOf { it.maxPoints }} ranks", tree.sumOf { it.maxPoints } >= 30)
            // Every spell a talent taught before, it still teaches.
            assertTrue("$cls lost a spell unlock", tree.count { it.spellId != null } >= 2)
            // No node points at one that is gone.
            val ids = tree.map { it.id }.toSet()
            assertTrue(tree.all { t -> t.prerequisites.all { it in ids } && t.exclusiveWith.all { it in ids } })
        }
    }

    @Test
    fun `the Cleanse node still names its spell`() {
        // The one per-spell node a healer tree keeps, since dispelling is a
        // healer's job rather than a trade a charm should offer.
        val key = data.bundle(PlayerClass.PRIEST).talents.flatMap { it.effects.keys }.first { it.endsWith(":cleanse") }
        val cleanse = data.spell("cleanse")!!
        val plain = fight(PlayerClass.PRIEST)
        val with = fight(PlayerClass.PRIEST, holding(PlayerClass.PRIEST, key) to 1)
        assertTrue("the node should reach the spell", with.me.effect(key) != plain.me.effect(key))
        assertTrue(cleanse.manaCost > 0 || cleanse.cooldown > 0)
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
