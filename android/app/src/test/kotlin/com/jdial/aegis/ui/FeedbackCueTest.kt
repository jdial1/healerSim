package com.jdial.aegis.ui

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which sound and vibration a change in the fight should produce. */
class FeedbackCueTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()
    private val fight = engine.reduce(
        engine.newCharacter(PlayerClass.PRIEST, Rng(4)),
        Action.StartDungeon(dungeon, "normal"),
        Rng(4),
    )

    private fun withHealth(s: GameState, id: String, fraction: Double) =
        s.copy(party = s.party.map { if (it.id == id) it.copy(health = it.maxHealth * fraction) else it })

    @Test
    fun `nothing happening makes no sound`() {
        assertEquals(emptyList<Cue>(), cuesBetween(fight, fight))
    }

    @Test
    fun `an ally crossing into danger warns once`() {
        val hurt = withHealth(fight, "1", 0.2)
        assertEquals(listOf(Cue.DANGER), cuesBetween(fight, hurt))
        // Already in danger and still there: no second warning.
        assertEquals(emptyList<Cue>(), cuesBetween(hurt, withHealth(hurt, "1", 0.1)))
    }

    @Test
    fun `a death outranks the warning`() {
        val dead = withHealth(fight, "1", 0.0)
        assertEquals(listOf(Cue.DEATH), cuesBetween(fight, dead))
    }

    @Test
    fun `a new crit number plays the crit cue, and only when new`() {
        val crit = FloatingText(
            id = 7, unitId = "1", amount = 40, kind = FloatingKind.HEAL, crit = true,
            expiresAtCombatTick = 99,
        )
        val shown = fight.copy(floatingCombatTexts = listOf(crit))
        assertEquals(listOf(Cue.CRIT), cuesBetween(fight, shown))
        assertEquals(emptyList<Cue>(), cuesBetween(shown, shown))
    }

    @Test
    fun `the end of a run plays clear or wipe, and nothing else`() {
        val wiped = engine.reduce(withHealth(withHealth(withHealth(withHealth(withHealth(
            fight, "1", 0.0), "2", 0.0), "3", 0.0), "4", 0.0), "5", 0.0), Action.Tick(1), Rng(4))
        assertEquals(listOf(Cue.WIPE), cuesBetween(fight, wiped))

        val cleared = wiped.copy(
            dungeonOutcome = wiped.dungeonOutcome!!.copy(kind = DungeonOutcomeKind.SUCCESS),
        )
        assertEquals(listOf(Cue.CLEAR), cuesBetween(fight, cleared))
    }

    @Test
    fun `outside a fight nothing plays`() {
        val idle = fight.copy(isCombatActive = false)
        assertTrue(cuesBetween(idle, withHealth(idle, "1", 0.0)).isEmpty())
    }
}
