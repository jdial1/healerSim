package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a class can actually press.
 *
 * The game was built backwards for a long time: three to six spells per class
 * against fifteen to thirty-two talents, so an hour went into choosing how four
 * buttons behaved. Worse, the bar was hardcoded to three class spells, so the
 * Druid's six and the Warrior's five were cut to three the moment a run
 * started -- talents modified spells the bar could not hold.
 *
 * These are about the kit, not the tuning: how many verbs a class has, that
 * they are all reachable, and that each role can answer the question its seat
 * is asked.
 */
class KitTest {
    private val data = Fixtures.data
    private val engine = Engine(data)
    private val progression = Fixtures.progression

    /** Everything a level-[level] character of [cls] has, with every talent spent. */
    private fun kit(cls: PlayerClass, level: Int = 50): List<String> {
        val rng = Rng(1)
        var s = engine.newCharacter(cls, rng).withMe { it.copy(level = level) }
        for (talent in data.bundle(cls).talents.sortedBy { it.levelReq }) {
            repeat(talent.maxPoints) {
                if (s.talentPoints > 0) {
                    val out = engine.reduce(s, Action.UnlockTalent(talent.id), rng)
                    if (out !== s) s = out
                }
            }
        }
        return progression.buildSpellLoadout(cls, s.talents, level).actionBar.filter { it.isNotEmpty() }
    }

    private fun spells(cls: PlayerClass) = data.bundle(cls).spells.values

    @Test
    fun `every class has a kit, and every spell in it is reachable`() {
        for (cls in PlayerClass.entries) {
            val own = spells(cls)
            assertTrue("$cls has only ${own.size} spells", own.size >= 6)

            // The bar is the kit. A spell that cannot be put on it is a spell
            // the player does not have, however carefully it was designed.
            val bar = kit(cls)
            val missing = own.map { it.id }.filterNot { it in bar }
            assertEquals("$cls cannot reach: $missing", emptyList<String>(), missing)
            assertTrue("$cls bar is ${bar.size}", bar.size >= 7)
        }
    }

    @Test
    fun `the bar never shrinks below five, and never grows past two rows`() {
        for (cls in PlayerClass.entries) {
            // Level 1, nothing spent: the starting bar.
            val start = progression.buildSpellLoadout(cls, emptyList(), 1).actionBar
            assertEquals("$cls starts with a short bar", 5, start.size)
            assertTrue("$cls level-50 bar is too long", kit(cls).size <= 10)
        }
    }

    @Test
    fun `every seat can answer its own health bar`() {
        // The measured failure this fixes: a level-47 Mage cleared one run in
        // five, and had nothing at all it could press about it. A damage dealer
        // or a tank cannot select party frames, so this must be castable with
        // no target -- see Engine.castAs.
        for (cls in PlayerClass.entries) {
            val own = spells(cls)
            val selfAnswer = own.any {
                it.school == SpellSchool.HEAL && (it.healing > 0 || it.shield > 0)
            } || own.any { it.damageReduction != null }
            assertTrue("$cls has no answer to its own health", selfAnswer)
        }
    }

    @Test
    fun `a tank has something to press between its long cooldowns`() {
        // One 30-second wall and nothing in between was the whole tank
        // rotation. A short-cooldown defensive is the verb of the role.
        for (cls in listOf(PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT, PlayerClass.MONK)) {
            val walls = spells(cls).filter { it.damageReduction != null }
            assertTrue("$cls has ${walls.size} defensives", walls.size >= 2)
            assertTrue(
                "$cls has no short defensive: ${walls.map { it.cooldown }}",
                walls.any { it.cooldown in 1..120 },
            )
            assertTrue("$cls has no interrupt", spells(cls).any { it.interrupts } ||
                data.grantsFor(cls, 50).any { data.spell(it)?.interrupts == true })
            assertTrue("$cls has no AoE threat", spells(cls).any { it.type == SpellType.AOE })
        }
    }

    @Test
    fun `a healer can pre-empt a hit, not only answer one`() {
        // Every heal in the game answered damage that had already landed;
        // absorb existed only as a Priest's overheal, which nobody chooses.
        val shields = PlayerClass.healerClasses.associateWith { cls ->
            spells(cls).filter { it.shield > 0 }
        }
        assertTrue(
            "no healer can shield: $shields",
            shields.values.any { it.isNotEmpty() },
        )
        for (cls in PlayerClass.healerClasses) {
            val own = spells(cls)
            assertTrue("$cls has no emergency", own.any { it.cooldown >= 250 })
            assertTrue("$cls has no group heal", own.any { it.type == SpellType.AOE })
        }
    }

    @Test
    fun `a shield absorbs the next hit, and is cast on yourself with no target`() {
        val rng = Rng(3)
        val cls = PlayerClass.MAGE
        var s = engine.newCharacter(cls, rng).withMe {
            it.copy(level = 20, unlockedSpells = it.unlockedSpells + "ice_barrier")
        }
        s = engine.reduce(s, Action.StartDungeon(data.dungeons.first(), "normal"), rng)

        val before = s.unit(s.localUnitId)!!.shield
        // No target: a damage dealer has no party frames to aim at.
        val after = engine.reduce(s, Action.CastSpell("ice_barrier", null, 99.9), rng)
        assertTrue(
            "the mage should be shielded, was $before now ${after.unit(after.localUnitId)!!.shield}",
            after.unit(after.localUnitId)!!.shield > before,
        )
    }
}
