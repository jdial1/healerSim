package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.Targeting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Wailing Caverns: the wound on whoever holds threat, and the defensive that clears it. */
class WoundTest {
    // No ambient damage and no AI healing: only the wound moves health.
    private val data = Fixtures.data.let { d ->
        d.with(
            balance = d.balance.copy(
                environmentalDamage = d.balance.environmentalDamage.copy(tankProcChance = 0.0, nonTankProcChance = 0.0),
                roles = d.balance.roles.copy(aiHealerHealBase = 0.0, aiHealerHealPerLevel = 0.0),
            ),
        )
    }
    private val engine = Engine(data)
    private val m = data.encounters.mechanics.getValue("verdan_wound")

    private fun fight(cls: PlayerClass): GameState {
        val rng = Rng(4)
        var s = engine.newCharacter(cls, rng)
        s = s.withMe { it.copy(level = 8, unlockedSpells = it.unlockedSpells + data.bundle(cls).spells.keys) }
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == "wailing_caverns" }, "normal"), rng)
        return s.copy(
            combatPhase = CombatPhase.BOSS, enemyHealth = 1e9, enemyMaxHealth = 1e9, mechanicCooldown = 10_000,
            party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
        )
    }

    private fun wound(stacks: Int) = UnitDebuff(
        id = "wound", name = "Infected Wound", remainingTicks = m.durationTicks!!, damagePerTick = 0.0,
        sourceAbilityId = "verdan_wound", stacks = stacks, clearedByDefensive = true,
    )

    private fun GameState.wounded(unitId: String, stacks: Int) =
        copy(party = party.map { if (it.id == unitId) it.copy(debuffs = listOf(wound(stacks))) else it })

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    private fun GameState.woundOn(id: String) = unit(id)!!.debuffs.firstOrNull { it.sourceAbilityId == "verdan_wound" }

    @Test
    fun `Wailing Caverns wounds whoever holds threat`() {
        val tpl = data.dungeons.first { it.id == "wailing_caverns" }.bossCombat!!.debuffTemplates
            .first { it.abilityId == "verdan_wound" }
        assertEquals(Targeting.HIGHEST_THREAT, tpl.targeting)
        assertFalse(tpl.dispellable)
    }

    @Test
    fun `tanks learn their defensive at level 7, in time for Wailing Caverns`() {
        assertTrue("shield_wall" in data.grantsFor(PlayerClass.WARRIOR, 7))
        assertFalse("shield_wall" in data.grantsFor(PlayerClass.WARRIOR, 6))
        assertTrue("icebound_fortitude" in data.grantsFor(PlayerClass.DEATHKNIGHT, 7))
        assertTrue(data.dungeons.first { it.id == "wailing_caverns" }.levelMin >= 7)
        // No talent still unlocks what the level already gives.
        val unlocks = data.bundle(PlayerClass.WARRIOR).talents.mapNotNull { it.spellId } +
            data.bundle(PlayerClass.DEATHKNIGHT).talents.mapNotNull { it.spellId }
        assertFalse(unlocks.any { it == "shield_wall" || it == "icebound_fortitude" })
    }

    @Test
    fun `the wound stacks, and past the top it bursts`() {
        val warrior = fight(PlayerClass.WARRIOR)
        val me = warrior.localUnitId
        var s = step(warrior.wounded(me, 1), m.everyTicks * (m.maxStacks - 1))
        assertEquals(m.maxStacks, s.woundOn(me)!!.stacks)

        val before = s.unit(me)!!.health
        s = step(s, m.everyTicks)
        assertEquals(1, s.woundOn(me)!!.stacks)
        assertTrue("took ${before - s.unit(me)!!.health}", before - s.unit(me)!!.health >= m.burstDamage * 0.5)
        // ...and nothing before that.
        val quiet = step(warrior.wounded(me, 1), m.everyTicks)
        assertEquals(warrior.unit(me)!!.health, quiet.unit(me)!!.health, 1e-9)
    }

    @Test
    fun `a defensive clears it`() {
        val warrior = fight(PlayerClass.WARRIOR)
        val me = warrior.localUnitId
        // Mid global cooldown, as a defensive has to be.
        val busy = warrior.wounded(me, 4).withMe { it.copy(globalCooldownRemaining = 10) }
        val walled = engine.reduce(busy, Action.CastSpell("shield_wall", null, 99.0), Rng(1))
        assertEquals(10, walled.globalCooldownRemaining)
        assertEquals(null, step(walled).woundOn(me))
        // Without it, the wound stays.
        assertEquals(4, step(warrior.wounded(me, 4)).woundOn(me)!!.stacks)
    }

    @Test
    fun `an AI tank clears it just before it would burst`() {
        val priest = fight(PlayerClass.PRIEST)
        val tank = priest.party.first { it.role == UnitRole.TANK }.id
        assertEquals(m.maxStacks - 2, step(priest.wounded(tank, m.maxStacks - 2)).woundOn(tank)!!.stacks)
        assertEquals(null, step(priest.wounded(tank, m.maxStacks - 1)).woundOn(tank))
    }
}
