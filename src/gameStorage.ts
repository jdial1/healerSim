/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, Dungeon, GameState, Talent } from './types.ts';
import { PRIEST_TALENTS, DRUID_TALENTS, PALADIN_TALENTS } from './talents/index.ts';
import { dungeonBaseXp, dungeonXpTierMultiplier } from './constants.ts';
import { computedMaxMana } from './playerStats.ts';
import { classSpellOrder } from './talentMechanics.ts';

function nominalClearXpForDifficulty(difficulty: number): number {
  return Math.round(dungeonBaseXp(difficulty) * dungeonXpTierMultiplier(difficulty));
}

function needXpToReachNextLevel(currentLevel: number): number {
  const tier = Math.floor((currentLevel - 1) / 3);
  const runsInTier = ((currentLevel - 1) % 3) + 1;
  const perClear = nominalClearXpForDifficulty(tier + 1);
  return Math.max(1, perClear * runsInTier);
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
  actionBarSpellIds?: string[];
};

function spellIdMultisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const tally = new Map<string, number>();
  for (const id of a) tally.set(id, (tally.get(id) ?? 0) + 1);
  for (const id of b) {
    const n = (tally.get(id) ?? 0) - 1;
    if (n < 0) return false;
    tally.set(id, n);
  }
  return [...tally.values()].every((c) => c === 0);
}

function applySavedActionBarOrder(
  defaultBar: string[],
  saved: string[] | undefined,
): string[] {
  if (!saved || saved.length !== defaultBar.length) return defaultBar;
  if (!spellIdMultisetEqual(saved, defaultBar)) return defaultBar;
  return saved;
}

export function reconcileActionBarOrder(prev: string[], defaultBar: string[]): string[] {
  if (prev.length === defaultBar.length && spellIdMultisetEqual(prev, defaultBar)) return prev;
  return defaultBar;
}

function talentTreeTemplate(cls: ClassType): Talent[] {
  if (cls === ClassType.PRIEST) return PRIEST_TALENTS;
  if (cls === ClassType.DRUID) return DRUID_TALENTS;
  return PALADIN_TALENTS;
}

function starterSpells(cls: ClassType): string[] {
  if (cls === ClassType.PRIEST) return ['flash_heal', 'renew'];
  if (cls === ClassType.DRUID) return ['rejuvenation', 'regrowth'];
  return ['flash_heal'];
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
  const merged: string[] = [...starter];
  for (const id of extra) {
    if (!merged.includes(id)) merged.push(id);
  }
  const order = classSpellOrder(cls);
  const healRow: string[] = [];
  for (const id of order) {
    if (merged.includes(id) && healRow.length < 3 && !healRow.includes(id)) healRow.push(id);
  }
  for (const id of merged) {
    if (healRow.length >= 3) break;
    if (!healRow.includes(id)) healRow.push(id);
  }
  while (healRow.length < 3) {
    healRow.push('');
  }
  const activeActionBars: string[] = [healRow[0]!, healRow[1]!, healRow[2]!, 'mana_potion'];
  const unlockedSpells = ['mana_potion', ...merged].filter((x, i, a) => a.indexOf(x) === i);
  return { unlockedSpells, activeActionBars };
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
  const pool = level;
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
    const activeActionBars = applySavedActionBarOrder(
      meta.activeActionBars,
      Array.isArray(p.actionBarSpellIds) ? p.actionBarSpellIds : undefined,
    );
    return {
      ...meta,
      activeActionBars,
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
    actionBarSpellIds: state.activeActionBars,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
