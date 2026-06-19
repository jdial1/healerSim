import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameReducer, getInitialState } from "../src/gameEngineReducer.js";
import { DUNGEONS } from "../src/dungeons/index.js";
import { TICK_RATE, dungeonPaceDpsMultiplier, generateRandomParty } from "../src/constants.js";
import { getMeta, getXpToLevel } from "../src/gameStorage.js";
import { CLASS_PROGRESSION } from "../src/playerStats.js";
import { hasBuff, addBuff } from "../src/talentMechanics.js";
import { getAuraTicks } from "../src/auraConfig.js";
import { testPalette } from "./testColors.js";
const T = testPalette();
const REACTION_MS = 400;
const REACTION_TICKS = Math.max(1, Math.round(REACTION_MS / TICK_RATE));
const CAST_TICKS = 10;
const DELAY_TICKS = REACTION_TICKS + CAST_TICKS;
const MAX_COMBAT_TICKS = 12e4;
const SEEDS_PER_DUNGEON = 4;
const PACE = "normal";
const HEALER_CLASS = "PRIEST";
const CRISIS_HP_FRAC = 0.5;
function minLivingAllyHpFraction(party) {
  let min = 1;
  let any = false;
  for (const u of party) {
    if (u.role === "HEALER") continue;
    if (u.health <= 0 || u.maxHealth <= 0) continue;
    any = true;
    min = Math.min(min, u.health / u.maxHealth);
  }
  return any ? min : null;
}
function tryActivateArchangelCrisis(state) {
  if (state.playerClass !== "PRIEST") return state;
  const frac = minLivingAllyHpFraction(state.party);
  if (frac === null || frac >= CRISIS_HP_FRAC) return state;
  if (hasBuff(state.playerCombatBuffs, "archangel")) return state;
  const cap = CLASS_PROGRESSION.PRIEST;
  return {
    ...state,
    capstoneForm: cap.capstoneForm,
    playerCombatBuffs: addBuff(
      state.playerCombatBuffs,
      cap.capstonePlayerBuffId,
      getAuraTicks(cap.capstonePlayerBuffId),
      1
    )
  };
}
function mulberry32(a) {
  return () => {
    let t = a += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pickHealTarget(party) {
  let best = null;
  let bestRatio = 1;
  for (const u of party) {
    if (u.role === "HEALER") continue;
    if (u.health <= 0 || u.maxHealth <= 0) continue;
    const r = u.health / u.maxHealth;
    if (r < 0.8 && r < bestRatio) {
      bestRatio = r;
      best = u;
    }
  }
  return best?.id ?? null;
}
function resolveCastTargetId(state, preferredId) {
  const u = state.party.find((x) => x.id === preferredId);
  if (u && u.health > 0) return preferredId;
  const tank = state.party.find((x) => x.role === "TANK" && x.health > 0);
  if (tank) return tank.id;
  const any = state.party.find((x) => x.role !== "HEALER" && x.health > 0);
  return any?.id ?? preferredId;
}
function initialStateForDungeon(dungeon) {
  let state = getInitialState(HEALER_CLASS, void 0);
  const meta = getMeta(getXpToLevel(dungeon.levelMax), HEALER_CLASS, state.talents);
  state = {
    ...state,
    ...meta,
    level: dungeon.levelMax,
    party: generateRandomParty(dungeon.levelMax, HEALER_CLASS)
  };
  return gameReducer(state, { type: "START_DUNGEON", dungeon, pace: PACE });
}
function runDelayedHealDungeonOnce(dungeon, seed) {
  const rng = mulberry32(seed);
  let state = initialStateForDungeon(dungeon);
  let pending = null;
  let ticks = 0;
  while (state.isCombatActive && ticks < MAX_COMBAT_TICKS) {
    ticks += 1;
    state = gameReducer(state, {
      type: "TICK",
      random: rng,
      now: seed + ticks,
      dpsMultiplier: dungeonPaceDpsMultiplier(PACE)
    });
    state = tryActivateArchangelCrisis(state);
    const t = state.combatElapsedTicks;
    if (pending !== null && t >= pending.at) {
      const tid = resolveCastTargetId(state, pending.targetId);
      state = gameReducer(state, {
        type: "CAST_SPELL",
        spellId: "flash_heal",
        targetId: tid,
        critRoll: rng() * 100
      });
      pending = null;
    }
    if (pending === null && state.isCombatActive) {
      const id = pickHealTarget(state.party);
      if (id !== null) {
        pending = { at: t + DELAY_TICKS, targetId: id };
      }
    }
    if (state.dungeonOutcome?.kind === "failure") return "failure";
    if (state.dungeonOutcome?.kind === "success") return "success";
  }
  return "timeout";
}
function runHealingStressTest() {
  console.log(
    `${T.dim}Delayed heal bot:${T.r} ally ${T.cyan}<80% max HP${T.r} ${T.dim}\u2192${T.r} wait ${T.yellow}${REACTION_MS}ms${T.r} ${T.dim}+${T.r} ${T.yellow}${CAST_TICKS * TICK_RATE / 1e3}s${T.r} cast ${T.dim}\u2192${T.r} Flash Heal. ${T.dim}Archangel if any ally ${T.cyan}<${Math.round(CRISIS_HP_FRAC * 100)}%${T.r}${T.dim}. PRIEST, ${PACE} pace.${T.r}`
  );
  const stressDungeons = DUNGEONS.filter((d) => d.difficulty >= 6);
  const list = stressDungeons.length > 0 ? stressDungeons : DUNGEONS.slice(-2);
  for (const d of list) {
    let ok = 0;
    let fail = 0;
    let tout = 0;
    for (let s = 0; s < SEEDS_PER_DUNGEON; s += 1) {
      const r = runDelayedHealDungeonOnce(d, d.id.length * 1315423911 + s * 2654435761);
      if (r === "success") ok += 1;
      else if (r === "failure") fail += 1;
      else tout += 1;
    }
    const n = SEEDS_PER_DUNGEON;
    const okc = ok === n ? T.green : ok > 0 ? T.yellow : T.red;
    console.log(
      `  ${T.cyan}${d.name}${T.r} ${T.dim}(${n} seeds)${T.r} ${okc}clear=${ok}${T.r} ${T.dim}|${T.r} ${T.red}wipe=${fail}${T.r} ${T.dim}|${T.r} ${T.yellow}timeout=${tout}${T.r}`
    );
  }
}
const thisFile = fileURLToPath(import.meta.url);
const ranAsMain = process.argv[1] !== void 0 && path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);
if (ranAsMain) {
  runHealingStressTest();
}
export {
  runHealingStressTest
};
