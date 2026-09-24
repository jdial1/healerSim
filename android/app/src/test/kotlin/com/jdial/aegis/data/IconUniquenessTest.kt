package com.jdial.aegis.data

import com.jdial.aegis.sim.Fixtures
import com.jdial.aegis.sim.MANA_POTION_ID
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Every talent and every spell has a picture of its own.
 *
 * The trees were built from a handful of placeholder icons, so the same one
 * stood for eight different talents and a player could not tell nodes apart
 * at a glance. With the whole icon folder available there is no reason for a
 * repeat. The one deliberate echo: a talent that unlocks a spell shows that
 * spell. Potions are exempt -- they are meant to look alike.
 *
 * scripts/assign-unique-icons.py fixes a violation.
 */
class IconUniquenessTest {
    private val classes = PlayerClass.entries.map { Fixtures.data.bundle(it) }

    // By spell id: Flash Heal is one spell that two classes carry.
    private val spellIcons = (classes.flatMap { b -> b.spells.values } + Fixtures.data.sharedSpells.values)
        .filter { it.id != MANA_POTION_ID && !it.hasTag("consumable") }
        .distinctBy { it.id }
        .map { it.id to it.icon }

    private fun repeats(pairs: List<Pair<String, String>>): Map<String, List<String>> =
        pairs.groupBy({ it.second }, { it.first }).filterValues { it.size > 1 }

    @Test
    fun `no two talents in a tree share an icon`() {
        val bad = classes.associate { b ->
            b.meta.id to repeats(b.talents.filter { it.spellId == null }.map { it.id to it.icon })
        }.filterValues { it.isNotEmpty() }
        assertEquals(emptyMap<String, Any>(), bad)
    }

    @Test
    fun `no two talents anywhere share an icon`() {
        val all = classes.flatMap { b ->
            b.talents.filter { it.spellId == null }.map { "${b.meta.id}/${it.id}" to it.icon }
        }
        assertEquals(emptyMap<String, List<String>>(), repeats(all))
    }

    @Test
    fun `no two spells share an icon`() {
        assertEquals(emptyMap<String, List<String>>(), repeats(spellIcons))
    }

    @Test
    fun `no two charms share an icon, and none borrows a spell's or a talent's`() {
        val charms = Fixtures.data.charms.values.map { it.id to it.icon }
        assertEquals(emptyMap<String, List<String>>(), repeats(charms))

        val taken = (spellIcons + classes.flatMap { b -> b.talents.map { it.id to it.icon } })
            .associate { (id, icon) -> icon to id }
        // A charm rewrites a spell, so borrowing that spell's icon would read as
        // the spell itself sitting in the inventory.
        assertEquals(
            emptyList<String>(),
            charms.mapNotNull { (id, icon) -> taken[icon]?.let { "$id wears $it" } },
        )
    }

    @Test
    fun `a talent wears a spell's icon only when it unlocks that spell`() {
        val bySpellIcon = spellIcons.associate { (id, icon) -> icon to id }
        val bad = classes.flatMap { b ->
            b.talents.mapNotNull { t ->
                val owner = bySpellIcon[t.icon] ?: return@mapNotNull null
                if (owner == t.spellId) null else "${b.meta.id}/${t.id} wears $owner"
            }
        } + classes.flatMap { b ->
            b.talents.filter { it.spellId != null }.mapNotNull { t ->
                val spell = b.spells[t.spellId] ?: return@mapNotNull "${b.meta.id}/${t.id}: no spell ${t.spellId}"
                if (spell.icon == t.icon) null else "${b.meta.id}/${t.id} unlocks ${t.spellId} but shows ${t.icon}"
            }
        }
        assertEquals(emptyList<String>(), bad)
    }
}
