package com.jdial.aegis.ui

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jdial.aegis.R
import com.jdial.aegis.data.AddTemplate
import com.jdial.aegis.data.PlayerClass
import com.jdial.aegis.sim.CombatPhase
import com.jdial.aegis.sim.GameState
import com.jdial.aegis.sim.TRASH_PACK_COUNT
import com.jdial.aegis.sim.Unit
import com.jdial.aegis.sim.UnitRole
import com.jdial.aegis.ui.theme.AegisType
import com.jdial.aegis.ui.theme.Gilt
import kotlin.math.ceil
import kotlin.math.roundToInt

/*
 * The fight, drawn: Final Fantasy's side-on line-up, the party on the left and
 * the enemy on the right, on a flat field.
 *
 * The AI party used to be four health bars and a damage number the player
 * never saw being dealt. Here they step out to swing, flinch when hit, fall
 * over when they die, and say something when it matters.
 *
 * Everything is derived from consecutive states, so the simulation -- and the
 * recorded single-player runs it must reproduce exactly -- is untouched. It is
 * decoration over information the party frames already carry, so screen
 * readers skip it.
 *
 * Sprites: Kenney's Tiny Dungeon, Farm, Ski and Battle packs (CC0), 16x16, drawn with
 * nearest-neighbour scaling so they stay crisp.
 */

// --- who looks like what -------------------------------------------------------

@DrawableRes
fun spriteForClass(cls: PlayerClass?): Int = when (cls) {
    PlayerClass.PRIEST -> R.drawable.spr_sage
    PlayerClass.DRUID -> R.drawable.spr_ranger
    PlayerClass.PALADIN -> R.drawable.spr_knight_helm
    PlayerClass.MAGE -> R.drawable.spr_wizard
    PlayerClass.WARRIOR -> R.drawable.spr_viking
    PlayerClass.DEATHKNIGHT -> R.drawable.spr_knight_visor
    PlayerClass.ROGUE -> R.drawable.spr_rogue
    PlayerClass.MONK -> R.drawable.spr_monk
    PlayerClass.WARLOCK -> R.drawable.spr_sorceress
    null -> R.drawable.spr_peasant
}

private val aiDps = listOf(
    R.drawable.spr_fighter, R.drawable.spr_brawler, R.drawable.spr_farmhand,
    R.drawable.spr_rancher, R.drawable.spr_peasant,
)

/**
 * A party member's sprite. Players look like their class; the AI looks like
 * its role, and never borrows the sprite the player is already wearing.
 */
@DrawableRes
fun spriteForUnit(unit: Unit, state: GameState): Int {
    val human = state.participants[unit.id]?.takeIf { it.isHuman }
    if (human != null) return spriteForClass(human.playerClass)
    val mine = spriteForClass(state.playerClass)
    val slot = unit.id.toIntOrNull() ?: 0
    val pick = when (unit.role) {
        UnitRole.TANK -> R.drawable.spr_knight_helm
        UnitRole.HEALER -> R.drawable.spr_sage
        UnitRole.DPS -> aiDps[slot % aiDps.size]
    }
    return if (pick != mine) pick else when (unit.role) {
        UnitRole.TANK -> R.drawable.spr_knight_visor
        UnitRole.HEALER -> R.drawable.spr_ranger
        UnitRole.DPS -> aiDps[(slot + 1) % aiDps.size]
    }
}

/** What an enemy looks like: a sprite, and a colour laid over it so one tile can be several creatures. */
data class EnemyLook(@DrawableRes val sprite: Int, val tint: Color? = null)

private val Green = Color(0xFF86EFAC)
private val Red = Color(0xFFF87171)
private val Orange = Color(0xFFFB923C)
private val Purple = Color(0xFFC084FC)
private val Teal = Color(0xFF5EEAD4)
private val Ashen = Color(0xFF9CA3AF)
private val Frost = Color(0xFF93C5FD)
private val Rust = Color(0xFFD6A26B)

private fun look(@DrawableRes sprite: Int, tint: Color? = null) = EnemyLook(sprite, tint)

/**
 * Every enemy and boss in the content, by name. A missing name falls back to
 * a slime; a test keeps this list complete.
 */
val enemyLooks: Map<String, EnemyLook> = mapOf(
    // Deadmines
    "Defias Pirate" to look(R.drawable.spr_soldier_red),
    "Defias Miner" to look(R.drawable.spr_brawler),
    "Smite" to look(R.drawable.spr_viking),
    "Edwin VanCleef" to look(R.drawable.spr_rogue),
    // Shadowfang Keep
    "Shadowfang Worgen" to look(R.drawable.spr_yeti_dark),
    "Haunted Static" to look(R.drawable.spr_ghost),
    "Fenrus the Devourer" to look(R.drawable.spr_yeti_dark, Rust),
    "Archmage Arugal" to look(R.drawable.spr_wizard),
    // Wailing Caverns
    "Raptor" to look(R.drawable.spr_lizard, Rust),
    "Ooze" to look(R.drawable.spr_slime),
    "Druid of the Fang" to look(R.drawable.spr_ranger),
    "Verdan the Everliving" to look(R.drawable.spr_tree),
    // Gnomeregan
    "Leper Gnome" to look(R.drawable.spr_peasant, Green),
    "Arcane Nullifier" to look(R.drawable.spr_mech),
    "Mecha-Tank" to look(R.drawable.spr_tank),
    "Mekgineer Thermaplugg" to look(R.drawable.spr_mech, Orange),
    // Scarlet Monastery
    "Scarlet Knight" to look(R.drawable.spr_soldier_red),
    "Scarlet Monk" to look(R.drawable.spr_monk, Red),
    "Mograine" to look(R.drawable.spr_knight_helm, Red),
    "High Inspector Whitemane" to look(R.drawable.spr_sage),
    // Razorfen Downs
    "Quilboar Zombie" to look(R.drawable.spr_yeti, Green),
    "Death's Head Necromancer" to look(R.drawable.spr_wizard, Ashen),
    "Coldbringer Ward" to look(R.drawable.spr_snowman),
    "Amnennar the Coldbringer" to look(R.drawable.spr_yeti),
    // Zul'Farrak
    "Sandfury Troll" to look(R.drawable.spr_brawler, Teal),
    "Shadowcaster" to look(R.drawable.spr_monk, Purple),
    "Basilisk" to look(R.drawable.spr_lizard),
    "Chief Ukorz Sandscalp" to look(R.drawable.spr_cyclops, Teal),
    // Maraudon
    "Centaur Outcast" to look(R.drawable.spr_soldier_orange),
    "Corrupt Elemental" to look(R.drawable.spr_rock),
    "Hydra" to look(R.drawable.spr_lizard, Green),
    "Princess Theradras" to look(R.drawable.spr_rock, Green),
    // Sunken Temple
    "Atal'ai Exile" to look(R.drawable.spr_ranger, Teal),
    "Nightmare Wyrm" to look(R.drawable.spr_lizard, Purple),
    "Dragonkin" to look(R.drawable.spr_lizard, Green),
    "Shade of Eranikus" to look(R.drawable.spr_ghost, Green),
    // Blackrock Depths
    "Dark Iron Dwarf" to look(R.drawable.spr_soldier_grey),
    "Fire Elemental" to look(R.drawable.spr_slime, Orange),
    "Houndmaster" to look(R.drawable.spr_fighter),
    "Emperor Thaurissan" to look(R.drawable.spr_viking),
    // Lower Blackrock Spire
    "Blackrock Orc" to look(R.drawable.spr_soldier_green),
    "Ogre Warmonger" to look(R.drawable.spr_cyclops),
    "Firebrand Grunt" to look(R.drawable.spr_soldier_orange),
    "Overlord Wyrmthalak" to look(R.drawable.spr_cyclops, Green),
    // Stratholme
    "Plague Ghoul" to look(R.drawable.spr_slime),
    "Patchwork Horror" to look(R.drawable.spr_cyclops, Green),
    "Banshee" to look(R.drawable.spr_ghost),
    "Baron Rivendare" to look(R.drawable.spr_knight_visor, Ashen),
    // Scholomance
    "Risen Guard" to look(R.drawable.spr_knight_helm),
    "Necromancer" to look(R.drawable.spr_wizard, Ashen),
    "Voidwalker" to look(R.drawable.spr_ghost, Purple),
    "Darkmaster Gandling" to look(R.drawable.spr_wizard),
    // Dire Maul
    "Gordok Ogre" to look(R.drawable.spr_cyclops),
    "Warpwood Guardian" to look(R.drawable.spr_tree),
    "Eldreth Spirit" to look(R.drawable.spr_ghost, Frost),
    "King Gordok" to look(R.drawable.spr_cyclops, Red),
    // Upper Blackrock Spire
    "Blackhand Elite" to look(R.drawable.spr_soldier_grey),
    "Chromatic Dragonkin" to look(R.drawable.spr_lizard, Purple),
    "Drakonid Slayer" to look(R.drawable.spr_lizard, Red),
    "General Drakkisath" to look(R.drawable.spr_lizard, Orange),
    // Molten Core
    "Molten Giant" to look(R.drawable.spr_rock, Orange),
    "Fire Lord" to look(R.drawable.spr_slime, Orange),
    "Core Hound" to look(R.drawable.spr_yeti_dark, Orange),
    "Ragnaros" to look(R.drawable.spr_crab),
    // Endless
    "Spiteful Shade" to look(R.drawable.spr_ghost, Purple),
    "Endless Thrall" to look(R.drawable.spr_rogue, Ashen),
    "Twisted Echo" to look(R.drawable.spr_ghost, Frost),
    "The Timeless One" to look(R.drawable.spr_wizard),
)

/** Who is being fought: the boss, or this pull's pack -- each pull is a different one. */
fun enemyName(state: GameState): String {
    val dungeon = state.currentDungeon ?: return "Trash"
    if (state.combatPhase == CombatPhase.BOSS) return dungeon.bossName
    if (dungeon.enemies.isEmpty()) return "Trash"
    val pull = (TRASH_PACK_COUNT - state.trashPullsRemaining).coerceAtLeast(0)
    return dungeon.enemies[pull % dungeon.enemies.size].name
}

fun lookForEnemy(state: GameState): EnemyLook =
    enemyLooks[enemyName(state)] ?: EnemyLook(R.drawable.spr_slime)

/** How many of a trash pack are still standing: they drop out as its health falls. */
fun packStanding(state: GameState, size: Int = 3): Int {
    if (state.enemyMaxHealth <= 0) return size
    val frac = (state.enemyHealth / state.enemyMaxHealth).coerceIn(0.0, 1.0)
    return ceil(frac * size).toInt().coerceIn(0, size)
}

// --- what happened ---------------------------------------------------------------

sealed interface SceneEvent {
    data class Hurt(val unitId: String) : SceneEvent
    data class Healed(val unitId: String) : SceneEvent
    data class Died(val unitId: String) : SceneEvent
    data class EnemyHit(val amount: Int) : SceneEvent
    data class Bark(val unitId: String, val text: String) : SceneEvent

    /** A boss cast was cancelled before it landed, by [byUnitId]. */
    data class Interrupted(val byUnitId: String?) : SceneEvent

    /** The boss announcing what is coming: its tell, said once as the cast starts. */
    data class Tell(val text: String) : SceneEvent
}

/** Below this an AI party member asks for help. */
const val BARK_HELP_FRACTION = 0.25

/** The AI healer calls out when its budget falls below this. */
const val BARK_OOM_MANA = 15.0

/**
 * What the scene should show for a change from [prev] to [cur].
 *
 * Pure, so the rules are tested without a device. Barks come only from the
 * AI -- a person's words are their own -- and only on the crossing, never
 * every tick while a condition holds.
 */
fun sceneEventsBetween(prev: GameState, cur: GameState): List<SceneEvent> = buildList {
    if (!prev.isCombatActive || !cur.isCombatActive) return@buildList
    val before = prev.party.associateBy { it.id }
    val ai = { id: String -> cur.participants[id]?.isHuman != true && id != cur.localUnitId }

    for (u in cur.party) {
        val was = before[u.id] ?: continue
        when {
            was.isAlive && !u.isAlive -> add(SceneEvent.Died(u.id))
            u.health < was.health -> add(SceneEvent.Hurt(u.id))
            u.health > was.health -> add(SceneEvent.Healed(u.id))
        }
        if (ai(u.id) && u.isAlive && u.maxHealth > 0 && was.maxHealth > 0 &&
            was.health / was.maxHealth >= BARK_HELP_FRACTION &&
            u.health / u.maxHealth < BARK_HELP_FRACTION
        ) {
            add(SceneEvent.Bark(u.id, "Heal me!"))
        }
    }

    // The AI tank taking the enemy back -- the moment its job is visible.
    val target = cur.enemyTargetId
    if (target != null && target != prev.enemyTargetId && prev.enemyTargetId != null) {
        val unit = cur.party.firstOrNull { it.id == target }
        if (unit != null && unit.role == UnitRole.TANK && ai(unit.id)) add(SceneEvent.Bark(unit.id, "Taunting!"))
    }

    val healer = cur.party.firstOrNull { it.role == UnitRole.HEALER && ai(it.id) && it.isAlive }
    if (healer != null && prev.aiHealerMana >= BARK_OOM_MANA && cur.aiHealerMana < BARK_OOM_MANA) {
        add(SceneEvent.Bark(healer.id, "Out of mana!"))
    }

    // Adds: a runner bolting, a runner gone, a mender's heal kicked or landing.
    val addsBefore = prev.adds.associateBy { it.id }
    for (a in cur.adds) {
        val was = addsBefore[a.id] ?: continue
        if (a.fleeing && !was.fleeing) add(SceneEvent.Tell("${a.name} runs for help!"))
        if (was.casting && !a.casting) {
            if (was.timer > 1) {
                val by = cur.lastInterruptBy
                add(SceneEvent.Interrupted(by))
                if (by != null && ai(by)) add(SceneEvent.Bark(by, "Kicked!"))
            } else {
                add(SceneEvent.Tell("${a.name} mends the others."))
            }
        }
    }
    if (cur.extraPulls > prev.extraPulls) {
        val gone = prev.adds.firstOrNull { it.fleeing && cur.adds.none { a -> a.id == it.id } }
        add(SceneEvent.Tell("${gone?.name ?: "One"} got away. More are coming!"))
    }

    val cast = cur.enemyCast
    if (cast != null && cast.tell.isNotEmpty() && prev.enemyCast?.abilityId != cast.abilityId) add(SceneEvent.Tell(cast.tell))

    // A cast that vanished before its last tick was kicked, not landed.
    val lastCast = prev.enemyCast
    if (lastCast != null && cur.enemyCast == null && lastCast.remainingTicks > 1) {
        val by = cur.lastInterruptBy
        add(SceneEvent.Interrupted(by))
        if (by != null && ai(by)) add(SceneEvent.Bark(by, "Kicked!"))
    }

    val sameEnemy = prev.enemyMaxHealth == cur.enemyMaxHealth &&
        prev.trashPullsRemaining == cur.trashPullsRemaining &&
        prev.combatPhase == cur.combatPhase
    val dealt = prev.enemyHealth - cur.enemyHealth
    if (sameEnemy && dealt >= 1.0) add(SceneEvent.EnemyHit(dealt.roundToInt()))
}

/** The order the party stands in, front first: whoever holds the line leads. */
fun lineUp(party: List<Unit>): List<Unit> = party.sortedWith(
    compareBy<Unit> { when (it.role) { UnitRole.TANK -> 0; UnitRole.DPS -> 1; UnitRole.HEALER -> 2 } }
        .thenBy { it.id },
)

/** Where one party member stands, in dp from the top-left of the scene. */
data class Spot(val x: Int, val y: Int)

/** How far ahead of the group the tank stands. */
const val TANK_STEP = 60

/**
 * The formation: everyone but the tank in a column at the back, and the tank
 * a step in front of them, level with the middle of the column -- between the
 * group and the enemy, where the tank belongs.
 */
fun formation(party: List<Unit>): Map<String, Spot> {
    val (front, back) = lineUp(party).partition { it.role == UnitRole.TANK }
    val middle = 8 + (back.size - 1).coerceAtLeast(0) * ROW / 2
    return back.mapIndexed { i, u -> u.id to Spot(14, 8 + i * ROW) }.toMap() +
        front.mapIndexed { i, u -> u.id to Spot(14 + TANK_STEP, middle + i * ROW) }
}

/** The scene's height in dp: the back column, or the tanks if there are more of them. */
fun sceneHeight(party: List<Unit>): Int {
    val tallest = formation(party).values.maxOfOrNull { it.y } ?: 0
    return (tallest + SPRITE + 18).coerceAtLeast(120)
}

// --- the scene -------------------------------------------------------------------

private data class Burst(val id: Long, val amount: Int)
private data class Say(val text: String, val until: Long)

private val Sky = Color(0xFF2E4468)
private val Horizon = Color(0xFF4E6E4A)
private val Field = Color(0xFF3B5A36)

const val SPRITE = 34

/** Vertical step between party members: enough that each one reads as a person. */
const val ROW = 25
private const val BOSS = 72

@Composable
fun BattleView(state: GameState, targetId: String? = null, modifier: Modifier = Modifier) {
    val party = lineUp(state.party)
    val lunge = remember { mutableStateMapOf<String, Int>() }      // unitId -> nonce
    val flinch = remember { mutableStateMapOf<String, Int>() }
    val sparkle = remember { mutableStateMapOf<String, Int>() }
    val says = remember { mutableStateMapOf<String, Say>() }
    val bursts = remember { mutableStateListOf<Burst>() }
    var enemyFlash by remember { mutableStateOf(0) }
    var interruptedAt by remember { mutableStateOf(0L) }
    var tell by remember { mutableStateOf<Say?>(null) }
    var enemyLunge by remember { mutableStateOf(0) }
    var nextAttacker by remember { mutableStateOf(0) }
    var pending by remember { mutableStateOf(0) }
    var lastSwing by remember { mutableStateOf(0L) }
    var lastEnemySwing by remember { mutableStateOf(0L) }
    var previous by remember { mutableStateOf(state) }

    LaunchedEffect(state) {
        val now = System.currentTimeMillis()
        for (e in sceneEventsBetween(previous, state)) when (e) {
            is SceneEvent.Hurt -> {
                flinch[e.unitId] = (flinch[e.unitId] ?: 0) + 1
                // The enemy steps in when it lands a blow, at a readable pace.
                if (now - lastEnemySwing > 700) { enemyLunge++; lastEnemySwing = now }
            }
            is SceneEvent.Healed -> sparkle[e.unitId] = (sparkle[e.unitId] ?: 0) + 1
            is SceneEvent.Died -> flinch[e.unitId] = (flinch[e.unitId] ?: 0) + 1
            is SceneEvent.Bark -> says[e.unitId] = Say(e.text, now + 1_600)
            is SceneEvent.Interrupted -> interruptedAt = now
            is SceneEvent.Tell -> tell = Say(e.text, now + 2_400)
            is SceneEvent.EnemyHit -> {
                pending += e.amount
                // Ten ticks a second of damage becomes one swing and one number
                // every half second: a rhythm, not a blur.
                if (now - lastSwing >= 450) {
                    val fighters = party.filter { it.isAlive && it.role != UnitRole.HEALER }
                    if (fighters.isNotEmpty()) {
                        val who = fighters[nextAttacker % fighters.size]
                        lunge[who.id] = (lunge[who.id] ?: 0) + 1
                        nextAttacker++
                    }
                    enemyFlash++
                    bursts += Burst(now, pending)
                    if (bursts.size > 4) bursts.removeAt(0)
                    pending = 0
                    lastSwing = now
                }
            }
        }
        says.entries.removeAll { it.value.until < now }
        if ((tell?.until ?: Long.MAX_VALUE) < now) tell = null
        previous = state
    }

    val bob by rememberInfiniteTransition(label = "idle").animateFloat(
        0f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "bob",
    )

    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(sceneHeight(party).dp)
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, Gilt.deep.copy(alpha = 0.6f), RoundedCornerShape(6.dp))
            .background(Field)
            .clearAndSetSemantics { },
    ) {
        val w = maxWidth
        val h = maxHeight
        // Flat bands, no texture: sky, a strip of horizon, field.
        Box(Modifier.fillMaxWidth().height(h * 0.28f).background(Sky))
        Box(Modifier.fillMaxWidth().height(3.dp).offset(y = h * 0.28f).background(Horizon))

        // The party on the left, facing the enemy, the tank out in front.
        val spots = formation(party)
        val boss = state.combatPhase == CombatPhase.BOSS
        val bossX = w - BOSS.dp - 26.dp
        val bossY = (h - BOSS.dp) / 2 + 6.dp
        val cast = state.enemyCast
        val focus = cast?.targets?.firstOrNull() ?: state.enemyTargetId
        // Who the enemy means: a dashed line to each victim of a wind-up, and a
        // faint one to whoever the boss is simply fighting.
        Canvas(Modifier.fillMaxSize()) {
            val from = if (boss) {
                Offset((bossX + (BOSS / 2).dp).toPx(), (bossY + (BOSS / 2).dp).toPx())
            } else {
                Offset((w - 40.dp).toPx(), (h / 2).toPx())
            }
            fun at(id: String) = spots[id]?.let { Offset((it.x + SPRITE / 2).dp.toPx(), (it.y + SPRITE / 2).dp.toPx()) }
            if (cast != null) {
                val colour = (if (cast.interruptible) Kick else WindUp).copy(alpha = 0.35f + 0.55f * cast.progress)
                for (id in cast.targets) at(id)?.let {
                    drawLine(colour, from, it, 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f)))
                }
            } else if (boss) {
                state.enemyTargetId?.let(::at)?.let { drawLine(Color.White.copy(alpha = 0.2f), from, it, 1.dp.toPx()) }
            }
        }

        party.forEachIndexed { i, u ->
            key(u.id) {
                val spot = spots.getValue(u.id)
                val x = spot.x.dp
                val y = spot.y.dp
                PartySprite(
                    unit = u,
                    state = state,
                    x = x,
                    y = y,
                    // A pixel step, not a glide: the bob snaps between two rows.
                    bob = if (((bob + i * 0.37f) % 1f) > 0.5f) 1.dp else 0.dp,
                    lunge = lunge[u.id] ?: 0,
                    flinch = flinch[u.id] ?: 0,
                    sparkle = sparkle[u.id] ?: 0,
                    say = says[u.id]?.text,
                    isYou = u.id == state.localUnitId,
                    targeted = state.enemyCast?.targets?.contains(u.id) == true,
                )
            }
        }

        // The enemy on the right: a pack that thins as it loses health, or one
        // big boss.
        val look = lookForEnemy(state)
        val flash = remember { Animatable(0f) }
        LaunchedEffect(enemyFlash) {
            if (enemyFlash > 0) { flash.snapTo(0.6f); flash.animateTo(0f, tween(220)) }
        }
        val step = remember { Animatable(0f) }
        LaunchedEffect(enemyLunge) {
            if (enemyLunge > 0) { step.animateTo(1f, tween(110)); step.animateTo(0f, tween(200)) }
        }
        // A wind-up glows hotter as it nears landing.
        val windUp = state.enemyCast?.progress ?: 0f
        val tint = when {
            flash.value > 0f -> ColorFilter.tint(Color.White.copy(alpha = flash.value), BlendMode.SrcAtop)
            state.enemyCast != null ->
                ColorFilter.tint(WindUp.copy(alpha = 0.15f + 0.45f * windUp), BlendMode.SrcAtop)
            else -> look.tint?.let { ColorFilter.tint(it, BlendMode.Modulate) }
        }
        // The tiles face right; the enemy faces the party.
        val facing = Modifier.graphicsLayer { scaleX = -1f }
        val stepX = (-14 * step.value).dp
        if (boss) {
            // The boss turns toward whoever it means: a lean, not a spin.
            val aimY = focus?.let { spots[it] }?.let { (it.y + SPRITE / 2).toFloat() }
            val lean by animateFloatAsState(
                aimY?.let { ((it - (bossY + (BOSS / 2).dp).value) / 40f).coerceIn(-1f, 1f) * 10f } ?: 0f,
                tween(300),
                label = "lean",
            )
            PixelSprite(
                look.sprite, BOSS.dp, tint,
                Modifier.offset(x = bossX + stepX, y = bossY).graphicsLayer { rotationZ = -lean }.then(facing),
            )
        } else {
            val slots = listOf(0.dp to 6.dp, (-38).dp to 42.dp, 4.dp to 82.dp)
            repeat(packStanding(state)) { i ->
                val (dx, dy) = slots[i]
                PixelSprite(
                    look.sprite, SPRITE.dp, tint,
                    Modifier.offset(x = w - SPRITE.dp - 30.dp + dx + stepX, y = 14.dp + dy).then(facing),
                )
            }
        }

        // Adds stand in front of the enemy they belong to. A runner edges away;
        // a mender glows while it casts; the chosen one wears a marker.
        state.adds.filter { it.kind == AddTemplate.PACK }.forEachIndexed { p, a ->
            key(a.id) {
                val packLook = enemyLooks[a.looksLike] ?: EnemyLook(R.drawable.spr_slime)
                val packTint = packLook.tint?.let { ColorFilter.tint(it, BlendMode.Modulate) }
                val standing = ceil((a.health / a.maxHealth).coerceIn(0.0, 1.0) * 3).toInt()
                val slots = listOf(0.dp to 0.dp, (-26).dp to 30.dp, 2.dp to 60.dp)
                repeat(standing) { i ->
                    val (dx, dy) = slots[i]
                    PixelSprite(
                        packLook.sprite, 26.dp, packTint,
                        Modifier.offset(x = w - SPRITE.dp - 84.dp - (p * 40).dp + dx, y = 22.dp + dy).then(facing),
                    )
                }
                if (a.id == targetId) {
                    BasicText(
                        "▼",
                        style = AegisType.label.copy(fontSize = 10.sp, color = Gilt.core),
                        modifier = Modifier.offset(x = w - SPRITE.dp - 76.dp - (p * 40).dp, y = 8.dp),
                    )
                }
            }
        }
        state.adds.filter { it.kind != AddTemplate.PACK }.forEachIndexed { i, a ->
            key(a.id) {
                val addLook = enemyLooks[a.looksLike] ?: EnemyLook(R.drawable.spr_slime)
                val away = if (a.fleeing && a.timerTotal > 0) 1f - a.timer.toFloat() / a.timerTotal else 0f
                val ax = (if (boss) bossX - 48.dp else w - SPRITE.dp - 118.dp) - (i % 2 * 30).dp + (50 * away).dp
                val ay = (10 + (i % 3) * 36).dp
                val addTint = when {
                    a.casting -> ColorFilter.tint(Kick.copy(alpha = 0.25f + 0.4f * a.castProgress), BlendMode.SrcAtop)
                    else -> addLook.tint?.let { ColorFilter.tint(it, BlendMode.Modulate) }
                }
                PixelSprite(
                    addLook.sprite, 28.dp, addTint,
                    Modifier.offset(x = ax, y = ay).graphicsLayer { alpha = 1f - 0.5f * away }.then(facing),
                )
                Box(
                    Modifier
                        .offset(x = ax, y = ay + 29.dp)
                        .width(28.dp)
                        .height(3.dp)
                        .background(Color(0xAA000000)),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((a.health / a.maxHealth).toFloat().coerceIn(0f, 1f))
                            .fillMaxHeight()
                            .background(Danger),
                    )
                }
                if (a.id == targetId) {
                    BasicText(
                        "▼",
                        style = AegisType.label.copy(fontSize = 10.sp, color = Gilt.core),
                        modifier = Modifier.offset(x = ax + 9.dp, y = ay - 12.dp),
                    )
                }
            }
        }

        // A hit on everyone reddens the whole scene as it nears.
        if (cast != null && cast.targets.size > 1 && cast.targets.size >= state.party.count { it.isAlive }) {
            Box(Modifier.fillMaxSize().background(Danger.copy(alpha = 0.06f + 0.22f * cast.progress)))
        }
        cast?.let {
            CastBar(it, Modifier.offset(x = w - 146.dp, y = 5.dp).width(132.dp))
        }
        if (state.exposedTicks > 0) {
            BasicText(
                "EXPOSED  ${ceil(state.exposedTicks / 10.0).toInt()}s",
                style = AegisType.label.copy(fontSize = 11.sp, color = Kick),
                modifier = Modifier.offset(x = w - 120.dp, y = h - 22.dp),
            )
        }
        tell?.let {
            BasicText(
                it.text,
                maxLines = 2,
                style = AegisType.label.copy(fontSize = 10.sp, color = Color.White),
                modifier = Modifier
                    .offset(x = w - 200.dp, y = if (cast != null) 24.dp else 6.dp)
                    .width(186.dp)
                    .background(Color(0xCC000000), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            )
        }
        // The payoff for a kick: the cast breaks, and says so.
        val sinceKick = remember(interruptedAt) { Animatable(0f) }
        LaunchedEffect(interruptedAt) { if (interruptedAt > 0) sinceKick.animateTo(1f, tween(1_100)) }
        if (interruptedAt > 0 && sinceKick.value < 1f) {
            BasicText(
                "INTERRUPTED",
                style = AegisType.label.copy(fontSize = 11.sp, color = Kick),
                modifier = Modifier
                    .offset(x = w - 140.dp, y = (8 - 10 * sinceKick.value).dp)
                    .graphicsLayer { alpha = 1f - sinceKick.value },
            )
        }

        // Damage numbers over the enemy, as the old side-on games did it.
        bursts.forEach { b ->
            key(b.id) {
                val rise = remember { Animatable(0f) }
                LaunchedEffect(Unit) {
                    rise.animateTo(1f, tween(900))
                    bursts.remove(b)
                }
                BasicText(
                    "${b.amount}",
                    style = AegisType.numeric.copy(fontSize = 13.sp, color = Color.White),
                    modifier = Modifier
                        // In the open ground just short of the enemy: drawn over
                        // the sprites they were hard to read. Below the boss's
                        // tell, which sits under the cast bar.
                        .offset(x = w - 150.dp + (b.id % 17).toInt().dp, y = (96 - 26 * rise.value).dp)
                        .graphicsLayer { alpha = 1f - rise.value * rise.value },
                )
            }
        }
    }
}

private val WindUp = Color(0xFFF97316)
private val Danger = Color(0xFFDC2626)

/** A cast that can be kicked, and the kick that lands. */
private val Kick = Color(0xFFFACC15)

/** The boss's wind-up: what is coming, filling toward the moment it lands. */
@Composable
private fun CastBar(cast: com.jdial.aegis.sim.EnemyCast, modifier: Modifier) {
    Column(modifier) {
        BasicText(
            (if (cast.interruptible) "KICK  ·  " else "") + cast.name.uppercase(),
            maxLines = 1,
            style = AegisType.label.copy(fontSize = 9.sp, color = if (cast.interruptible) Kick else Color.White),
        )
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(Color(0xAA000000)),
        ) {
            Box(Modifier.fillMaxWidth(cast.progress).fillMaxHeight().background(if (cast.interruptible) Kick else WindUp))
        }
    }
}

@Composable
private fun PixelSprite(@DrawableRes res: Int, size: Dp, tint: ColorFilter?, modifier: Modifier) {
    Image(
        // The bitmap overload, because it is the one that takes a filter:
        // nearest-neighbour keeps a 16px sprite crisp at 40dp.
        bitmap = ImageBitmap.imageResource(res),
        contentDescription = null,
        colorFilter = tint,
        filterQuality = FilterQuality.None,
        modifier = modifier.size(size),
    )
}

@Composable
private fun PartySprite(
    unit: Unit,
    state: GameState,
    x: Dp,
    y: Dp,
    bob: Dp,
    lunge: Int,
    flinch: Int,
    sparkle: Int,
    say: String?,
    isYou: Boolean,
    /** A boss cast is aimed at this unit. */
    targeted: Boolean = false,
) {
    val step = remember { Animatable(0f) }
    LaunchedEffect(lunge) {
        // Step out, swing, step back.
        if (lunge > 0) { step.animateTo(1f, tween(120)); step.animateTo(0f, tween(220)) }
    }
    val hurt = remember { Animatable(0f) }
    LaunchedEffect(flinch) {
        if (flinch > 0) { hurt.snapTo(1f); hurt.animateTo(0f, tween(260)) }
    }
    val glow = remember { Animatable(0f) }
    LaunchedEffect(sparkle) {
        if (sparkle > 0) { glow.snapTo(1f); glow.animateTo(0f, tween(500)) }
    }

    val dead = !unit.isAlive
    val shake = if (hurt.value > 0.5f) 2.dp else 0.dp
    val tint = when {
        dead -> ColorFilter.tint(Color(0xFF6B7280).copy(alpha = 0.7f), BlendMode.SrcAtop)
        hurt.value > 0f -> ColorFilter.tint(Color(0xFFEF4444).copy(alpha = hurt.value * 0.7f), BlendMode.SrcAtop)
        glow.value > 0f -> ColorFilter.tint(Color(0xFF86EFAC).copy(alpha = glow.value * 0.6f), BlendMode.SrcAtop)
        // Mind-controlled: fighting for the other side until someone dispels it.
        unit.debuffs.any { it.charm } -> ColorFilter.tint(Color(0xFFA855F7).copy(alpha = 0.55f), BlendMode.SrcAtop)
        else -> null
    }

    Box(Modifier.offset(x = x + (22 * step.value).dp + shake, y = y + if (dead) 10.dp else -bob)) {
        PixelSprite(
            spriteForUnit(unit, state),
            SPRITE.dp,
            tint,
            // The fallen lie down, as they always have.
            Modifier.graphicsLayer { rotationZ = if (dead) -90f else 0f },
        )
        if (isYou && !dead) {
            // A small marker so you can find yourself in the line-up.
            Box(
                Modifier
                    .offset(x = (SPRITE / 2 - 2).dp, y = (-4).dp)
                    .size(4.dp)
                    .background(Gilt.core),
            )
        }
        if (targeted && !dead) {
            // The victim of the cast, marked where the eye already is.
            BasicText(
                "!",
                style = AegisType.numeric.copy(fontSize = 15.sp, color = Color(0xFFF87171)),
                modifier = Modifier.offset(x = (SPRITE / 2 - 3).dp, y = (-17).dp),
            )
        }
        if (glow.value > 0f) {
            BasicText(
                "+",
                style = AegisType.numeric.copy(fontSize = 14.sp, color = Color(0xFF86EFAC)),
                modifier = Modifier
                    .offset(x = (SPRITE - 6).dp, y = (-2 - 10 * (1 - glow.value)).dp)
                    .graphicsLayer { alpha = glow.value },
            )
        }
        if (say != null && !dead) {
            BasicText(
                say,
                style = AegisType.label.copy(fontSize = 9.sp, color = Color(0xFF1F2937)),
                modifier = Modifier
                    .offset(x = (SPRITE + 2).dp, y = 4.dp)
                    .background(Color(0xFFF8FAFC), RoundedCornerShape(4.dp))
                    .padding(horizontal = 4.dp, vertical = 1.dp),
            )
        }
    }
}
