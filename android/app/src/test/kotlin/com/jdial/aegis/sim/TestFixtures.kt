package com.jdial.aegis.sim

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
