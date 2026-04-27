import { Buff, ClassType, GameState, Unit, Spell } from './types.ts';
import { findConsumableHotIndex } from './talentMechanics.ts';
import { directHealSynergyMultiplierFromIds, nextManaForSpellWithHooks } from './combatHooks.ts';
import { BALANCE } from './balance.ts';

export const T_SPIRIT_AMP = 10 * 10;

export const SHIELD_DEFAULT_TICKS = BALANCE.combat.shared.shieldDefaultTicks;

const SHARED = BALANCE.combat.shared;
const DRUID = BALANCE.combat.druid;

function hotPandemicCapMult(spell: Spell): number {
  return spell.balance?.hotPandemicDurationCapMult ?? SHARED.hotPandemicDurationCapMultDefault;
}

export function directHealSynergyMultiplier(unit: Unit, spellId: string): number {
  return directHealSynergyMultiplierFromIds(unit, spellId);
}

export function applyPandemicHotToUnit(
  unit: Unit,
  spell: Spell,
  healingPerTick: number,
  opts?: { hasteTickScale?: number; bloomBurstHeal?: number },
): Unit {
  const baseTicks = spell.hotDuration ?? 0;
  if (baseTicks <= 0) return unit;
  const capTicks = Math.max(baseTicks, Math.floor(baseTicks * hotPandemicCapMult(spell)));
  const existingIdx = unit.buffs.findIndex((b) => b.sourceSpellId === spell.id);
  let carried = 0;
  let kept = unit.buffs;
  if (existingIdx >= 0) {
    carried = unit.buffs[existingIdx].remainingTicks;
    kept = unit.buffs.filter((_, i) => i !== existingIdx);
  }
  const combined = Math.min(carried + baseTicks, capTicks);
  const scale = opts?.hasteTickScale ?? 1;
  const bloom =
    opts?.bloomBurstHeal ?? (spell.id === 'lifebloom' ? Math.max(0, spell.healing) : undefined);
  const buff: Buff = {
    id: spell.id,
    name: spell.name,
    remainingTicks: combined,
    healingPerTick,
    icon: spell.icon,
    sourceSpellId: spell.id,
    durationTicksMax: combined,
    tickIntervalScale: scale,
    tickAccumulator: 0,
    bloomBurstHeal: bloom && bloom > 0 ? bloom : undefined,
    rendersAsHoTRing: true,
  };
  return { ...unit, buffs: [...kept, buff] };
}

export function nextManaForSpell(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  return nextManaForSpellWithHooks(s, classType, spell, spellId, surgeFree);
}

export function swiftmendCanApply(s: GameState, targetId: string): boolean {
  if (s.playerClass !== 'DRUID') return false;
  const u = s.party.find((x) => x.id === targetId);
  if (!u || u.health <= 0) return false;
  return findConsumableHotIndex(u, 'DRUID') >= 0;
}

export function resolveSwiftmend(
  s: GameState,
  classType: ClassType,
  targetId: string,
  healMult: number,
  critMod: number,
  spell: Spell,
): { party: Unit[]; applied: boolean } {
  if (classType !== 'DRUID') return { party: s.party, applied: false };
  const p = s.party.map((u) => ({ ...u, buffs: [...u.buffs] }));
  const idx = p.findIndex((u) => u.id === targetId);
  if (idx < 0) return { party: s.party, applied: false };
  const u = p[idx];
  if (u.health <= 0) return { party: s.party, applied: false };
  const hotIdx = findConsumableHotIndex(u, 'DRUID');
  if (hotIdx < 0) {
    return { party: s.party, applied: false };
  }
  u.buffs = u.buffs.filter((_, j) => j !== hotIdx);
  const h = Math.min(u.maxHealth, u.health + spell.healing * healMult * critMod);
  p[idx] = { ...u, health: h };
  return { party: p, applied: true };
}

export function oneHotTickDoubleRoll(photosynthPoints: number): boolean {
  if (photosynthPoints <= 0) return false;
  return Math.random() < photosynthPoints * DRUID.photosynthesisDoubleTickChancePerRank;
}
