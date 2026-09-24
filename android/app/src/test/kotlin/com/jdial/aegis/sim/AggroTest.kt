package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Aggro directs damage. In a run someone is tanking, the enemy's own swings and
 * its adds land on whoever holds its attention -- mobs hitting a damage dealer
 * while the tank had full aggro read as the threat table meaning nothing.
 * Raid-wide attacks still hit everyone; they say so in their tell.
 */
class AggroTest {
    // The AI healer would heal every swing straight back; with it off, any
    // damage taken stays taken.
    private val data = Fixtures.data.let { d ->
        d.with(balance = d.balance.copy(roles = d.balance.roles.copy(aiHealerHealBase = 0.0, aiHealerHealPerLevel = 0.0)))
    }
    private val engine = Engine(data)
    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)

    /** A fight with no scripted mechanics firing, so only swings and adds land. */
    private fun quiet(cls: PlayerClass, holder: (GameState) -> String): GameState {
        val rng = Rng(5)
        var s = engine.newCharacter(cls, rng).withMe { it.copy(level = 20) }
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first { it.id == "zul_farrak" }, "normal"), rng)
        s = s.copy(
            mechanicCooldown = 100_000, enemyCast = null,
            enemyHealth = 1e9, enemyMaxHealth = 1e9,
            party = s.party.map { it.copy(maxHealth = 1e6, health = 1e6) },
        )
        return s.copy(enemyTargetId = holder(s), tauntLockTicks = 100_000)
    }

    /**
     * Ticks [ticks] times and returns everyone hurt on a tick who was not the
     * enemy's target going into it. Mechanics are silenced and nothing heals,
     * so the only damage is the enemy's own swings.
     */
    private fun strays(s0: GameState, ticks: Int): Pair<List<String>, Set<String>> {
        var s = s0
        val rng = Rng(9)
        val stray = mutableListOf<String>()
        val hit = mutableSetOf<String>()
        repeat(ticks) { i ->
            val target = s.enemyTargetId
            val next = engine.reduce(s, Action.Tick(1), rng)
            for (u in next.party) {
                val was = s.unit(u.id)!!.health
                if (u.health < was - 1e-9) {
                    hit += u.id
                    if (u.id != target) stray += "tick $i: ${u.id} hit while the enemy was on $target"
                }
            }
            s = next
        }
        return stray to hit
    }

    @Test
    fun `the enemy's swings land only on whoever it is on`() {
        // A tank run and a damage dealer's: whoever the threat table picks
        // takes the swings, and nobody else takes any.
        for (cls in listOf(PlayerClass.WARRIOR, PlayerClass.MAGE)) {
            val (stray, hit) = strays(quiet(cls) { it.localUnitId }, 400)
            assertEquals("$cls", emptyList<String>(), stray)
            assertTrue("$cls: something should have been hit", hit.isNotEmpty())
        }
    }

    @Test
    fun `a healer's run keeps its random spread`() {
        // There the boss picks by chance, not threat -- the healer game.
        val (_, hit) = strays(quiet(PlayerClass.PRIEST) { it.localUnitId }, 400)
        assertTrue("several should be hit in a healer's run, were $hit", hit.size >= 2)
    }

    @Test
    fun `adds go for whoever holds the enemy, not the healer`() {
        val base = quiet(PlayerClass.WARRIOR) { it.localUnitId }
        val add = tick.spawnAdds(
            listOf(AddTemplate(kind = AddTemplate.ADD, name = "a", health = 0.001, damagePerTick = 5.0)),
            base.enemyMaxHealth, "t",
        ).single().copy(health = 1e9, maxHealth = 1e9)
        val (after, party) = tick.processAdds(base.copy(adds = listOf(add)), base.party)
        val healer = base.party.first { it.role == UnitRole.HEALER }.id
        val tank = base.localUnitId
        assertTrue(after.adds.isNotEmpty())
        assertTrue("the tank should take the add's damage", party.first { it.id == tank }.health < 1e6)
        assertEquals("and the healer none", 1e6, party.first { it.id == healer }.health, 1e-9)
    }
}
