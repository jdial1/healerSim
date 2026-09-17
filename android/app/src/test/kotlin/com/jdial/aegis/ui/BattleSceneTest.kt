package com.jdial.aegis.ui

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the battle window shows for a change in the fight. */
class BattleSceneTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()

    // A warrior, so the healer and the DPS beside them are AI.
    private val fight = engine.reduce(
        engine.newCharacter(PlayerClass.WARRIOR, Rng(4)),
        Action.StartDungeon(dungeon, "normal"),
        Rng(4),
    )
    private val aiDps = fight.party.first { it.role == UnitRole.DPS && it.id != fight.localUnitId }
    private val me = fight.party.first { it.id == fight.localUnitId }

    private fun withHealth(s: GameState, id: String, fraction: Double) =
        s.copy(party = s.party.map { if (it.id == id) it.copy(health = it.maxHealth * fraction) else it })

    @Test
    fun `an AI ally crossing into low health asks for help, once`() {
        val low = withHealth(fight, aiDps.id, 0.2)
        assertEquals(
            listOf(SceneEvent.Hurt(aiDps.id), SceneEvent.Bark(aiDps.id, "Heal me!")),
            sceneEventsBetween(fight, low),
        )
        assertEquals(listOf(SceneEvent.Hurt(aiDps.id)), sceneEventsBetween(low, withHealth(low, aiDps.id, 0.1)))
    }

    @Test
    fun `a person never barks`() {
        val low = withHealth(fight, me.id, 0.2)
        assertEquals(listOf(SceneEvent.Hurt(me.id)), sceneEventsBetween(fight, low))
    }

    @Test
    fun `a death is a death, not a hurt`() {
        assertEquals(listOf(SceneEvent.Died(aiDps.id)), sceneEventsBetween(fight, withHealth(fight, aiDps.id, 0.0)))
    }

    @Test
    fun `the AI healer calls out when it runs dry`() {
        val healer = fight.party.first { it.role == UnitRole.HEALER }
        val full = fight.copy(aiHealerMana = 50.0)
        assertEquals(
            listOf(SceneEvent.Bark(healer.id, "Out of mana!")),
            sceneEventsBetween(full, full.copy(aiHealerMana = 10.0)),
        )
    }

    @Test
    fun `damage to the same enemy is a hit, a new enemy is not`() {
        val hit = fight.copy(enemyHealth = fight.enemyHealth - 30)
        assertEquals(listOf(SceneEvent.EnemyHit(30)), sceneEventsBetween(fight, hit))
        val nextPull = hit.copy(trashPullsRemaining = fight.trashPullsRemaining - 1)
        assertTrue(sceneEventsBetween(fight, nextPull).none { it is SceneEvent.EnemyHit })
    }

    @Test
    fun `outside a fight nothing happens`() {
        val idle = fight.copy(isCombatActive = false)
        assertTrue(sceneEventsBetween(idle, withHealth(idle, aiDps.id, 0.0)).isEmpty())
    }

    @Test
    fun `a pack thins as its health falls`() {
        val max = fight.copy(enemyMaxHealth = 300.0)
        assertEquals(3, packStanding(max.copy(enemyHealth = 300.0)))
        assertEquals(2, packStanding(max.copy(enemyHealth = 200.0)))
        assertEquals(1, packStanding(max.copy(enemyHealth = 1.0)))
        assertEquals(0, packStanding(max.copy(enemyHealth = 0.0)))
    }

    @Test
    fun `every enemy and boss in the content has its own look`() {
        val names = Fixtures.data.dungeons.flatMap { d -> d.enemies.map { it.name } + d.bossName }
        assertEquals(emptyList<String>(), names.filter { it !in enemyLooks })
    }

    @Test
    fun `each pull is a different enemy, then the boss`() {
        val seen = (TRASH_PACK_COUNT downTo 1).map { enemyName(fight.copy(trashPullsRemaining = it)) }
        assertEquals(dungeon.enemies.map { it.name }.take(TRASH_PACK_COUNT), seen)
        assertEquals(dungeon.bossName, enemyName(fight.copy(combatPhase = CombatPhase.BOSS)))
    }

    @Test
    fun `the tank stands in front of the group`() {
        val spots = formation(fight.party)
        val tank = fight.party.first { it.role == UnitRole.TANK }
        val rest = fight.party.filter { it.role != UnitRole.TANK }.map { spots.getValue(it.id) }
        assertTrue(rest.all { it.x < spots.getValue(tank.id).x })
        // Level with the middle of the group, not off at one end.
        assertTrue(spots.getValue(tank.id).y in rest.minOf { it.y }..rest.maxOf { it.y })
        assertTrue(spots.getValue(tank.id).y > rest.minOf { it.y })
        // Nobody shares a spot.
        assertEquals(fight.party.size, spots.values.toSet().size)
    }

    @Test
    fun `a person's frame shows their slot and class, the AI keeps its name`() {
        val guest = Participant(unitId = aiDps.id, playerClass = PlayerClass.MAGE, isHuman = true)
        val shared = fight.copy(participants = fight.participants + (aiDps.id to guest))
        assertEquals("Player ${aiDps.id} · Frost Mage", frameName(aiDps, shared, Fixtures.data))
        assertEquals("You · Prot Warrior", frameName(me, shared, Fixtures.data))
        val ai = fight.party.first { it.role == UnitRole.HEALER }
        assertEquals(ai.name, frameName(ai, shared, Fixtures.data))
        // A player who dropped is the AI's again, and named as such.
        val dropped = shared.copy(participants = shared.participants + (aiDps.id to guest.copy(isHuman = false)))
        assertEquals(aiDps.name, frameName(aiDps, dropped, Fixtures.data))
    }

    @Test
    fun `a kicked cast breaks, and the AI that kicked it says so`() {
        val cast = EnemyCast("vc_cannon", "Cannon Barrage", targets = listOf("1"), remainingTicks = 12, totalTicks = 30, interruptible = true)
        val casting = fight.copy(enemyCast = cast)
        val kicked = casting.copy(enemyCast = null, lastInterruptBy = aiDps.id)
        assertEquals(
            listOf(SceneEvent.Interrupted(aiDps.id), SceneEvent.Bark(aiDps.id, "Kicked!")),
            sceneEventsBetween(casting, kicked),
        )
        // A cast that ran its course landed; nobody kicked it.
        val landing = fight.copy(enemyCast = cast.copy(remainingTicks = 1))
        assertTrue(sceneEventsBetween(landing, fight).none { it is SceneEvent.Interrupted })
        // The player's own kick is not narrated for them.
        val mine = casting.copy(enemyCast = null, lastInterruptBy = fight.localUnitId)
        assertEquals(listOf(SceneEvent.Interrupted(fight.localUnitId)), sceneEventsBetween(casting, mine))
    }

    @Test
    fun `the tank leads and the healer stands at the back`() {
        val roles = lineUp(fight.party.shuffled(java.util.Random(1))).map { it.role }
        assertEquals(UnitRole.TANK, roles.first())
        assertEquals(UnitRole.HEALER, roles.last())
    }
}
