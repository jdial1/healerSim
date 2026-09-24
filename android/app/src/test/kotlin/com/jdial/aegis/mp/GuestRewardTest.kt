package com.jdial.aegis.mp

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.roundToInt

/**
 * Guests used to finish a whole dungeon with no XP and no result screen: the
 * engine only ever rewarded its own player, and the frame carried neither.
 */
class GuestRewardTest {
    private val engine = Engine(Fixtures.data)
    private val dungeon = Fixtures.data.dungeons.first()

    private fun started(cls: PlayerClass) =
        engine.reduce(engine.newCharacter(cls, Rng(4)), Action.StartDungeon(dungeon, "normal"), Rng(4))

    /** Kills everyone, so the next tick ends the run as a wipe. */
    private fun wiped(s: GameState): GameState {
        val dead = s.copy(party = s.party.map { it.copy(health = 0.0) })
        return engine.reduce(dead, Action.Tick(1), Rng(4))
    }

    /**
     * A priest host in slot 5 with a level-[guestLevel] warrior guest in slot 1,
     * two trash pulls in. A wipe before clearing anything is worth no XP at
     * all, which would let every award assertion here pass as 0 == 0.
     */
    private fun hostWithGuest(guestLevel: Int): GameState {
        val warrior = engine.newCharacter(PlayerClass.WARRIOR, Rng(4)).me
        return started(PlayerClass.PRIEST)
            .copy(trashPullsRemaining = TRASH_PACK_COUNT - 2)
            .withParticipant("1") { warrior.copy(unitId = "1", level = guestLevel) }
    }

    @Test
    fun `single player records exactly the award it always gave`() {
        val end = wiped(started(PlayerClass.PRIEST))
        val outcome = requireNotNull(end.dungeonOutcome) { "the wipe should have ended the run" }
        assertEquals(mapOf(PLAYER_UNIT_ID to outcome.xpGained), end.runXpAwards)
        assertTrue("single player's numbers are its own", !outcome.groupStats)
    }

    @Test
    fun `the host credits each guest on the guest's own level`() {
        // XP only depends on level once a player out-levels the dungeon, so the
        // guest has to -- at a level inside the range the host's award and the
        // guest's are identical, and crediting the wrong level goes unseen.
        val guestLevel = dungeon.levelMax + 5
        val start = hostWithGuest(guestLevel)
        val pullsCleared = TRASH_PACK_COUNT - start.trashPullsRemaining
        val end = wiped(start)

        val pace = engine.progression.pace("normal").xpMultiplier
        val expected = (engine.progression.dungeonFailureXpGain(dungeon, guestLevel, pullsCleared) * pace).roundToInt()
        assertTrue("the fixture must be worth something, got $expected", expected > 0)
        assertEquals("the guest's award follows the guest's level", expected, end.runXpAwards["1"])
        assertEquals(
            "and the host's is what the host was given",
            end.dungeonOutcome!!.xpGained, end.runXpAwards[PLAYER_UNIT_ID],
        )
        assertTrue(
            "the fixture must tell the two levels apart",
            end.runXpAwards["1"] != end.runXpAwards[PLAYER_UNIT_ID],
        )
    }

    @Test
    fun `an ai slot is not credited`() {
        val end = wiped(hostWithGuest(guestLevel = 1).withParticipant("1") { it.copy(isHuman = false) })
        assertEquals(setOf(PLAYER_UNIT_ID), end.runXpAwards.keys)
    }

    /** What a level-1 warrior guest in slot 1 looks like mid-run. */
    private fun guest(): GameState =
        started(PlayerClass.WARRIOR).copy(
            participants = mapOf("1" to engine.newCharacter(PlayerClass.WARRIOR, Rng(4)).me.copy(unitId = "1")),
            localUnitId = "1",
        )

    private fun render(before: GameState, frame: Snapshot) =
        frame.rewardGuest(engine, before, frame.applyTo(before, dungeon), slot = "1")

    @Test
    fun `a guest gets its xp and a result from the final frame`() {
        val frame = wiped(hostWithGuest(guestLevel = 1)).toSnapshot()
        val awarded = frame.xpAwarded.getValue("1")
        assertTrue("the fixture must award something", awarded > 0)

        val before = guest()
        val after = render(before, frame)

        assertEquals("the guest's xp must go up by its award", before.xp + awarded, after.xp)
        val outcome = requireNotNull(after.dungeonOutcome) { "the guest got no result" }
        assertEquals(DungeonOutcomeKind.PARTY_WIPE, outcome.kind)
        assertEquals("the result shows the guest's own xp", awarded, outcome.xpGained)
        assertTrue("and says its numbers are the group's", outcome.groupStats)
        assertTrue("the run is over for the guest too", !after.isCombatActive)
    }

    @Test
    fun `a frame seen twice pays once`() {
        val frame = wiped(hostWithGuest(guestLevel = 1)).toSnapshot()
        val once = render(guest(), frame)
        val twice = render(once, frame)
        assertEquals(once.xp, twice.xp)
        assertEquals(once.dungeonOutcome, twice.dungeonOutcome)
    }

    @Test
    fun `enough xp to level up does, and the result says so`() {
        val frame = wiped(hostWithGuest(guestLevel = 1)).toSnapshot()
        val needed = engine.progression.xpProgressWithinLevel(0).needed
        val big = frame.copy(xpAwarded = mapOf("1" to needed + 1))
        val after = render(guest(), big)
        assertTrue("level ${after.level} should be above 1", after.level > 1)
        assertTrue(after.dungeonOutcome!!.leveledUp)
        assertEquals(
            "talent points follow the level, as they do for a local award",
            engine.progression.talentPoints(after.level, after.talents), after.talentPoints,
        )
    }

    @Test
    fun `a clear counts toward the guest's completed dungeons`() {
        val wipe = wiped(hostWithGuest(guestLevel = 1)).toSnapshot()
        val clear = wipe.copy(outcome = wipe.outcome!!.copy(kind = DungeonOutcomeKind.SUCCESS))
        val after = render(guest(), clear)
        assertTrue(dungeon.id in after.completedDungeonIds)
        assertTrue("a wipe does not", dungeon.id !in render(guest(), wipe).completedDungeonIds)
    }

    @Test
    fun `a mid-run award -- an endless wave -- pays without ending the run`() {
        val live = hostWithGuest(guestLevel = 1).toSnapshot().copy(xpAwarded = mapOf("1" to 40))
        val after = render(guest(), live)
        assertEquals(guest().xp + 40, after.xp)
        assertNull("no result until the run actually ends", after.dungeonOutcome)
        assertTrue(after.isCombatActive)
    }
}
