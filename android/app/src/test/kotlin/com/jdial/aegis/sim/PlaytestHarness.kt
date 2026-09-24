package com.jdial.aegis.sim

import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.data.SpellSchool
import com.jdial.aegis.data.SpellType
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
        val keystone = prop("playtest.keystone", "0").toInt()
        // "What happens if the player does nothing?" -- the question that says
        // whether a seat matters at all.
        val idle = prop("playtest.idle", "false").toBoolean()
        val pace = prop("playtest.pace", "normal")

        println("PLAYTEST-BEGIN")
        for (cls in classes) {
            for (level in levels) {
                val dungeon = data.dungeons.firstOrNull { !it.endless && level in it.levelMin..it.levelMax }
                    ?: data.dungeons.last { !it.endless && it.levelMin <= level }
                repeat(runs) { seed ->
                    println(play(cls, level, dungeon.id, hard, pace, seed + 1, idle, keystone).json())
                }
            }
        }
        println("PLAYTEST-END")
    }

    /** One run's story, in the numbers a tuning pass cares about. */
    internal data class Run(
        val cls: String, val level: Int, val dungeon: String, val hard: Boolean, val seed: Int,
        val outcome: String, val ticks: Int, val deaths: Int, val missedKicks: Int,
        /** Who fell first, and at which tick. A death count cannot be read back. */
        val firstDown: String, val firstDownTick: Int,
        /** The first kickable cast let through, named. */
        val firstMissedKick: String,
        val kicks: Int, val dispels: Int, val defensives: Int, val addsKilled: Int,
        val xp: Int, val dps: Double, val hps: Double, val lowestHealthPct: Double,
        /** The share of this seat's own effort that bought nothing. One per seat. */
        val wastePct: Double,
        /** A healer's waste, under its own name. Equal to [wastePct] in a healer run. */
        val overhealPct: Double,
        val aiHealerLowPct: Double,
        /** Share of fighting ticks the enemy was on this player: how often a damage dealer pulled it. */
        val aggroPct: Double,
        /** Resources, sampled every tick: how full, how often capped, how often stuck. */
        val resAvgPct: Double, val resCapPct: Double, val manaAvgPct: Double, val starvedPct: Double,
    ) {
        fun json(): String = """{"cls":"$cls","level":$level,"dungeon":"$dungeon","hard":$hard,"seed":$seed,""" +
            """"outcome":"$outcome","ticks":$ticks,"deaths":$deaths,"missedKicks":$missedKicks,""" +
            """"firstDown":"$firstDown","firstDownTick":$firstDownTick,""" +
            """"firstMissedKick":"$firstMissedKick",""" +
            """"kicks":$kicks,"dispels":$dispels,"defensives":$defensives,"addsKilled":$addsKilled,""" +
            """"xp":$xp,"dps":${"%.1f".format(dps)},"hps":${"%.1f".format(hps)},""" +
            """"lowestHealthPct":${"%.1f".format(lowestHealthPct)},""" +
            """"wastePct":${"%.1f".format(wastePct)},"overhealPct":${"%.1f".format(overhealPct)},""" +
            """"aiHealerLowPct":${"%.1f".format(aiHealerLowPct)},""" +
            """"aggroPct":${"%.1f".format(aggroPct)},""" +
            """"resAvgPct":${"%.1f".format(resAvgPct)},"resCapPct":${"%.1f".format(resCapPct)},""" +
            """"manaAvgPct":${"%.1f".format(manaAvgPct)},"starvedPct":${"%.1f".format(starvedPct)}}"""
    }

    internal fun play(
        cls: PlayerClass,
        level: Int,
        dungeonId: String,
        hard: Boolean,
        pace: String,
        seed: Int,
        idle: Boolean = false,
        keystone: Int = 0,
    ): Run {
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
        s = engine.reduce(s, Action.StartDungeon(dungeon, pace, hard, keystone), rng)

        val damage = data.bundle(cls).spells.values
            .filter { it.school == SpellSchool.DAMAGE }
            .sortedByDescending { it.healing }
            .map { it.id }
        // Smallest first: the bot picks the cheapest heal that will do.
        val healSpells = data.bundle(cls).spells.values.filter { it.school == SpellSchool.HEAL }
        val heals = healSpells.filter { it.healing > 0 }.sortedBy { it.healing }.map { it.id }
        // A healer with heal-over-time spells keeps them running, and reaches
        // for the group heal when the group needs one. Playing a healer as a
        // list of single-target heals is what made them look weak.
        val hots = healSpells.filter { it.hotDuration != null }.map { it.id }
        val groupHeals = healSpells.filter { it.type == SpellType.AOE }.map { it.id }
        val kick = s.unlockedSpells.firstOrNull { data.spell(it)?.interrupts == true }
        val wall = s.unlockedSpells.firstOrNull { data.spell(it)?.damageReduction != null }
        // The absorb and the self-heal every class outside the healer seat now
        // carries. A bot that never presses them is measuring a kit nobody has.
        val absorb = s.unlockedSpells.firstOrNull { (data.spell(it)?.shield ?: 0.0) > 0 }
        val selfHeal = s.unlockedSpells.filter { id ->
            val sp = data.spell(id)
            sp != null && sp.school == SpellSchool.HEAL && sp.healing > 0 && sp.type != SpellType.AOE
        }.maxByOrNull { data.spell(it)!!.healing }
        val refill = s.unlockedSpells.firstOrNull { (data.spell(it)?.manaRegenBuffDurationTicks ?: 0) > 0 }
        val cleanse = s.unlockedSpells.firstOrNull { data.spell(it)?.dispels == true }

        var kicks = 0
        var dispels = 0
        var defensives = 0
        var addsSeen = 0
        var addsKilled = 0
        var lowest = 100.0
        var aiLow = 100.0
        var fighting = 0
        var onMe = 0
        var ticks = 0
        // Resource sampling. The Death Knight's "resource" is its memory of
        // recent damage rather than a pool, so its cap is meaningless here.
        val classBalance = data.balance.classes
        var resSum = 0.0
        var resCapped = 0
        var manaSum = 0.0
        var starved = 0
        var ready = 0
        var sampled = 0
        while (s.isCombatActive && ticks < 6_000) {
            val before = s
            val me = s.unit(s.localUnitId)
            val hurt = s.party.filter { it.isAlive }.minByOrNull { it.health / it.maxHealth }
            hurt?.let { lowest = minOf(lowest, it.health / it.maxHealth * 100) }
            if (s.aiHealerManaMax > 0) aiLow = minOf(aiLow, s.aiHealerMana / s.aiHealerManaMax * 100)
            if (s.restTicks == 0) {
                fighting++
                if (s.enemyTargetId == s.localUnitId) onMe++
            }

            // What the bar looks like before this tick's decisions.
            val cap = when (cls) {
                PlayerClass.WARRIOR -> WarriorHooks.rageCap(engine.stats.uniqueStatRating(cls, level, s.talents), classBalance)
                PlayerClass.ROGUE -> classBalance.rogue.energyMax
                else -> 0.0
            }
            if (cap > 0) {
                val pct = s.classResource / cap * 100
                resSum += pct
                if (pct >= 95) resCapped++
            }
            if (s.maxMana > 0) manaSum += s.mana / s.maxMana * 100
            sampled++
            // Idle means idle: the global cooldown is up and there is still
            // nothing this class can pay for. Counting every tick would call
            // the gap between casts starvation.
            if (s.globalCooldownRemaining <= 0) {
                ready++
                val couldAct = (damage + heals).any { id ->
                    val spell = data.spell(id) ?: return@any false
                    s.canPay(spell) && (s.spellCooldowns[id] ?: 0) <= 0
                }
                if (!couldAct) starved++
            }

            if (idle) {
                s = engine.reduce(s, Action.Tick(1), rng)
                ticks++
                continue
            }

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
            // A shield goes on before the hit, which is the only thing in the
            // kit that can answer a telegraph rather than its aftermath.
            if (absorb != null && me != null && me.shield <= 0) {
                val aimed = s.enemyCast?.targets?.contains(me.id) == true
                if (aimed || me.health < me.maxHealth * 0.8) {
                    val out = cast(s, absorb, me.id, rng)
                    if (out !== s) s = out
                }
            }
            // Out of mana in the middle of a boss is a run lost; the refill is
            // long enough on cooldown to be worth spending early.
            if (refill != null && s.maxMana > 0 && s.mana < s.maxMana * 0.45) {
                s = cast(s, refill, null, rng)
            }
            // The wound, and a beating.
            if (wall != null && me != null) {
                val stacked = me.debuffs.any { it.clearedByDefensive && it.stacks >= 3 }
                if (stacked || me.health < me.maxHealth * 0.45) {
                    val out = cast(s, wall, null, rng)
                    if (out !== s) { defensives++; s = out }
                }
            }
            // Anyone who is not the healer still has their own health bar, and
            // now has something to do about it.
            if (s.playerRole != UnitRole.HEALER && selfHeal != null && me != null &&
                me.health < me.maxHealth * 0.55
            ) {
                s = cast(s, selfHeal, me.id, rng)
            }
            if (s.playerRole == UnitRole.HEALER) {
                // The cheapest heal that covers the wound, not the biggest one
                // in the book: a healer who casts Greater Heal on a scratch is
                // out of mana by the boss, and that is the bot's fault, not the
                // encounter's.
                // A telegraph is a promise: top up whoever it names before it
                // lands. A healer who waits for the damage is always behind.
                val incoming = s.enemyCast?.targets.orEmpty()
                    .mapNotNull { s.unit(it) }
                    .filter { it.isAlive && it.health < it.maxHealth * 0.9 }
                    .minByOrNull { it.health / it.maxHealth }
                if (incoming != null) {
                    for (id in heals.reversed()) {
                        val out = cast(s, id, incoming.id, rng)
                        if (out !== s) { s = out; break }
                    }
                }
                val wounded = s.party.count { it.isAlive && it.health < it.maxHealth * 0.8 }
                val tank = s.party.firstOrNull { it.isAlive && it.role == UnitRole.TANK }
                var acted = false
                // Three or more hurt is what a group heal is for.
                if (wounded >= 3) {
                    for (id in groupHeals) {
                        val out = cast(s, id, hurt?.id, rng)
                        if (out !== s) { s = out; acted = true; break }
                    }
                }
                // A heal-over-time on the tank pays for itself before the next hit.
                if (!acted && tank != null && hots.isNotEmpty()) {
                    val missing = hots.firstOrNull { id -> tank.buffs.none { it.sourceSpellId == id } }
                    if (missing != null && tank.health < tank.maxHealth * 0.95) {
                        val out = cast(s, missing, tank.id, rng)
                        if (out !== s) { s = out; acted = true }
                    }
                }
                if (!acted && hurt != null && hurt.health < hurt.maxHealth * 0.85) {
                    val deficit = hurt.maxHealth - hurt.health
                    // In trouble, the biggest thing in the book; otherwise the
                    // cheapest that covers the wound.
                    val urgent = hurt.health < hurt.maxHealth * 0.4
                    val pick = if (urgent) heals.lastOrNull() else {
                        heals.lastOrNull { (data.spell(it)?.healing ?: 0.0) <= deficit } ?: heals.lastOrNull()
                    }
                    for (id in listOfNotNull(pick) + heals.reversed()) {
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
            firstDown = outcome?.firstDownName ?: s.runFirstDownName,
            firstDownTick = outcome?.firstDownTick ?: s.runFirstDownTick,
            firstMissedKick = outcome?.firstMissedKick ?: s.runFirstMissedKick,
            kicks = kicks, dispels = dispels, defensives = defensives, addsKilled = addsKilled,
            xp = outcome?.xpGained ?: 0,
            dps = outcome?.stats?.dps ?: 0.0,
            hps = outcome?.stats?.hps ?: 0.0,
            wastePct = outcome?.stats?.wastePct ?: 0.0,
            overhealPct = outcome?.stats?.overhealPct ?: 0.0,
            lowestHealthPct = lowest,
            aiHealerLowPct = aiLow,
            aggroPct = if (fighting == 0) 0.0 else onMe * 100.0 / fighting,
            resAvgPct = if (sampled > 0) resSum / sampled else 0.0,
            resCapPct = if (sampled > 0) resCapped * 100.0 / sampled else 0.0,
            manaAvgPct = if (sampled > 0) manaSum / sampled else 0.0,
            starvedPct = if (ready > 0) starved * 100.0 / ready else 0.0,
        )
    }

    private fun cast(s: GameState, id: String, target: String?, rng: Rng) =
        engine.reduce(s, Action.CastSpell(id, target, rng.nextDouble() * 100), rng)
}
