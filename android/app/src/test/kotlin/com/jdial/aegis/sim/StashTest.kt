package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The stash: consumables any class can carry, one in, one use.
 *
 * Every other choice in this game is made mid-fight or on the talent screen.
 * Which consumable to bring is made before the run, which is the one kind of
 * decision it did not have.
 */
class StashTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val items = data.stash.items.values

    private fun run(cls: PlayerClass, carry: String?, level: Int = 20): GameState {
        val rng = Rng(2)
        val s = engine.newCharacter(cls, rng).withMe { it.copy(level = level) }
        // Where a character of this level belongs: in the Deadmines a level 40
        // is synced down to 4 and would measure a level-4 potion.
        val dungeon = data.dungeons.first { !it.endless && level <= syncCap(it.levelMax) }
        return engine.reduce(s, Action.StartDungeon(dungeon, "normal", false, 0, carry), rng)
            .let { f -> f.copy(party = f.party.map { it.copy(maxHealth = 1e6, health = 1e6 / 2) }) }
    }

    @Test
    fun `twenty, each with its own icon and something to do`() {
        assertEquals(20, items.size)
        assertEquals(20, items.map { it.icon }.toSet().size)
        for (item in items) {
            assertTrue("${item.id} is not tagged", item.hasTag(CONSUMABLE_TAG))
            val does = item.healing > 0 || item.shield > 0 || item.damageReduction != null ||
                (item.manaRegenBuffDurationTicks ?: 0) > 0 || (item.hotHealingPerTick ?: 0.0) > 0
            assertTrue("${item.id} does nothing", does)
        }
    }

    @Test
    fun `every mode drops something from every dungeon, and every item drops somewhere`() {
        val modes = listOf("fast", "normal", "slow", "hard")
        for (mode in modes) {
            for ((i, d) in data.dungeons.withIndex()) {
                assertNotNull("${d.id} drops nothing on $mode", data.stash.dropFor(i, mode))
            }
        }
        val dropped = modes.flatMap { m -> data.dungeons.indices.mapNotNull { data.stash.dropFor(it, m) } }.toSet()
        assertEquals(items.map { it.id }.toSet(), dropped)
    }

    @Test
    fun `any class can carry any of them`() {
        val bomb = "goblin_fire_bomb"
        for (cls in PlayerClass.entries) {
            val s = run(cls, bomb)
            assertEquals("$cls", bomb, s.me.carried)
            assertTrue("$cls cannot reach it", bomb in s.activeActionBars)
        }
    }

    @Test
    fun `one carried, one use, and nothing that was not carried`() {
        val s = run(PlayerClass.PRIEST, "healing_potion")
        val used = engine.reduce(s, Action.CastSpell("healing_potion", s.localUnitId, 0.0), Rng(1))
        assertTrue("the first drink should land", used.me.carriedUsed)
        assertTrue(used.unit(used.localUnitId)!!.health > s.unit(s.localUnitId)!!.health)

        // A second press is refused -- the same state back.
        assertTrue(engine.reduce(used, Action.CastSpell("healing_potion", s.localUnitId, 0.0), Rng(1)) === used)

        // Something not carried cannot be used at all.
        val other = engine.reduce(s, Action.CastSpell("flask_of_the_titans", s.localUnitId, 0.0), Rng(1))
        assertTrue(other === s)
    }

    @Test
    fun `a potion found early is still worth drinking late`() {
        // They rank with level the way class spells do; without that a stash
        // item would sit at rank 1 forever.
        fun healed(level: Int): Double {
            val s = run(PlayerClass.MAGE, "healing_potion", level)
            val before = s.unit(s.localUnitId)!!.health
            return engine.reduce(s, Action.CastSpell("healing_potion", null, 0.0), Rng(1))
                .unit(s.localUnitId)!!.health - before
        }
        assertTrue("level 40 ${healed(40)} vs level 5 ${healed(5)}", healed(40) > healed(5) * 1.5)
    }

    @Test
    fun `it is off the global cooldown, like the mana potion`() {
        val s = run(PlayerClass.MAGE, "flask_of_stoneskin").withMe { it.copy(globalCooldownRemaining = 10) }
        val out = engine.reduce(s, Action.CastSpell("flask_of_stoneskin", null, 0.0), Rng(1))
        assertTrue("it should go off mid-GCD", out.me.carriedUsed)
    }

    @Test
    fun `nothing carried means nothing extra on the bar`() {
        val s = run(PlayerClass.WARRIOR, null)
        assertNull(s.me.carried)
        assertFalse(s.activeActionBars.any { data.spell(it)?.isStashItem() == true })
    }

    @Test
    fun `the outcome says what was spent, so the stash can take it out`() {
        val rng = Rng(1)
        var s = run(PlayerClass.MAGE, "healing_potion")
        s = engine.reduce(s, Action.CastSpell("healing_potion", null, 0.0), rng)
        s = s.copy(combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 0.0001)
        repeat(60) { if (s.dungeonOutcome == null) s = engine.reduce(s, Action.Tick(1), rng) }
        assertEquals("healing_potion", s.dungeonOutcome?.spent)
        assertEquals("normal", s.dungeonOutcome?.pace)
    }
}

/** The bar on the profile: where a consumable is chosen, and where slots swap. */
class ProfileBarTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private fun fresh() = engine.newCharacter(PlayerClass.MAGE, Rng(1))

    @Test
    fun `dragging one slot onto another swaps the two`() {
        val s = fresh()
        val before = s.activeActionBars
        val after = engine.reduce(s, Action.ReorderActionBar(0, 1), Rng(1)).activeActionBars
        assertEquals(before[1], after[0])
        assertEquals(before[0], after[1])
        // Nothing else moved: a swap, not a shift.
        assertEquals(before.drop(2), after.drop(2))
    }

    @Test
    fun `a consumable goes on the bar, and only one at a time`() {
        val s = fresh()
        val empty = s.activeActionBars.indexOf("")
        val one = engine.reduce(s, Action.SetActionBarSlot(empty, "healing_potion"), Rng(1))
        assertTrue("healing_potion" in one.activeActionBars)
        val two = engine.reduce(one, Action.SetActionBarSlot(0, "flask_of_stoneskin"), Rng(1))
        assertTrue("flask_of_stoneskin" in two.activeActionBars)
        assertFalse("the first comes off", "healing_potion" in two.activeActionBars)
    }

    @Test
    fun `whatever consumable is on the bar is what the run carries, where it was put`() {
        var s = fresh()
        val slot = s.activeActionBars.indexOf("")
        s = engine.reduce(s, Action.SetActionBarSlot(slot, "healing_potion"), Rng(1))
        val run = engine.reduce(
            s, Action.StartDungeon(data.dungeons.first(), "normal", false, 0, "healing_potion"), Rng(1),
        )
        assertEquals("healing_potion", run.me.carried)
        assertEquals("it stays in the slot it was put in", slot, run.activeActionBars.indexOf("healing_potion"))

        // Put down but no longer held: the run carries nothing, and it comes off.
        val none = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal", false, 0, null), Rng(1))
        assertNull(none.me.carried)
        assertFalse("healing_potion" in none.activeActionBars)
    }

    @Test
    fun `a bar with a consumable on it survives a save and a load`() {
        var s = fresh()
        val slot = s.activeActionBars.indexOf("")
        s = engine.reduce(s, Action.SetActionBarSlot(slot, "healing_potion"), Rng(1))
        s = engine.reduce(s, Action.ReorderActionBar(0, 1), Rng(1))
        val store = SaveStore(java.io.File.createTempFile("aegis-bar", ".json"), engine)
        val back = store.restore(store.serialize(s)!!, Rng(1))!!
        assertEquals("the arrangement comes back as it was left", s.activeActionBars, back.activeActionBars)
    }
}
