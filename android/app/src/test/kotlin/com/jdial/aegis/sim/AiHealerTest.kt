package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The AI healer: the thing that has to exist before any non-healer role is a
 * game rather than a demo.
 *
 * It is a budget, not a rotation, because the player cannot observe an AI's
 * spell choice -- only whether the bars stayed up and whether it ran dry.
 */
class AiHealerTest {
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)
    private val cfg = Fixtures.data.balance.roles

    private fun unit(id: String, role: UnitRole, hp: Double, maxHp: Double = 100.0, lvl: Int = 10) =
        Unit(id = id, name = "u$id", role = role, level = lvl, health = hp, maxHealth = maxHp)

    /**
     * A human occupies [PLAYER_UNIT_ID]. That is now what "the player is in this
     * slot" means -- the AI healer used to exclude slot 5 by id, and excludes
     * any slot with a human participant instead, so a second human healing from
     * slot 4 is not also driven by the AI.
     */
    private fun state(mana: Double) = GameState(
        participants = mapOf(PLAYER_UNIT_ID to Participant(PLAYER_UNIT_ID)),
        aiHealerMana = mana,
        isCombatActive = true,
    )

    private fun dpsParty(vararg hp: Double) = listOf(
        unit("1", UnitRole.TANK, hp[0]),
        unit("2", UnitRole.DPS, hp[1]),
        unit("3", UnitRole.HEALER, hp[2]),
        unit(PLAYER_UNIT_ID, UnitRole.DPS, hp[3]),
    )

    @Test
    fun `does nothing when the player is the healer`() {
        // Slot 5 is the player; there is no AI healer to act.
        val party = listOf(
            unit("1", UnitRole.TANK, 10.0),
            unit(PLAYER_UNIT_ID, UnitRole.HEALER, 100.0),
        )
        val r = tick.aiHealerTick(state(999.0), party)
        assertEquals(party, r.party)
        assertEquals(0.0, r.healed, 0.0)
    }

    @Test
    fun `an ai healer in any slot works, not just slot 4`() {
        // The exclusion is "a human is driving this slot", not "this is not
        // slot 5". Put the human in slot 1 and the healer in slot 5, and slot 5
        // must act.
        val party = listOf(
            unit(PLAYER_UNIT_ID, UnitRole.HEALER, 100.0),
            unit("1", UnitRole.TANK, 10.0),
        )
        val s = GameState(
            participants = mapOf("1" to Participant("1")),
            localUnitId = "1",
            aiHealerMana = 999.0,
            isCombatActive = true,
        )
        val r = tick.aiHealerTick(s, party)
        assertTrue("slot 5 has no human and should have healed", r.healed > 0)
        assertTrue(r.party.first { it.id == "1" }.health > 10.0)
    }

    @Test
    fun `heals the unit furthest from full`() {
        val r = tick.aiHealerTick(state(999.0), dpsParty(30.0, 80.0, 100.0, 90.0))
        assertTrue("something should have been healed", r.healed > 0)
        assertTrue("the tank was lowest", r.party.first { it.id == "1" }.health > 30.0)
        assertEquals("nobody else", 80.0, r.party.first { it.id == "2" }.health, 0.0)
    }

    @Test
    fun `never heals past full`() {
        // Eligible (below the triage threshold) but missing less than one heal:
        // 80/100 with a level-10 heal, which is far more than 20.
        val heal = cfg.aiHealerHeal(10)
        assertTrue("test needs an overheal case", heal > 20.0)

        // Start below the cap, or regen clamps first and the arithmetic below
        // is measuring the cap rather than the charge.
        val start = 100.0
        val r = tick.aiHealerTick(state(start), dpsParty(80.0, 100.0, 100.0, 100.0))
        val tank = r.party.first { it.id == "1" }
        assertEquals(100.0, tank.health, 0.0)
        assertEquals("only the missing 20 was paid for", 20.0, r.healed, 1e-9)
        assertEquals(
            "and only the missing 20 was charged",
            start + cfg.aiHealerRegen(10) - 20.0 * cfg.aiHealerManaPerHealPoint,
            r.manaLeft,
            1e-9,
        )
    }

    @Test
    fun `it triages rather than topping people off`() {
        // Above the threshold nobody is worth a global cooldown, so chip damage
        // is allowed to accumulate -- which is what makes a spike lethal.
        val nearFull = cfg.aiHealerHealBelowFraction * 100.0 + 1.0
        val r = tick.aiHealerTick(state(999.0), dpsParty(nearFull, nearFull, 100.0, nearFull))
        assertEquals(0.0, r.healed, 0.0)
    }

    @Test
    fun `when the budget runs dry it stops healing`() {
        val broke = tick.aiHealerTick(state(0.0), dpsParty(10.0, 10.0, 100.0, 10.0))
        assertEquals("no mana, no heal", 0.0, broke.healed, 0.0)

        val rich = tick.aiHealerTick(state(999.0), dpsParty(10.0, 10.0, 100.0, 10.0))
        assertTrue(rich.healed > 0)
    }

    @Test
    fun `mana regenerates but is capped`() {
        val cap = cfg.aiHealerMaxMana(10)
        // Full party, so nothing is spent and only regen moves the number.
        val r = tick.aiHealerTick(state(cap), dpsParty(100.0, 100.0, 100.0, 100.0))
        assertEquals("cannot regen past the cap", cap, r.manaLeft, 1e-9)

        val low = tick.aiHealerTick(state(10.0), dpsParty(100.0, 100.0, 100.0, 100.0))
        assertEquals(10.0 + cfg.aiHealerRegen(10), low.manaLeft, 1e-9)
    }

    @Test
    fun `healing, mana and regen grow faster than a straight line past the pivot`() {
        // Pinned at the pivot, below it and above it: from level 28 a straight
        // line left the AI healer too weak to keep a group alive.
        val pivot = cfg.aiHealerLevelPivot.toInt()
        assertEquals(cfg.aiHealerHealBase + cfg.aiHealerHealPerLevel * pivot, cfg.aiHealerHeal(pivot), 1e-9)
        val linear47 = cfg.aiHealerHealBase + cfg.aiHealerHealPerLevel * 47
        assertTrue(cfg.aiHealerHeal(47) > linear47)
        assertTrue(cfg.aiHealerMaxMana(47) > cfg.aiHealerManaBase + cfg.aiHealerManaPerLevel * 47)
        assertTrue(cfg.aiHealerRegen(47) > cfg.aiHealerRegen(5))
    }

    @Test
    fun `a dead ai healer heals nobody`() {
        val party = listOf(
            unit("1", UnitRole.TANK, 10.0),
            unit("3", UnitRole.HEALER, 0.0),
            unit(PLAYER_UNIT_ID, UnitRole.DPS, 50.0),
        )
        assertEquals(0.0, tick.aiHealerTick(state(999.0), party).healed, 0.0)
    }

    @Test
    fun `choice does not depend on party order`() {
        val a = dpsParty(30.0, 30.0, 100.0, 90.0)
        val b = listOf(a[1], a[0], a[2], a[3])
        // Both are tied at 30/100; ascending id must decide, not list position.
        val ra = tick.aiHealerTick(state(999.0), a).party.first { it.health > 30.0 }.id
        val rb = tick.aiHealerTick(state(999.0), b).party.first { it.health > 30.0 }.id
        assertEquals(ra, rb)
        assertEquals("1", ra)
    }

    @Test
    fun `a mage run starts with a full ai healer budget and a healer run with none`() {
        val engine = Engine(Fixtures.data)
        val dungeon = Fixtures.data.dungeons.first()

        val mage = engine.reduce(
            engine.newCharacter(PlayerClass.MAGE, Rng(1)),
            Action.StartDungeon(dungeon, "normal"), Rng(1),
        )
        assertTrue("a mage needs an AI healer with mana", mage.aiHealerMana > 0)

        val priest = engine.reduce(
            engine.newCharacter(PlayerClass.PRIEST, Rng(1)),
            Action.StartDungeon(dungeon, "normal"), Rng(1),
        )
        assertEquals("a healer player has no AI healer", 0.0, priest.aiHealerMana, 0.0)
    }
}
