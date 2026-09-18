package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Charms: the first thing in this game you take out of a dungeon.
 *
 * A charm speaks exactly the keys talents speak, so it needs no effect code of
 * its own -- these are about the content being real (a charm that names a spell
 * its class does not have does nothing, silently) and about the trade being
 * real, since a charm that is pure upside is one everybody wears and nobody
 * thinks about.
 */
class CharmTest {
    private val data = Fixtures.data
    private val engine = Engine(data)

    private fun character(cls: PlayerClass, charmId: String? = null): GameState {
        val rng = Rng(3)
        var s = engine.newCharacter(cls, rng).withMe {
            it.copy(level = 40, unlockedSpells = it.unlockedSpells + data.bundle(cls).spells.keys)
        }
        if (charmId != null) s = engine.reduce(s, Action.EquipCharm(charmId), rng)
        return s
    }

    private fun charmsOf(cls: PlayerClass) = data.charms.values.filter { it.cls == cls.name }

    @Test
    fun `every class has five, and every one of them is real`() {
        for (cls in PlayerClass.entries) {
            val mine = charmsOf(cls)
            assertEquals("$cls", 5, mine.size)
            for (charm in mine) {
                assertTrue("${charm.id} has no effects", charm.effects.isNotEmpty())
                assertTrue("${charm.id} has no text", charm.text.isNotEmpty())
                assertTrue("${charm.id} drops from nowhere", charm.from.isNotEmpty())
                assertTrue(
                    "${charm.id} drops from a dungeon that does not exist",
                    data.dungeons.any { it.id == charm.from },
                )
                // A key naming a spell the class does not have is a charm that
                // silently does nothing.
                val spells = data.bundle(cls).spells
                for (key in charm.effects.keys.filter { ':' in it }) {
                    val spellId = key.substringAfter(':')
                    assertTrue("${charm.id}: $cls has no $spellId", spellId in spells)
                }
            }
        }
    }

    @Test
    fun `most charms cost something as well as giving something`() {
        // Not all -- a charm or two may be a straight trade of one thing for
        // another shape of the same thing -- but a set that is all upside is a
        // set with no decision in it.
        val withCost = data.charms.values.count { c -> c.effects.values.any { it < 0 } }
        assertTrue("only $withCost of ${data.charms.size} carry a cost", withCost >= data.charms.size * 2 / 3)
    }

    @Test
    fun `a charm changes what a spell does`() {
        // Priest: Renew ticks for more, and costs more.
        val charm = data.charms.getValue("atalai_prayer_bead")
        val plain = character(PlayerClass.PRIEST)
        val worn = character(PlayerClass.PRIEST, charm.id)

        val heal = { s: GameState ->
            val fight = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), Rng(1))
                .let { f -> f.copy(party = f.party.map { it.copy(maxHealth = 1e6, health = 1e6 / 2) }) }
            val before = fight.unit("1")!!.buffs.sumOf { it.healingPerTick }
            engine.reduce(fight, Action.CastSpell("renew", "1", 99.9), Rng(1))
                .unit("1")!!.buffs.sumOf { it.healingPerTick } - before
        }
        assertTrue("the charm should make Renew tick harder", heal(worn) > heal(plain))

        val cost = { s: GameState ->
            val fight = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), Rng(1))
                .let { f -> f.copy(party = f.party.map { it.copy(maxHealth = 1e6, health = 1e6 / 2) }) }
            fight.mana - engine.reduce(fight, Action.CastSpell("renew", "1", 99.9), Rng(1)).mana
        }
        assertTrue("and cost more for it", cost(worn) > cost(plain))
    }

    @Test
    fun `a charm changes a cooldown, in both directions`() {
        // Druid: Swiftmend twice as often, for less.
        val charm = data.charms.getValue("fang_of_the_grove")
        val cd = { s: GameState ->
            val fight = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), Rng(1))
                .let { f -> f.copy(party = f.party.map { it.copy(maxHealth = 1e6, health = 1e6 / 2) }) }
            var out = engine.reduce(fight, Action.CastSpell("rejuvenation", "1", 50.0), Rng(1))
            // Swiftmend consumes a HoT, and the global cooldown is between the
            // two casts -- without the ticks it is refused and both read zero.
            repeat(12) { out = engine.reduce(out, Action.Tick(1), Rng(1)) }
            out = engine.reduce(out, Action.CastSpell("swiftmend", "1", 50.0), Rng(1))
            out.spellCooldowns["swiftmend"] ?: 0
        }
        val plain = cd(character(PlayerClass.DRUID))
        val worn = cd(character(PlayerClass.DRUID, charm.id))
        assertTrue("plain $plain, worn $worn", worn in 1 until plain)
    }

    @Test
    fun `a charm is refused in combat, and refused from another class`() {
        val rng = Rng(1)
        val priestCharm = charmsOf(PlayerClass.PRIEST).first().id

        // Wrong class: nothing happens rather than a Priest charm on a Mage.
        val mage = character(PlayerClass.MAGE)
        assertNull(engine.reduce(mage, Action.EquipCharm(priestCharm), rng).charm)

        // Mid-fight: swapping would be a free reset of everything on cooldown.
        val fighting = engine.reduce(
            character(PlayerClass.PRIEST), Action.StartDungeon(data.dungeons.first(), "normal"), rng,
        )
        assertNull(engine.reduce(fighting, Action.EquipCharm(priestCharm), rng).charm)

        // And out of it, worn, then taken off again.
        val worn = engine.reduce(character(PlayerClass.PRIEST), Action.EquipCharm(priestCharm), rng)
        assertEquals(priestCharm, worn.charm?.id)
        assertNull(engine.reduce(worn, Action.EquipCharm(null), rng).charm)
    }

    @Test
    fun `a worn charm survives a save and a load, and an unowned one does not`() {
        val store = SaveStore(java.io.File.createTempFile("aegis-charm", ".json"), engine)
        val charm = charmsOf(PlayerClass.PRIEST).first()
        val worn = character(PlayerClass.PRIEST, charm.id)

        val blob = store.serialize(worn)!!
        assertEquals(charm.id, blob.equippedCharmId)
        // Owned on the account, not the character.
        assertEquals(charm.id, store.restore(blob, Rng(1), listOf(charm.id))?.charm?.id)

        // Wearing one nobody on the account earned is not a thing a save can do.
        assertNull(store.restore(blob, Rng(1), emptyList())?.charm)
    }

    @Test
    fun `charms are the account's, and a save from before keeps what it earned`() {
        // Earned per character before the move: pooled onto the roster on load,
        // so the Mage keeps what the Priest found and nobody loses anything.
        val priest = charmsOf(PlayerClass.PRIEST).first().id
        val mage = charmsOf(PlayerClass.MAGE).first().id
        val old = Roster(
            byClass = mapOf(
                "PRIEST" to CharacterBlob(playerClass = "PRIEST", charmIds = listOf(priest)),
                "MAGE" to CharacterBlob(playerClass = "MAGE", charmIds = listOf(mage)),
            ),
        )
        assertEquals(setOf(priest, mage), old.withCharmsPooled().charmIds.toSet())
        // Already pooled: nothing changes.
        val pooled = old.withCharmsPooled()
        assertTrue(pooled.withCharmsPooled() == pooled)
    }

    @Test
    fun `the charms are spread over dungeons, not all in one`() {
        val places = data.charms.values.map { it.from }.toSet()
        assertTrue("charms drop from only $places", places.size >= 4)
        // Every class gets one from each place, so no class is behind.
        for (cls in PlayerClass.entries) {
            assertEquals("$cls", places, charmsOf(cls).map { it.from }.toSet())
        }
    }

    @Test
    fun `a damage charm names a damage spell, and a heal charm a heal`() {
        for (charm in data.charms.values) {
            val spells = data.bundle(PlayerClass.valueOf(charm.cls)).spells
            for ((key, _) in charm.effects) {
                val spell = spells[key.substringAfter(':')] ?: continue
                when (key.substringBefore(':')) {
                    "damage" -> assertEquals("${charm.id}", SpellSchool.DAMAGE, spell.school)
                    "heal" -> assertEquals("${charm.id}", SpellSchool.HEAL, spell.school)
                    // A cooldown charm on a spell with no cooldown does nothing.
                    "cooldown" -> assertNotEquals("${charm.id}", 0, spell.cooldown)
                }
            }
        }
    }

    @Test
    fun `a charm says what it does, in numbers, with the cost in red`() {
        for (charm in data.charms.values) {
            val chips = charmEffects(charm, data)
            assertEquals("${charm.id}: one chip per effect", charm.effects.size, chips.size)
            // No raw keys leaking through: every chip names something a player knows.
            // Raw keys are lower-case ("cooldown:renew"); a label never is.
            assertTrue("${charm.id}: ${chips.map { it.label }}", chips.none { it.label != it.label.uppercase() || "NULL" in it.label })
        }
        // Greater Heal sooner and lighter: a green cooldown, a red heal.
        val rosary = charmEffects(data.charms.getValue("whitemanes_rosary"), data)
        val cd = rosary.first { "COOLDOWN" in it.label }
        val heal = rosary.first { "HEALING" in it.label }
        assertEquals("good", cd.tone)
        assertEquals("-2.5s", cd.value)
        assertEquals("bad", heal.tone)
        assertEquals("-12%", heal.value)
        assertTrue(cd.label.startsWith("GREATER HEAL"))
    }
}
