package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tank and DPS talents that each do their own thing (content/classes/TALENTS.py). */
class TalentEffectsTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)
    private val playable = listOf(PlayerClass.MAGE, PlayerClass.ROGUE, PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT)

    private fun fight(cls: PlayerClass, vararg talents: Pair<String, Int>): GameState {
        val rng = Rng(3)
        val tree = data.bundle(cls).talents
        var s = engine.newCharacter(cls, rng)
        s = s.withMe { p ->
            p.copy(
                unlockedSpells = p.unlockedSpells + data.bundle(cls).spells.keys,
                talents = talents.map { (id, n) -> TalentRank(tree.first { it.id == id }, n) },
            )
        }
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), rng)
            .withMe { it.copy(classResource = 100.0) }
    }

    private fun cast(s: GameState, id: String) = engine.reduce(s, Action.CastSpell(id, null, 99.9), Rng(1))
    private fun dealt(s: GameState, id: String) = cast(s, id).pendingEnemyDamage

    @Test
    fun `no tank or dps tree repeats itself`() {
        for (cls in playable) {
            val tree = data.bundle(cls).talents.filter { it.spellId == null }
            val jobs = tree.map { t ->
                val b = t.statBonus
                val stats = listOfNotNull(
                    "power".takeIf { b != null && b.healingBoost != 0.0 },
                    "crit".takeIf { b != null && b.critChance != 0.0 },
                    "haste".takeIf { b != null && b.haste != 0.0 },
                    "resource".takeIf { b != null && b.manaPool != 0.0 },
                    "signature".takeIf { b != null && b.uniqueStat != 0.0 },
                    "return".takeIf { b != null && b.manaReturnOnDirectHeal != 0.0 },
                )
                (stats + t.effects.keys).sorted()
            }
            assertTrue("$cls: every talent does something", jobs.none { it.isEmpty() })
            assertEquals("$cls repeats: $jobs", jobs.size, jobs.toSet().size)
            val statCounts = jobs.flatten().groupingBy { it }.eachCount()
            assertTrue("$cls has a plain stat twice: $statCounts", statCounts.values.all { it == 1 })
        }
    }

    @Test
    fun `a spell talent raises that spell's damage, and only that spell's`() {
        val base = fight(PlayerClass.MAGE)
        val talented = fight(PlayerClass.MAGE, "m_r0c0" to 2)
        assertEquals(dealt(base, "frostbolt") * 1.10, dealt(talented, "frostbolt"), 1e-9)
        assertEquals(dealt(base, "fireball"), dealt(talented, "fireball"), 1e-9)
    }

    @Test
    fun `a dot talent raises the ticks`() {
        val tick0 = cast(fight(PlayerClass.ROGUE), "rupture").enemyDebuffs.first { it.id == "rupture" }.damagePerTick
        val tick1 = cast(fight(PlayerClass.ROGUE, "rg_r0c0" to 3), "rupture").enemyDebuffs.first { it.id == "rupture" }.damagePerTick
        assertEquals(tick0 * 1.24, tick1, 1e-9)
    }

    @Test
    fun `a cost talent makes the spell cheaper`() {
        val spent = { s: GameState -> s.classResource - cast(s, "sinister_strike").classResource }
        val cost = data.spell("sinister_strike")!!.manaCost.toDouble()
        assertEquals(cost, spent(fight(PlayerClass.ROGUE)), 1e-9)
        assertEquals(cost - 6, spent(fight(PlayerClass.ROGUE, "rg_r2c4" to 2)), 1e-9)
    }

    @Test
    fun `a cooldown talent shortens the cooldown`() {
        val cd = { s: GameState -> cast(s, "living_bomb").spellCooldowns["living_bomb"] ?: 0 }
        assertTrue(cd(fight(PlayerClass.MAGE, "m_r6c2" to 1)) < cd(fight(PlayerClass.MAGE)))
    }

    @Test
    fun `an execute talent only counts below 35 percent`() {
        val low = { s: GameState -> s.copy(enemyHealth = s.enemyMaxHealth * 0.3) }
        val base = fight(PlayerClass.WARRIOR)
        val talented = fight(PlayerClass.WARRIOR, "w_r5c3" to 2)
        assertEquals(dealt(base, "revenge"), dealt(talented, "revenge"), 1e-9)
        assertEquals(dealt(low(base), "revenge") * 1.16, dealt(low(talented), "revenge"), 1e-9)
    }

    @Test
    fun `a threat talent raises threat, not damage`() {
        val a = cast(fight(PlayerClass.DEATHKNIGHT), "death_strike").me
        val b = cast(fight(PlayerClass.DEATHKNIGHT, "dk_r1c3" to 2), "death_strike").me
        assertEquals(a.pendingEnemyDamage, b.pendingEnemyDamage, 1e-9)
        assertEquals(a.pendingPlayerThreat * 1.12, b.pendingPlayerThreat, 1e-9)
    }

    @Test
    fun `class talents tune the class mechanic`() {
        // Rogue: energy comes back faster, and the finisher refunds some.
        val spentRogue = { s: GameState -> s.withMe { it.copy(classResource = 0.0) } }
        val regen0 = tick.classTick(spentRogue(fight(PlayerClass.ROGUE)), emptyMap()).classResource
        val regen1 = tick.classTick(spentRogue(fight(PlayerClass.ROGUE, "rg_r5c1" to 2)), emptyMap()).classResource
        assertEquals(regen0 * 1.2, regen1, 1e-9)
        val pointed = { s: GameState -> s.withMe { it.copy(comboPoints = 3) } }
        val after0 = cast(pointed(fight(PlayerClass.ROGUE)), "eviscerate").classResource
        val after1 = cast(pointed(fight(PlayerClass.ROGUE, "rg_r0c4" to 3)), "eviscerate").classResource
        assertEquals(after0 + 15, after1, 1e-9)

        // Warrior: more rage per mana-paid attack.
        val rage = { s: GameState -> cast(s.withMe { it.copy(classResource = 0.0) }, "revenge").classResource }
        assertEquals(rage(fight(PlayerClass.WARRIOR)) + 4, rage(fight(PlayerClass.WARRIOR, "w_r2c4" to 2)), 1e-9)

        // Mage: the chill lasts longer.
        val chill = { s: GameState -> cast(s, "frostbolt").enemyDebuffs.first { it.id == MAGE_CHILL_ID }.remainingTicks }
        assertEquals(chill(fight(PlayerClass.MAGE)) + 30, chill(fight(PlayerClass.MAGE, "m_r1c3" to 2)))

        // Death Knight: Death Strike heals for more of what was taken.
        val hurt = { s: GameState ->
            s.withMe { it.copy(classResource = 100.0) }.copy(party = s.party.map { it.copy(health = it.maxHealth * 0.2) })
        }
        val hp = { s: GameState -> cast(hurt(s), "death_strike").unit(s.localUnitId)!!.health }
        assertEquals(hp(fight(PlayerClass.DEATHKNIGHT)) + 100 * 0.1, hp(fight(PlayerClass.DEATHKNIGHT, "dk_r1c1" to 2)), 1e-9)
        val shield = { s: GameState -> cast(hurt(s), "death_strike").unit(s.localUnitId)!!.shield }
        assertEquals(shield(fight(PlayerClass.DEATHKNIGHT)) * 1.2, shield(fight(PlayerClass.DEATHKNIGHT, "dk_r0c0" to 2)), 1e-9)
    }

    @Test
    fun `more class talents tune the class mechanic`() {
        // Warrior: more rage from the same hit.
        // The trickle is flat, so compare only what the hit itself paid.
        val trickle = data.balance.classes.warrior.ragePerTick
        val hit = { s: GameState ->
            val empty = s.withMe { it.copy(classResource = 0.0) }
            tick.classTick(empty, mapOf(s.localUnitId to s.unit(s.localUnitId)!!.maxHealth * 0.1)).classResource - trickle
        }
        assertEquals(hit(fight(PlayerClass.WARRIOR)) * 1.2, hit(fight(PlayerClass.WARRIOR, "w_r0c0" to 2)), 1e-9)

        // Mage: a chilled enemy takes more from everything.
        val chilled = { s: GameState -> cast(cast(s, "frostbolt").withMe { it.copy(globalCooldownRemaining = 0) }, "fireball") }
        val fire = { s: GameState -> chilled(s).pendingEnemyDamage - cast(s, "frostbolt").pendingEnemyDamage }
        assertEquals(fire(fight(PlayerClass.MAGE)) * 1.12, fire(fight(PlayerClass.MAGE, "m_r5c3" to 2)), 1e-9)

        // Rogue: each combo point is worth more.
        val pointed = { s: GameState -> dealt(s.withMe { it.copy(comboPoints = 3) }, "eviscerate") }
        assertEquals(pointed(fight(PlayerClass.ROGUE)) * 1.2, pointed(fight(PlayerClass.ROGUE, "rg_r3c3" to 2)), 1e-9)
    }
}
