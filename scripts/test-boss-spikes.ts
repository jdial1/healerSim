import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyGameBase } from '../src/gameEngineReducer.ts';
import { DUNGEONS } from '../src/dungeons/index.ts';
import {
  TICKS_PER_SECOND,
  bossCombatProfileForDungeon,
  generateRandomParty,
} from '../src/constants.ts';
import { advanceBossSpikeSimTick, type TickRandom } from '../src/gameTick.ts';
import {
  allyMaxHealthForRoleAndLevel,
  healerMaxHealthFromStats,
} from '../src/playerStats.ts';
import { cloneTalentsForClass } from '../src/talents/index.ts';
import {
  computeMetaFromProgress,
  totalXpToReachLevel,
} from '../src/gameStorage.ts';
import type { ClassType, Dungeon, GameState } from '../src/types.ts';
import { resetUnitStatus } from '../src/unitUtils.ts';
import { testPalette } from './testColors.ts';

const T = testPalette();

const TICKS_PER_DUNGEON = 10_000;
const EPISODE_TICKS = 200;
const EPISODES = Math.ceil(TICKS_PER_DUNGEON / EPISODE_TICKS);
const WINDOW_3S = 3 * TICKS_PER_SECOND;
const WINDOW_2S = 2 * TICKS_PER_SECOND;
const HP_BEEF_MULT = 1_000_000;

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIntInclusive(min: number, max: number, random: TickRandom): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function maxRollingSum(values: number[], window: number): number {
  if (values.length === 0 || window <= 0) return 0;
  const w = Math.min(window, values.length);
  let sum = 0;
  for (let i = 0; i < w; i += 1) sum += values[i]!;
  let max = sum;
  for (let i = w; i < values.length; i += 1) {
    sum += values[i]! - values[i - w]!;
    if (sum > max) max = sum;
  }
  return max;
}

function beefParty(party: GameState['party']): GameState['party'] {
  return party.map((u) => ({
    ...resetUnitStatus(u),
    maxHealth: Math.round(u.maxHealth * HP_BEEF_MULT),
    health: Math.round(u.health * HP_BEEF_MULT),
  }));
}

function partyFixedDungeonLevel(level: number, cls: ClassType): GameState['party'] {
  const raw = generateRandomParty(level, cls);
  return raw.map((u) => {
    const cleared = resetUnitStatus(u);
    if (u.role === 'TANK') {
      const hp = allyMaxHealthForRoleAndLevel('TANK', level);
      return { ...cleared, level, maxHealth: hp, health: hp };
    }
    if (u.role === 'DPS') {
      const hp = allyMaxHealthForRoleAndLevel('DPS', level);
      return { ...cleared, level, maxHealth: hp, health: hp };
    }
    const hp = healerMaxHealthFromStats(cls, level);
    return { ...cleared, level, maxHealth: hp, health: hp };
  });
}

function buildBossSpikeState(dungeon: Dungeon, episodeIndex: number): GameState {
  const allyLevel = dungeon.levelMax;
  const talents = cloneTalentsForClass('PRIEST');
  const xp = totalXpToReachLevel(allyLevel);
  const meta = computeMetaFromProgress(xp, 'PRIEST', talents);
  const party = beefParty(partyFixedDungeonLevel(allyLevel, 'PRIEST'));
  const prof = bossCombatProfileForDungeon(dungeon);
  const rng = mulberry32(episodeIndex * 0x9e3779b9 ^ dungeon.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const mechCd = randomIntInclusive(
    prof.mechanicIntervalTicksMin,
    prof.mechanicIntervalTicksMax,
    rng,
  );
  const base = emptyGameBase();
  return {
    ...base,
    ...meta,
    playerClass: 'PRIEST',
    talents,
    isCombatActive: true,
    combatPhase: 'BOSS',
    currentDungeon: dungeon,
    dungeonPace: 'normal',
    trashPullsRemaining: 0,
    enemyHealth: dungeon.bossHealth,
    enemyMaxHealth: dungeon.bossHealth,
    dungeonProgress: 75,
    party,
    bossSelfBuffs: [],
    bossMechanicCountdownTicks: mechCd,
    bossMechanicOrdinal: 0,
    playerCombatBuffs: [],
    internalCooldowns: {},
    capstoneForm: null,
    holyPower: 0,
    beaconTargetId: '1',
    dungeonOutcome: null,
    spellCooldowns: {},
  };
}

function lineForSpike(
  dungeon: Dungeon,
  max3s: number,
  max2s: number,
  tankMaxHp: number,
): string {
  const boss = dungeon.bossName;
  const tag =
    max3s >= tankMaxHp
      ? 'one-shot risk'
      : max3s >= tankMaxHp * 0.75
        ? 'CAUTION: Near lethal burst window'
        : 'Safe';
  const tagColored =
    max3s >= tankMaxHp
      ? `${T.red}${tag}${T.r}`
      : max3s >= tankMaxHp * 0.75
        ? `${T.yellow}${tag}${T.r}`
        : `${T.green}${tag}${T.r}`;
  return (
    `${T.cyan}[${dungeon.name}]${T.r} ${T.yellow}${boss}${T.r}: Max observed ${T.dim}3s${T.r} damage spike is ${T.magenta}${Math.round(max3s)}${T.r} (${T.dim}2s${T.r}: ${T.magenta}${Math.round(max2s)}${T.r}). (${T.dim}Tank max HP is${T.r} ${T.yellow}${tankMaxHp}${T.r}). ${tagColored}.`
  );
}

function runDungeonBossSpikes(dungeon: Dungeon): void {
  let globalMax3s = 0;
  let globalMax2s = 0;
  for (let ep = 0; ep < EPISODES; ep += 1) {
    let state = buildBossSpikeState(dungeon, ep);
    const rng = mulberry32(ep * 2654435761 + dungeon.name.length * 1315423911);
    const damages: number[] = [];
    for (let t = 0; t < EPISODE_TICKS; t += 1) {
      const step = advanceBossSpikeSimTick(state, rng, ep * EPISODE_TICKS + t);
      state = step.state;
      damages.push(step.tankDamageThisTick);
    }
    globalMax3s = Math.max(globalMax3s, maxRollingSum(damages, WINDOW_3S));
    globalMax2s = Math.max(globalMax2s, maxRollingSum(damages, WINDOW_2S));
  }
  const tankMaxHp = allyMaxHealthForRoleAndLevel('TANK', dungeon.levelMax);
  console.log(lineForSpike(dungeon, globalMax3s, globalMax2s, tankMaxHp));
}

export function runBossSpikesTest(): void {
  console.log(
    `${T.dim}Monte Carlo:${T.r} ${T.cyan}${TICKS_PER_DUNGEON}${T.r} boss ticks per dungeon ${T.dim}(${EPISODES}×${EPISODE_TICKS}, boss-only, no player heals). Rolling windows: 2s / 3s.${T.r}\n`,
  );
  for (const d of DUNGEONS) {
    const prof = bossCombatProfileForDungeon(d);
    if (
      prof.attackTemplates.length === 0 &&
      prof.debuffTemplates.length === 0 &&
      prof.selfBuffTemplates.length === 0
    ) {
      console.log(
        `${T.dim}[${d.name}]${T.r} ${T.yellow}${d.bossName}${T.r}: ${T.dim}No boss combat profile — skipped.${T.r}`,
      );
      continue;
    }
    runDungeonBossSpikes(d);
  }
}

const thisFile = fileURLToPath(import.meta.url);
const ranAsMain =
  process.argv[1] !== undefined &&
  path.normalize(path.resolve(process.argv[1])) === path.normalize(thisFile);
if (ranAsMain) {
  runBossSpikesTest();
}
