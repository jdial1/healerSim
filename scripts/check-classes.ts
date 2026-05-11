import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStatBreakdown } from '../src/formulas';
import { ClassRegistry } from '../src/combat';
import { getSplitPairs } from '../src/pages/TalentPage';
import type { ClassType, Talent } from '../src/types';
import { testPalette } from './testColors';
import { getScriptDir } from './script-util';

// Group 4: Robust path resolution for ESM scripts (now using script-util)
const { __filename, __dirname } = getScriptDir(import.meta.url);

const CLASSES: ClassType[] = ['PRIEST', 'DRUID', 'PALADIN'];
const LEVELS = [1, 10, 20, 25];

const C = testPalette();

function getMaxedTalents(cls: ClassType): Talent[] {
  const base = ClassRegistry.getTalents(cls).map((t) => ({ ...t, points: t.maxPoints }));
  const pairs = getSplitPairs(base);
  const bottomIds = new Set(pairs.map((p) => p.bottom.id));
  return base.map((t) => (bottomIds.has(t.id) ? { ...t, points: 0 } : t));
}

function formatPct(val: number): string {
  return `${val.toFixed(1)}%`;
}

export function runClassTestCondensed(): void {
  const rows: string[] = [];
  for (const cls of CLASSES) {
    for (const lvl of LEVELS) {
      const baseStats = getStatBreakdown(cls, lvl, []);
      const maxTalents = getMaxedTalents(cls);
      const specStats = getStatBreakdown(cls, lvl, maxTalents);
      const healDiff =
        (specStats.healEffectMult / baseStats.healEffectMult - 1) * 100;
      rows.push(
        `${C.cyan}${cls}${C.r} ${C.dim}L${lvl}${C.r} ${C.dim}base${C.r} mana=${C.yellow}${Math.floor(baseStats.maxMana)}${C.r} heal%=${C.yellow}${formatPct(baseStats.totalHealBonusPct)}${C.r} crit=${formatPct(baseStats.critChancePct)} haste=${formatPct(baseStats.hastePct)} int/spr=${baseStats.intellect}/${baseStats.spirit} ${C.dim}|${C.r} ${C.dim}spec${C.r} mana=${C.yellow}${Math.floor(specStats.maxMana)}${C.r} heal%=${C.green}${formatPct(specStats.totalHealBonusPct)}${C.r} crit=${formatPct(specStats.critChancePct)} haste=${formatPct(specStats.hastePct)} ${C.dim}|${C.r} ${C.yellow}Δmana=${Math.round(specStats.maxMana - baseStats.maxMana)}${C.r} ${C.green}talentHeal+${healDiff.toFixed(1)}%${C.r}`,
      );
    }
  }
  console.log(rows.join('\n'));
}

export function runClassTest(): void {
  console.log('⚖️  Class Scaling & Talent Impact Analysis');
  console.log('Comparing [Base Stats] vs [Full Talent Ceiling]\n');

  for (const cls of CLASSES) {
    console.log(`${'='.repeat(80)}`);
    console.log(`🛡️  CLASS: ${cls}`);
    console.log(`${'='.repeat(80)}`);
    console.log(
      `${'LVL'.padEnd(4)} | ` +
        `${'Mode'.padEnd(8)} | ` +
        `${'Mana'.padEnd(6)} | ` +
        `${'Heal %'.padEnd(8)} | ` +
        `${'Crit'.padEnd(6)} | ` +
        `${'Haste'.padEnd(6)} | ` +
        `${'Int/Spr'}`,
    );
    console.log(`${'-'.repeat(80)}`);

    for (const lvl of LEVELS) {
      const baseStats = getStatBreakdown(cls, lvl, []);
      const maxTalents = getMaxedTalents(cls);
      const specStats = getStatBreakdown(cls, lvl, maxTalents);

      console.log(
        `${lvl.toString().padEnd(4)} | ` +
          `${'Base'.padEnd(8)} | ` +
          `${Math.floor(baseStats.maxMana).toString().padEnd(6)} | ` +
        `${formatPct(baseStats.totalHealBonusPct).padEnd(8)} | ` +
          `${formatPct(baseStats.critChancePct).padEnd(6)} | ` +
          `${formatPct(baseStats.hastePct).padEnd(6)} | ` +
          `${baseStats.intellect}/${baseStats.spirit}`,
      );

      console.log(
        `${''.padEnd(4)} | ` +
          `${'Spec'.padEnd(8)} | ` +
          `${Math.floor(specStats.maxMana).toString().padEnd(6)} | ` +
        `${formatPct(specStats.totalHealBonusPct).padEnd(8)} | ` +
          `${formatPct(specStats.critChancePct).padEnd(6)} | ` +
          `${formatPct(specStats.hastePct).padEnd(6)} | ` +
          `Talent Gain: +${Math.round(specStats.maxMana - baseStats.maxMana)} Mana`,
      );

      const healDiff =
        (specStats.healEffectMult / baseStats.healEffectMult - 1) * 100;
      console.log(
        `${''.padEnd(15)} 📈 Talent Power Spike: +${healDiff.toFixed(1)}% total output`,
      );
      console.log(`${'-'.repeat(80)}`);
    }
    console.log('\n');
  }
}

const thisFile = __filename;
const isClassMain =
  process.argv[1] !== undefined &&
  path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);

if (isClassMain) {
  runClassTest();
}
