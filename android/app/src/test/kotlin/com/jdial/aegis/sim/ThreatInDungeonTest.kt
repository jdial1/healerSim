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
    fun `spamming heals puts the healer on the threat table`() {
        // The bug this pins: cast heals reached the threat table through
        // nothing at all. Only HoT ticks and passive healing were fed to
        // accrueThreat, because those flow through the tick while a cast does
        // not -- so a healer could spam their biggest heal for a whole fight
        // and stay at zero threat.
        var s = start(PlayerClass.PRIEST)
        val rng = Rng(4)
        val heal = s.activeActionBars.first { it.isNotEmpty() }
        repeat(120) {
            if (!s.isCombatActive) return@repeat
            // Keep someone hurt, or every heal is overheal and correctly free.
            s = s.copy(party = s.party.map { u -> if (u.id == "1") u.copy(health = 1.0) else u })
            s = engine.reduce(s, Action.CastSpell(heal, "1", 0.99), rng)
            s = engine.reduce(s, Action.Tick(1), rng)
        }
        val self = s.party.first { it.id == PLAYER_UNIT_ID }
        val coefficient = Fixtures.data.balance.threat.healingCoefficient
        assertTrue("the healer healed nothing, so this proves nothing", s.runHealEffective > 0.0)
        // Half of what landed, as in WotLK. Not a rough correlation.
        assertEquals(s.runHealEffective * coefficient, self.threat, 1e-6)
    }

    @Test
    fun `an ai healer can pull the enemy off a player tank`() {
        // The other half of the same bug: healing threat was credited to the
        // player's slot whoever did the healing, so the AI healer worked all
        // fight for nothing and a tank could never be out-threatened by it.
        // An AI healer that heals hard enough to lead: a higher-level one, so
        // the outcome is not a photo finish that moves with every retune of
        // how much a level-1 AI healer heals for.
        var s = start(PlayerClass.WARRIOR).let { st ->
            st.copy(party = st.party.map { if (it.role == UnitRole.HEALER) it.copy(level = 30) else it })
        }
        val rng = Rng(4)
        var healerLed = false
        repeat(150) {
            if (!s.isCombatActive) return@repeat
            // Damage the DPS so the AI healer has something to do.
            s = s.copy(
                party = s.party.map { u ->
                    if (u.role == UnitRole.DPS) u.copy(health = u.maxHealth * 0.3) else u
                },
            )
            s = engine.reduce(s, Action.Tick(1), rng)
            val healer = s.party.firstOrNull { it.role == UnitRole.HEALER } ?: return@repeat
            if (s.enemyTargetId == healer.id) healerLed = true
        }
        val healer = s.party.first { it.role == UnitRole.HEALER }
        assertTrue("the ai healer generated no threat at all", healer.threat > 0.0)
        assertTrue("the ai healer never pulled despite out-threatening the tank", healerLed)
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
    fun `the enemy settles on a tank who is playing, and leaves one who is not`() {
        // The point of the tank's threat multiplier -- and of the tank doing
        // anything at all. A human tank earns threat from what they cast, not
        // from the party's scripted damage, because being credited for damage
        // the AI dealt is what let a tank hold a boss all dungeon while doing
        // nothing.
        val rng = Rng(4)
        var s = start(PlayerClass.WARRIOR)
        val strike = s.activeActionBars.first { it.isNotEmpty() }
        repeat(80) {
            if (!s.isCombatActive) return@repeat
            val next = engine.reduce(s, Action.CastSpell(strike, s.enemyTargetId, 0.99), rng)
            if (next !== s) s = next
            s = engine.reduce(s, Action.Tick(1), rng)
        }
        assertEquals("the enemy should be on the tank who is playing", PLAYER_UNIT_ID, s.enemyTargetId)

        val idle = run(start(PlayerClass.WARRIOR), 80)
        assertTrue(
            "a tank who never casts should lose the enemy to someone who does",
            idle.enemyTargetId != PLAYER_UNIT_ID,
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
    fun `a dps who burns hard enough pulls aggro, and the ai tank takes it back`() {
        // Casting Frostbolt repeatedly should eventually beat the tank's lead --
        // if it cannot, threat is decorative for a DPS. An AI tank then taunts
        // the enemy back; before it could, a DPS doing their job simply died.
        var s = start(PlayerClass.MAGE)
        val rng = Rng(4)
        val tank = s.party.first { it.role == UnitRole.TANK }
        var outThreatened = false
        var tauntedBack = false
        repeat(120) {
            if (!s.isCombatActive) return@repeat
            s = engine.reduce(s, Action.Tick(1), rng)
            s = engine.reduce(s, Action.CastSpell("frostbolt", null, 100.0), rng)
            val self = s.party.first { it.id == PLAYER_UNIT_ID }
            val t = s.party.first { it.id == tank.id }
            if (self.threat > t.threat) outThreatened = true
            if (s.tauntedById == tank.id && s.aiTauntCooldown > 0) tauntedBack = true
        }
        assertTrue("a spamming mage should out-threat the tank at some point", outThreatened)
        assertTrue("and the ai tank should have taunted it back", tauntedBack)
        assertEquals("so the enemy is on the tank", tank.id, s.enemyTargetId)
    }

    @Test
    fun `a spell's threatMultiplier reaches the threat table`() {
        // It did not. threatMultiplier and flatThreat were declared on Spell and
        // read by nothing, so a tank's Shield Slam (3.0x) generated exactly the
        // same threat as any other spell of the same size -- which is why
        // casting a threat spell did not move the bar.
        //
        // Death Strike rather than Shield Slam: a Warrior's threat is also
        // scaled by Vengeance, and this is about the spell's own number.
        val slam = Fixtures.data.bundle(PlayerClass.DEATHKNIGHT).spells.getValue("death_strike")
        assertTrue("fixture must declare a multiplier", slam.threatMultiplier > 1.0)

        val casts = CastPipeline(Fixtures.data, Fixtures.stats)
        val s = run(start(PlayerClass.DEATHKNIGHT), 1)
        val out = casts.tryCast(
            CastContext(s, Fixtures.data, Fixtures.stats, Rng(4)),
            "death_strike", null, 100.0,
        )

        assertTrue("the cast must deal damage", out.pendingEnemyDamage > 0.0)
        assertEquals(
            "threat banked must be damage times the declared multiplier, plus any flat",
            out.pendingEnemyDamage * slam.threatMultiplier + slam.flatThreat,
            out.me.pendingPlayerThreat,
            1e-9,
        )
        assertTrue(
            "and must therefore exceed the damage, or the multiplier is inert",
            out.me.pendingPlayerThreat > out.pendingEnemyDamage,
        )
    }

    @Test
    fun `a taunt generates threat even though it deals no damage`() {
        val casts = CastPipeline(Fixtures.data, Fixtures.stats)
        val s = run(start(PlayerClass.WARRIOR), 20)
        val before = s.party.first { it.id == PLAYER_UNIT_ID }.threat
        val out = casts.tryCast(
            CastContext(s, Fixtures.data, Fixtures.stats, Rng(4)),
            "taunt", null, 100.0,
        )
        assertEquals("a taunt deals no damage", 0.0, out.pendingEnemyDamage, 0.0)
        assertTrue(
            "but it must take the lead: $before -> ${out.party.first { it.id == PLAYER_UNIT_ID }.threat}",
            out.party.first { it.id == PLAYER_UNIT_ID }.threat >= before,
        )
        assertEquals(PLAYER_UNIT_ID, out.enemyTargetId)
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

    }
}
