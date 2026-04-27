import { gameReducer, gameStateForClass } from '../src/gameEngineReducer.ts';
import { DUNGEONS } from '../src/dungeons/index.ts';
import { TICKS_PER_SECOND, generateRandomParty } from '../src/constants.ts';
import { computeMetaFromProgress } from '../src/gameStorage.ts';
import type { Dungeon, GameState, Unit } from '../src/types.ts';

const RUNS_PER_DUNGEON = 10;

interface RunResult {
  trashSec: number;
  bossSec: number;
  totalSec: number;
}

async function runSimulation(dungeon: Dungeon): Promise<RunResult> {
  let state: GameState = gameStateForClass('PRIEST', undefined);
  const noTalents = state.talents.map((t) => ({ ...t, points: 0 }));
  const meta = computeMetaFromProgress(state.xp, 'PRIEST', noTalents);
  state = {
    ...state,
    ...meta,
    party: generateRandomParty(meta.level, 'PRIEST'),
  };
  state.level = dungeon.levelMax;

  state = gameReducer(state, { type: 'START_DUNGEON', dungeon });

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

function avgRuns(runs: RunResult[]): { trashSec: number; bossSec: number; totalSec: number } {
  const n = runs.length;
  return {
    trashSec: runs.reduce((a, b) => a + b.trashSec, 0) / n,
    bossSec: runs.reduce((a, b) => a + b.bossSec, 0) / n,
    totalSec: runs.reduce((a, b) => a + b.totalSec, 0) / n,
  };
}

function fmtCell(seconds: number, width: number): string {
  return `${seconds.toFixed(2)}s`.padEnd(width);
}

async function main() {
  console.log('🚀 Dungeon phase test — PRIEST, no talents (10 runs per dungeon)');

  const results: Record<string, RunResult[]> = {};

  for (const dungeon of DUNGEONS) {
    console.log(`\n🏰 ${dungeon.name}`);
    results[dungeon.id] = [];
    process.stdout.write('  runs … ');
    for (let i = 0; i < RUNS_PER_DUNGEON; i++) {
      const run = await runSimulation(dungeon);
      results[dungeon.id].push(run);
    }
    const a = avgRuns(results[dungeon.id]);
    console.log(`avg ${fmtCell(a.totalSec, 10)} (trash ${a.trashSec.toFixed(1)}s / boss ${a.bossSec.toFixed(1)}s)`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 AVERAGES (10 runs each)');
  console.log(`${'='.repeat(70)}`);
  console.log(
    `${'Dungeon'.padEnd(22)} | ${'Trash'.padEnd(10)} | ${'Boss'.padEnd(10)} | ${'Total'.padEnd(10)}`,
  );
  console.log(`${'-'.repeat(22)}-+-${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(10)}`);

  for (const dungeon of DUNGEONS) {
    const a = avgRuns(results[dungeon.id]);
    console.log(
      `${dungeon.name.padEnd(22)} | ` +
        `${fmtCell(a.trashSec, 10)} | ` +
        `${fmtCell(a.bossSec, 10)} | ` +
        `${fmtCell(a.totalSec, 10)}`,
    );
  }
  console.log(`\n${'='.repeat(70)}\n`);
}

main().catch(console.error);
