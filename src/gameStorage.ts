/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, Dungeon, GameState, Talent } from './types.ts';
import { PRIEST_TALENTS, DRUID_TALENTS, PALADIN_TALENTS } from './talents/index.ts';
import { dungeonBaseXp, dungeonXpTierMultiplier, TRASH_PACK_COUNT } from './constants.ts';
import balanceData from './data/balance.json';
import { computedMaxMana } from './playerStats.ts';
import { classSpellOrder, starterSpellsForClass } from './playerStats.ts';

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
  return Math.max(
    0,
    Math.round(base * tier * Math.pow(balanceData.xp.overlevelDiminishingBase, levelsOver)),
  );
}

export function dungeonFailureXpFraction(pullsCleared: number): number {
  const x = balanceData.xp;
  if (pullsCleared >= TRASH_PACK_COUNT) return x.failureFractionWhenAllTrashCleared;
  if (pullsCleared === 2) return x.failureFractionWhenTwoPullsCleared;
  if (pullsCleared === 1) return x.failureFractionWhenOnePullCleared;
  return 0;
}

export function computeDungeonFailureXpGain(
  dungeon: Dungeon,
  playerLevel: number,
  pullsCleared: number,
): number {
  const full = computeDungeonXpGain(dungeon, playerLevel);
  return Math.round(full * dungeonFailureXpFraction(pullsCleared));
}

export function levelsOverDungeonMax(dungeon: Dungeon, playerLevel: number): number {
  return Math.max(0, playerLevel - dungeon.levelMax);
}

const ROSTER_KEY = 'healerSim.roster.v2';
const LEGACY_SAVE_KEY = 'healerSim.save.v1';

export type SavedShape = {
  v: 1;
  xp: number;
  talentRanks: Record<string, number>;
  completedDungeonIds: string[];
  playerClass: ClassType | null;
  actionBarSpellIds?: string[];
};

export type RosterV2 = {
  v: 2;
  lastPlayedClass: ClassType | null;
  byClass: Partial<Record<ClassType, SavedShape>>;
};

function emptyRoster(): RosterV2 {
  return { v: 2, lastPlayedClass: null, byClass: {} };
}

export function readRoster(): RosterV2 {
  if (typeof localStorage === 'undefined') return emptyRoster();
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) {
      const r = JSON.parse(raw) as RosterV2;
      if (r.v === 2 && r.byClass && typeof r.byClass === 'object') {
        return {
          v: 2,
          lastPlayedClass: r.lastPlayedClass ?? null,
          byClass: { ...r.byClass },
        };
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacyRaw) {
      const p = JSON.parse(legacyRaw) as SavedShape;
      if (p.v === 1 && p.playerClass) {
        const migrated: RosterV2 = {
          v: 2,
          lastPlayedClass: p.playerClass,
          byClass: { [p.playerClass]: { ...p, playerClass: p.playerClass } },
        };
        writeRoster(migrated);
        return migrated;
      }
    }
  } catch {}
  return emptyRoster();
}

export function writeRoster(roster: RosterV2): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
}

export function maxLevelAcrossRoster(roster: RosterV2): number {
  let max = 1;
  for (const shape of Object.values(roster.byClass)) {
    if (!shape) continue;
    const L = levelFromTotalXp(shape.xp);
    if (L > max) max = L;
  }
  return max;
}

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
  if (cls === 'PRIEST') return PRIEST_TALENTS;
  if (cls === 'DRUID') return DRUID_TALENTS;
  return PALADIN_TALENTS;
}

export function buildSpellLoadout(
  cls: ClassType | null,
  talents: Talent[],
): { unlockedSpells: string[]; activeActionBars: string[] } {
  if (!cls) return { unlockedSpells: [], activeActionBars: [] };
  const starter = starterSpellsForClass(cls);
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

export function patchFromSavedShape(shape: SavedShape): Partial<GameState> | null {
  if (!shape.playerClass) return null;
  const cls = shape.playerClass;
  const talents = mergeSavedTalentRanks(shape.talentRanks, cls);
  const meta = computeMetaFromProgress(shape.xp, cls, talents);
  const activeActionBars = applySavedActionBarOrder(
    meta.activeActionBars,
    Array.isArray(shape.actionBarSpellIds) ? shape.actionBarSpellIds : undefined,
  );
  return {
    ...meta,
    activeActionBars,
    playerClass: cls,
    completedDungeonIds: Array.isArray(shape.completedDungeonIds) ? shape.completedDungeonIds : [],
  };
}

export function serializeCharacter(state: GameState): SavedShape | null {
  if (!state.playerClass) return null;
  const talentRanks: Record<string, number> = {};
  for (const t of state.talents) {
    talentRanks[t.id] = t.points;
  }
  return {
    v: 1,
    xp: state.xp,
    talentRanks,
    completedDungeonIds: state.completedDungeonIds,
    playerClass: state.playerClass,
    actionBarSpellIds: state.activeActionBars,
  };
}

export function mergeRosterWithCharacter(roster: RosterV2, state: GameState): RosterV2 {
  const blob = serializeCharacter(state);
  if (!blob) return roster;
  const cls = blob.playerClass;
  return {
    ...roster,
    byClass: { ...roster.byClass, [cls]: blob },
    lastPlayedClass: cls,
  };
}
