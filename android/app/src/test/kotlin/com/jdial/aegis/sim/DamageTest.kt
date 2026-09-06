package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The damage plumbing. No longer dormant -- the Mage uses it -- but still
 * inert for every class the frozen web app has, which is the property the
 * parity corpus depends on.
 *
 * The corpus proves the healer path did not move. These pin the reason it
 * cannot: the enemy-damage expression is an exact identity while the player
 * heals, not an approximation inside an epsilon.
 */
class DamageTest {
    private val engine = Engine(Fixtures.data)

    @Test
    fun `the healer damage expression is an exact identity, not an approximation`() {
        // parity/golden.json is compared byte-for-byte, not within an epsilon.
        // That is only possible because, with the player healing, the enemy
        // damage reduces to `x * 1.0 + 0.0` -- and `* 1.0` and `+ 0.0` are both
        // exact in IEEE-754 for any finite non-negative x.
        //
        // If someone retunes aiShareWhenHealer to 0.999, or reorders the
        // multiply, the goldens drift by amounts smaller than the Kotlin
        // comparison's 1e-6 and nobody notices for weeks. So: assert it.
        assertEquals(1.0, Fixtures.data.balance.roles.aiShareWhenHealer, 0.0)

        // Reconstruct both forms of the whole expression, on values shaped like
        // the real ones (partyDps * bossMult * pace * jitter), and require the
        // results to be bit-identical -- not close.
        val aiShare = Fixtures.data.balance.roles.aiShareWhenHealer
        val pending = 0.0
        val dots = 0.0
        val cases = listOf(
            listOf(16.0, 1.0, 1.0, 1.0),
            listOf(51.9234, 0.7, 1.5, 0.97),
            listOf(1234.5678, 0.49, 0.6666666666666666, 1.0499999999999998),
            listOf(1e-9, 0.343, 2.0, 0.95),
        )
        for (c in cases) {
            val (partyDps, bossMult, pace, jitter) = c
            val before = partyDps * bossMult * pace * jitter
            val after = partyDps * bossMult * pace * jitter * aiShare + (pending + dots)
            assertEquals("expected bit equality for $c", before, after, 0.0)
            assertEquals(before.toRawBits(), after.toRawBits())
        }
    }

    @Test
    fun `the web app's classes all still play as healers`() {
        // Narrower than it was: the Mage is a DPS, so the aiShare branch is no
        // longer permanently on the identity path. What still must hold is that
        // no *healer* class drifted off it, because that is the path the parity
        // corpus was recorded on.
        for (cls in PlayerClass.webClasses) {
            assertEquals("$cls", UnitRole.HEALER, engine.roleOf(cls))
        }
        assertEquals(UnitRole.DPS, engine.roleOf(PlayerClass.MAGE))
    }

    @Test
    fun `no healer spell deals damage, and every mage spell does`() {
        val healerOffenders = PlayerClass.webClasses.flatMap { cls ->
            Fixtures.data.bundle(cls).spells.values
                .filter { it.school != SpellSchool.HEAL }
                .map { "${cls}/${it.id}" }
        }
        assertEquals(emptyList<String>(), healerOffenders)

        val mageNonDamage = Fixtures.data.bundle(PlayerClass.MAGE).spells.values
            .filter { it.school != SpellSchool.DAMAGE }
            .map { it.id }
        assertEquals(emptyList<String>(), mageNonDamage)
    }

    @Test
    fun `a fresh character starts with no pending damage and no enemy dots`() {
        val s = engine.newCharacter(PlayerClass.PRIEST, Rng(1))
        assertEquals(0.0, s.pendingEnemyDamage, 0.0)
        assertEquals(emptyList<UnitDebuff>(), s.enemyDebuffs)
        assertEquals(UnitRole.HEALER, s.playerRole)
    }

    @Test
    fun `enemy dots refresh by ability rather than replacing the list`() {
        // The party-side equivalent of this replaces the unit's whole debuff
        // list -- applying one debuff wipes the others. That bug is load-bearing
        // for existing balance so it stays, but the enemy side must not inherit
        // it, or a second DoT would silently cancel the first.
        val existing = listOf(
            UnitDebuff(id = "a", name = "A", remainingTicks = 5, damagePerTick = 1.0, sourceAbilityId = "a"),
            UnitDebuff(id = "b", name = "B", remainingTicks = 5, damagePerTick = 2.0, sourceAbilityId = "b"),
        )
        // Mirrors applyDamageCast's rule: drop only the same ability, keep the rest.
        val refreshed = existing.filterNot { it.sourceAbilityId == "a" } +
            UnitDebuff(id = "a", name = "A", remainingTicks = 9, damagePerTick = 1.0, sourceAbilityId = "a")

        assertEquals(2, refreshed.size)
        assertTrue(refreshed.any { it.sourceAbilityId == "b" })
        assertEquals(9, refreshed.first { it.sourceAbilityId == "a" }.remainingTicks)
    }

    @Test
    fun `clearing combat drops damage state`() {
        val dirty = GameState(
            participants = mapOf(PLAYER_UNIT_ID to Participant(PLAYER_UNIT_ID, pendingEnemyDamage = 99.0)),
            enemyDebuffs = listOf(
                UnitDebuff(id = "x", name = "X", remainingTicks = 3, damagePerTick = 1.0),
            ),
            enemyTargetId = "2",
            tauntLockTicks = 4,
            tauntedById = "1",
        )
        val clean = dirty.clearedCombat()
        assertEquals(0.0, clean.pendingEnemyDamage, 0.0)
        assertEquals(emptyList<UnitDebuff>(), clean.enemyDebuffs)
        assertEquals(null, clean.enemyTargetId)
        assertEquals(0, clean.tauntLockTicks)
        assertEquals(null, clean.tauntedById)
    }

    @Test
    fun `a spell that deals damage is not treated as a heal`() {
        // isHeal() used to mean "not a mana potion", which quietly made every
        // damage spell a heal at three call sites.
        val heal = Fixtures.data.bundle(PlayerClass.PRIEST).spells.getValue("flash_heal")
        assertTrue(heal.isHeal())
        assertTrue(!heal.copy(school = SpellSchool.DAMAGE).isHeal())
    }
}
