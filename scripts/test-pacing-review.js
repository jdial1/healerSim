// Clear-time review: how long a run actually takes at the level you play it.
//
// scripts/test-dungeons.js measures timings at `dungeon.levelMax`, but a dungeon
// unlocks at `levelMin` — so the numbers that were signed off are the best case,
// not the common one. This prints both, against the pacing targets.
//
// Enemy health depletion is fully deterministic (no RNG in the DPS path), so
// these are exact, not sampled.
import "../src/gameEngineReducer.js";
import { DUNGEONS } from "../src/data/index.js";
import {
  BALANCE,
  TRASH_PACK_COUNT,
  TICKS_PER_SECOND,
  getTrashMaxHealth,
  dungeonPaceDpsMultiplier,
  pacingData,
} from "../src/constants.js";

const PACES = ["fast", "normal", "slow"];

/** Party damage per tick, straight from the balance constants. */
function partyDpsPerTick(level) {
  const pd = BALANCE.partyDps;
  return pd.base + Math.pow(level, pd.levelExponent) * pd.levelMultiplier;
}

function clearSeconds(dungeon, level, pace) {
  const perTick = partyDpsPerTick(level) * dungeonPaceDpsMultiplier(pace);
  const trashHp = getTrashMaxHealth(dungeon) * TRASH_PACK_COUNT;
  const trashSec = trashHp / perTick / TICKS_PER_SECOND;
  const bossSec = dungeon.bossHealth / perTick / TICKS_PER_SECOND;
  return { trashSec, bossSec, totalSec: trashSec + bossSec };
}

function fmt(n) {
  return `${n.toFixed(0)}s`.padStart(5);
}

function pct(actual, target) {
  const d = ((actual - target) / target) * 100;
  const s = `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
  return s.padStart(6);
}

console.log("Clear-time review — actual vs pacing target\n");
console.log("Targets come from data/pacing.json (trashSec is for ALL three pulls).");
console.log("'at min' is the level the dungeon unlocks at; 'at max' is what");
console.log("scripts/test-dungeons.js measures.\n");

for (const pace of PACES) {
  const def = pacingData.paces[pace];
  console.log(
    `[${pace}] target trash ${def.trashSec}s + boss ${def.bossSec}s = ${def.trashSec + def.bossSec}s`,
  );
  console.log(
    "  dungeon".padEnd(26) +
      "lv".padStart(6) +
      "trash".padStart(7) +
      "boss".padStart(7) +
      "total".padStart(7) +
      "vs target".padStart(11),
  );

  for (const d of DUNGEONS) {
    if (d.endless) continue;
    for (const [label, lv] of [["min", d.levelMin], ["max", d.levelMax]]) {
      const r = clearSeconds(d, lv, pace);
      const target = def.trashSec + def.bossSec;
      console.log(
        `  ${d.name}`.padEnd(26) +
          `${label} ${lv}`.padStart(6) +
          fmt(r.trashSec).padStart(7) +
          fmt(r.bossSec).padStart(7) +
          fmt(r.totalSec).padStart(7) +
          pct(r.totalSec, target).padStart(11),
      );
    }
  }
  console.log();
}

// The headline number: how much longer a first visit takes than the sign-off.
console.log("Ratio of first-visit (levelMin) to signed-off (levelMax) clear time:\n");
for (const d of DUNGEONS) {
  if (d.endless) continue;
  const atMin = clearSeconds(d, d.levelMin, "normal").totalSec;
  const atMax = clearSeconds(d, d.levelMax, "normal").totalSec;
  console.log(
    `  ${d.name}`.padEnd(26) +
      `lv ${d.levelMin}-${d.levelMax}`.padStart(10) +
      `${fmt(atMin)} vs ${fmt(atMax)}`.padStart(16) +
      `  ${(atMin / atMax).toFixed(2)}x`,
  );
}
