package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Party composition, which had no test coverage at all before roles existed --
 * `generateParty` was simply assumed correct because it only ever did one thing.
 *
 * It now has to place the player in any of three roles and fill the rest, while
 * drawing from the rng in exactly the order it always did. That second part is
 * not obvious from reading it, so it is pinned here.
 */
class PartyCompositionTest {
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)

    private fun party(cls: PlayerClass, level: Int, seed: Int) =
        tick.generateParty(cls, level, Rng(seed))

    @Test
    fun `always five units in fixed slots with the player last`() {
        for (cls in PlayerClass.entries) {
            val p = party(cls, 12, 99)
            assertEquals("$cls", listOf("1", "2", "3", "4", "5"), p.map { it.id })
            assertEquals("$cls", PLAYER_UNIT_ID, p.last().id)
            assertEquals("$cls", "Player (You)", p.last().name)
        }
    }

    @Test
    fun `the group is always one tank, three dps and one healer`() {
        for (cls in PlayerClass.entries) {
            val roles = party(cls, 12, 99).groupingBy { it.role }.eachCount()
            assertEquals("$cls tanks", 1, roles[UnitRole.TANK])
            assertEquals("$cls dps", 3, roles[UnitRole.DPS])
            assertEquals("$cls healers", 1, roles[UnitRole.HEALER])
        }
    }

    @Test
    fun `the player takes the role their class plays`() {
        assertEquals(UnitRole.HEALER, party(PlayerClass.PRIEST, 12, 99).last().role)
        assertEquals(UnitRole.HEALER, party(PlayerClass.DRUID, 12, 99).last().role)
        assertEquals(UnitRole.HEALER, party(PlayerClass.PALADIN, 12, 99).last().role)
        assertEquals(UnitRole.DPS, party(PlayerClass.MAGE, 12, 99).last().role)
    }

    @Test
    fun `a dps player is given an ai healer with a real name`() {
        val p = party(PlayerClass.MAGE, 12, 99)
        val healer = p.first { it.role == UnitRole.HEALER }
        assertTrue("healer must be an AI slot, not the player", healer.id != PLAYER_UNIT_ID)
        assertTrue("healer needs a name from the pool", healer.name.isNotBlank())
        assertTrue("healer must not be the fallback", healer.name != "Field Medic")
        assertTrue("healer needs health", healer.maxHealth > 0)
    }

    @Test
    fun `slot 1 is the tank whenever the player is not tanking`() {
        // A lot of code and UI assumes this -- including the tank-death rule
        // that doubles everyone's damage.
        for (cls in PlayerClass.entries) {
            val p = party(cls, 12, 99)
            if (p.last().role != UnitRole.TANK) {
                assertEquals("$cls", UnitRole.TANK, p.first().role)
            }
        }
    }

    @Test
    fun `the character sheet and the combat frame agree on the player's health`() {
        // The sheet called healerMaxHealth unconditionally, so a tank read 65
        // on their character screen and 130 in the party frame. Both go through
        // playerMaxHealth now; this is what stops them drifting apart again.
        for (cls in PlayerClass.entries) {
            val role = Engine(Fixtures.data).roleOf(cls)
            val sheet = Fixtures.stats.playerMaxHealth(role, 12)
            val frame = party(cls, 12, 99).last().maxHealth
            assertEquals("$cls", sheet.toDouble(), frame, 0.0)
        }
    }

    @Test
    fun `a tank has more health than a dps`() {
        assertTrue(
            Fixtures.stats.playerMaxHealth(UnitRole.TANK, 12) >
                Fixtures.stats.playerMaxHealth(UnitRole.DPS, 12),
        )
    }

    @Test
    fun `every role has three classes, the third of the new roles unbuilt`() {
        val byRole = PlayerClass.entries.groupBy { Fixtures.data.bundle(it).meta.role }
        assertEquals(setOf("HEALER", "DPS", "TANK"), byRole.keys)
        for ((role, classes) in byRole) {
            assertEquals("$role should have three classes", 3, classes.size)
        }

        // Two kinds of not-selectable, and they must not be confused. The
        // Paladin is finished and gated on a level, so it carries no `locked`
        // flag; the Monk and Warlock are simply unbuilt and carry one, which is
        // what makes their card say so instead of promising a level.
        val unbuilt = PlayerClass.entries.filter { Fixtures.data.bundle(it).meta.locked }
        assertEquals(listOf(PlayerClass.MONK, PlayerClass.WARLOCK), unbuilt)
        assertTrue(
            "the Paladin is level-gated, not unbuilt",
            !Fixtures.data.bundle(PlayerClass.PALADIN).meta.locked,
        )
    }

    @Test
    fun `every playable class can actually be started`() {
        // A locked class still has to parse and build a character -- GameData
        // loads every entry -- but only the playable ones need to reach combat.
        val engine = Engine(Fixtures.data)
        for (cls in PlayerClass.entries) {
            val s = engine.newCharacter(cls, Rng(5))
            assertEquals("$cls", cls, s.playerClass)
            assertTrue("$cls needs a starting bar", s.activeActionBars.any { it.isNotBlank() })
            assertEquals("$cls party", 5, s.party.size)
        }
    }

    @Test
    fun `a healer party is unchanged from before roles existed`() {
        // Verified empirically against the pre-role implementation: identical
        // output across three seeds and three levels. The draw order is
        // pick tank, shuffle three dps, then one level roll per AI slot in
        // order -- adding or reordering a draw here desynchronises every
        // recorded parity scenario, none of which would fail visibly.
        val p = party(PlayerClass.PRIEST, 1, 1337)
        assertEquals(
            listOf("Sunbreaker", "Shadow Priest", "Frostweaver", "Feral Kitty", "Player (You)"),
            p.map { it.name },
        )
        assertEquals(listOf(1, 1, 2, 1, 1), p.map { it.level })
        assertEquals(listOf(130.0, 65.0, 77.0, 65.0), p.dropLast(1).map { it.maxHealth })
    }
}
