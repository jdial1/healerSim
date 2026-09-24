package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every seat gets a number for the effort that bought nothing.
 *
 * The healer's has been there since the game was named after it. The tank and
 * damage seats had none, so there was no way to tell a good clear from a lucky
 * one, and no way to compare two builds that both survived -- which is the whole
 * of the optimization game the healer already had.
 *
 * The tank's waste is threat built while already holding with room to spare; the
 * damage dealer's is damage dealt while already past the pull line, which bought
 * risk and nothing else. Both are measured against the margin
 * `resolveEnemyTarget` actually enforces, so the number on the result screen and
 * the rule in the engine are the same rule.
 */
class SeatWasteTest {
    private val harness = PlaytestHarness()

    private fun play(cls: PlayerClass, level: Int) = (1..4).map { seed ->
        val data = Fixtures.data
        val dungeon = data.dungeons.firstOrNull { !it.endless && level in it.levelMin..it.levelMax }
            ?: data.dungeons.last { !it.endless && it.levelMin <= level }
        harness.play(cls, level, dungeon.id, false, "normal", seed)
    }

    @Test
    fun `a tank posts a waste number`() {
        val runs = play(PlayerClass.WARRIOR, 20)
        assertTrue(
            "no run reported any waste: ${runs.map { it.wastePct }}",
            runs.any { it.wastePct > 0.0 },
        )
        assertTrue("a share cannot exceed everything", runs.all { it.wastePct <= 100.0 + 1e-9 })
    }

    /**
     * The discriminating half, tested on the rule rather than on a run.
     *
     * The harness bot posts 100% every time, and that is a true reading of how it
     * plays: it presses its defensive nought to once in a thirty-second fight, so
     * every hit worth pressing it for does land with it ready. Measuring
     * discrimination through the bot would be measuring the bot. The rule is what
     * has to discriminate, so the rule is what is pinned.
     */
    @Test
    fun `a defensive that is up is not waste, and one left ready is`() {
        val tick = GameTick(Fixtures.data, Fixtures.stats, Fixtures.progression)
        val defensive = Fixtures.data.spell("shield_wall")
            ?: Fixtures.data.spell("shield_block")
            ?: return // no warrior defensive in content; nothing to pin
        val me = Participant(PLAYER_UNIT_ID, unlockedSpells = listOf(defensive.id))

        val ready = GameState(participants = mapOf(PLAYER_UNIT_ID to me))
        assertTrue("off cooldown and unspent is waste", tick.defensiveReady(ready))

        val onCooldown = GameState(
            participants = mapOf(PLAYER_UNIT_ID to me.copy(spellCooldowns = mapOf(defensive.id to 40))),
        )
        assertTrue("a spent cooldown is not waste", !tick.defensiveReady(onCooldown))

        val raised = GameState(
            participants = mapOf(
                PLAYER_UNIT_ID to me.copy(
                    playerCombatBuffs = listOf(PlayerBuff(id = BUFF_ACTIVE_MITIGATION, remainingTicks = 20)),
                ),
            ),
        )
        assertTrue("a defensive that is up is not waste", !tick.defensiveReady(raised))
    }

    @Test
    fun `a damage dealer posts a waste number`() {
        val runs = play(PlayerClass.MAGE, 20)
        assertTrue("a share cannot exceed everything", runs.all { it.wastePct <= 100.0 + 1e-9 })
        assertTrue("a share cannot be negative", runs.all { it.wastePct >= 0.0 })
    }

    @Test
    fun `a healer's waste is its overheal, from one source`() {
        // Not a second accumulator for the same quantity: the healer's waste is
        // the overheal the run has always counted.
        for (r in play(PlayerClass.PRIEST, 20)) {
            assertEquals("waste and overheal disagree on seed ${r.seed}", r.overhealPct, r.wastePct, 1e-9)
        }
    }

    @Test
    fun `waste is cleared with the rest of the slate`() {
        val s = GameState(runSeatEffort = 500.0, runSeatWaste = 120.0)
        assertEquals(0.0, s.clearedCombat().runSeatEffort, 0.0)
        assertEquals(0.0, s.clearedCombat().runSeatWaste, 0.0)
    }
}
