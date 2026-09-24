package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The numbers on the profile are the numbers a cast uses.
 *
 * The spellbook used to print each spell's base figures from the content file,
 * which is what it did at level 1 with no talents and no charm -- so a level-40
 * player read a heal as half of what it actually did.
 */
class SpellStatsTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val stats = Fixtures.stats

    private fun value(list: List<SpellStat>, label: String) =
        list.first { it.label == label }.value.substringBefore(' ').trimEnd('s').toInt()

    @Test
    fun `a heal reads bigger at a higher level, as it casts`() {
        val spell = data.spell("flash_heal")!!
        val low = spellStats(spell, PlayerClass.PRIEST, 1, null, stats)
        val high = spellStats(spell, PlayerClass.PRIEST, 40, null, stats)
        assertTrue(value(high, "HEAL") > value(low, "HEAL"))
        assertEquals("the base figure at level 1", spell.healing.toInt(), value(low, "HEAL"))
    }

    @Test
    fun `it matches what a cast actually heals`() {
        val rng = Rng(3)
        var s = engine.newCharacter(PlayerClass.PRIEST, rng).withMe {
            it.copy(level = 30, unlockedSpells = it.unlockedSpells + "greater_heal")
        }
        // A level-30 dungeon: in the Deadmines a level 30 is synced to 4.
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first { 30 <= syncCap(it.levelMax) }, "normal"), rng)
            .let { f -> f.copy(party = f.party.map { it.copy(maxHealth = 1e7, health = 1e6) }) }

        val shown = value(spellStats(data.spell("greater_heal")!!, PlayerClass.PRIEST, 30, s.me, stats), "HEAL")
        val before = s.unit("1")!!.health
        // A roll that cannot crit, so only rank and talents move it.
        val landed = engine.reduce(s, Action.CastSpell("greater_heal", "1", 99.9), Rng(1)).unit("1")!!.health - before
        // Healing power is the class's own multiplier on top; the profile shows
        // the floor, so a cast is never less than what it says.
        assertTrue("shown $shown, landed $landed", landed >= shown * 0.99)
    }

    @Test
    fun `a charm's change shows up where you would look for it`() {
        val charm = data.charms.getValue("whitemanes_rosary") // Greater Heal: sooner, lighter.
        val plain = engine.newCharacter(PlayerClass.PRIEST, Rng(1)).withMe { it.copy(level = 30) }
        val worn = engine.reduce(plain, Action.EquipCharm(charm.id), Rng(1))
        val spell = data.spell("greater_heal")!!

        val a = spellStats(spell, PlayerClass.PRIEST, 30, plain.me, stats)
        val b = spellStats(spell, PlayerClass.PRIEST, 30, worn.me, stats)
        assertTrue("the cooldown should read shorter", value(b, "COOLDOWN") < value(a, "COOLDOWN"))
        assertTrue("and the heal lighter", value(b, "HEAL") < value(a, "HEAL"))
    }

    @Test
    fun `every spell and consumable says something about itself`() {
        val everything = PlayerClass.entries.flatMap { cls ->
            data.bundle(cls).spells.values.map { cls to it }
        } + data.stash.items.values.map { PlayerClass.MAGE to it }
        for ((cls, spell) in everything) {
            assertTrue("${spell.id} shows nothing", spellStats(spell, cls, 20, null, stats).isNotEmpty())
        }
    }

    @Test
    fun `every spell has a shelf, and the shelves are the ones shown`() {
        for (cls in PlayerClass.entries) {
            for (spell in data.bundle(cls).spells.values) {
                assertTrue("${spell.id} is on no shelf", spellGroup(spell) in SPELL_GROUPS)
            }
        }
        // A tank's taunt is utility, a wall is defence, a strike is damage.
        assertEquals("UTILITY", spellGroup(data.spell("taunt")!!))
        assertEquals("DEFENCE", spellGroup(data.spell("shield_wall")!!))
        assertEquals("DAMAGE", spellGroup(data.spell("shield_slam")!!))
        assertEquals("HEALING", spellGroup(data.spell("renew")!!))
    }
}
