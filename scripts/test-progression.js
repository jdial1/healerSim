import path from "node:path";
import { fileURLToPath } from "node:url";
import { DUNGEONS } from "../src/dungeons/index.js";
import {
  dungeonPaceBossSec,
  dungeonPaceTrashSec,
  dungeonPaceXpMultiplier
} from "../src/constants.js";
import {
  computeDungeonFailureXpGain,
  computeDungeonXpGain,
  levelFromTotalXp,
  getXpToLevel
} from "../src/gameStorage.js";
import { testPalette } from "./testColors.js";
const T = testPalette();
const PACE = "normal";
const WIPE_RATE = 0.2;
const FAIL_PULLS_CLEARED = 1;
function xpToAdvanceOneLevel(fromLevel) {
  return getXpToLevel(fromLevel + 1) - getXpToLevel(fromLevel);
}
function pickDungeonForLevel(level) {
  const finite = DUNGEONS.filter((d) => !d.endless);
  let bestFinite = null;
  let bestFiniteXp = 0;
  for (const d of finite) {
    if (level < d.levelMin) continue;
    const xp = computeDungeonXpGain(d, level);
    if (xp > bestFiniteXp) {
      bestFiniteXp = xp;
      bestFinite = d;
    }
  }
  const endless = DUNGEONS.find((d) => d.endless);
  const endlessXp = endless !== void 0 && level >= endless.levelMin ? computeDungeonXpGain(endless, level) : 0;
  if (endless !== void 0 && endlessXp > bestFiniteXp) return endless;
  if (bestFinite !== null && bestFiniteXp > 0) return bestFinite;
  if (endless !== void 0) return endless;
  return bestFinite ?? finite[0];
}
function expectedXpPerRun(playerLevel) {
  const d = pickDungeonForLevel(playerLevel);
  const paceMult = dungeonPaceXpMultiplier(PACE);
  const full = Math.round(computeDungeonXpGain(d, playerLevel) * paceMult);
  const fail = Math.round(computeDungeonFailureXpGain(d, playerLevel, FAIL_PULLS_CLEARED) * paceMult);
  return (1 - WIPE_RATE) * full + WIPE_RATE * fail;
}
function secondsPerRun() {
  return dungeonPaceTrashSec(PACE) + dungeonPaceBossSec(PACE);
}
function simulateRunsToTargetLevel(targetLevel) {
  let xp = 0;
  let runs = 0;
  const runsStartedAtLevel = Array.from({ length: Math.max(0, targetLevel - 1) }, () => 0);
  while (levelFromTotalXp(xp) < targetLevel) {
    const L = levelFromTotalXp(xp);
    runsStartedAtLevel[L - 1] += 1;
    xp += expectedXpPerRun(L);
    runs += 1;
    if (runs > 5e6) throw new Error("progression sim exceeded iteration cap");
  }
  return { runs, totalXpEnd: xp, runsStartedAtLevel };
}
function runProgressionTest() {
  const targetLevel = Math.max(...DUNGEONS.map((d) => d.levelMax));
  const secPerRun = secondsPerRun();
  const { runs, runsStartedAtLevel } = simulateRunsToTargetLevel(targetLevel);
  const hours = runs * secPerRun / 3600;
  console.log(`${T.dim}XP to reach next level (by current level):${T.r}`);
  for (let L = 1; L < targetLevel; L += 1) {
    const need = xpToAdvanceOneLevel(L);
    console.log(`  ${T.dim}L${L}\u2192${L + 1}:${T.r} ${T.cyan}${need}${T.r} ${T.dim}XP${T.r}`);
  }
  console.log("");
  console.log(
    `${T.dim}Dungeon runs started at each level (counts toward that level bar; includes XP overflow from prior runs):${T.r}`
  );
  for (let L = 1; L < targetLevel; L += 1) {
    const n = runsStartedAtLevel[L - 1] ?? 0;
    const minThis = n * secPerRun / 60;
    const runWord = n === 1 ? "run" : "runs";
    console.log(
      `  ${T.dim}L${L}\u2192${L + 1}:${T.r} ${T.yellow}${n}${T.r} ${T.dim}${runWord}${T.r} ${T.dim}(~${minThis.toFixed(1)} min)${T.r}`
    );
  }
  console.log(`  ${T.dim}\u03A3:${T.r} ${T.yellow}${runs}${T.r} ${T.dim}(matches full sim)${T.r}`);
  console.log("");
  console.log(
    `${T.dim}Level 1 to ${targetLevel}${T.r} requires ${T.green}~${runs}${T.r} dungeon runs ${T.dim}(Normal pace, ${(WIPE_RATE * 100).toFixed(0)}% wipe rate, fail XP = ${FAIL_PULLS_CLEARED} pull(s) cleared).${T.r} Estimated active playtime: ${T.green}${hours.toFixed(1)} hours${T.r}.`
  );
}
const thisFile = fileURLToPath(import.meta.url);
const ranAsMain = process.argv[1] !== void 0 && path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);
if (ranAsMain) {
  runProgressionTest();
}
export {
  runProgressionTest
};
