import { emptyGameBase, gameReducer, gameStateForClass } from '../src/gameEngineReducer.ts';
import { DUNGEONS } from '../src/dungeons/index.ts';
import {
  TICKS_PER_SECOND,
  generateRandomParty,
  dungeonPaceDpsMultiplier,
  bossCombatProfileForDungeon,
  bossDamageMultiplierForDifficulty,
  damageTakenMultiplierFromDungeonLevelGap,
  SPELLS,
  spellHasTag,
} from '../src/constants.ts';
import { computeMetaFromProgress } from '../src/gameStorage.ts';
import {
  allyMaxHealthForRoleAndLevel,
  spellHealingMultiplierFromProgress,
  talentCritChancePctFromTalents,
  talentHastePctFromTalents,
} from '../src/playerStats.ts';
import { runDamageTakenMultiplier } from '../src/combatHookRegistry.ts';
import type {
  BossCombatProfile,
  ClassType,
  Dungeon,
  DungeonPace,
  GameState,
  Talent,
  Unit,
} from '../src/types.ts';

const RUNS_PER_DUNGEON = 100;

const PACES: DungeonPace[] = ['fast', 'normal', 'slow'];

const PACE_TARGET_SEC: Record<DungeonPace, { trash: number; boss: number }> = {
  fast: { trash: 15, boss: 30 },
  normal: { trash: 20, boss: 40 },
  slow: { trash: 30, boss: 60 },
};

const TARGET_RATIO_TOLERANCE = 0.1;

const COLOR = process.stdout.isTTY
  ? { r: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' }
  : { r: '', dim: '', green: '', red: '', yellow: '' };

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function padEndVisible(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - stripAnsi(s).length));
}

function toneSec(actual: number, target: number): string {
  if (target <= 0) return COLOR.dim;
  const ratio = actual / target;
  const lo = 1 - TARGET_RATIO_TOLERANCE;
  const hi = 1 + TARGET_RATIO_TOLERANCE;
  if (ratio >= lo && ratio <= hi) return COLOR.green;
  if (ratio < lo) return COLOR.yellow;
  return COLOR.red;
}

function fmtSecVsTarget(actual: number, target: number, padWidth: number): string {
  const body = `${actual.toFixed(2)}s`;
  const colored = `${toneSec(actual, target)}${body}${COLOR.r}`;
  return padWidth > 0 ? padEndVisible(colored, padWidth) : colored;
}

function fmtIntSecOffTotal(actual: number, target: number, padWidth: number): string {
  if (target <= 0) {
    const plain = 'n/a';
    return padWidth > 0 ? padEndVisible(plain, padWidth) : plain;
  }
  const delta = Math.round(actual - target);
  const sign = delta >= 0 ? '+' : '';
  const body = `${sign}${delta}s`;
  const colored = `${toneSec(actual, target)}${body}${COLOR.r}`;
  return padWidth > 0 ? padEndVisible(colored, padWidth) : colored;
}

function fmtPctOffTotal(actual: number, target: number, padWidth: number): string {
  if (target <= 0) {
    const plain = 'n/a';
    return padWidth > 0 ? padEndVisible(plain, padWidth) : plain;
  }
  const pct = ((actual - target) / target) * 100;
  const sign = pct >= 0 ? '+' : '';
  const body = `${sign}${pct.toFixed(1)}%`;
  const colored = `${toneSec(actual, target)}${body}${COLOR.r}`;
  return padWidth > 0 ? padEndVisible(colored, padWidth) : colored;
}

function fmtStdSec(sigma: number, padWidth: number): string {
  const body = `${sigma.toFixed(3)}s`;
  return padWidth > 0 ? padEndVisible(body, padWidth) : body;
}

function sampleStdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
}

function expectedTrashTotalSec(pace: DungeonPace): number {
  return PACE_TARGET_SEC[pace].trash;
}

function expectedBossSec(pace: DungeonPace): number {
  return PACE_TARGET_SEC[pace].boss;
}

function expectedTotalSec(pace: DungeonPace): number {
  return expectedTrashTotalSec(pace) + expectedBossSec(pace);
}

interface RunResult {
  trashSec: number;
  bossSec: number;
  totalSec: number;
}

async function runSimulation(dungeon: Dungeon, pace: DungeonPace): Promise<RunResult> {
  let state: GameState = gameStateForClass('PRIEST', undefined);
  const noTalents = state.talents.map((t) => ({ ...t, points: 0 }));
  const meta = computeMetaFromProgress(state.xp, 'PRIEST', noTalents);
  state = {
    ...state,
    ...meta,
    party: generateRandomParty(meta.level, 'PRIEST'),
  };
  state.level = dungeon.levelMax;
  state.party = generateRandomParty(dungeon.levelMax, 'PRIEST');

  state = gameReducer(state, { type: 'START_DUNGEON', dungeon, pace });

  const GOD_HP = 999999;
  state.party = state.party.map((u: Unit) => ({ ...u, maxHealth: GOD_HP, health: GOD_HP }));

  let trashTicks = 0;
  let bossTicks = 0;
  let safetyLimit = 0;

  while (state.isCombatActive && safetyLimit < 100000) {
    safetyLimit++;

    const currentPhase = state.combatPhase;

    state = gameReducer(state, {
      type: 'TICK',
      random: Math.random,
      now: Date.now(),
      dpsMultiplier: dungeonPaceDpsMultiplier(pace),
    });

    if (currentPhase === 'TRASH') {
      trashTicks++;
    } else {
      bossTicks++;
    }

    state.party = state.party.map((u: Unit) => ({ ...u, health: GOD_HP }));
  }

  return {
    trashSec: trashTicks / TICKS_PER_SECOND,
    bossSec: bossTicks / TICKS_PER_SECOND,
    totalSec: (trashTicks + bossTicks) / TICKS_PER_SECOND,
  };
}

function summarizeRuns(runs: RunResult[]): {
  trashSec: number;
  bossSec: number;
  totalSec: number;
  trashStd: number;
  bossStd: number;
  totalStd: number;
} {
  const n = runs.length;
  if (n === 0) {
    return { trashSec: 0, bossSec: 0, totalSec: 0, trashStd: 0, bossStd: 0, totalStd: 0 };
  }
  const trashSec = runs.reduce((a, b) => a + b.trashSec, 0) / n;
  const bossSec = runs.reduce((a, b) => a + b.bossSec, 0) / n;
  const totalSec = runs.reduce((a, b) => a + b.totalSec, 0) / n;
  return {
    trashSec,
    bossSec,
    totalSec,
    trashStd: sampleStdDev(runs.map((r) => r.trashSec)),
    bossStd: sampleStdDev(runs.map((r) => r.bossSec)),
    totalStd: sampleStdDev(runs.map((r) => r.totalSec)),
  };
}

const MIN_HEAL_GCD_TICKS = 10;

const REALISTIC_HPS_SPELL_IDS: Record<ClassType, string[]> = {
  PRIEST: ['flash_heal', 'greater_heal', 'renew'],
  DRUID: ['rejuvenation', 'regrowth', 'healing_touch', 'lifebloom'],
  PALADIN: ['flash_heal', 'holy_light'],
};

const AMBIENT_WOUND_FACTOR = 0.166;
const OCCASIONAL_COH_HPS = 0.28;
const OCCASIONAL_WG_HPS = 0.24;
const OCCASIONAL_LOD_HPS = 0.2;

function synergyDirectMult(spellId: string): number {
  if (!spellHasTag(spellId, 'synergy-direct')) return 1;
  const m = SPELLS[spellId]?.balance?.directHealSynergyMultiplier;
  return m !== undefined ? m : 1.15;
}

function shellStateForDamageTaken(): GameState {
  const b = emptyGameBase();
  return { ...b, playerClass: 'PRIEST', talents: [], party: b.party };
}

function expectedAttackTargetCount(targeting: 'single_random' | 'all_living' | 'two_random'): number {
  if (targeting === 'all_living') return 5;
  if (targeting === 'two_random') return 2;
  return 1;
}

function bossMechanicKindCount(profile: BossCombatProfile): number {
  let n = 0;
  if (profile.debuffTemplates.length > 0) n += 1;
  if (profile.selfBuffTemplates.length > 0) n += 1;
  if (profile.attackTemplates.length > 0) n += 1;
  return n;
}

function maxSelfBuffPartyDamageMult(profile: BossCombatProfile): number {
  let m = 1;
  for (const t of profile.selfBuffTemplates) {
    m = Math.max(m, t.partyDamageMultiplier);
  }
  return m;
}

function totalHealPerCast(spellId: string, cls: ClassType, level: number, talents: Talent[]): number {
  const sp = SPELLS[spellId];
  if (!sp || spellId === 'mana_potion') return 0;
  const mult = spellHealingMultiplierFromProgress(cls, level, talents);
  const syn = synergyDirectMult(spellId);
  const critPct = talentCritChancePctFromTalents(talents);
  const critM = 1 + (critPct / 100) * 0.5;
  const direct = sp.healing * mult * syn * critM;
  const hotTicks = sp.hotDuration ?? 0;
  const hotHeal = (sp.hotHealingPerTick ?? 0) * hotTicks * mult * critM;
  let total = direct + hotHeal;
  if (sp.type === 'AOE') total *= 5;
  return total;
}

function castIntervalSec(spellId: string, _cls: ClassType, talents: Talent[]): number {
  const sp = SPELLS[spellId];
  if (!sp) return 1;
  const h = talentHastePctFromTalents(talents);
  const cdTicks = Math.max(
    MIN_HEAL_GCD_TICKS,
    Math.round(sp.cooldown * (1 - h / 100)),
  );
  return cdTicks / TICKS_PER_SECOND;
}

function spellSustainHps(spellId: string, cls: ClassType, level: number, talents: Talent[]): number {
  const h = totalHealPerCast(spellId, cls, level, talents);
  const t = castIntervalSec(spellId, cls, talents);
  return t > 0 ? h / t : 0;
}

function realisticBarHpsForClass(cls: ClassType, level: number, talents: Talent[]): number {
  let best = 0;
  for (const id of REALISTIC_HPS_SPELL_IDS[cls]) {
    best = Math.max(best, spellSustainHps(id, cls, level, talents));
  }
  if (cls === 'PRIEST') {
    best += spellSustainHps('circle_of_healing', cls, level, talents) * OCCASIONAL_COH_HPS;
  } else if (cls === 'DRUID') {
    best += spellSustainHps('wild_growth', cls, level, talents) * OCCASIONAL_WG_HPS;
  } else {
    best += spellSustainHps('light_of_dawn', cls, level, talents) * OCCASIONAL_LOD_HPS;
  }
  return best;
}

function estimateAmbientBossPartyChipDpsRaw(
  dungeon: Dungeon,
  memberLevel: number,
  partyBuffMult: number,
): number {
  const D = dungeon.difficulty;
  const expectedRawPerTick = 0.4 * (4 + D) + 4 * 0.1 * (2.5 + D);
  const diffMult = bossDamageMultiplierForDifficulty(dungeon.difficulty);
  const gap = damageTakenMultiplierFromDungeonLevelGap(memberLevel, dungeon.levelMax);
  const shell = shellStateForDamageTaken();
  const dmgTakenMult = runDamageTakenMultiplier(shell, { source: 'trash_tick' });
  const scaledPerTick = expectedRawPerTick * diffMult * partyBuffMult * gap * dmgTakenMult;
  return scaledPerTick * TICKS_PER_SECOND;
}

function estimateBossMechanicalPartyDps(dungeon: Dungeon, profile: BossCombatProfile, memberLevel: number): number {
  const nKinds = bossMechanicKindCount(profile);
  const avgSec =
    ((profile.mechanicIntervalTicksMin + profile.mechanicIntervalTicksMax) / 2) / TICKS_PER_SECOND;
  if (nKinds === 0 || avgSec <= 0) return 0;
  const mechPerSec = 1 / avgSec;
  const partyBuff = maxSelfBuffPartyDamageMult(profile);
  const diffMult = bossDamageMultiplierForDifficulty(dungeon.difficulty);
  const gap = damageTakenMultiplierFromDungeonLevelGap(memberLevel, dungeon.levelMax);
  const dmgTakenMult = runDamageTakenMultiplier(shellStateForDamageTaken(), { source: 'boss_attack' });
  const atkShare = profile.attackTemplates.length > 0 ? 1 / nKinds : 0;
  let atkMean = 0;
  for (const a of profile.attackTemplates) {
    const scaled = a.damage * diffMult * partyBuff * gap * dmgTakenMult;
    atkMean += scaled * expectedAttackTargetCount(a.targeting);
  }
  if (profile.attackTemplates.length > 0) atkMean /= profile.attackTemplates.length;
  const attackDps = atkShare * mechPerSec * atkMean;

  let dotDps = 0;
  if (profile.debuffTemplates.length > 0) {
    for (const d of profile.debuffTemplates) {
      dotDps += d.damagePerTick * expectedAttackTargetCount(d.targeting) * gap * TICKS_PER_SECOND;
    }
    dotDps /= profile.debuffTemplates.length;
    const avgDurSec =
      profile.debuffTemplates.reduce((a, d) => a + d.durationTicks, 0) /
      profile.debuffTemplates.length /
      TICKS_PER_SECOND;
    const dotUptime = Math.min(1, avgDurSec / (nKinds * avgSec));
    dotDps *= dotUptime;
  }

  return attackDps + dotDps;
}

function scaledBossAttackHit(
  dungeon: Dungeon,
  damage: number,
  partyDmgMult: number,
  memberLevel: number,
): number {
  const gap = damageTakenMultiplierFromDungeonLevelGap(memberLevel, dungeon.levelMax);
  const dmgTakenMult = runDamageTakenMultiplier(shellStateForDamageTaken(), { source: 'boss_attack' });
  return damage * bossDamageMultiplierForDifficulty(dungeon.difficulty) * partyDmgMult * gap * dmgTakenMult;
}

function printBossVsHealerHpsOverlap(): void {
  console.log(`${'='.repeat(70)}`);
  console.log('HPS vs boss party damage pressure (level = dungeon min, no talents)');
  console.log(
    `${COLOR.dim}Boss: mechanics + ambient chip (same EV as game tick: tank 40%×U[0,8]+D, others 10%×U[0,5]+D each tick). Ambient ×${AMBIENT_WOUND_FACTOR} = modeled triage load (overlap, HoTs, not every chip needs a direct heal). Healer bar: max non-AOE sustain HPS + occasional AoE (${OCCASIONAL_COH_HPS}×CoH / ${OCCASIONAL_WG_HPS}×WG / ${OCCASIONAL_LOD_HPS}×LoD HPS).${COLOR.r}`,
  );
  console.log(
    `${COLOR.dim}Paladin bar is not comparable to Priest/Druid on this screen: no Beacon echo, no Devotion damage taken, no injured-target Radiance multiplier (all applied in-game, several talent-gated).${COLOR.r}`,
  );
  console.log(`${'='.repeat(70)}`);
  const emptyTalents: Talent[] = [];
  for (const dungeon of DUNGEONS) {
    const profile = bossCombatProfileForDungeon(dungeon);
    if (
      profile.attackTemplates.length === 0 &&
      profile.debuffTemplates.length === 0 &&
      profile.selfBuffTemplates.length === 0
    ) {
      continue;
    }
    const lv = dungeon.levelMin;
    const partyBuff = maxSelfBuffPartyDamageMult(profile);
    const mech = estimateBossMechanicalPartyDps(dungeon, profile, lv);
    const ambRaw = estimateAmbientBossPartyChipDpsRaw(dungeon, lv, partyBuff);
    const ambEff = ambRaw * AMBIENT_WOUND_FACTOR;
    const bossDps = mech + ambEff;
    if (bossDps <= 0) continue;
    console.log(
      `${dungeon.name} (Lv ${lv}-${dungeon.levelMax}): pressure ~${bossDps.toFixed(1)} / s ` +
        `${COLOR.dim}(mech ~${mech.toFixed(1)} + ambient eff ~${ambEff.toFixed(1)}, raw ~${ambRaw.toFixed(1)})${COLOR.r}`,
    );
    for (const cls of ['PRIEST', 'DRUID', 'PALADIN'] as ClassType[]) {
      const barHps = realisticBarHpsForClass(cls, lv, emptyTalents);
      const margin = barHps - bossDps;
      const tag =
        margin >= 0
          ? `${COLOR.green}Clearable margin +${margin.toFixed(1)}${COLOR.r}`
          : `${COLOR.red}Pressure −${Math.abs(margin).toFixed(1)}${COLOR.r}`;
      console.log(`  ${cls} realistic bar HPS ~${barHps.toFixed(1)}  |  ${tag}`);
    }
    console.log('');
  }
}

function printOneshotSpikeOverlap(): void {
  console.log(`${'='.repeat(70)}`);
  console.log('One-shot spike check (boss attacks vs DPS HP at dungeon min level)');
  console.log(
    `${COLOR.dim}Uses attackTemplates × difficulty × max self-buff party mult; crits add ~50% more in-game.${COLOR.r}`,
  );
  console.log(`${'='.repeat(70)}`);
  const dpsHp = (lv: number) => allyMaxHealthForRoleAndLevel('DPS', lv);
  for (const dungeon of DUNGEONS) {
    const profile = bossCombatProfileForDungeon(dungeon);
    if (profile.attackTemplates.length === 0) continue;
    const partyMult = maxSelfBuffPartyDamageMult(profile);
    const lv = dungeon.levelMin;
    const hp = dpsHp(lv);
    for (const atk of profile.attackTemplates) {
      const raw = scaledBossAttackHit(dungeon, atk.damage, partyMult, lv);
      const pct = hp > 0 ? (raw / hp) * 100 : 0;
      const warn =
        pct >= 95
          ? `${COLOR.red}WARNING ${pct.toFixed(0)}% of DPS max HP${COLOR.r}`
          : `${COLOR.green}~${pct.toFixed(0)}% of DPS max HP${COLOR.r}`;
      console.log(
        `${dungeon.bossName} — ${atk.name}: ~${raw.toFixed(0)} vs Lv ${lv} DPS ${hp} HP  (${warn})`,
      );
    }
  }
  console.log('');
}

async function main() {
  console.log(
    `Dungeon phase test — PRIEST, no talents (${RUNS_PER_DUNGEON} runs per dungeon per pace)\n`,
  );
  if (process.stdout.isTTY) {
    const pct = Math.round(TARGET_RATIO_TOLERANCE * 100);
    console.log(
      `${COLOR.dim}Timing vs UI targets:${COLOR.r} ${COLOR.green}within ±${pct}%${COLOR.r} · ${COLOR.yellow}faster than −${pct}%${COLOR.r} · ${COLOR.red}slower than +${pct}%${COLOR.r}\n`,
    );
  }

  const results: Record<string, Record<DungeonPace, RunResult[]>> = {};
  for (const dungeon of DUNGEONS) {
    results[dungeon.id] = { fast: [], normal: [], slow: [] };
  }

  for (const pace of PACES) {
    const tgt = PACE_TARGET_SEC[pace];
    console.log(`${'='.repeat(70)}`);
    console.log(
      `${pace.toUpperCase()} — target total ~${tgt.trash + tgt.boss}s (trash all pulls ~${tgt.trash}s, boss ~${tgt.boss}s) (${RUNS_PER_DUNGEON} runs each)`,
    );
    console.log(`${'='.repeat(70)}`);

    for (const dungeon of DUNGEONS) {
      process.stdout.write(`  ${dungeon.name} … `);
      for (let i = 0; i < RUNS_PER_DUNGEON; i++) {
        const run = await runSimulation(dungeon, pace);
        results[dungeon.id][pace].push(run);
      }
      const s = summarizeRuns(results[dungeon.id][pace]);
      const tTrash = expectedTrashTotalSec(pace);
      const tBoss = expectedBossSec(pace);
      const tTotal = expectedTotalSec(pace);
      console.log(
        `avg ${fmtSecVsTarget(s.totalSec, tTotal, 10)} (${COLOR.dim}trash${COLOR.r} ${fmtSecVsTarget(s.trashSec, tTrash, 0)} ${COLOR.dim}/${COLOR.r} ${COLOR.dim}boss${COLOR.r} ${fmtSecVsTarget(s.bossSec, tBoss, 0)})`,
      );
    }
    console.log('');
  }

  console.log(`${'='.repeat(70)}`);
  console.log(`COMBINED AVERAGES (${RUNS_PER_DUNGEON} runs each dungeon × pace)`);
  console.log(`${'='.repeat(70)}`);
  console.log(
    `${'Pace'.padEnd(8)} | ${'Dungeon'.padEnd(22)} | ${'Trash'.padEnd(10)} | ${'Boss'.padEnd(10)} | ${'Total'.padEnd(10)} | ${'σ trash'.padEnd(9)} | ${'σ boss'.padEnd(9)} | ${'σ total'.padEnd(9)} | ${'s off total'.padEnd(10)} | ${'% off total'.padEnd(12)}`,
  );
  console.log(
    `${'-'.repeat(8)}-+-${'-'.repeat(22)}-+-${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(9)}-+-${'-'.repeat(9)}-+-${'-'.repeat(9)}-+-${'-'.repeat(10)}-+-${'-'.repeat(12)}`,
  );

  for (const pace of PACES) {
    const tTrash = expectedTrashTotalSec(pace);
    const tBoss = expectedBossSec(pace);
    const tTotal = expectedTotalSec(pace);
    for (const dungeon of DUNGEONS) {
      const s = summarizeRuns(results[dungeon.id][pace]);
      console.log(
        `${pace.padEnd(8)} | ${dungeon.name.padEnd(22)} | ` +
          `${fmtSecVsTarget(s.trashSec, tTrash, 10)} | ` +
          `${fmtSecVsTarget(s.bossSec, tBoss, 10)} | ` +
          `${fmtSecVsTarget(s.totalSec, tTotal, 10)} | ` +
          `${fmtStdSec(s.trashStd, 9)} | ` +
          `${fmtStdSec(s.bossStd, 9)} | ` +
          `${fmtStdSec(s.totalStd, 9)} | ` +
          `${fmtIntSecOffTotal(s.totalSec, tTotal, 10)} | ` +
          `${fmtPctOffTotal(s.totalSec, tTotal, 12)}`,
      );
    }
  }
  printBossVsHealerHpsOverlap();
  printOneshotSpikeOverlap();
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(console.error);
