package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.pow

/**
 * One player's damage against one AI DPS, over a real dungeon.
 *
 * A player who out-damages the rest of the group combined makes the party
 * decoration; one who does less than an AI makes it pointless to play. The
 * band is 1-1.6x an AI DPS for a DPS class. A tank's job is threat and
 * survival, so it only has to stay under the DPS ceiling while still doing
 * real damage.
 *
 * The rotation is deliberately simple -- highest-value spell that will cast,
 * every tick -- so the band describes a reasonable player, not a perfect one.
 */
class PlayerDamageBalanceTest {
    private val engine = Engine(Fixtures.data)
    private val data = Fixtures.data

    /** Spells in the order a sensible player reaches for them. Utility is left out. */
    private val priority = mapOf(
        PlayerClass.MAGE to listOf("living_bomb", "arcane_missiles", "fireball", "frostbolt"),
        PlayerClass.ROGUE to listOf("eviscerate", "rupture", "fan_of_knives", "sinister_strike"),
        PlayerClass.WARRIOR to listOf("shield_slam", "revenge"),
        PlayerClass.DEATHKNIGHT to listOf("death_strike", "heart_strike"),
    )

    data class Result(val player: Double, val oneAiDps: Double, val note: String = "") {
        val ratio get() = player / oneAiDps
    }

    /** Plays [cls] at [level] through the dungeon made for that level. */
    fun measure(cls: PlayerClass, level: Int, ticks: Int = 900, seed: Int = 7): Result {
        val rng = Rng(seed)
        var s = engine.newCharacter(cls, rng)
        // Every spell the class has, at this level, with no talents: the band
        // is for the base kit, which talents then move within.
        val allSpells = data.bundle(cls).spells.keys.toList()
        val maxMana = engine.stats.maxMana(cls, level, s.talents)
        s = s.withMe {
            it.copy(level = level, maxMana = maxMana, mana = maxMana.toDouble(), unlockedSpells = allSpells)
        }
        val dungeon = data.dungeons.first { !it.endless && level in it.levelMin..it.levelMax }
        s = engine.reduce(s, Action.StartDungeon(dungeon, "normal"), rng)

        val role = engine.roleOf(cls)
        val aiDpsCount = partyRoles(role).dropLast(1).count { it == UnitRole.DPS }
        val pd = data.balance.partyDps
        val share = when (role) {
            UnitRole.DPS -> data.balance.roles.aiShareWhenDps
            UnitRole.TANK -> data.balance.roles.aiShareWhenTank
            UnitRole.HEALER -> data.balance.roles.aiShareWhenHealer
        }
        val perTickAi = (pd.base + level.toDouble().pow(pd.levelExponent) * pd.levelMultiplier) *
            s.runDpsJitter * share * (1 - data.balance.threat.tankDamageShare) / aiDpsCount

        var player = 0.0
        var ai = 0.0
        var active = 0; var dead = 0; var idle = 0
        val order = priority.getValue(cls)
        repeat(ticks) {
            if (!s.isCombatActive) return@repeat
            active++
            if (s.unit(s.localUnitId)?.isAlive != true) dead++
            var cast = false
            // A reasonable player drinks when they run low.
            if (s.mana < s.maxMana * 0.25) {
                val drunk = engine.reduce(s, Action.CastSpell(MANA_POTION_ID, null, 0.0), rng)
                if (drunk !== s) s = drunk
            }
            for (id in order) {
                val spell = data.spell(id) ?: continue
                if (spell.school != SpellSchool.DAMAGE) continue
                val next = engine.reduce(s, Action.CastSpell(id, null, rng.nextDouble() * 100.0), rng)
                if (next !== s) { s = next; cast = true; break }
            }
            if (!cast && s.globalCooldownRemaining == 0) idle++
            // Rates while alive: the band is about how hard a player hits, and a
            // wipe the AI healer could not prevent says nothing about that.
            // ...and while fighting: a rest between pulls is nobody's damage.
            if (s.unit(s.localUnitId)?.isAlive == true && s.restTicks == 0) {
                player += s.pendingEnemyDamage + s.enemyDebuffs.sumOf { it.damagePerTick }
                ai += perTickAi
            }
            s = engine.reduce(s, Action.Tick(1), rng)
        }
        return Result(player, ai, "active=$active dead=$dead idle=$idle out=${s.dungeonOutcome?.kind} mana=${s.mana.toInt()}/${s.maxMana}")
    }

    /** A level inside every tier of dungeon worth checking, low to high. */
    private val levels = listOf(1, 8, 20, 35, 47)
    private val seeds = listOf(7, 11)

    private fun outOfBand(classes: List<PlayerClass>, band: ClosedFloatingPointRange<Double>): List<String> =
        classes.flatMap { cls ->
            levels.flatMap { lv ->
                seeds.mapNotNull { seed ->
                    val r = measure(cls, lv, seed = seed)
                    println("BALANCE $cls L$lv seed$seed ratio=%.2f ${r.note}".format(r.ratio))
                    if (r.ratio in band) null else "$cls level $lv seed $seed: %.2fx".format(r.ratio)
                }
            }
        }

    @Test
    fun `a DPS player does 1 to 1_6 times one AI DPS at every level`() {
        assertEquals(emptyList<String>(), outOfBand(listOf(PlayerClass.MAGE, PlayerClass.ROGUE), 1.0..1.6))
    }

    @Test
    fun `a tank player does real damage, but less than a DPS`() {
        assertEquals(
            emptyList<String>(),
            outOfBand(listOf(PlayerClass.WARRIOR, PlayerClass.DEATHKNIGHT), 0.3..1.0),
        )
    }
}
