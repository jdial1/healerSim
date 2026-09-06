package com.jdial.aegis.sim

import com.jdial.aegis.data.Targeting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The threat model. Live for a tank or DPS player, and still completely inert
 * for a healer -- which is the property that keeps the parity corpus valid.
 *
 * Threat targeting is switched on by the player's role rather than by dungeon
 * content, for exactly that reason: opting a dungeon in via its JSON would
 * change how the boss picks victims for a healer too, removing an rng draw and
 * desynchronising every recorded scenario.
 *
 * The corpus proves threat changed nothing for a healer. It cannot prove threat
 * *works*, because the JS engine it records has no threat at all -- that is what
 * these are for.
 */
class ThreatTest {
    private val engine = Engine(Fixtures.data)
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)

    private fun unit(id: String, role: UnitRole, threat: Double = 0.0, hp: Double = 100.0) =
        Unit(id = id, name = "u$id", role = role, level = 1, health = hp, maxHealth = 100.0, threat = threat)

    private fun state(vararg party: Unit, targetId: String? = null, lock: Int = 0, taunter: String? = null) =
        GameState(
            party = party.toList(),
            enemyTargetId = targetId,
            tauntLockTicks = lock,
            tauntedById = taunter,
            isCombatActive = true,
        )

    // --- target resolution ---------------------------------------------------

    @Test
    fun `no living units means no target`() {
        assertNull(tick.resolveEnemyTarget(state(unit("1", UnitRole.TANK, hp = 0.0))))
    }

    @Test
    fun `with no target yet the highest threat is picked`() {
        val s = state(
            unit("1", UnitRole.TANK, threat = 10.0),
            unit("2", UnitRole.DPS, threat = 40.0),
        )
        assertEquals("2", tick.resolveEnemyTarget(s))
    }

    @Test
    fun `ties break on ascending id, not list order`() {
        val a = state(unit("3", UnitRole.DPS, threat = 50.0), unit("2", UnitRole.DPS, threat = 50.0))
        val b = state(unit("2", UnitRole.DPS, threat = 50.0), unit("3", UnitRole.DPS, threat = 50.0))
        assertEquals("2", tick.resolveEnemyTarget(a))
        assertEquals("2", tick.resolveEnemyTarget(b))
    }

    @Test
    fun `beating the current target by less than the margin does not pull it`() {
        // overtakeMultiplier is 1.1, so 105 over 100 is a lead but not a pull.
        val s = state(
            unit("1", UnitRole.TANK, threat = 100.0),
            unit("2", UnitRole.DPS, threat = 105.0),
            targetId = "1",
        )
        assertEquals("1", tick.resolveEnemyTarget(s))
    }

    @Test
    fun `beating it by more than the margin pulls it`() {
        val s = state(
            unit("1", UnitRole.TANK, threat = 100.0),
            unit("2", UnitRole.DPS, threat = 200.0),
            targetId = "1",
        )
        assertEquals("2", tick.resolveEnemyTarget(s))
    }

    @Test
    fun `a dead target is released even to someone with less threat`() {
        val s = state(
            unit("1", UnitRole.TANK, threat = 900.0, hp = 0.0),
            unit("2", UnitRole.DPS, threat = 1.0),
            targetId = "1",
        )
        assertEquals("2", tick.resolveEnemyTarget(s))
    }

    @Test
    fun `a taunt lock beats the table`() {
        val s = state(
            unit("1", UnitRole.TANK, threat = 1.0),
            unit("2", UnitRole.DPS, threat = 999.0),
            targetId = "2", lock = 5, taunter = "1",
        )
        assertEquals("1", tick.resolveEnemyTarget(s))
    }

    @Test
    fun `a taunt lock on a corpse falls back to the table`() {
        val s = state(
            unit("1", UnitRole.TANK, threat = 1.0, hp = 0.0),
            unit("2", UnitRole.DPS, threat = 999.0),
            targetId = "2", lock = 5, taunter = "1",
        )
        assertEquals("2", tick.resolveEnemyTarget(s))
    }

    // --- accrual -------------------------------------------------------------

    @Test
    fun `overheal generates no threat`() {
        val party = listOf(unit(PLAYER_UNIT_ID, UnitRole.HEALER))
        // accrueThreat is only ever handed *effective* healing, so the healer's
        // threat is a function of what landed, never of what was cast.
        val none = tick.accrueThreat(party, healEffective = 0.0, scriptedPartyDamage = 0.0)
        val some = tick.accrueThreat(party, healEffective = 100.0, scriptedPartyDamage = 0.0)
        assertEquals(0.0, none.single().threat, 0.0)
        assertNotEquals(0.0, some.single().threat)
    }

    @Test
    fun `a tank out-threats each individual dps in a real party`() {
        // The guarantee is per-DPS, not against the whole party combined: in a
        // standard 1 tank + 3 DPS group the tank must lead each of them, which
        // is what keeps the enemy on it without anyone taunting.
        val party = listOf(
            unit("1", UnitRole.TANK),
            unit("2", UnitRole.DPS), unit("3", UnitRole.DPS), unit("4", UnitRole.DPS),
        )
        val after = tick.accrueThreat(party, healEffective = 0.0, scriptedPartyDamage = 100.0)
        val cfg = Fixtures.data.balance.threat
        val tankThreat = after.first { it.id == "1" }.threat
        val dpsThreat = after.first { it.id == "2" }.threat

        // The tank deals far less of the damage but generates more threat with
        // it -- that asymmetry is the whole reason the role works.
        assertEquals(100.0 * cfg.tankDamageShare * 2.5, tankThreat, 1e-9)
        assertEquals(100.0 * (1 - cfg.tankDamageShare) / 3.0, dpsThreat, 1e-9)

        // And by enough that the overtake margin does not let a DPS drift into
        // the lead on scripted damage alone -- pulling aggro has to take doing
        // something, which is what a player DPS will be able to do.
        assertEquals(true, tankThreat > dpsThreat * cfg.overtakeMultiplier)
    }

    @Test
    fun `the ai healer earns its own threat rather than the player's`() {
        // Whoever is healing is on the table. Before this, healing threat was
        // credited to slot 5 unconditionally, so the AI healer could heal an
        // entire fight and never appear -- a player tank could not lose aggro
        // to their own healer no matter how hard it worked.
        val party = listOf(unit(PLAYER_UNIT_ID, UnitRole.TANK), unit("4", UnitRole.HEALER))
        val after = tick.accrueThreat(
            party, healEffective = 0.0, scriptedPartyDamage = 0.0, aiHealerHealing = 200.0,
        )
        val cfg = Fixtures.data.balance.threat
        assertEquals(0.0, after.first { it.id == PLAYER_UNIT_ID }.threat, 0.0)
        assertEquals(200.0 * cfg.healingCoefficient, after.first { it.id == "4" }.threat, 1e-9)
    }

    @Test
    fun `the damage pool is split across living dps only`() {
        val three = listOf(unit("2", UnitRole.DPS), unit("3", UnitRole.DPS), unit("4", UnitRole.DPS))
        val two = listOf(unit("2", UnitRole.DPS), unit("3", UnitRole.DPS), unit("4", UnitRole.DPS, hp = 0.0))
        val a = tick.accrueThreat(three, 0.0, 90.0).first { it.id == "2" }.threat
        val b = tick.accrueThreat(two, 0.0, 90.0).first { it.id == "2" }.threat
        assertEquals(30.0, a, 1e-9)
        assertEquals(45.0, b, 1e-9)
    }

    @Test
    fun `a corpse is dropped from the table`() {
        val party = listOf(unit("2", UnitRole.DPS, threat = 500.0, hp = 0.0))
        assertEquals(0.0, tick.accrueThreat(party, 0.0, 100.0).single().threat, 0.0)
    }

    // --- taunt ---------------------------------------------------------------

    @Test
    fun `taunting takes the lead and keeps it after the lock expires`() {
        val start = state(
            unit("1", UnitRole.TANK, threat = 10.0),
            unit("2", UnitRole.DPS, threat = 100.0),
            targetId = "2",
        )
        val taunted = engine.reduce(start, Action.Taunt(ticks = 3, actorId = "1"), Rng(1))
        assertEquals("1", taunted.enemyTargetId)
        assertEquals(3, taunted.tauntLockTicks)

        // The bump, not the lock, is what stops the enemy snapping straight back.
        val expired = taunted.copy(tauntLockTicks = 0, tauntedById = null)
        assertEquals("1", tick.resolveEnemyTarget(expired))
    }

    @Test
    fun `a dead unit cannot taunt`() {
        val start = state(unit("1", UnitRole.TANK, hp = 0.0), unit("2", UnitRole.DPS, threat = 5.0))
        assertEquals(start, engine.reduce(start, Action.Taunt(ticks = 3, actorId = "1"), Rng(1)))
    }

    // --- active mitigation ---------------------------------------------------

    @Test
    fun `a defensive cooldown only protects the player`() {
        val s = GameState(
            participants = mapOf(
                PLAYER_UNIT_ID to Participant(
                    PLAYER_UNIT_ID,
                    playerCombatBuffs = listOf(
                        PlayerBuff(id = BUFF_ACTIVE_MITIGATION, remainingTicks = 50, magnitude = 0.5),
                    ),
                ),
            ),
        )
        assertEquals(0.5, tick.activeMitigation(s, unit(PLAYER_UNIT_ID, UnitRole.TANK)), 1e-9)
        assertEquals("an ally is not covered", 1.0, tick.activeMitigation(s, unit("1", UnitRole.TANK)), 1e-9)
    }

    @Test
    fun `no defensive means no reduction`() {
        assertEquals(1.0, tick.activeMitigation(GameState(), unit(PLAYER_UNIT_ID, UnitRole.TANK)), 1e-9)
    }

    // --- the dormancy guarantee ---------------------------------------------

    @Test
    fun `no shipped dungeon uses threat targeting`() {
        // Still load-bearing. HIGHEST_THREAT consumes no rng, unlike every other
        // targeting mode, so a dungeon opting in via JSON would remove draws
        // from the seeded stream for *every* player including healers, and
        // desynchronise the parity corpus. Threat targeting is switched on by
        // role instead -- see GameTick.effectiveTargeting.
        val offenders = Fixtures.data.dungeons.flatMap { d ->
            val c = d.bossCombat ?: return@flatMap emptyList<String>()
            (c.attackTemplates.map { it.targeting to it.abilityId } +
                c.debuffTemplates.map { it.targeting to it.abilityId })
                .filter { it.first == Targeting.HIGHEST_THREAT }
                .map { "${d.id}/${it.second}" }
        }
        assertEquals(emptyList<String>(), offenders)
    }
}
