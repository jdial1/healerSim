import type { FloatingCombatTextEntry, Unit } from './types.ts';

export const FLOATING_COMBAT_TEXT_LIFETIME_TICKS = 22;

export function pruneFloats(
  entries: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
): FloatingCombatTextEntry[] {
  return entries.filter((e) => e.expiresAtCombatTick > combatElapsedTicks);
}

export function diffFloats(
  before: Unit[],
  after: Unit[],
  healCrit: boolean,
): Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }> {
  const out: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }> = [];
  for (const au of after) {
    const bu = before.find((x) => x.id === au.id);
    if (!bu) continue;
    const dh = au.health - bu.health;
    const ds = au.shield - bu.shield;
    if (dh > 0) out.push({ unitId: au.id, amount: dh, kind: 'heal', crit: healCrit });
    if (ds > 0) out.push({ unitId: au.id, amount: ds, kind: 'absorb', crit: false });
  }
  return out;
}

export function appendFloatingCombatDrafts(
  pruned: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
  drafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>,
): FloatingCombatTextEntry[] {
  const exp = combatElapsedTicks + FLOATING_COMBAT_TEXT_LIFETIME_TICKS;
  const adds = drafts
    .filter((a) => a.amount > 0)
    .map((a, i) => ({
      id: `${combatElapsedTicks}-f${i}-${Math.random().toString(36).slice(2, 9)}`,
      unitId: a.unitId,
      amount: Math.round(a.amount),
      kind: a.kind,
      crit: a.crit,
      expiresAtCombatTick: exp,
    }));
  return [...pruned, ...adds];
}

export function mergeFloats(
  existing: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
  drafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>,
): FloatingCombatTextEntry[] {
  return appendFloatingCombatDrafts(
    pruneFloats(existing, combatElapsedTicks),
    combatElapsedTicks,
    drafts,
  );
}
