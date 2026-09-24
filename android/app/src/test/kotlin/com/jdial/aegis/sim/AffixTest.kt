package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.affixesFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Hard mode's affixes, and the trash kinds that are not just a health bar.
 *
 * Hard mode was multipliers and nothing else -- the same fight with bigger
 * numbers, which is a difficulty setting rather than a reason to play a place
 * again. An affix changes what the run asks of you, and is fixed per dungeon so
 * it is something to prepare for rather than something to learn from a wipe.
 */
class AffixTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)

    private fun run(cls: PlayerClass = PlayerClass.MAGE, dungeon: String = "deadmines", hard: Boolean = false): GameState {
        val rng = Rng(4)
        val s = engine.newCharacter(cls, rng).withMe { it.copy(level = 30) }
        return engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == dungeon }, "normal", hard), rng)
    }

    private fun step(s: GameState, n: Int = 1): GameState {
        var out = s
        repeat(n) { if (out.isCombatActive) out = engine.reduce(out, Action.Tick(1), Rng(7)) }
        return out
    }


    @Test
    fun `a normal run carries no affixes and a hard one does`() {
        assertEquals(emptyList<Any>(), data.encounters.affixesFor("deadmines", false))
        assertTrue(data.encounters.affixesFor("deadmines", true).isNotEmpty())
        // Every dungeon names its own, so none falls back to a default nobody chose.
        for (d in data.dungeons.filter { !it.endless }) {
            assertTrue("${d.id} has no affixes", data.encounters.affixesFor(d.id, true).isNotEmpty())
        }
    }

    @Test
    fun `an affix lays its own mechanic over the rotation, and winds the clock in`() {
        // Poisonous adds a debuff to every rotation; chaotic shortens the gap.
        val poisoned = data.encounters.affixes.getValue("poisonous")
        assertTrue(poisoned.debuff != null)
        val chaotic = data.encounters.affixes.getValue("chaotic")
        assertTrue("chaotic should shorten the gap", chaotic.mechanicInterval < 1.0)

        val normal = run(dungeon = "sunken_temple")
        val hard = run(dungeon = "sunken_temple", hard = true)
        // Sunken Temple is poisonous and chaotic: more to dispel, sooner.
        assertTrue(hard.mechanicCooldown <= normal.mechanicCooldown)
    }

    @Test
    fun `hard mode is not only bigger numbers`() {
        // The point of the whole exercise: two runs of the same place differ by
        // something other than health and damage multipliers.
        val ids = data.dungeons.filter { !it.endless }.flatMap {
            data.encounters.affixesFor(it.id, true)
        }.map { it.name }.toSet()
        assertTrue("only $ids in play", ids.size >= 4)
    }

    @Test
    fun `a caster casts at the party and can be kicked like a mender`() {
        val base = run().copy(enemyHealth = 5000.0, enemyMaxHealth = 5000.0)
        val caster = tick.spawnAdds(
            listOf(AddTemplate(kind = AddTemplate.CASTER, name = "c", health = 0.3, blast = 60.0)),
            base.enemyMaxHealth, "t",
        ).single().copy(timer = 1)
        val casting = step(base.copy(adds = listOf(caster)))
        assertTrue("it should wind up", casting.adds.single().casting)

        // Left alone, it lands on everybody.
        val landing = casting.copy(adds = listOf(casting.adds.single().copy(timer = 1)))
        val hit = step(landing)
        assertTrue(
            "the party should have been hit",
            hit.party.sumOf { it.health } < landing.party.sumOf { it.health },
        )

        // Kicked, it starts its wait over -- and the wait is the caster's, not
        // the mender's, so a kick is worth a different amount against each.
        val kicked = engine.reduce(casting, Action.CastSpell("counterspell", null, 99.0), Rng(1))
        assertTrue(!kicked.adds.single().casting)
        assertEquals(data.encounters.addRules.casterEveryTicks, kicked.adds.single().timer)
    }

    @Test
    fun `a shielder makes the enemy ignore part of everything, until it falls`() {
        val base = run().copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
        val shielder = tick.spawnAdds(
            listOf(AddTemplate(kind = AddTemplate.SHIELDER, name = "w", health = 0.001, wardFraction = 0.5)),
            base.enemyMaxHealth, "t",
        ).single().copy(health = 1e7, maxHealth = 1e7)

        val warded = base.enemyHealth - step(base.copy(adds = listOf(shielder))).enemyHealth
        val open = base.enemyHealth - step(base).enemyHealth
        assertTrue("warded $warded should be less than $open", warded < open * 0.8)
    }

    @Test
    fun `a splitter dies into its children`() {
        val base = run().copy(enemyHealth = 1e9, enemyMaxHealth = 1e9)
        val child = AddTemplate(kind = AddTemplate.ADD, name = "shard", looksLike = "Defias Miner", health = 0.05)
        val splitter = tick.spawnAdds(
            listOf(
                AddTemplate(
                    kind = AddTemplate.SPLITTER, name = "s", looksLike = "Defias Miner",
                    health = 0.1, splitsInto = listOf(child, child),
                ),
            ),
            base.enemyMaxHealth, "t",
        ).single().copy(health = 0.001)

        val after = step(base.copy(adds = listOf(splitter)))
        assertEquals("it should have split in two", 2, after.adds.size)
        assertTrue("the children are smaller", after.adds.all { it.maxHealth < splitter.maxHealth })
        assertNotEquals("and are not the splitter", AddTemplate.SPLITTER, after.adds.first().kind)
    }

    @Test
    fun `a leech feeds the enemy what it takes from the party`() {
        val base = run().copy(enemyHealth = 1000.0, enemyMaxHealth = 1e9)
        val leech = tick.spawnAdds(
            listOf(AddTemplate(kind = AddTemplate.LEECH, name = "l", health = 0.4, damagePerTick = 5.0)),
            base.enemyMaxHealth, "t",
        ).single().copy(health = 1e7, maxHealth = 1e7)

        val (after, _) = tick.processAdds(base.copy(adds = listOf(leech)), base.party)
        assertTrue(
            "the enemy should have been healed, ${after.enemyHealth} vs ${base.enemyHealth}",
            after.enemyHealth > base.enemyHealth,
        )
    }

    @Test
    fun `every add kind the content uses is one the engine knows`() {
        val known = setOf(
            AddTemplate.MENDER, AddTemplate.RUNNER, AddTemplate.ADD, AddTemplate.PACK,
            AddTemplate.BOMB, AddTemplate.CASTER, AddTemplate.SPLITTER, AddTemplate.SHIELDER,
            AddTemplate.LEECH,
        )
        val used = (
            data.encounters.trash.values.flatten().flatMap { it.adds } +
                data.encounters.bosses.values.flatMap { it.adds }.flatMap { it.spawn } +
                data.encounters.affixes.values.flatMap { it.extraAdds }
            )
        assertEquals(emptyList<String>(), used.map { it.kind }.filterNot { it in known })
        // And the ones added to make trash more than a health bar are in play.
        val inUse = used.map { it.kind }.toSet()
        for (kind in listOf(AddTemplate.CASTER, AddTemplate.SPLITTER, AddTemplate.SHIELDER, AddTemplate.LEECH)) {
            assertTrue("$kind is defined but never used", kind in inUse)
        }
    }
}
