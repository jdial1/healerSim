import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStatBreakdown } from "../src/playerStats.js";
import { getTalents } from "../src/talents/index.js";
import { getSplitPairs } from "../src/talentSplitPairs.js";
import { testPalette } from "./testColors.js";
const CLASSES = ["PRIEST", "DRUID", "PALADIN"];
const LEVELS = [1, 10, 20, 25];
const C = testPalette();
function getMaxedTalents(cls) {
  const base = getTalents(cls).map((t) => ({ ...t, points: t.maxPoints }));
  const pairs = getSplitPairs(base);
  const bottomIds = new Set(pairs.map((p) => p.bottom.id));
  return base.map((t) => bottomIds.has(t.id) ? { ...t, points: 0 } : t);
}
function formatPct(val) {
  return `${val.toFixed(1)}%`;
}
function runClassTestCondensed() {
  const rows = [];
  for (const cls of CLASSES) {
    for (const lvl of LEVELS) {
      const baseStats = getStatBreakdown(cls, lvl, []);
      const maxTalents = getMaxedTalents(cls);
      const specStats = getStatBreakdown(cls, lvl, maxTalents);
      const healDiff = (specStats.healingEffectMultiplier / baseStats.healingEffectMultiplier - 1) * 100;
      rows.push(
        `${C.cyan}${cls}${C.r} ${C.dim}L${lvl}${C.r} ${C.dim}base${C.r} mana=${C.yellow}${Math.floor(baseStats.maxMana)}${C.r} heal%=${C.yellow}${formatPct(baseStats.totalHealingBonusPct)}${C.r} crit=${formatPct(baseStats.critChancePct)} haste=${formatPct(baseStats.hastePct)} int/spr=${baseStats.intellect}/${baseStats.spirit} ${C.dim}|${C.r} ${C.dim}spec${C.r} mana=${C.yellow}${Math.floor(specStats.maxMana)}${C.r} heal%=${C.green}${formatPct(specStats.totalHealingBonusPct)}${C.r} crit=${formatPct(specStats.critChancePct)} haste=${formatPct(specStats.hastePct)} ${C.dim}|${C.r} ${C.yellow}\u0394mana=${Math.round(specStats.maxMana - baseStats.maxMana)}${C.r} ${C.green}talentHeal+${healDiff.toFixed(1)}%${C.r}`
      );
    }
  }
  console.log(rows.join("\n"));
}
function runClassTest() {
  console.log("\u2696\uFE0F  Class Scaling & Talent Impact Analysis");
  console.log("Comparing [Base Stats] vs [Full Talent Ceiling]\n");
  for (const cls of CLASSES) {
    console.log(`${"=".repeat(80)}`);
    console.log(`\u{1F6E1}\uFE0F  CLASS: ${cls}`);
    console.log(`${"=".repeat(80)}`);
    console.log(
      `${"LVL".padEnd(4)} | ${"Mode".padEnd(8)} | ${"Mana".padEnd(6)} | ${"Heal %".padEnd(8)} | ${"Crit".padEnd(6)} | ${"Haste".padEnd(6)} | ${"Int/Spr"}`
    );
    console.log(`${"-".repeat(80)}`);
    for (const lvl of LEVELS) {
      const baseStats = getStatBreakdown(cls, lvl, []);
      const maxTalents = getMaxedTalents(cls);
      const specStats = getStatBreakdown(cls, lvl, maxTalents);
      console.log(
        `${lvl.toString().padEnd(4)} | ${"Base".padEnd(8)} | ${Math.floor(baseStats.maxMana).toString().padEnd(6)} | ${formatPct(baseStats.totalHealingBonusPct).padEnd(8)} | ${formatPct(baseStats.critChancePct).padEnd(6)} | ${formatPct(baseStats.hastePct).padEnd(6)} | ${baseStats.intellect}/${baseStats.spirit}`
      );
      console.log(
        `${"".padEnd(4)} | ${"Spec".padEnd(8)} | ${Math.floor(specStats.maxMana).toString().padEnd(6)} | ${formatPct(specStats.totalHealingBonusPct).padEnd(8)} | ${formatPct(specStats.critChancePct).padEnd(6)} | ${formatPct(specStats.hastePct).padEnd(6)} | Talent Gain: +${Math.round(specStats.maxMana - baseStats.maxMana)} Mana`
      );
      const healDiff = (specStats.healingEffectMultiplier / baseStats.healingEffectMultiplier - 1) * 100;
      console.log(
        `${"".padEnd(15)} \u{1F4C8} Talent Power Spike: +${healDiff.toFixed(1)}% total output`
      );
      console.log(`${"-".repeat(80)}`);
    }
    console.log("\n");
  }
}
const classEntry = process.argv[1];
const isClassMain = classEntry !== void 0 && path.resolve(classEntry) === fileURLToPath(import.meta.url);
if (isClassMain) {
  runClassTest();
}
export {
  runClassTest,
  runClassTestCondensed
};
