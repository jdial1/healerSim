package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Editing the action bar from the character screen.
 *
 * Reordering already existed; choosing *which* unlocked spells you carry did
 * not, so the loadout was whatever progression handed you.
 */
class ActionBarEditTest {
    private val engine = Engine(Fixtures.data)

    private fun character(cls: PlayerClass = PlayerClass.PRIEST) =
        engine.newCharacter(cls, Rng(3))

    private fun set(s: GameState, i: Int, id: String) =
        engine.reduce(s, Action.SetActionBarSlot(i, id), Rng(3))

    @Test
    fun `a removed spell can be put back in a different slot`() {
        // A fresh character already carries everything it has unlocked, so the
        // round trip is the honest way to exercise placement.
        val s = character()
        val from = s.activeActionBars.indexOfFirst { it.isNotBlank() }
        val spell = s.activeActionBars[from]
        val cleared = set(s, from, "")
        assertEquals("", cleared.activeActionBars[from])

        val to = cleared.activeActionBars.indexOfFirst { it.isBlank() }
        val out = set(cleared, to, spell)
        assertEquals(spell, out.activeActionBars[to])
        assertEquals("and only in one place", 1, out.activeActionBars.count { it == spell })
    }

    @Test
    fun `a slot can be cleared`() {
        val s = character()
        val filled = s.activeActionBars.indexOfFirst { it.isNotBlank() }
        val out = set(s, filled, "")
        assertEquals("", out.activeActionBars[filled])
    }

    @Test
    fun `the same spell cannot occupy two slots`() {
        // Two slots sharing one cooldown looks exactly like a bug from the
        // combat screen, so the engine refuses rather than letting the UI police
        // it.
        val s = character()
        val existing = s.activeActionBars.first { it.isNotBlank() }
        val empty = s.activeActionBars.indexOfFirst { it.isBlank() }
        assertEquals(s, set(s, empty, existing))
    }

    @Test
    fun `a spell the character has not unlocked is refused`() {
        val s = character()
        val notMine = Fixtures.data.bundle(PlayerClass.MAGE).spells.keys.first()
        assertTrue(notMine !in s.unlockedSpells)
        assertEquals(s, set(s, 0, notMine))
    }

    @Test
    fun `an out of range slot is refused`() {
        val s = character()
        val spell = s.activeActionBars.first { it.isNotBlank() }
        assertEquals(s, set(s, -1, spell))
        assertEquals(s, set(s, s.activeActionBars.size, spell))
    }

    @Test
    fun `editing is inert mid-run`() {
        // Same rule reordering already had: rebuilding your bar mid-pull is not
        // a decision this game asks you to make.
        val started = engine.reduce(
            character(),
            Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"),
            Rng(3),
        )
        val filled = started.activeActionBars.indexOfFirst { it.isNotBlank() }
        assertTrue("fixture needs a filled slot", filled >= 0)
        assertEquals("clearing must be refused mid-run", started, set(started, filled, ""))
    }

    // --- the global cooldown -------------------------------------------------

    @Test
    fun `a second cast in the same tick is refused`() {
        val engine2 = Engine(Fixtures.data)
        var s = engine2.reduce(
            character(), Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"), Rng(3),
        )
        s = engine2.reduce(s, Action.Tick(1), Rng(3))
        val spell = s.activeActionBars.first { it.isNotBlank() && it != MANA_POTION_ID }

        val first = engine2.reduce(s, Action.CastSpell(spell, "1", 100.0), Rng(3))
        assertTrue("the first cast should land", first.mana < s.mana)
        assertTrue("and should start the GCD", first.globalCooldownRemaining > 0)

        val second = engine2.reduce(first, Action.CastSpell(spell, "1", 100.0), Rng(3))
        assertEquals("a second cast on the GCD must change nothing", first, second)
    }

    @Test
    fun `the global cooldown expires and casting resumes`() {
        val engine2 = Engine(Fixtures.data)
        var s = engine2.reduce(
            character(), Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"), Rng(3),
        )
        s = engine2.reduce(s, Action.Tick(1), Rng(3))
        val spell = s.activeActionBars.first { it.isNotBlank() && it != MANA_POTION_ID }
        s = engine2.reduce(s, Action.CastSpell(spell, "1", 100.0), Rng(3))

        val gcd = Fixtures.data.balance.combat.shared.globalCooldownTicks
        repeat(gcd) { s = engine2.reduce(s, Action.Tick(1), Rng(3)) }
        assertEquals("the GCD should have expired", 0, s.globalCooldownRemaining)

        val manaBefore = s.mana
        val after = engine2.reduce(s, Action.CastSpell(spell, "1", 100.0), Rng(3))
        assertTrue("casting should work again", after.mana < manaBefore)
    }

    @Test
    fun `the potion is off the global cooldown`() {
        // Being unable to drink because you just cast is the kind of rule that
        // only ever feels like a bug.
        val engine2 = Engine(Fixtures.data)
        var s = engine2.reduce(
            character(), Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"), Rng(3),
        )
        s = engine2.reduce(s, Action.Tick(1), Rng(3))
        val spell = s.activeActionBars.first { it.isNotBlank() && it != MANA_POTION_ID }
        s = engine2.reduce(s, Action.CastSpell(spell, "1", 100.0), Rng(3))
        assertTrue(s.globalCooldownRemaining > 0)

        val drunk = engine2.reduce(s, Action.CastSpell(MANA_POTION_ID, null, 100.0), Rng(3))
        assertTrue(
            "the potion must still be usable on the GCD",
            drunk.manaPotionsUsedThisDungeon > s.manaPotionsUsedThisDungeon,
        )
    }

    @Test
    fun `every class can fill a slot with each of its own spells`() {
        // Guards the new classes too: a spell that cannot be slotted is one the
        // player can never cast.
        for (cls in PlayerClass.entries) {
            var s = engine.newCharacter(cls, Rng(3))
            for (id in s.unlockedSpells) {
                if (id in s.activeActionBars) continue
                val slot = s.activeActionBars.indexOfFirst { it.isBlank() }
                if (slot < 0) break
                s = set(s, slot, id)
                assertEquals("$cls could not slot $id", id, s.activeActionBars[slot])
            }
        }
    }
}
