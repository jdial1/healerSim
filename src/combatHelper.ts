import { Buff, ClassType, GameState, Unit, Spell, PartyDebuff } from './types.ts';
import { getConsumableHotIndex } from './talentMechanics.ts';
import { getManaCost as getManaCostRegistry } from './combatHookRegistry.ts';
import { BALANCE, SPELLS } from './data/index.ts';
import { spellHasTag } from './constants.ts';
import { getHealSplit } from './healMath.ts';

export const T_SPIRIT_AMP = 10 * 10;
export const SHIELD_DEFAULT_TICKS = BALANCE.combat.shared.shieldDefaultTicks;
const SHARED = BALANCE.combat.shared;
const DRUID = BALANCE.combat.druid;

/**
 * SHARED UTILITY: pandemic calculation for HoTs
 */
function hotPandemicCapMult(spell: Spell): number {
  return spell.balance?.hotPandemicDurationCapMult ?? SHARED.hotPandemicDurationCapMultDefault;
}

/**
 * SHARED UTILITY: helper for synergy bonuses
 * Moved from deleted combatHooks.ts
 */
export function getSynergyMultiplierByIds(unit: Unit, spellId: string): number {
  if (!spellHasTag(spellId, 'synergy-direct')) return 1;
  if (!unit.buffs.some((b) => spellHasTag(b.sourceSpellId, 'synergy-primer-source'))) return 1;
  const sp = SPELLS[spellId];
  return sp?.balance?.directHealSynergyMultiplier ?? SHARED.directHealSynergyMultiplierDefault;
}

function unitBuffIdMatch(b: Buff, spellId: string): boolean {
  return b.sourceSpellId === spellId || b.id === spellId;
}

export function getPartyBuffStacks(unit: Unit, spellId: string): number {
  const b = unit.buffs.find(
    (x) => unitBuffIdMatch(x, spellId) && (x.category ?? 'helpful') === 'helpful',
  );
  if (!b) return 0;
  if ((b.stacks ?? 0) > 0) return b.stacks!;
  return b.remainingTicks > 0 ? 1 : 0;
}

function debuffIdMatch(d: PartyDebuff, abilityId: string): boolean {
  return d.sourceAbilityId === abilityId || d.id === abilityId;
}

export function getPartyDebuffStacks(unit: Unit, abilityOrDebuffId: string): number {
  const d = unit.debuffs.find(
    (x) =>
      debuffIdMatch(x, abilityOrDebuffId) && (x.category ?? 'harmful') === 'harmful',
  );
  if (!d) return 0;
  return d.remainingTicks > 0 ? 1 : 0;
}

export function dispelOne(debuffs: PartyDebuff[]): PartyDebuff[] {
  const i = debuffs.findIndex(
    (d) =>
      (d.category ?? 'harmful') === 'harmful' && (d.isDispellable ?? d.dispellable),
  );
  if (i < 0) return debuffs;
  return debuffs.filter((_, j) => j !== i);
}

export function getSynergyMultiplier(unit: Unit, spellId: string): number {
  return getSynergyMultiplierByIds(unit, spellId);
}

/**
 * UNIT MUTATOR: Applies a HoT while respecting the Pandemic window
 */
export function applyHot(
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

/**
 * DELEGATOR: Calculates final mana cost using class hooks
 */
export function getManaCost(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  return getManaCostRegistry(s, classType, spell, spellId, surgeFree);
}

/**
 * SHARED LOGIC: swiftmend eligibility check
 */
export function canSwiftmend(s: GameState, targetId: string): boolean {
  if (s.playerClass !== 'DRUID') return false;
  const u = s.party.find((x) => x.id === targetId);
  if (!u || u.health <= 0) return false;
  return getConsumableHotIndex(u) >= 0;
}

/**
 * SHARED LOGIC: swiftmend resolution
 */
export function resolveSwiftmend(
  s: GameState,
  classType: ClassType,
  targetId: string,
  healMult: number,
  critMod: number,
  spell: Spell,
  rankHealMult: number,
): { party: Unit[]; applied: boolean; eff: number; oh: number } {
  if (classType !== 'DRUID') return { party: s.party, applied: false, eff: 0, oh: 0 };
  const p = s.party.map((u) => ({ ...u, buffs: [...u.buffs] }));
  const idx = p.findIndex((u) => u.id === targetId);
  if (idx < 0) return { party: s.party, applied: false, eff: 0, oh: 0 };
  const u = p[idx];
  if (u.health <= 0) return { party: s.party, applied: false, eff: 0, oh: 0 };
  
  const hotIdx = getConsumableHotIndex(u);
  if (hotIdx < 0) {
    return { party: s.party, applied: false, eff: 0, oh: 0 };
  }

  const raw = spell.healing * rankHealMult * healMult * critMod;
  const { eff, oh } = getHealSplit(u.health, u.maxHealth, raw);
  
  // Consume the HoT
  u.buffs = u.buffs.filter((_, j) => j !== hotIdx);
  const h = Math.min(u.maxHealth, u.health + raw);
  p[idx] = { ...u, health: h };
  
  return { party: p, applied: true, eff, oh };
}

export function isDoubleTick(photosynthPoints: number): boolean {
  if (photosynthPoints <= 0) return false;
  return Math.random() < photosynthPoints * DRUID.photosynthesisDoubleTickChancePerRank;
}