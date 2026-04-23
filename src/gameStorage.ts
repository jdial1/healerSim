/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, GameState, Talent } from './types.ts';
import { PRIEST_TALENTS, DRUID_TALENTS, PALADIN_TALENTS } from './constants.ts';

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
  const level = Math.floor(xp / 200) + 1;
  const pool = 5 + (level - 1);
  const spent = talents.reduce((acc, t) => acc + t.points * t.cost, 0);
  const talentPoints = Math.max(0, pool - spent);
  const maxMana = 100 + talents.reduce((acc, t) => acc + (t.statBonus?.manaPool ?? 0) * t.points, 0);
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
