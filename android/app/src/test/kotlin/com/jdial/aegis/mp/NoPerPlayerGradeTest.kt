package com.jdial.aegis.mp

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.descriptors.elementNames
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The wire carries resources, never a verdict on anybody's play.
 *
 * A player is answerable for their own seat and told nothing about how well
 * anyone else held theirs. The moment a frame carries per-player healing or
 * damage, a client can build a meter out of it, and then a wipe has somebody to
 * blame -- which is the one thing that makes a public queue of strangers
 * unplayable. Third-party meters in the games this borrows from are the whole
 * evidence for the rule.
 *
 * [WirePlayer] is pinned to an allowlist rather than scanned for suspicious
 * names, so *any* new field on it fails here and has to be argued for. The
 * question to answer when it does: does a guest need this to draw the frame, or
 * only to judge the person it belongs to?
 *
 * The group's own numbers are not in scope. [Snapshot.outcome] carries the
 * host's run stats once, labelled as the group's (`DungeonOutcome.groupStats`),
 * which is a total for five people and names nobody.
 */
class NoPerPlayerGradeTest {
    @OptIn(ExperimentalSerializationApi::class)
    private fun fields(d: kotlinx.serialization.descriptors.SerialDescriptor) =
        d.elementNames.toSet()

    @OptIn(ExperimentalSerializationApi::class)
    @Test
    fun `a wire player carries only what is needed to draw it`() {
        val allowed = setOf(
            // Who it is.
            "unitId",
            // What it can spend, and what is on cooldown: a guest draws these.
            "mana", "maxMana", "spellCooldowns", "globalCooldownRemaining",
            "playerCombatBuffs", "holyPower", "capstoneForm", "classResource",
            "comboPoints",
        )
        val actual = fields(WirePlayer.serializer().descriptor)
        val added = actual - allowed
        assertTrue(
            "new field(s) on WirePlayer: $added. Does a guest need this to draw " +
                "the frame, or only to grade the player it belongs to?",
            added.isEmpty(),
        )
        assertEquals("the allowlist has drifted from the type", allowed, actual)
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Test
    fun `the frame carries no per-player performance totals`() {
        // Named rather than pattern-matched: these are the accumulators
        // GameState keeps per participant, and none of them belongs on the wire.
        val verdicts = setOf(
            "runHealEffective", "runHealOverheal", "runManaSpentHealing",
            "runDamageDealt", "healingDone", "damageDone", "hps", "dps",
            "overhealPct", "hpm", "threat",
        )
        for (name in fields(Snapshot.serializer().descriptor) + fields(WirePlayer.serializer().descriptor)) {
            assertTrue("the wire carries $name", name !in verdicts)
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Test
    fun `what a guest asks to do says nothing about how it is going`() {
        // A guest's upward channel is an intent, not a report. Anything it could
        // put here is a claim the host would have to distrust anyway.
        assertEquals(
            setOf("seq", "spellId", "targetId"),
            fields(WireAction.serializer().descriptor),
        )
    }
}
