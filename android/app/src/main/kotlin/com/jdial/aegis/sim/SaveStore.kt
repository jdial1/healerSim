package com.jdial.aegis.sim

import com.jdial.aegis.data.PlayerClass
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Port of the persistence in `src/gameStorage.js`.
 *
 * The schema is deliberately identical to the web app's `aegis.roster.v2`, so a
 * save can move between the two. Only six fields per character are stored —
 * level, talent points, mana pool and the spell loadout are all *derived* on load.
 *
 * No DataStore: this is one small JSON blob. Writing to a temp file and renaming
 * is what DataStore does internally, and is three lines here.
 */
@Serializable
data class CharacterBlob(
    val v: Int = 1,
    val xp: Int = 0,
    val talentRanks: Map<String, Int> = emptyMap(),
    val completedDungeonIds: List<String> = emptyList(),
    val playerClass: String,
    val actionBarSpellIds: List<String> = emptyList(),
    val introTutorialComplete: Boolean = false,
)

@Serializable
data class Roster(
    val v: Int = 2,
    val lastPlayedClass: String? = null,
    val byClass: Map<String, CharacterBlob> = emptyMap(),
)

/** Mirrors the web app's `aegis.suspend.v1`: one boss-phase run, read once. */
@Serializable
data class SuspendedRun(val v: Int = 1, val playerClass: String, val state: GameState)

class SaveStore(
    private val file: File,
    private val engine: Engine,
    private val suspendFile: File = File(file.parentFile, "aegis.suspend.v1.json"),
    private val tutorialFile: File = File(file.parentFile, "aegis.tutorial.v1.json"),
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun load(): Roster =
        runCatching { json.decodeFromString<Roster>(file.readText()) }
            .getOrElse { Roster() }

    /** Atomic: write beside the target, then rename over it. */
    fun save(roster: Roster) {
        runCatching {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeText(json.encodeToString(roster))
            if (!tmp.renameTo(file)) {
                file.writeText(tmp.readText())
                tmp.delete()
            }
        }
    }

    fun serialize(state: GameState): CharacterBlob? {
        val cls = state.playerClass ?: return null
        return CharacterBlob(
            xp = state.xp,
            talentRanks = state.talents.associate { it.id to it.points },
            completedDungeonIds = state.completedDungeonIds,
            playerClass = cls.name,
            actionBarSpellIds = state.activeActionBars,
            introTutorialComplete = state.introTutorialComplete,
        )
    }

    fun merge(roster: Roster, state: GameState): Roster {
        val blob = serialize(state) ?: return roster
        return roster.copy(
            lastPlayedClass = blob.playerClass,
            byClass = roster.byClass + (blob.playerClass to blob),
        )
    }

    /** Rebuilds full state from a stored blob, deriving everything else. */
    fun restore(blob: CharacterBlob, rng: Rng): GameState? {
        val cls = runCatching { PlayerClass.valueOf(blob.playerClass) }.getOrNull() ?: return null
        val base = engine.newCharacter(cls, rng)

        val talents = base.talents.map { t ->
            t.copy(points = (blob.talentRanks[t.id] ?: 0).coerceIn(0, t.talent.maxPoints))
        }
        val level = engine.progression.levelFromTotalXp(blob.xp)
        val loadout = engine.progression.buildSpellLoadout(cls, talents)
        val maxMana = engine.stats.maxMana(cls, level, talents)

        // A saved bar order is honoured only if it holds the same spells.
        val bar = blob.actionBarSpellIds.takeIf {
            it.size == loadout.actionBar.size && it.sorted() == loadout.actionBar.sorted()
        } ?: loadout.actionBar

        return base.copy(
            xp = blob.xp,
            level = level,
            talents = talents,
            talentPoints = engine.progression.talentPoints(level, talents),
            unlockedSpells = loadout.unlockedSpells,
            activeActionBars = bar,
            maxMana = maxMana,
            mana = maxMana.toDouble(),
            completedDungeonIds = blob.completedDungeonIds,
            introTutorialComplete = blob.introTutorialComplete,
            party = base.party,
        )
    }

    fun maxLevelAcrossRoster(roster: Roster): Int =
        roster.byClass.values.maxOfOrNull { engine.progression.levelFromTotalXp(it.xp) } ?: 1

    // --- suspended run -------------------------------------------------------

    /** Only a live boss fight is worth resuming; trash is cheap to redo. */
    fun isSuspendable(state: GameState): Boolean =
        state.isCombatActive &&
            state.combatPhase == CombatPhase.BOSS &&
            state.currentDungeon != null &&
            state.playerClass != null

    fun writeSuspendedRun(state: GameState) {
        val cls = state.playerClass ?: return
        if (!isSuspendable(state)) return
        runCatching {
            val tmp = File(suspendFile.parentFile, suspendFile.name + ".tmp")
            tmp.writeText(json.encodeToString(SuspendedRun(playerClass = cls.name, state = state)))
            if (!tmp.renameTo(suspendFile)) { suspendFile.writeText(tmp.readText()); tmp.delete() }
        }
    }

    fun clearSuspendedRun() {
        runCatching { suspendFile.delete() }
    }

    /**
     * Read-once-then-delete, exactly as the web app does: a resumed run must not
     * be resumable a second time.
     */
    fun takeSuspendedRun(cls: PlayerClass): GameState? {
        val run = runCatching { json.decodeFromString<SuspendedRun>(suspendFile.readText()) }.getOrNull()
        clearSuspendedRun()
        if (run == null || run.playerClass != cls.name) return null
        if (!isSuspendable(run.state)) return null
        return run.state
    }

    // --- tutorial progress ---------------------------------------------------

    fun readTutorialSteps(): List<String> =
        runCatching { json.decodeFromString<List<String>>(tutorialFile.readText()) }.getOrElse { emptyList() }

    fun writeTutorialSteps(steps: List<String>) {
        runCatching { tutorialFile.writeText(json.encodeToString(steps.distinct())) }
    }
}
