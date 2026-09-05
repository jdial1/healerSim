// Solves for partyDps constants that hold clear times near target across the
// whole game, measured at the level a dungeon is actually entered (levelMin).
//
// Run: node scripts/test-pacing-tune.js [targetTotalSecondsAtNormalPace]
import "../src/gameEngineReducer.js";
import { DUNGEONS } from "../src/data/index.js";
import { BALANCE, TRASH_PACK_COUNT, TICKS_PER_SECOND, getTrashMaxHealth } from "../src/constants.js";

const CORE = DUNGEONS.filter((d) => !d.endless);

/** Total health a run must chew through: three trash pulls plus the boss. */
function runHealth(d) {
  return getTrashMaxHealth(d) * TRASH_PACK_COUNT + d.bossHealth;
}

function secondsAt(d, level, base, exponent, mult, paceDps) {
  const perTick = (base + Math.pow(level, exponent) * mult) * paceDps;
  return runHealth(d) / perTick / TICKS_PER_SECOND;
}

/** Worst-case and spread matter more than the mean: consistency is the goal. */
function score(base, exponent, mult, target) {
  let worst = 0;
  let sum = 0;
  for (const d of CORE) {
    const s = secondsAt(d, d.levelMin, base, exponent, mult, 1);
    const err = Math.abs(s - target) / target;
    worst = Math.max(worst, err);
    sum += err;
  }
  return { worst, mean: sum / CORE.length };
}

const targetTotal = Number(process.argv[2] ?? 45);
const pd = BALANCE.partyDps;

console.log(`Tuning partyDps for a ${targetTotal}s normal-pace run, measured at levelMin.\n`);

const current = score(pd.base, pd.levelExponent, pd.levelMultiplier, targetTotal);
console.log(
  `current  base=${pd.base} exponent=${pd.levelExponent} multiplier=${pd.levelMultiplier}` +
    `  worst=${(current.worst * 100).toFixed(0)}%  mean=${(current.mean * 100).toFixed(0)}%`,
);

let best = null;
for (let base = 4; base <= 40; base += 0.5) {
  for (let exponent = 1.0; exponent <= 1.6; exponent += 0.05) {
    for (let mult = 0.5; mult <= 6; mult += 0.1) {
      const s = score(base, exponent, mult, targetTotal);
      if (best === null || s.worst < best.s.worst) best = { base, exponent, mult, s };
    }
  }
}

console.log(
  `tuned    base=${best.base} exponent=${best.exponent.toFixed(2)} multiplier=${best.mult.toFixed(1)}` +
    `  worst=${(best.s.worst * 100).toFixed(0)}%  mean=${(best.s.mean * 100).toFixed(0)}%\n`,
);

console.log("Per-dungeon clear time at levelMin (normal pace):\n");
console.log(
  "  dungeon".padEnd(26) + "lv".padStart(4) + "now".padStart(8) + "tuned".padStart(8) + "delta".padStart(9),
);
for (const d of CORE) {
  const now = secondsAt(d, d.levelMin, pd.base, pd.levelExponent, pd.levelMultiplier, 1);
  const next = secondsAt(d, d.levelMin, best.base, best.exponent, best.mult, 1);
  console.log(
    `  ${d.name}`.padEnd(26) +
      `${d.levelMin}`.padStart(4) +
      `${now.toFixed(0)}s`.padStart(8) +
      `${next.toFixed(0)}s`.padStart(8) +
      `${(((next - now) / now) * 100).toFixed(0)}%`.padStart(9),
  );
}

// Out-levelling should still feel faster, but not trivially so.
console.log("\nSame dungeons at levelMax (out-levelled), tuned:\n");
for (const d of CORE) {
  const next = secondsAt(d, d.levelMax, best.base, best.exponent, best.mult, 1);
  console.log(`  ${d.name}`.padEnd(26) + `${d.levelMax}`.padStart(4) + `${next.toFixed(0)}s`.padStart(8));
}
