package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Level sync: more than one level over a dungeon's range and the run is played
 * at one over, so an old character and a new one can take the same early
 * dungeon and both be in the same fight.
 */
class LevelSyncTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val deadmines = data.dungeons.first { it.id == "deadmines" }

    /** A character genuinely of [level]: the XP to be it, not just the field. */
    private fun character(cls: PlayerClass, level: Int): GameState {
        val s = engine.newCharacter(cls, Rng(1))
        return s.copy(xp = Fixtures.progression.xpToLevel(level)).withMe {
            it.copy(level = level, maxMana = engine.stats.maxMana(cls, level, it.talents))
        }
    }

    @Test
    fun `one over the range is left alone, further is synced to it`() {
        assertEquals(1, syncedLevel(1, deadmines.levelMax))
        assertEquals(syncCap(deadmines.levelMax), syncedLevel(deadmines.levelMax + 1, deadmines.levelMax))
        assertEquals(syncCap(deadmines.levelMax), syncedLevel(25, deadmines.levelMax))
    }

    @Test
    fun `a level 25 tank plays the Deadmines as a low level, beside a level 1 healer`() {
        val tank = engine.reduce(character(PlayerClass.WARRIOR, 25), Action.StartDungeon(deadmines, "normal"), Rng(2))
        assertEquals(syncCap(deadmines.levelMax), tank.me.level)
        assertEquals(25, tank.me.syncedFrom)
        // The party it is given is sized for the synced level, not the real one.
        assertTrue(tank.party.all { it.level <= syncCap(deadmines.levelMax) + 1 })

        val healer = engine.reduce(character(PlayerClass.PRIEST, 1), Action.StartDungeon(deadmines, "normal"), Rng(2))
        assertEquals("a level 1 is not synced at all", 1, healer.me.level)
        assertEquals(0, healer.me.syncedFrom)
    }

    @Test
    fun `a synced character is paid on its real level, and gets it back`() {
        val start = engine.reduce(character(PlayerClass.WARRIOR, 25), Action.StartDungeon(deadmines, "normal"), Rng(2))
        var s = start.copy(combatPhase = CombatPhase.BOSS, trashPullsRemaining = 0, enemyHealth = 0.0001)
        repeat(60) { if (s.dungeonOutcome == null) s = engine.reduce(s, Action.Tick(1), Rng(3)) }
        val outcome = s.dungeonOutcome!!
        // Paid as a 25 in a level-3 dungeon: heavily diminished, as an
        // over-levelled clear always was, rather than a level-4's full share.
        val asTrue = Fixtures.progression.dungeonXpGain(deadmines, 25)
        val asSynced = Fixtures.progression.dungeonXpGain(deadmines, syncCap(deadmines.levelMax))
        assertTrue("paid ${outcome.xpGained}; true $asTrue, synced $asSynced", outcome.xpGained < asSynced)
        assertEquals("the real level comes back when the run ends", 25, s.me.level)
        assertEquals(0, s.me.syncedFrom)
    }

    @Test
    fun `walking out hands the real level back too`() {
        val start = engine.reduce(character(PlayerClass.MAGE, 30), Action.StartDungeon(deadmines, "normal"), Rng(2))
        assertEquals(syncCap(deadmines.levelMax), start.me.level)
        val left = engine.reduce(start, Action.AbandonDungeon, Rng(2))
        assertEquals(30, left.me.level)
    }
}
