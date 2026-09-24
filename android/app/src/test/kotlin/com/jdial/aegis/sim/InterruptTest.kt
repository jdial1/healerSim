package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cancelling a boss's wind-up: the DPS button, and the AI that presses it. */
class InterruptTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)
    private val deadmines = data.dungeons.first { it.id == "deadmines" }

    private fun fight(cls: PlayerClass): GameState {
        val rng = Rng(2)
        return engine.reduce(engine.newCharacter(cls, rng), Action.StartDungeon(deadmines, "normal"), rng)
            .copy(combatPhase = CombatPhase.BOSS)
    }

    private fun cast(interruptible: Boolean, elapsed: Int = 10) = EnemyCast(
        abilityId = "vc_cannon", name = "Cannon Barrage", targets = listOf("1", "2"),
        remainingTicks = 30 - elapsed, totalTicks = 30, interruptible = interruptible,
    )

    private fun kick(s: GameState, spell: String) = engine.reduce(s, Action.CastSpell(spell, null, 99.0), Rng(1))

    @Test
    fun `DPS learn their interrupt at level one, and it is on the bar`() {
        for ((cls, spell) in listOf(PlayerClass.MAGE to "counterspell", PlayerClass.ROGUE to "kick")) {
            val s = engine.newCharacter(cls, Rng(1))
            assertTrue("$cls knows $spell", spell in s.unlockedSpells)
            assertTrue("$cls can reach $spell", spell in s.activeActionBars)
        }
        assertTrue("counterspell" !in engine.newCharacter(PlayerClass.WARRIOR, Rng(1)).unlockedSpells)
    }

    @Test
    fun `a kick cancels an interruptible cast`() {
        val s = fight(PlayerClass.MAGE).copy(enemyCast = cast(interruptible = true))
        val out = kick(s, "counterspell")
        assertNull(out.enemyCast)
        assertEquals(s.localUnitId, out.lastInterruptBy)
        assertTrue((out.spellCooldowns["counterspell"] ?: 0) > 0)
    }

    @Test
    fun `a kick ignores the global cooldown, and starts none`() {
        val s = fight(PlayerClass.MAGE).copy(enemyCast = cast(interruptible = true)).withMe { it.copy(globalCooldownRemaining = 10) }
        val out = kick(s, "counterspell")
        assertNull(out.enemyCast)
        assertEquals(10, out.globalCooldownRemaining)
    }

    @Test
    fun `a kick at the wrong moment does nothing but still costs the cooldown`() {
        val solid = fight(PlayerClass.MAGE).copy(enemyCast = cast(interruptible = false))
        val out = kick(solid, "counterspell")
        assertEquals(solid.enemyCast, out.enemyCast)
        assertTrue((out.spellCooldowns["counterspell"] ?: 0) > 0)

        val idle = fight(PlayerClass.MAGE)
        assertTrue((kick(idle, "counterspell").spellCooldowns["counterspell"] ?: 0) > 0)
    }

    @Test
    fun `a rogue's kick costs energy`() {
        val s = fight(PlayerClass.ROGUE).copy(enemyCast = cast(interruptible = true))
        val spent = kick(s, "kick")
        assertNull(spent.enemyCast)
        assertEquals(s.classResource - 25, spent.classResource, 1e-9)
        val poor = s.withMe { it.copy(classResource = 10.0) }
        assertSame(poor, kick(poor, "kick"))
    }

    @Test
    fun `the AI kicks every second interruptible cast, after a beat`() {
        val s = fight(PlayerClass.PRIEST)
        val delay = data.encounters.aiKickDelayTicks
        // The first cast of the run goes through.
        assertEquals(cast(true, delay), tick.aiKick(s.copy(enemyCast = cast(true, delay), interruptibleCasts = 1)).enemyCast)
        // The second is kicked -- but not before the beat.
        val second = s.copy(interruptibleCasts = 2)
        assertEquals(cast(true, delay - 1), tick.aiKick(second.copy(enemyCast = cast(true, delay - 1))).enemyCast)
        val kicked = tick.aiKick(second.copy(enemyCast = cast(true, delay)))
        assertNull(kicked.enemyCast)
        assertEquals(UnitRole.DPS, kicked.unit(kicked.lastInterruptBy!!)!!.role)
        // Never a cast that cannot be interrupted.
        assertEquals(cast(false, delay), tick.aiKick(second.copy(enemyCast = cast(false, delay))).enemyCast)
    }

    @Test
    fun `with a human DPS in the run, kicking is theirs`() {
        val s = fight(PlayerClass.MAGE).copy(enemyCast = cast(true, 20), interruptibleCasts = 2)
        assertEquals(s.enemyCast, tick.aiKick(s).enemyCast)
    }

    @Test
    fun `the Deadmines boss has a cannon to kick`() {
        val cannon = deadmines.bossCombat!!.attackTemplates.firstOrNull { it.abilityId == "vc_cannon" }
        assertTrue(cannon != null && cannon.interruptible && cannon.castTicks > 0)
    }

    @Test
    fun `in a real fight, the AI's kick takes the cannon off the party`() {
        // Run a priest's Deadmines boss long enough for two cannons and count
        // the ones that landed against the ones that were kicked.
        val rng = Rng(9)
        var s = fight(PlayerClass.PRIEST).copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
        var kicked = 0
        var started = 0
        repeat(1500) {
            if (!s.isCombatActive) return@repeat
            val before = s.enemyCast
            // Nobody heals here, so keep the party standing: this is about the kicks.
            s = s.copy(party = s.party.map { it.copy(health = it.maxHealth) })
            s = engine.reduce(s, Action.Tick(1), rng)
            if (before == null && s.enemyCast?.abilityId == "vc_cannon") started++
            if (before?.abilityId == "vc_cannon" && s.enemyCast == null && before.remainingTicks > 1) kicked++
        }
        assertTrue("expected cannons, saw $started", started >= 2)
        assertTrue("expected kicks, saw $kicked", kicked >= 1)
        assertTrue(kicked < started)
    }
}
