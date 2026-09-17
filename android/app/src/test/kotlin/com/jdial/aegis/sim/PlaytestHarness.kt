package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Plays runs and prints what happened, for scripts/playtest.py to read.
 *
 * Not a test: it asserts nothing and is skipped unless asked for, because
 * tuning data is a question ("is a bomb too strong at level 12?") rather than
 * a contract. The bot plays like a competent player, not a perfect one: it
 * kicks what it can, switches to adds, dispels, and uses its defensive.
 *
 *   ./gradlew :app:testDebugUnitTest --tests '*PlaytestHarness*' \
 *       -Dplaytest=1 -Dplaytest.classes=MAGE,PRIEST -Dplaytest.levels=3,8 -Dplaytest.runs=5
 */
class PlaytestHarness {
    private val data = Fixtures.data
    private val engine = Engine(data)

    private fun prop(name: String, fallback: String) = System.getProperty(name)?.takeIf { it.isNotBlank() } ?: fallback

    @Test
    fun report() {
        assumeTrue("playtest harness runs only when asked", System.getProperty("playtest") != null)
        val classes = prop("playtest.classes", "PRIEST,MAGE,WARRIOR").split(",").map { PlayerClass.valueOf(it.trim()) }
        val levels = prop("playtest.levels", "3,8,12,20,34,47").split(",").map { it.trim().toInt() }
        val runs = prop("playtest.runs", "5").toInt()
        val hard = prop("playtest.hard", "false").toBoolean()
        val pace = prop("playtest.pace", "normal")

        println("PLAYTEST-BEGIN")
        for (cls in classes) {
            for (level in levels) {
                val dungeon = data.dungeons.firstOrNull { !it.endless && level in it.levelMin..it.levelMax }
                    ?: data.dungeons.last { !it.endless && it.levelMin <= level }
                repeat(runs) { seed -> println(play(cls, level, dungeon.id, hard, pace, seed + 1).json()) }
            }
        }
        println("PLAYTEST-END")
    }

    /** One run's story, in the numbers a tuning pass cares about. */
    private data class Run(
        val cls: String, val level: Int, val dungeon: String, val hard: Boolean, val seed: Int,
        val outcome: String, val ticks: Int, val deaths: Int, val missedKicks: Int,
        val kicks: Int, val dispels: Int, val defensives: Int, val addsKilled: Int,
        val xp: Int, val dps: Double, val hps: Double, val lowestHealthPct: Double,
    ) {
        fun json(): String = """{"cls":"$cls","level":$level,"dungeon":"$dungeon","hard":$hard,"seed":$seed,""" +
            """"outcome":"$outcome","ticks":$ticks,"deaths":$deaths,"missedKicks":$missedKicks,""" +
            """"kicks":$kicks,"dispels":$dispels,"defensives":$defensives,"addsKilled":$addsKilled,""" +
            """"xp":$xp,"dps":${"%.1f".format(dps)},"hps":${"%.1f".format(hps)},""" +
            """"lowestHealthPct":${"%.1f".format(lowestHealthPct)}}"""
    }

    private fun play(cls: PlayerClass, level: Int, dungeonId: String, hard: Boolean, pace: String, seed: Int): Run {
        val rng = Rng(seed)
        var s = engine.newCharacter(cls, rng)
        val maxMana = engine.stats.maxMana(cls, level, s.talents)
        s = s.withMe {
            it.copy(
                level = level, maxMana = maxMana, mana = maxMana.toDouble(),
                unlockedSpells = (it.unlockedSpells + data.bundle(cls).spells.keys + data.grantsFor(cls, level)).distinct(),
            )
        }
        // A player at this level has spent their points. Invested cheapest tier
        // first, which is what a tree's prerequisites allow anyway -- a bot
        // playing a level-47 healer with an empty tree says nothing useful.
        for (talent in data.bundle(cls).talents.sortedBy { it.levelReq }) {
            repeat(talent.maxPoints) {
                if (s.talentPoints > 0) {
                    val out = engine.reduce(s, Action.UnlockTalent(talent.id), rng)
                    if (out !== s) s = out
                }
            }
        }

        val dungeon = data.dungeons.first { it.id == dungeonId }
        s = engine.reduce(s, Action.StartDungeon(dungeon, pace, hard), rng)

        val damage = data.bundle(cls).spells.values
            .filter { it.school == SpellSchool.DAMAGE }
            .sortedByDescending { it.healing }
            .map { it.id }
        // Smallest first: the bot picks the cheapest heal that will do.
        val heals = data.bundle(cls).spells.values
            .filter { it.school == SpellSchool.HEAL && it.healing > 0 }
            .sortedBy { it.healing }
            .map { it.id }
        val kick = s.unlockedSpells.firstOrNull { data.spell(it)?.interrupts == true }
        val wall = s.unlockedSpells.firstOrNull { data.spell(it)?.damageReduction != null }
        val cleanse = s.unlockedSpells.firstOrNull { data.spell(it)?.dispels == true }

        var kicks = 0
        var dispels = 0
        var defensives = 0
        var addsSeen = 0
        var addsKilled = 0
        var lowest = 100.0
        var ticks = 0
        while (s.isCombatActive && ticks < 6_000) {
            val before = s
            val me = s.unit(s.localUnitId)
            val hurt = s.party.filter { it.isAlive }.minByOrNull { it.health / it.maxHealth }
            hurt?.let { lowest = minOf(lowest, it.health / it.maxHealth * 100) }

            // Drink before it is too late.
            if (s.mana < s.maxMana * 0.35) s = cast(s, MANA_POTION_ID, null, rng)

            // Whatever is winding up that can be stopped.
            if (kick != null && (s.enemyCast?.interruptible == true || s.adds.any { it.casting })) {
                val target = s.adds.firstOrNull { it.casting }?.id
                val out = cast(s, kick, target, rng)
                if (out !== s) { kicks++; s = out }
            }
            // Whatever is eating the party.
            if (cleanse != null) {
                val ill = s.party.firstOrNull { it.isAlive && it.debuffs.toDispel(safeOnly = true) != null }
                if (ill != null) {
                    val out = cast(s, cleanse, ill.id, rng)
                    if (out !== s) { dispels++; s = out }
                }
            }
            // The wound, and a beating.
            if (wall != null && me != null) {
                val stacked = me.debuffs.any { it.clearedByDefensive && it.stacks >= 3 }
                if (stacked || me.health < me.maxHealth * 0.45) {
                    val out = cast(s, wall, null, rng)
                    if (out !== s) { defensives++; s = out }
                }
            }
            if (s.playerRole == UnitRole.HEALER) {
                // The cheapest heal that covers the wound, not the biggest one
                // in the book: a healer who casts Greater Heal on a scratch is
                // out of mana by the boss, and that is the bot's fault, not the
                // encounter's.
                if (hurt != null && hurt.health < hurt.maxHealth * 0.85) {
                    val deficit = hurt.maxHealth - hurt.health
                    val pick = heals.lastOrNull { (data.spell(it)?.healing ?: 0.0) <= deficit } ?: heals.lastOrNull()
                    for (id in listOfNotNull(pick) + heals) {
                        val out = cast(s, id, hurt.id, rng)
                        if (out !== s) { s = out; break }
                    }
                }
            } else {
                // Adds first: a mender or a bomb left standing is the mistake.
                val aim = s.adds.filter { it.isAlive }
                    .minByOrNull {
                        when (it.kind) {
                            AddTemplate.BOMB -> 0; AddTemplate.MENDER -> 1; AddTemplate.RUNNER -> 2; else -> 3
                        }
                    }?.id
                for (id in damage) {
                    val out = cast(s, id, aim, rng)
                    if (out !== s) { s = out; break }
                }
            }

            s = engine.reduce(s, Action.Tick(1), rng)
            addsSeen += (s.adds.map { it.id } - before.adds.map { it.id }.toSet()).size
            addsKilled += (before.adds.filter { it.isAlive }.map { it.id } - s.adds.map { it.id }.toSet()).size
            ticks++
        }
        val outcome = s.dungeonOutcome
        return Run(
            cls = cls.name, level = level, dungeon = dungeonId, hard = hard, seed = seed,
            outcome = outcome?.kind?.name ?: "TIMEOUT",
            ticks = outcome?.clearTicks ?: ticks,
            deaths = outcome?.deaths ?: 0,
            missedKicks = outcome?.missedKicks ?: 0,
            kicks = kicks, dispels = dispels, defensives = defensives, addsKilled = addsKilled,
            xp = outcome?.xpGained ?: 0,
            dps = outcome?.stats?.dps ?: 0.0,
            hps = outcome?.stats?.hps ?: 0.0,
            lowestHealthPct = lowest,
        )
    }

    private fun cast(s: GameState, id: String, target: String?, rng: Rng) =
        engine.reduce(s, Action.CastSpell(id, target, rng.nextDouble() * 100), rng)
}
