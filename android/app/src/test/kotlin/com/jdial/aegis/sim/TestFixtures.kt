package com.jdial.aegis.sim

import com.jdial.aegis.data.Balance
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import java.io.File

/** Shared fixtures: the real content, loaded the way the app loads it. */
object Fixtures {
    private val assetsDir = File(System.getProperty("aegis.assetsDir") ?: "build/generated/gameAssets")

    val data: GameData by lazy {
        check(assetsDir.isDirectory) { "Missing assets at ${assetsDir.absolutePath}; run :app:syncGameData" }
        GameData.load { path -> File(assetsDir, path).readText() }
    }

    val stats: PlayerStats by lazy { PlayerStats(data) }
    val progression: Progression by lazy { Progression(data, stats) }
}

/** The same content with some parts replaced -- for tests that isolate one rule. */
fun GameData.with(balance: Balance = this.balance, dungeons: List<Dungeon> = this.dungeons): GameData =
    GameData(balance, dungeons, npcPools, pacing, auras, consumables, mechanics, sharedSpells, classes, grants, encounters, looks)

/** Every boss attack landing at once, with no wind-up -- for tests about damage, not timing. */
fun GameData.withoutCasts(): GameData = with(
    dungeons = dungeons.map { d ->
        val c = d.bossCombat ?: return@map d
        d.copy(bossCombat = c.copy(attackTemplates = c.attackTemplates.map { it.copy(castTicks = 0) }))
    },
)
