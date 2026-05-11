import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassRegistry } from '../src/combat';
import type { Talent } from '../src/types';
import { realisticBarHpsForClass } from './check-dungeons';
import { simulateSecondsToOom } from './check-spells';
import { testPalette } from './testColors';
import { getScriptDir } from './script-util';

// Group 4: Robust path resolution for ESM scripts (now using script-util)
const { __filename, __dirname } = getScriptDir(import.meta.url);

const T = testPalette();

const HEAL_IDS = ['p_r0c1', 'p_r1c1'] as const;
const CRIT_IDS = ['p_r0c3', 'p_r1c3'] as const;

function talentsHeal5(): Talent[] {
  const t = ClassRegistry.getTalents('PRIEST');
  return t.map((x) => {
    if (x.id === HEAL_IDS[0]) return { ...x, points: 3 };
    if (x.id === HEAL_IDS[1]) return { ...x, points: 2 };
    return { ...x, points: 0 };
  });
}

function talentsCrit5(): Talent[] {
  const t = ClassRegistry.getTalents('PRIEST');
  return t.map((x) => {
    if (x.id === CRIT_IDS[0]) return { ...x, points: 3 };
    if (x.id === CRIT_IDS[1]) return { ...x, points: 2 };
    return { ...x, points: 0 };
  });
}

function pctMoreManaSustain(critSec: number, healSec: number): number {
  if (healSec <= 0 || critSec <= 0) return 0;
  return ((critSec - healSec) / healSec) * 100;
}

export function runTalentRoiTest(): void {
  const h = talentsHeal5();
  const c = talentsCrit5();
  const L10 = 10;
  const capLevel = 25;
  const barH = realisticBarHpsForClass('PRIEST', L10, h);
  const barC = realisticBarHpsForClass('PRIEST', L10, c);
  const hpsDeltaPct = barH > 0 ? ((barH - barC) / barC) * 100 : 0;
  const proxyClear = hpsDeltaPct;
  const seed = 0xdecafbad;
  const oomH = simulateSecondsToOom('PRIEST', capLevel, h, ['flash_heal', 'renew'], seed, null);
  const oomC = simulateSecondsToOom('PRIEST', capLevel, c, ['flash_heal', 'renew'], seed, null);
  const sustainCritVsHeal = pctMoreManaSustain(oomC, oomH);

  const lineHps =
    proxyClear >= 0
      ? `${T.green}+Healing bar HPS ~${proxyClear.toFixed(1)}% vs +Crit at L${L10}${T.r}`
      : `${T.yellow}+Crit bar HPS edge ${Math.abs(proxyClear).toFixed(1)}% vs +Healing at L${L10}${T.r}`;
  const lineOom =
    sustainCritVsHeal >= 0
      ? `${T.green}+Crit OOM sustain +${sustainCritVsHeal.toFixed(1)}% vs +Healing at L${capLevel}${T.r} (${oomC.toFixed(0)}s vs ${oomH.toFixed(0)}s)`
      : `${T.cyan}+Healing OOM longer by ${Math.abs(sustainCritVsHeal).toFixed(1)}%${T.r} (${oomH.toFixed(0)}s vs ${oomC.toFixed(0)}s)`;

  console.log(
    `${T.dim}PRIEST 5pt:${T.r} ${T.cyan}Healing Focus I+III${T.r} ${T.dim}(3+2)${T.r} vs ${T.cyan}Critical Focus I+II${T.r} ${T.dim}(3+2)${T.r}.`,
  );
  console.log(`  ${T.dim}L${L10} sustain bar (realistic HPS proxy):${T.r} heal ${T.yellow}${barH.toFixed(1)}${T.r} vs crit ${T.yellow}${barC.toFixed(1)}${T.r}`);
  console.log(`  ${lineHps}`);
  console.log(`  ${T.dim}L${capLevel} OOM (Flash/Renew sim, same seed):${T.r} ${lineOom}`);
  const hpsEdge = Math.abs(proxyClear);
  const oomEdgeSec = Math.abs(oomC - oomH);
  const parity =
    hpsEdge >= 3 && oomEdgeSec >= 2
      ? `${T.green}distinct tradeoffs (bar HPS vs OOM horizon)${T.r}`
      : hpsEdge >= 3 && oomEdgeSec < 2
        ? `${T.yellow}healing leads bar HPS; OOM parity at this seed${T.r}`
        : `${T.yellow}review if one path dominates${T.r}`;
  console.log(`  ${T.dim}ROI:${T.r} ${parity}`);
}

const thisFile = __filename;
const ranAsMain =
  process.argv[1] !== undefined &&
  path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);
if (ranAsMain) {
  runTalentRoiTest();
}
