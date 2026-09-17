package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** The one real mechanic each playable tank and DPS class has. */
class RoleMechanicsTest {
    private val engine = Engine(Fixtures.data)
    private val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)
    private val balance = Fixtures.data.balance.classes
    private val me = PLAYER_UNIT_ID

    private fun fight(cls: PlayerClass, level: Int = 1): GameState {
        val rng = Rng(3)
        var s = engine.newCharacter(cls, rng)
        val spells = Fixtures.data.bundle(cls).spells.keys.toList()
        s = s.withMe { it.copy(level = level, unlockedSpells = spells) }
        return engine.reduce(s, Action.StartDungeon(Fixtures.data.dungeons.first(), "normal"), rng)
    }

    private fun cast(s: GameState, id: String, critRoll: Double = 99.9) =
        engine.reduce(s, Action.CastSpell(id, null, critRoll), Rng(1))

    /** Ready to cast again: the global cooldown is not what these tests are about. */
    private fun GameState.ready() = withMe { it.copy(globalCooldownRemaining = 0, spellCooldowns = emptyMap()) }

    private fun GameState.withResource(r: Double) = withMe { it.copy(classResource = r) }

    // --- Warrior ---------------------------------------------------------------

    @Test
    fun `a warrior builds rage from damage taken, up to a cap Vengeance raises`() {
        val s = fight(PlayerClass.WARRIOR)
        val hp = s.unit(me)!!.maxHealth
        val hit = tick.classTick(s, mapOf(me to hp * 0.25))
        assertEquals(0.25 * balance.warrior.ragePerFullHealthTaken, hit.classResource, 1e-9)

        val low = tick.classTick(s, mapOf(me to hp * 10)).classResource
        val high = tick.classTick(fight(PlayerClass.WARRIOR, level = 30), mapOf(me to hp * 100)).classResource
        assertEquals(WarriorHooks.rageCap(Fixtures.stats.uniqueStatRating(PlayerClass.WARRIOR, 1, s.talents), balance), low, 1e-9)
        assertTrue("a higher Vengeance rating holds more rage: $low vs $high", high > low)
    }

    @Test
    fun `shield slam spends rage, not mana, and is refused without it`() {
        val s = fight(PlayerClass.WARRIOR)
        assertSame(s, cast(s, "shield_slam"))

        val raged = s.withResource(40.0)
        val slammed = cast(raged, "shield_slam")
        assertEquals(40.0 - 15.0, slammed.classResource, 1e-9)
        assertEquals(raged.mana, slammed.mana, 0.0)
        assertTrue(slammed.pendingEnemyDamage > 0)
    }

    @Test
    fun `a mana-paid attack builds rage`() {
        val s = fight(PlayerClass.WARRIOR)
        val out = cast(s, "revenge")
        assertEquals(balance.warrior.rageOnDamageCast, out.classResource, 1e-9)
        assertTrue(out.mana < s.mana)
    }

    @Test
    fun `vengeance multiplies a warrior's threat`() {
        val s = fight(PlayerClass.WARRIOR).withResource(40.0)
        val out = cast(s, "shield_slam")
        val p = out.me
        val rating = Fixtures.stats.uniqueStatRating(PlayerClass.WARRIOR, 1, s.talents)
        val spell = Fixtures.data.spell("shield_slam")!!
        val expected = p.pendingEnemyDamage * spell.threatMultiplier * (1 + rating * balance.warrior.threatPerRating)
        assertEquals(expected, p.pendingPlayerThreat, 1e-9)
    }

    // --- Death Knight ------------------------------------------------------------

    @Test
    fun `a death knight remembers recent damage, fading`() {
        val s = fight(PlayerClass.DEATHKNIGHT)
        val hit = tick.classTick(s, mapOf(me to 100.0))
        assertEquals(100.0, hit.classResource, 1e-9)
        val later = tick.classTick(hit, emptyMap())
        assertEquals(100.0 * balance.deathKnight.recentDamageDecayPerTick, later.classResource, 1e-9)
    }

    @Test
    fun `death strike heals for recent damage and shields in proportion to the stat`() {
        val base = fight(PlayerClass.DEATHKNIGHT)
        val maxHp = base.unit(me)!!.maxHealth
        val hurt = base.copy(party = base.party.map { if (it.id == me) it.copy(health = maxHp * 0.2) else it })
            .withResource(maxHp)

        val out = cast(hurt, "death_strike")
        val self = out.unit(me)!!
        val heal = maxHp * balance.deathKnight.deathStrikeHealFraction
        assertEquals(maxHp * 0.2 + heal, self.health, 1e-9)

        val rating = Fixtures.stats.uniqueStatRating(PlayerClass.DEATHKNIGHT, 1, base.talents)
        assertEquals(heal * rating * balance.deathKnight.bloodShieldPerRating, self.shield, 1e-9)

        // With nothing taken recently it still heals, for the floor.
        val fresh = cast(base.copy(party = hurt.party), "death_strike").unit(me)!!
        assertEquals(maxHp * 0.2 + maxHp * balance.deathKnight.deathStrikeMinHealFraction, fresh.health, 1e-9)
    }

    // --- Mage --------------------------------------------------------------------

    @Test
    fun `frostbolt chills, and the next spell crits on the chill and uses it up`() {
        val s = fight(PlayerClass.MAGE)
        // A roll above the mage's own crit chance (zero, untalented) but under
        // the Shatter bonus.
        val roll = balance.mage.shatterCritBase / 2

        val plain = cast(s, "fireball", roll).pendingEnemyDamage
        val chilled = cast(s, "frostbolt").ready()
        assertTrue(chilled.enemyDebuffs.any { it.id == MAGE_CHILL_ID })

        val shattered = cast(chilled, "fireball", roll)
        assertEquals(plain * 1.5, shattered.pendingEnemyDamage - chilled.pendingEnemyDamage, 1e-9)
        assertTrue(shattered.enemyDebuffs.none { it.id == MAGE_CHILL_ID })
    }

    @Test
    fun `frostbolt does not shatter itself`() {
        val s = fight(PlayerClass.MAGE)
        val roll = balance.mage.shatterCritBase / 2
        val first = cast(s, "frostbolt", roll)
        val second = cast(first.ready(), "frostbolt", roll)
        assertEquals(
            first.pendingEnemyDamage,
            second.pendingEnemyDamage - first.pendingEnemyDamage,
            1e-9,
        )
    }

    // --- Rogue -------------------------------------------------------------------

    @Test
    fun `a rogue starts full of energy, and it refills`() {
        val s = fight(PlayerClass.ROGUE)
        assertEquals(balance.rogue.energyMax, s.classResource, 0.0)
        val spent = s.withResource(10.0)
        assertEquals(10.0 + balance.rogue.energyPerTick, tick.classTick(spent, emptyMap()).classResource, 1e-9)
    }

    @Test
    fun `builders cost energy and add a combo point, two on a crit`() {
        val s = fight(PlayerClass.ROGUE)
        val hit = cast(s, "sinister_strike")
        assertEquals(1, hit.comboPoints)
        assertEquals(balance.rogue.energyMax - 40, hit.classResource, 1e-9)
        assertEquals(s.mana, hit.mana, 0.0)

        assertEquals(2, cast(s, "sinister_strike", critRoll = 0.0).comboPoints)
        val poor = s.withResource(39.0)
        assertSame(poor, cast(poor, "sinister_strike"))
    }

    @Test
    fun `the finisher needs a point, spends them all, and scales with them`() {
        val s = fight(PlayerClass.ROGUE)
        assertSame(s, cast(s, "eviscerate"))

        val two = cast(s.withMe { it.copy(comboPoints = 2) }, "eviscerate")
        val four = cast(s.withMe { it.copy(comboPoints = 4) }, "eviscerate")
        assertEquals(0, two.comboPoints)
        assertEquals(0, four.comboPoints)
        assertEquals(2 * two.pendingEnemyDamage, four.pendingEnemyDamage, 1e-9)
    }

    // --- everyone --------------------------------------------------------------------

    @Test
    fun `the dead do not cast`() {
        val s = fight(PlayerClass.MAGE)
        val dead = s.copy(party = s.party.map { if (it.id == me) it.copy(health = 0.0) else it })
        assertSame(dead, cast(dead, "frostbolt"))
        assertNotSame(s, cast(s, "frostbolt"))
    }

    @Test
    fun `a button is affordable in the resource its spell names`() {
        val warrior = fight(PlayerClass.WARRIOR)
        val slam = Fixtures.data.spell("shield_slam")!!
        // Plenty of mana, no rage: not castable, whatever the mana says.
        assertTrue(warrior.mana >= slam.manaCost)
        assertTrue(!warrior.canPay(slam))
        assertTrue(warrior.withResource(15.0).canPay(slam))

        val rogue = fight(PlayerClass.ROGUE)
        val finisher = Fixtures.data.spell("eviscerate")!!
        assertTrue("no points, no finisher", !rogue.canPay(finisher))
        assertTrue(rogue.withMe { it.copy(comboPoints = 1) }.canPay(finisher))
    }

    @Test
    fun `the character sheet says what the stat buys, and it grows with the stat`() {
        for (cls in listOf(PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT, PlayerClass.MAGE, PlayerClass.ROGUE)) {
            val low = masteryEffect(cls, 5.0, balance)
            val high = masteryEffect(cls, 40.0, balance)
            assertTrue("$cls", low != null && high != null && low != high)
        }
        assertEquals(null, masteryEffect(PlayerClass.PRIEST, 20.0, balance))
    }

    @Test
    fun `unfinished classes are marked locked, and no playable one is`() {
        val locked = PlayerClass.entries.filter { Fixtures.data.bundle(it).meta.locked }
        assertEquals(listOf(PlayerClass.MONK, PlayerClass.WARLOCK), locked)
    }

    @Test
    fun `a damage dealer's run records what they dealt`() {
        var s = fight(PlayerClass.MAGE)
        val rng = Rng(9)
        var dealt = 0.0
        repeat(40) {
            s = engine.reduce(s, Action.CastSpell("frostbolt", null, 99.9), rng)
            dealt += s.pendingEnemyDamage + s.enemyDebuffs.sumOf { it.damagePerTick }
            s = engine.reduce(s, Action.Tick(1), rng)
        }
        assertTrue(dealt > 0)
        assertEquals(dealt, s.runDamageDealt, 1e-6)
    }

    @Test
    fun `a healer's class tick changes nothing`() {
        val s = fight(PlayerClass.PRIEST)
        assertEquals(s.participants, tick.classTick(s, mapOf(me to 50.0)).participants)
    }
}
