package com.jdial.aegis.ui

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
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
    fun `a boss wind-up warns once, when it starts`() {
        val cast = EnemyCast("vc_ambush", "Ambush", targets = listOf("1"), remainingTicks = 20, totalTicks = 20)
        val started = fight.copy(enemyCast = cast)
        assertEquals(listOf(Cue.TELEGRAPH), cuesBetween(fight, started))
        val ticking = started.copy(enemyCast = cast.copy(remainingTicks = 19))
        assertEquals(emptyList<Cue>(), cuesBetween(started, ticking))
        // The next cast, right after the last one landed, warns again.
        assertEquals(listOf(Cue.TELEGRAPH), cuesBetween(ticking.copy(enemyCast = cast.copy(remainingTicks = 1)), started))
    }

    @Test
    fun `a kick that lands is heard, a cast that lands is not`() {
        val cast = EnemyCast("vc_cannon", "Cannon Barrage", targets = listOf("1"), remainingTicks = 12, totalTicks = 30, interruptible = true)
        val casting = fight.copy(enemyCast = cast)
        assertEquals(listOf(Cue.INTERRUPT), cuesBetween(casting, fight))
        assertEquals(emptyList<Cue>(), cuesBetween(fight.copy(enemyCast = cast.copy(remainingTicks = 1)), fight))
    }

    @Test
    fun `a cast sounds like what the spell does, not like a tap`() {
        val data = Fixtures.data
        // Every healer spell in the game, so a class added later cannot slip a
        // silent spell past this.
        val heals = data.bundle(PlayerClass.PRIEST).spells.values
        assertTrue("the priest should have heals to check", heals.isNotEmpty())
        for (spell in heals) {
            val cue = castCue(spell)
            assertTrue("$spell.id fell back to the generic cast", cue != Cue.CAST || spell.school != SpellSchool.HEAL)
        }

        // And the distinctions the player is meant to hear.
        val renew = heals.first { it.hotDuration != null }
        val flash = heals.first { it.hotDuration == null && it.type == SpellType.DIRECT && it.school == SpellSchool.HEAL }
        assertEquals(Cue.HOT, castCue(renew))
        assertEquals(Cue.HEAL, castCue(flash))
        heals.firstOrNull { it.type == SpellType.AOE }?.let { assertEquals(Cue.HEAL_GROUP, castCue(it)) }
        heals.firstOrNull { it.dispels }?.let { assertEquals(Cue.DISPEL, castCue(it)) }

        // A mage casts, a warrior swings, whatever the spell is called.
        val bolt = data.bundle(PlayerClass.MAGE).spells.values.first { it.school == SpellSchool.DAMAGE }
        val strike = data.bundle(PlayerClass.WARRIOR).spells.values.first { it.school == SpellSchool.DAMAGE }
        // Which variant is the content's call -- Frostbolt is ice, Fireball fire --
        // but a caster's damage is always a spell sound and a warrior's a blow.
        assertTrue("$bolt", castCue(bolt) in setOf(Cue.SPELL, Cue.BOLT_B, Cue.BOLT_C, Cue.STORM, Cue.STORM_B, Cue.DOT, Cue.DOT_B))
        assertTrue("$strike", castCue(strike) in setOf(Cue.SWING, Cue.SWING_B, Cue.STRIKE, Cue.CLEAVE, Cue.CLEAVE_B))
        data.bundle(PlayerClass.WARRIOR).spells.values.firstOrNull { it.damageReduction != null }
            ?.let { assertEquals(Cue.DEFENSIVE, castCue(it)) }

        assertEquals(Cue.CAST, castCue(null))
    }

    @Test
    fun `every spell in a class sounds different, and every potion sounds the same`() {
        val data = Fixtures.data
        for (cls in PlayerClass.entries) {
            val cues = data.bundle(cls).spells.values.associate { it.id to castCue(it) }
            val repeats = cues.entries.groupBy({ it.value }, { it.key }).filterValues { it.size > 1 }
            assertEquals("$cls shares sounds within the class: $repeats", emptyMap<Cue, List<String>>(), repeats)
        }
        // Consumables: one sound for all, whatever each one does.
        val potions = (data.stash.items.values + listOfNotNull(data.spell(MANA_POTION_ID))).map { castCue(it) }.toSet()
        assertEquals(setOf(Cue.POTION), potions)
    }

    @Test
    fun `every sound content names is one the app has`() {
        val data = Fixtures.data
        val named = PlayerClass.entries.flatMap { data.bundle(it).spells.values } + data.stash.items.values
        val unknown = named.mapNotNull { s -> s.sound?.takeIf { cueNamed(it) == null }?.let { "${s.id}=$it" } }
        assertEquals(emptyList<String>(), unknown)
    }

    @Test
    fun `the enemy side is audible`() {
        val add = EnemyAdd(
            id = "a1", kind = AddTemplate.ADD, name = "Defias Henchman",
            looksLike = "Defias Henchman", health = 50.0, maxHealth = 50.0,
        )
        val up = fight.copy(adds = listOf(add))
        assertEquals(listOf(Cue.ENEMY_DOWN), cuesBetween(up, up.copy(adds = listOf(add.copy(health = 0.0)))))

        assertEquals(listOf(Cue.PHASE), cuesBetween(fight, fight.copy(bossPhase = 1)))

        // A pack engaging, walked into or dragged in early.
        val pulled = fight.copy(trashPullsRemaining = fight.trashPullsRemaining - 1)
        assertEquals(listOf(Cue.PULL), cuesBetween(fight, pulled))
        assertEquals(listOf(Cue.PULL), cuesBetween(fight, fight.copy(extraPulls = fight.extraPulls + 1)))
    }

    @Test
    fun `an absorb landing is heard, and only when it grows`() {
        val shielded = fight.copy(party = fight.party.map { if (it.id == "1") it.copy(shield = 40.0) else it })
        assertEquals(listOf(Cue.SHIELD), cuesBetween(fight, shielded))
        // Ticking away again is not a second one.
        assertEquals(
            emptyList<Cue>(),
            cuesBetween(shielded, shielded.copy(party = shielded.party.map { if (it.id == "1") it.copy(shield = 10.0) else it })),
        )
    }

    @Test
    fun `outside a fight nothing plays`() {
        val idle = fight.copy(isCombatActive = false)
        assertTrue(cuesBetween(idle, withHealth(idle, "1", 0.0)).isEmpty())
    }
}
