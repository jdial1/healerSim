package com.jdial.aegis.sim

import com.jdial.aegis.data.DebuffMechanic
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** The healer's dispel, and the boss debuffs that make it a decision. */
class DispelTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)
    private val mech = data.encounters.mechanics

    private fun dungeon(id: String) = data.dungeons.first { it.id == id }

    /** A level-10 player at [dungeonId]'s boss, with a quiet boss. */
    private fun fight(cls: PlayerClass, dungeonId: String = "gnomeregan"): GameState {
        val rng = Rng(4)
        var s = engine.newCharacter(cls, rng)
        s = s.withMe { it.copy(level = 10, unlockedSpells = it.unlockedSpells + "cleanse") }
        return engine.reduce(s, Action.StartDungeon(dungeon(dungeonId), "normal"), rng)
            .copy(combatPhase = CombatPhase.BOSS, enemyHealth = 1e9, enemyMaxHealth = 1e9, mechanicCooldown = 10_000)
    }

    private fun debuff(ability: String, remaining: Int, stacks: Int = 0) = UnitDebuff(
        id = "$ability-x", name = ability, remainingTicks = remaining, damagePerTick = 0.0,
        sourceAbilityId = ability, dispellable = true, stacks = stacks,
        armedTicks = if (mech[ability]?.kind == DebuffMechanic.BOMB) mech.getValue(ability).safeBelowTicks else 0,
    )

    private fun GameState.give(unitId: String, d: UnitDebuff) =
        copy(party = party.map { if (it.id == unitId) it.copy(debuffs = it.debuffs + d) else it })

    private fun cleanse(s: GameState, target: String?) = engine.reduce(s, Action.CastSpell("cleanse", target, 99.0), Rng(1))

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }

    @Test
    fun `healers learn Cleanse at level 5, and nobody else does`() {
        for (cls in listOf(PlayerClass.PRIEST, PlayerClass.DRUID, PlayerClass.PALADIN)) {
            assertFalse("cleanse" in data.grantsFor(cls, 4))
            assertTrue("cleanse" in data.grantsFor(cls, 5))
        }
        for (cls in listOf(PlayerClass.MAGE, PlayerClass.WARRIOR, PlayerClass.ROGUE, PlayerClass.DEATHKNIGHT)) {
            assertFalse("cleanse" in data.grantsFor(cls, 60))
        }
        val bar = Fixtures.progression.buildSpellLoadout(PlayerClass.PRIEST, emptyList(), 5).actionBar
        assertEquals("cleanse", bar[4])
    }

    @Test
    fun `cleanse takes a debuff off its target, and needs one to take`() {
        val s = fight(PlayerClass.PRIEST)
        assertSame("nothing to dispel", s, cleanse(s, "1"))
        assertSame("no target", s, cleanse(s, null))

        val poisoned = s.give("1", debuff("amnennar_venom", 40, stacks = 3))
        val out = cleanse(poisoned, "1")
        assertTrue(out.unit("1")!!.debuffs.isEmpty())
        assertTrue((out.spellCooldowns["cleanse"] ?: 0) > 0)
    }

    @Test
    fun `a bomb dispelled early goes off on everyone, and late it does not`() {
        val s = fight(PlayerClass.PRIEST)
        val safe = mech.getValue("therm_arcane_bomb").safeBelowTicks
        val burst = mech.getValue("therm_arcane_bomb").burstDamage

        val early = cleanse(s.give("2", debuff("therm_arcane_bomb", safe + 20)), "2")
        for (u in early.party) assertEquals(u.id, s.unit(u.id)!!.health - burst, u.health, 1e-9)
        assertTrue(early.unit("2")!!.debuffs.isEmpty())

        val late = cleanse(s.give("2", debuff("therm_arcane_bomb", safe)), "2")
        assertEquals(s.party.map { it.health }, late.party.map { it.health })
        assertTrue(late.unit("2")!!.debuffs.isEmpty())
    }

    @Test
    fun `a bomb left alone goes off on its carrier`() {
        val s = fight(PlayerClass.PRIEST).give("2", debuff("therm_arcane_bomb", 1))
        val before = s.unit("2")!!.health
        val after = step(s).unit("2")!!
        assertTrue("took ${before - after.health}", before - after.health >= mech.getValue("therm_arcane_bomb").burstDamage * 0.5)
        assertTrue(after.debuffs.none { it.sourceAbilityId == "therm_arcane_bomb" })
    }

    @Test
    fun `poison stacks and never runs out`() {
        val m = mech.getValue("amnennar_venom")
        var s = fight(PlayerClass.PRIEST, "razorfen_downs").give("2", debuff("amnennar_venom", m.durationTicks!!, stacks = 1))
        s = s.copy(party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) })
        s = step(s, m.everyTicks * 3)
        val p = s.unit("2")!!.debuffs.first { it.sourceAbilityId == "amnennar_venom" }
        assertEquals(4, p.stacks)
        s = step(s, m.everyTicks * 10)
        assertEquals(m.maxStacks, s.unit("2")!!.debuffs.first { it.sourceAbilityId == "amnennar_venom" }.stacks)
    }

    @Test
    fun `the Shadowfang curse jumps to the next ally until it is dispelled`() {
        val m = mech.getValue("arugal_curse")
        assertEquals(DebuffMechanic.CURSE_CHAIN, m.kind)
        var s = fight(PlayerClass.PRIEST, "shadowfang_keep").give("3", debuff("arugal_curse", m.durationTicks!!))
        s = s.copy(party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) })
        val cursed = { st: GameState -> st.party.count { u -> u.debuffs.any { it.sourceAbilityId == "arugal_curse" } } }
        s = step(s, m.everyTicks)
        assertEquals(2, cursed(s))
        s = step(s, m.everyTicks)
        assertTrue(cursed(s) > 2)
    }

    @Test
    fun `a mind-controlled ally hits the most hurt one`() {
        val m = mech.getValue("sm_dominate")
        var s = fight(PlayerClass.PRIEST, "scarlet_monastery")
            .give("3", debuff("sm_dominate", m.durationTicks!!).copy(charm = true))
        s = s.copy(party = s.party.map { if (it.id == "4") it.copy(health = it.maxHealth * 0.5) else it })
        val before = s.unit("4")!!.health
        val after = step(s, m.everyTicks).unit("4")!!.health
        assertTrue("took ${before - after}", before - after >= m.hitDamage)
    }

    @Test
    fun `a new debuff does not wipe a puzzle debuff`() {
        val tpl = dungeon("gnomeregan").bossCombat!!.debuffTemplates.first { it.abilityId == "therm_radiation" }
        val s = fight(PlayerClass.PRIEST).give("2", debuff("therm_arcane_bomb", 60))
            .copy(mechanicCooldown = 1, mechanicOrdinal = 0)
        val out = step(s)
        val ids = out.unit("2")!!.debuffs.map { it.sourceAbilityId }
        assertTrue(ids.toString(), "therm_arcane_bomb" in ids && tpl.abilityId in ids)
    }

    @Test
    fun `the AI healer dispels when nobody else heals, and waits out a bomb`() {
        val mage = fight(PlayerClass.MAGE)
        val poisoned = mage.give("2", debuff("amnennar_venom", 40, stacks = 1))
        val (party, cd) = tick.aiDispel(poisoned, poisoned.party)
        assertTrue(party.first { it.id == "2" }.debuffs.isEmpty())
        assertEquals(data.encounters.aiDispelEveryTicks, cd)

        val onCooldown = tick.aiDispel(poisoned.copy(aiDispelCooldown = 5), poisoned.party)
        assertEquals(poisoned.party, onCooldown.first)

        val armed = mage.give("2", debuff("therm_arcane_bomb", 60))
        assertEquals(armed.party, tick.aiDispel(armed, armed.party).first)
        val safe = mage.give("2", debuff("therm_arcane_bomb", 5))
        assertTrue(tick.aiDispel(safe, safe.party).first.first { it.id == "2" }.debuffs.isEmpty())

        // A human healer's job.
        val priest = fight(PlayerClass.PRIEST).give("2", debuff("amnennar_venom", 40, stacks = 1))
        assertEquals(priest.party, tick.aiDispel(priest, priest.party).first)
    }

    @Test
    fun `the new debuffs are in the dungeons`() {
        fun has(dungeonId: String, ability: String) =
            assertNotNull(dungeon(dungeonId).bossCombat!!.debuffTemplates.firstOrNull { it.abilityId == ability && it.dispellable })
        has("gnomeregan", "therm_arcane_bomb")
        has("razorfen_downs", "amnennar_venom")
        has("scarlet_monastery", "sm_dominate")
        has("shadowfang_keep", "arugal_curse")
        assertEquals(mech.getValue("arugal_curse").durationTicks, dungeon("shadowfang_keep").bossCombat!!
            .debuffTemplates.first { it.abilityId == "arugal_curse" }.durationTicks)
    }
}
