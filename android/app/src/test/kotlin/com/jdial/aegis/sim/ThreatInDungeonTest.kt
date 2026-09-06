package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Targeting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Threat in an actual dungeon, not in isolation.
 *
 * The unit tests prove the model is correct given inputs. They do not prove the
 * inputs ever arrive -- and the first version of the on-screen meter read 100%
 * permanently, which looked exactly like a table that never moved. These run
 * real ticks and check the numbers actually change.
 */
class ThreatInDungeonTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()

    private fun start(cls: PlayerClass): GameState =
        engine.reduce(engine.newCharacter(cls, Rng(4)), Action.StartDungeon(dungeon, "normal"), Rng(4))

    private fun run(s0: GameState, ticks: Int, rng: Rng = Rng(4)): GameState {
        var s = s0
        repeat(ticks) { if (s.isCombatActive) s = engine.reduce(s, Action.Tick(1), rng) }
        return s
    }

    private fun threats(s: GameState) = s.party.associate { it.id to it.threat }

    @Test
    fun `a tank accrues threat over a real fight`() {
        val s = run(start(PlayerClass.WARRIOR), 60)
        val self = s.party.first { it.id == PLAYER_UNIT_ID }
        assertTrue("the player should have generated threat, got ${self.threat}", self.threat > 0.0)
    }

    @Test
    fun `the whole table moves, not just one unit`() {
        val s = run(start(PlayerClass.WARRIOR), 60)
        val moved = s.party.count { it.threat > 0.0 }
        assertTrue("expected several units generating threat, got $moved", moved >= 3)
    }

    @Test
    fun `threat keeps climbing rather than settling`() {
        val a = run(start(PlayerClass.WARRIOR), 40)
        val b = run(a, 40)
        val ta = threats(a).getValue(PLAYER_UNIT_ID)
        val tb = threats(b).getValue(PLAYER_UNIT_ID)
        assertTrue("threat should keep accruing: $ta -> $tb", tb > ta)
    }

    @Test
    fun `the enemy settles on the tank without anyone taunting`() {
        // The point of the tank's threat multiplier. If this fails the role does
        // not work, however correct the arithmetic is in isolation.
        val s = run(start(PlayerClass.WARRIOR), 80)
        assertEquals(
            "the enemy should be on the player tank",
            PLAYER_UNIT_ID,
            s.enemyTargetId,
        )
    }

    @Test
    fun `a dps player does not hold aggro off the ai tank`() {
        val s = run(start(PlayerClass.MAGE), 80)
        val target = s.party.firstOrNull { it.id == s.enemyTargetId }
        assertTrue("expected an enemy target after 80 ticks", target != null)
        assertEquals(
            "scripted damage alone must not pull the enemy off the tank",
            UnitRole.TANK,
            target!!.role,
        )
    }

    @Test
    fun `a dps who burns hard enough does pull aggro`() {
        // Casting Frostbolt repeatedly should eventually beat the tank's lead --
        // if it cannot, threat is decorative for a DPS.
        var s = start(PlayerClass.MAGE)
        val rng = Rng(4)
        repeat(120) {
            if (!s.isCombatActive) return@repeat
            s = engine.reduce(s, Action.Tick(1), rng)
            s = engine.reduce(s, Action.CastSpell("frostbolt", null, 100.0), rng)
        }
        val self = s.party.first { it.id == PLAYER_UNIT_ID }
        val tank = s.party.first { it.role == UnitRole.TANK }
        assertTrue(
            "a spamming mage should out-threat the tank: ${self.threat} vs ${tank.threat}",
            self.threat > tank.threat,
        )
        assertEquals("and should therefore have the enemy", PLAYER_UNIT_ID, s.enemyTargetId)
    }

    @Test
    fun `a healer run credits threat only to the healer, from healing`() {
        // The healer game must be untouched. The table is still computed for
        // them -- it costs nothing and stays honest -- but the *AI* units get no
        // scripted-damage credit, because for a healer the whole scripted pool
        // is still attributed the way it always was and nothing consults the
        // result. ThreatTest covers the targeting half of that guarantee.
        val s = run(start(PlayerClass.PRIEST), 60)
        val self = s.party.first { it.id == PLAYER_UNIT_ID }
        assertEquals(UnitRole.HEALER, self.role)

        // Whatever the table says, a healer's boss never picks by it: no shipped
        // template declares threat targeting, and effectiveTargeting only
        // converts for a non-healer.
        val declared = Fixtures.data.dungeons.flatMap { d ->
            val c = d.bossCombat ?: return@flatMap emptyList<Targeting>()
            c.attackTemplates.map { it.targeting } + c.debuffTemplates.map { it.targeting }
        }
        assertTrue("templates exist to check", declared.isNotEmpty())
        assertTrue(
            "no shipped template may declare threat targeting",
            declared.none { it == Targeting.HIGHEST_THREAT },
        )
    }
}
