/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, Dungeon, GameState, Talent } from './types.ts';
import {
  PRIEST_TALENTS,
  DRUID_TALENTS,
  PALADIN_TALENTS,
  dungeonBaseXp,
  dungeonXpTierMultiplier,
} from './constants.ts';
import { computedMaxMana } from './playerStats.ts';

const XP_BASE = 180;
const XP_GAMMA = 1.15;

function needXpToReachNextLevel(currentLevel: number): number {
  return Math.max(1, Math.round(XP_BASE * Math.pow(currentLevel, XP_GAMMA)));
}

export function totalXpToReachLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  let t = 0;
  for (let L = 1; L < targetLevel; L += 1) {
    t += needXpToReachNextLevel(L);
  }
  return t;
}

export function levelFromTotalXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = 1;
  let total = 0;
  for (;;) {
    const need = needXpToReachNextLevel(level);
    if (total + need > xp) break;
    total += need;
    level += 1;
  }
  return level;
}

export function xpProgressWithinLevel(xp: number): { into: number; needed: number } {
  const level = levelFromTotalXp(xp);
  const start = totalXpToReachLevel(level);
  const needed = needXpToReachNextLevel(level);
  return { into: Math.max(0, xp - start), needed };
}

export function computeDungeonXpGain(dungeon: Dungeon, playerLevel: number): number {
  const base = dungeonBaseXp(dungeon.difficulty);
  const tier = dungeonXpTierMultiplier(dungeon.difficulty);
  const levelsOver = Math.max(0, playerLevel - dungeon.levelMax);
  return Math.max(0, Math.round(base * tier * Math.pow(0.5, levelsOver)));
}

export function levelsOverDungeonMax(dungeon: Dungeon, playerLevel: number): number {
  return Math.max(0, playerLevel - dungeon.levelMax);
}

const STORAGE_KEY = 'healerSim.save.v1';

type SavedShape = {
  v: 1;
  xp: number;
  talentRanks: Record<string, number>;
  completedDungeonIds: string[];
  playerClass: ClassType | null;
};

function talentTreeTemplate(cls: ClassType): Talent[] {
  if (cls === ClassType.PRIEST) return PRIEST_TALENTS;
  if (cls === ClassType.DRUID) return DRUID_TALENTS;
  return PALADIN_TALENTS;
}

function starterSpells(cls: ClassType): string[] {
  if (cls === ClassType.PRIEST) return ['flash_heal', 'renew', 'mana_potion'];
  if (cls === ClassType.DRUID) return ['rejuvenation', 'regrowth', 'mana_potion'];
  return ['flash_heal', 'mana_potion'];
}

export function buildSpellLoadout(
  cls: ClassType | null,
  talents: Talent[],
): { unlockedSpells: string[]; activeActionBars: string[] } {
  if (!cls) return { unlockedSpells: [], activeActionBars: [] };
  const starter = starterSpells(cls);
  const extra: string[] = [];
  for (const t of talents) {
    if (t.spellId && t.points > 0 && !extra.includes(t.spellId)) extra.push(t.spellId);
  }
  const merged = [...starter];
  for (const id of extra) {
    if (!merged.includes(id)) merged.push(id);
  }
  return { unlockedSpells: merged, activeActionBars: merged };
}

export function mergeSavedTalentRanks(ranks: Record<string, number> | undefined, cls: ClassType | null): Talent[] {
  if (!cls) return [];
  return talentTreeTemplate(cls).map((t) => ({
    ...t,
    points: Math.min(t.maxPoints, Math.max(0, ranks?.[t.id] ?? 0)),
  }));
}

export function computeMetaFromProgress(
  xp: number,
  cls: ClassType | null,
  talents: Talent[],
): Pick<
  GameState,
  | 'xp'
  | 'level'
  | 'talentPoints'
  | 'talents'
  | 'unlockedSpells'
  | 'activeActionBars'
  | 'maxMana'
  | 'mana'
> {
  const level = levelFromTotalXp(xp);
  const pool = 5 + (level - 1);
  const spent = talents.reduce((acc, t) => acc + t.points * t.cost, 0);
  const talentPoints = Math.max(0, pool - spent);
  const maxMana = computedMaxMana(cls, level, talents);
  const { unlockedSpells, activeActionBars } = buildSpellLoadout(cls, talents);
  return {
    xp,
    level,
    talentPoints,
    talents,
    unlockedSpells,
    activeActionBars,
    maxMana,
    mana: maxMana,
  };
}

export function readStoredProgress(): Partial<GameState> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedShape;
    if (p.v !== 1) return null;
    const talents = mergeSavedTalentRanks(p.talentRanks, p.playerClass ?? null);
    const meta = computeMetaFromProgress(p.xp, p.playerClass ?? null, talents);
    return {
      ...meta,
      playerClass: p.playerClass ?? null,
      completedDungeonIds: Array.isArray(p.completedDungeonIds) ? p.completedDungeonIds : [],
    };
  } catch {
    return null;
  }
}

export function writeStoredProgress(state: GameState): void {
  if (typeof localStorage === 'undefined') return;
  const talentRanks: Record<string, number> = {};
  for (const t of state.talents) {
    talentRanks[t.id] = t.points;
  }
  const payload: SavedShape = {
    v: 1,
    xp: state.xp,
    talentRanks,
    completedDungeonIds: state.completedDungeonIds,
    playerClass: state.playerClass,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
