package com.jdial.aegis.data

import kotlinx.serialization.json.Json

/** Reads a content file by asset-relative path, e.g. `data/balance.json`. */
fun interface ContentSource {
    fun read(path: String): String
}

/**
 * Persisted by name (see `aegis.roster.v2`) and kept from being renamed by an
 * R8 keep rule plus the verifyMinifiedSaveContract Gradle task, so entries are
 * additive-only. A class's role lives in its ClassMeta, not here.
 */
enum class PlayerClass { PRIEST, DRUID, PALADIN, MAGE, WARRIOR, DEATHKNIGHT, ROGUE, MONK, WARLOCK;

    companion object {
        /**
         * The classes the frozen web app also has.
         *
         * parity/golden.json was generated from that app, so it is the only set
         * the parity tests can meaningfully compare against -- an Android-only
         * class has no reference to match. Anything added here from now on is
         * Android-only by definition.
         */
        val webClasses: List<PlayerClass> = listOf(PRIEST, DRUID, PALADIN)
    }
}

/** The four-part bundle per class, mirroring `src/classes/index.js`. */
data class ClassBundle(
    val meta: ClassMeta,
    val spells: Map<String, Spell>,
    val talents: List<Talent>,
)

/**
 * Parsed game content. The analogue of `src/data/index.js`: built once at startup
 * from the JSON synced out of the web app.
 */
class GameData(
    val balance: Balance,
    val dungeons: List<Dungeon>,
    val npcPools: NpcPools,
    val pacing: Pacing,
    val auras: Auras,
    val consumables: Map<String, ConsumableDef>,
    val mechanics: Map<String, Boolean>,
    val sharedSpells: Map<String, Spell>,
    val classes: Map<PlayerClass, ClassBundle>,
    /** Who learns the Android-owned utility spells, and when. */
    val grants: List<SpellGrant> = emptyList(),
    val encounters: Encounters = Encounters(),
    /** What each enemy looks like, by the name content calls it. */
    val looks: Map<String, EnemyLookDef> = emptyMap(),
) {
    /** The utility spells [cls] has learned by [level], in content order. */
    fun grantsFor(cls: PlayerClass, level: Int): List<String> {
        val role = bundle(cls).meta.role
        return grants.filter { it.level <= level && it.appliesTo(cls, role) }.map { it.spell }.distinct()
    }

    /** All class spells merged with the shared ones, as `SPELLS` is in the web app. */
    val spells: Map<String, Spell> =
        classes.values.fold(sharedSpells) { acc, bundle -> acc + bundle.spells }

    fun spell(id: String): Spell? = spells[id]

    fun bundle(cls: PlayerClass): ClassBundle = classes.getValue(cls)

    fun dungeon(id: String): Dungeon? = dungeons.firstOrNull { it.id == id }

    companion object {
        private val json = Json {
            ignoreUnknownKeys = true
            isLenient = true
        }

        fun load(source: ContentSource): GameData {
            fun <T> parse(path: String, deserialize: (String) -> T): T =
                runCatching { deserialize(source.read(path)) }
                    .getOrElse { throw IllegalStateException("Failed to parse asset '$path'", it) }

            val encounters = parse("data/encounters.json") { json.decodeFromString<Encounters>(it) }
            val utility = parse("data/utility_spells.json") { json.decodeFromString<UtilitySpells>(it) }
            val classes = PlayerClass.entries.associateWith { cls ->
                val name = cls.name.lowercase()
                val dir = "classes/$name"
                ClassBundle(
                    meta = parse("$dir/class.json") { json.decodeFromString<ClassMeta>(it) },
                    spells = parse("$dir/spells.json") { json.decodeFromString<Map<String, Spell>>(it) },
                    talents = parse("$dir/talents.json") { json.decodeFromString<List<Talent>>(it) },
                )
            }
            return GameData(
                balance = parse("data/balance.json") { json.decodeFromString<Balance>(it) },
                dungeons = parse("data/dungeons.json") { json.decodeFromString<List<Dungeon>>(it) }
                    .withEncounters(encounters),
                npcPools = parse("data/npc_pools.json") { json.decodeFromString<NpcPools>(it) },
                pacing = parse("data/pacing.json") { json.decodeFromString<Pacing>(it) },
                auras = parse("data/auras.json") { json.decodeFromString<Auras>(it) },
                consumables = parse("data/consumables.json") { json.decodeFromString<Map<String, ConsumableDef>>(it) },
                mechanics = parse("data/mechanics.json") { json.decodeFromString<Map<String, Boolean>>(it) },
                sharedSpells = parse("data/shared_spells.json") { json.decodeFromString<Map<String, Spell>>(it) } +
                    utility.spells,
                classes = classes,
                grants = utility.grants,
                encounters = encounters,
                looks = parse("data/looks.json") { json.decodeFromString<Map<String, EnemyLookDef>>(it) },
            )
        }
    }
}
