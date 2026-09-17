package com.jdial.aegis.sim

import com.jdial.aegis.data.Balance
import com.jdial.aegis.data.Dungeon
import com.jdial.aegis.data.GameData
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.File

/** Shared fixtures: the real content, and the JS engine's recorded output. */
object Fixtures {
    private val assetsDir = File(System.getProperty("aegis.assetsDir") ?: "build/generated/gameAssets")
    private val parityDir = File(System.getProperty("aegis.parityDir") ?: "../parity")

    val data: GameData by lazy {
        check(assetsDir.isDirectory) { "Missing assets at ${assetsDir.absolutePath}; run :app:syncGameData" }
        GameData.load { path -> File(assetsDir, path).readText() }
    }

    val stats: PlayerStats by lazy { PlayerStats(data) }
    val progression: Progression by lazy { Progression(data, stats) }

    /** `parity/golden.json`, produced by `node parity/generate-golden.mjs`. */
    val golden: JsonObject by lazy {
        val f = File(parityDir, "golden.json")
        check(f.isFile) { "Missing ${f.absolutePath}; run: node parity/generate-golden.mjs" }
        Json.parseToJsonElement(f.readText()) as JsonObject
    }
}

/** The same content with some parts replaced -- for tests that isolate one rule. */
fun GameData.with(balance: Balance = this.balance, dungeons: List<Dungeon> = this.dungeons): GameData =
    GameData(balance, dungeons, npcPools, pacing, auras, consumables, mechanics, sharedSpells, classes)

/** The shared content as the web app has it: every boss attack lands at once. */
fun GameData.withoutCasts(): GameData = with(
    dungeons = dungeons.map { d ->
        val c = d.bossCombat ?: return@map d
        d.copy(bossCombat = c.copy(attackTemplates = c.attackTemplates.map { it.copy(castTicks = 0) }))
    },
)
