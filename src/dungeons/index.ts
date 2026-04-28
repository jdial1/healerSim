import type { Dungeon } from '../types.ts';
import dungeonsData from '../data/dungeons.json';
import { endlessCycleMultiplier } from '../constants.ts';

export const DUNGEONS = dungeonsData as Dungeon[];

export const ENDLESS_DUNGEON_ID = 'endless';

export function getEndlessTemplate(): Dungeon {
  const d = DUNGEONS.find((x) => x.id === ENDLESS_DUNGEON_ID);
  if (!d) throw new Error('endless dungeon missing');
  return d;
}

export function endlessBossPool(playerLevel: number): Dungeon[] {
  const core = DUNGEONS.filter((d) => !d.endless);
  const eligible = core.filter((d) => playerLevel >= d.levelMin);
  return eligible.length > 0 ? eligible : core;
}

export function buildEndlessWaveDungeon(
  endlessTemplate: Dungeon,
  bossSource: Dungeon,
  stacks: number,
): Dungeon {
  const m = endlessCycleMultiplier(stacks);
  return {
    ...endlessTemplate,
    bossName: bossSource.bossName,
    bossHealth: Math.max(1, Math.round(bossSource.bossHealth * m)),
    bossIcon: bossSource.bossIcon,
    bossCombat: bossSource.bossCombat,
    levelMin: bossSource.levelMin,
    levelMax: bossSource.levelMax,
    difficulty: 1,
    endless: true,
  };
}
