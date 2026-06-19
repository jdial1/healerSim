import path from "node:path";
import { fileURLToPath } from "node:url";
import { DUNGEONS } from "../src/dungeons/index.js";
import { dungeonPaceXpMultiplier, TRASH_PACK_COUNT } from "../src/constants.js";
import {
  computeDungeonFailureXpGain,
  computeDungeonXpGain,
  levelFromTotalXp,
  PLAYER_MAX_LEVEL,
  getXpToLevel
} from "../src/gameStorage.js";
import { testPalette } from "./testColors.js";
const T = testPalette();
const PACE = "normal";
const BOSS_WIPE_RATE = 0.5;
const PACE_MULT = dungeonPaceXpMultiplier(PACE);
const SIM_ATTEMPTS = 800;
const STUCK_WINDOW = 120;
function pickDungeonForLevel(level) {
  const inBand = DUNGEONS.filter((d) => level >= d.levelMin && level <= d.levelMax);
  if (inBand.length > 0) return inBand.reduce((a, b) => a.difficulty >= b.difficulty ? a : b);
  const below = DUNGEONS.filter((d) => d.levelMax < level);
  if (below.length > 0) return below.reduce((a, b) => a.levelMax >= b.levelMax ? a : b);
  return DUNGEONS.reduce((a, b) => a.levelMax >= b.levelMax ? a : b);
}
function xpForBossAttempt(d, playerLevel, wipe) {
  if (wipe) {
    return Math.round(computeDungeonFailureXpGain(d, playerLevel, TRASH_PACK_COUNT) * PACE_MULT);
  }
  return Math.round(computeDungeonXpGain(d, playerLevel) * PACE_MULT);
}
function mulberry32(a) {
  return () => {
    let t = a += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function runFailStatesTest() {
  const rng = mulberry32(4207809076);
  let xp = 0;
  let lastLevel = 1;
  let stuckCounter = 0;
  let minFailXp = 1e9;
  let maxLevel = 1;
  for (let i = 0; i < SIM_ATTEMPTS; i += 1) {
    const L = levelFromTotalXp(xp);
    maxLevel = Math.max(maxLevel, L);
    if (L === lastLevel) stuckCounter += 1;
    else {
      stuckCounter = 0;
      lastLevel = L;
    }
    const d = pickDungeonForLevel(L);
    const wipe = rng() < BOSS_WIPE_RATE;
    const gain = xpForBossAttempt(d, L, wipe);
    minFailXp = Math.min(minFailXp, xpForBossAttempt(d, L, true));
    xp += gain;
    if (L >= PLAYER_MAX_LEVEL) break;
  }
  const finalLevel = levelFromTotalXp(xp);
  const xpInto = xp - getXpToLevel(finalLevel);
  const needNext = finalLevel < PLAYER_MAX_LEVEL ? getXpToLevel(finalLevel + 1) - getXpToLevel(finalLevel) : 0;
  const stuck = stuckCounter >= STUCK_WINDOW;
  const stuckCol = stuck ? T.red : T.green;
  const lvlCol = finalLevel >= 20 ? T.green : finalLevel >= 10 ? T.yellow : T.red;
  console.log(
    `${T.dim}Bad run:${T.r} ${T.yellow}${(BOSS_WIPE_RATE * 100).toFixed(0)}%${T.r} boss wipe \u2192 failure XP uses ${T.cyan}failureFractionWhenAllTrashCleared${T.r} ${T.dim}(${SIM_ATTEMPTS} attempts, ${PACE} pace XP).${T.r}`
  );
  console.log(
    `  ${T.dim}Outcome:${T.r} ${lvlCol}level ${finalLevel}${T.r} ${T.dim}(${xpInto} / ${needNext || "cap"} XP into next)${T.r} ${T.dim}|${T.r} max ${T.cyan}${maxLevel}${T.r} ${T.dim}|${T.r} min fail XP/run ${T.yellow}${Math.round(minFailXp)}${T.r}`
  );
  console.log(
    `  ${stuckCol}stuck@${STUCK_WINDOW}+ same level:${stuck ? "yes" : "no"}${T.r} ${T.dim}(counter ${stuckCounter})${T.r}`
  );
}
const thisFile = fileURLToPath(import.meta.url);
const ranAsMain = process.argv[1] !== void 0 && path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);
if (ranAsMain) {
  runFailStatesTest();
}
export {
  runFailStatesTest
};
