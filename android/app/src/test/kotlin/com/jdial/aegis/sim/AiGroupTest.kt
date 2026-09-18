package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The AI half of a tank or DPS player's group: a healer that lasts, and a tank
 * that keeps the boss.
 *
 * From level 28 up, a player doing nothing wrong used to lose almost every
 * run: the AI healer's healing and mana grew in a straight line while the
 * damage did not, late bosses land single hits bigger than a tank's health
 * bar, and a DPS player out-threatened the AI tank with no taunt to answer it.
 */
class AiGroupTest {
    private val engine = Engine(Fixtures.data)
    private val data = Fixtures.data

    private fun play(cls: PlayerClass, level: Int, seed: Int): DungeonOutcomeKind? {
        val rng = Rng(seed)
        var s = engine.newCharacter(cls, rng)
        val maxMana = engine.stats.maxMana(cls, level, s.talents)
        s = s.withMe {
            it.copy(level = level, maxMana = maxMana, mana = maxMana.toDouble(), unlockedSpells = data.bundle(cls).spells.keys.toList() + data.grantsFor(cls, level))
        }
        // A level-47 character has spent their points. Playing one naked was
        // measuring an undergeared player, not a careless one.
        for (talent in data.bundle(cls).talents.sortedBy { it.levelReq }) {
            repeat(talent.maxPoints) {
                if (s.talentPoints > 0) {
                    val out = engine.reduce(s, Action.UnlockTalent(talent.id), rng)
                    if (out !== s) s = out
                }
            }
        }
        val dungeon = data.dungeons.first { !it.endless && level in it.levelMin..it.levelMax }
        s = engine.reduce(s, Action.StartDungeon(dungeon, "normal"), rng)
        // Full damage, every tick, no defensives: a player who is not trying to
        // be careful, which is the one the AI has to carry.
        val order = if (cls == PlayerClass.WARRIOR) listOf("shield_slam", "revenge") else listOf("fireball", "frostbolt")
        var ticks = 0
        while (s.isCombatActive && ticks < 3000) {
            // It does switch to adds: leaving a mender or a healer-killer up is
            // not carelessness, it is not playing.
            val aim = s.adds.firstOrNull { it.isAlive }?.id
            // And it kicks what can be kicked: a landed kickable cast is meant to hurt.
            if (cls == PlayerClass.MAGE && (s.enemyCast?.interruptible == true || s.adds.any { it.casting })) {
                val kicked = engine.reduce(s, Action.CastSpell("counterspell", aim, 99.0), rng)
                if (kicked !== s) s = kicked
            }
            for (id in order) {
                val next = engine.reduce(s, Action.CastSpell(id, aim, rng.nextDouble() * 100), rng)
                if (next !== s) { s = next; break }
            }
            s = engine.reduce(s, Action.Tick(1), rng)
            ticks++
        }
        return s.dungeonOutcome?.kind
    }

    @Test
    /**
     * The last dungeon is deliberately not in this list. This bot never uses
     * its defensive and never dispels, and Ragnaros has phases: a player who
     * is not trying to be careful is not meant to clear the final tier. What a
     * careful one manages there is a tuning question, and it is measured by
     * PlaytestHarness, which plays properly.
     */
    fun `a tank or DPS player's group clears every tier of dungeon, most of the time`() {
        val failures = listOf(PlayerClass.WARRIOR, PlayerClass.MAGE).flatMap { cls ->
            listOf(8, 28, 41).mapNotNull { level ->
                val wins = (1..5).count { play(cls, level, it) == DungeonOutcomeKind.SUCCESS }
                if (wins >= 4) null else "$cls level $level: $wins/5"
            }
        }
        assertEquals(emptyList<String>(), failures)
    }

    private fun mageFight(): GameState {
        val rng = Rng(2)
        return engine.reduce(engine.newCharacter(PlayerClass.MAGE, rng), Action.StartDungeon(data.dungeons.first(), "normal"), rng)
    }

    private val tick = GameTick(data, Fixtures.stats, Fixtures.progression)

    @Test
    fun `the AI tank taunts the enemy back, then waits`() {
        val s = mageFight()
        val tank = s.party.first { it.role == UnitRole.TANK }
        val onMe = s.copy(enemyTargetId = s.localUnitId, party = s.party.map { if (it.id == s.localUnitId) it.copy(threat = 500.0) else it })
        val taunted = tick.aiTankTaunt(onMe)
        assertEquals(tank.id, taunted.enemyTargetId)
        assertEquals(data.balance.threat.aiTauntLockTicks, taunted.tauntLockTicks)
        assertTrue(taunted.party.first { it.id == tank.id }.threat > 500.0)

        // On cooldown it only counts down.
        val again = tick.aiTankTaunt(taunted.copy(enemyTargetId = s.localUnitId))
        assertEquals(s.localUnitId, again.enemyTargetId)
        assertEquals(taunted.aiTauntCooldown - 1, again.aiTauntCooldown)
    }

    @Test
    fun `a human tank is never taunted for, and a healer who pulls is taunted off`() {
        val s = mageFight()
        val tank = s.party.first { it.role == UnitRole.TANK }
        val human = s.withParticipant(tank.id) { Participant(tank.id, PlayerClass.WARRIOR) }
            .copy(enemyTargetId = s.localUnitId)
        assertEquals(s.localUnitId, tick.aiTankTaunt(human).enemyTargetId)

        val rng = Rng(2)
        val priest = engine.reduce(engine.newCharacter(PlayerClass.PRIEST, rng), Action.StartDungeon(data.dungeons.first(), "normal"), rng)
            .copy(enemyTargetId = PLAYER_UNIT_ID)
        // A healer's big heals can pull the boss now; the AI tank takes it back.
        assertEquals(priest.party.first { it.role == UnitRole.TANK }.id, tick.aiTankTaunt(priest).enemyTargetId)
    }
}
