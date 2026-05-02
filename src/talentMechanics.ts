import { CapstoneFormId, ClassType, Talent, Unit, PlayerCombatBuff } from './types.ts';
import {
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  SPELL_TAG_DRUID_HOT,
  SPELL_TAG_SWIFTMEND_CONSUMABLE,
  SPELL_TAG_SWIFTMEND_PREFER,
  spellHasTag,
  TICKS_PER_SECOND,
} from './constants.ts';
import type { MechanicId } from './data/index.ts';
import { CLASS_PROGRESSION } from './playerStats.ts';

export const TICKS_1S = 10;
export const PLAYER_BUFF_MANA_REGEN_POTION = 'mana_regen_potion';
export const PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT = 'spirit_regen_lockout';
export const PLAYER_BUFF_POWER_INFUSION = 'power_infusion';
export const PLAYER_BUFF_NATURAL_PERFECTION = 'natural_perfection';

const PLAYER_COMBAT_BUFF_NO_TIME_DECAY = new Set([
  PLAYER_BUFF_POWER_INFUSION,
  PLAYER_BUFF_NATURAL_PERFECTION,
]);

export const TICKS_SPIRIT_REDEMPTION = 10 * TICKS_1S;
export const ICD_SPIRIT_REDEMPTION = 120 * TICKS_1S;
export const SURGE_OF_LIGHT_TICKS = 6 * TICKS_1S;
export const HEALER_UNIT_ID = '5';

const MENTAL_FORTITUDE_MANA_FRACTION_PER_5S = 0.01;


export function getGeneralManaReturn(
  maxMana: number,
  talents: Talent[],
  spiritRegenLockoutTicksRemaining: number,
): number {
  if (spiritRegenLockoutTicksRemaining > 0) return 0;

  // Search for the Meditative Wellspring mechanic regardless of class
  const t = talents.find((x) => x.mechanicId === 'priest_meditative_wellspring');
  if (!t || t.points < t.maxPoints) return 0;

  return (maxMana * MENTAL_FORTITUDE_MANA_FRACTION_PER_5S) / (5 * TICKS_PER_SECOND);
}

export function getRanks(talents: Talent[], mechanicId: MechanicId): number {
  return talents
    .filter((t) => t.mechanicId === mechanicId)
    .reduce((a, t) => a + t.points, 0);
}

export function hasTalent(talents: Talent[], mechanicId: MechanicId): boolean {
  return getRanks(talents, mechanicId) > 0;
}

export function exclusiveUnlock(talents: Talent[], learnId: string): Talent[] {
  const t = talents.find((x) => x.id === learnId);
  if (!t) return talents;
  const toClear = new Set(t.exclusiveWith ?? []);
  return talents.map((row) => {
    if (row.id === learnId) {
      return { ...row, points: row.points + 1 };
    }
    if (toClear.has(row.id)) {
      return { ...row, points: 0 };
    }
    return row;
  });
}

function buffIsActive(b: PlayerCombatBuff): boolean {
  if (PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id)) return b.stacks > 0;
  return b.remainingTicks > 0;
}

export function hasBuff(buffs: PlayerCombatBuff[], id: string): boolean {
  return buffs.some((b) => b.id === id && buffIsActive(b));
}

export function getBuffTicks(buffs: PlayerCombatBuff[], id: string): number {
  const b = buffs.find((x) => x.id === id);
  if (!b || PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(id)) return 0;
  return b.remainingTicks > 0 ? b.remainingTicks : 0;
}

export function getBuffStacks(buffs: PlayerCombatBuff[], id: string): number {
  const b = buffs.find((x) => x.id === id);
  if (!b || !buffIsActive(b)) return 0;
  return b.stacks;
}

export function getNaturalPerfectionStacks(buffs: PlayerCombatBuff[]): number {
  return getBuffStacks(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
}

/**
 * Uses CLASS_PROGRESSION metadata to dynamically determine if a capstone 
 * should remain active based on player buffs.
 */
export function getCapstoneAfterTick(
  form: CapstoneFormId | null,
  buffs: PlayerCombatBuff[],
  playerClass: ClassType | null
): CapstoneFormId | null {
  if (!form || !playerClass) return null;
  
  const config = CLASS_PROGRESSION[playerClass];
  // FIX: Cast both to string to avoid literal-type comparison errors
  if ((form as string) === (config.capstoneForm as string)) {
    return hasBuff(buffs, config.capstonePlayerBuffId) ? form : null;
  }
  
  return null;
}

export function addSpiritLockoutIfSpent(
  buffs: PlayerCombatBuff[],
  spentMana: boolean,
): PlayerCombatBuff[] {
  if (!spentMana) return buffs;
  return addBuff(buffs, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT, MANA_SPIRIT_REGEN_LOCKOUT_TICKS, 1);
}

export function addBuff(
  buffs: PlayerCombatBuff[],
  id: string,
  ticks: number,
  stacks: number,
  opts?: { potionDripPerTick?: number },
): PlayerCombatBuff[] {
  const i = buffs.findIndex((b) => b.id === id);
  const drip = opts?.potionDripPerTick;
  if (i < 0) {
    return [
      ...buffs,
      { id, remainingTicks: ticks, stacks, ...(drip !== undefined ? { potionDripPerTick: drip } : {}) },
    ];
  }
  const prev = buffs[i];
  const nextDrip = drip !== undefined ? drip : prev.potionDripPerTick;
  const next = [...buffs];
  next[i] = {
    id,
    remainingTicks: Math.max(ticks, prev.remainingTicks),
    stacks,
    ...(nextDrip !== undefined ? { potionDripPerTick: nextDrip } : {}),
  };
  return next;
}

export function getPotionDrip(buffs: PlayerCombatBuff[]): number {
  const b = buffs.find((x) => x.id === PLAYER_BUFF_MANA_REGEN_POTION);
  if (!b || b.remainingTicks <= 0) return 0;
  return b.potionDripPerTick ?? 0;
}

export function tickBuffs(buffs: PlayerCombatBuff[]): PlayerCombatBuff[] {
  return buffs
    .map((b) =>
      PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id) ? b : { ...b, remainingTicks: b.remainingTicks - 1 },
    )
    .filter(buffIsActive);
}

export function decrementBuff(buffs: PlayerCombatBuff[], id: string): PlayerCombatBuff[] {
  return buffs
    .map((b) => {
      if (b.id !== id) return b;
      if (b.stacks <= 1) return { ...b, remainingTicks: 0, stacks: 0 };
      return { ...b, stacks: b.stacks - 1 };
    })
    .filter((b) => b.remainingTicks > 0 && b.stacks > 0);
}

export function removeBuff(buffs: PlayerCombatBuff[], id: string): PlayerCombatBuff[] {
  return buffs.filter((b) => b.id !== id);
}

export function applyPiAfterCd(
  buffs: PlayerCombatBuff[],
  castsRemaining: number,
): PlayerCombatBuff[] {
  if (castsRemaining <= 0) return removeBuff(buffs, PLAYER_BUFF_POWER_INFUSION);
  return addBuff(buffs, PLAYER_BUFF_POWER_INFUSION, 1, castsRemaining);
}

export function addPiCharges(buffs: PlayerCombatBuff[], minCharges: number): PlayerCombatBuff[] {
  const cur = getBuffStacks(buffs, PLAYER_BUFF_POWER_INFUSION);
  return addBuff(buffs, PLAYER_BUFF_POWER_INFUSION, 1, Math.max(cur, minCharges));
}

export function addNaturalPerfection(buffs: PlayerCombatBuff[], stacks: number): PlayerCombatBuff[] {
  if (stacks <= 0) return removeBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
  return addBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION, 1, stacks);
}

export function isReady(icds: Record<string, number>, key: string): boolean {
  return (icds[key] ?? 0) <= 0;
}

export function getHealer(party: Unit[]): Unit | undefined {
  return party.find((u) => u.role === 'HEALER');
}

/**
 * Dynamic HoT detection using spell tags
 */
export function hasHot(unit: Unit): boolean {
  return unit.buffs.some((b) => 
    spellHasTag(b.sourceSpellId, SPELL_TAG_DRUID_HOT) || 
    spellHasTag(b.sourceSpellId, 'synergy-primer-source')
  );
}

/**
 * Dynamic consumable detection for Swiftmend-like mechanics
 */
export function getConsumableHotIndex(unit: Unit): number {
  const prefer = unit.buffs.findIndex((b) => spellHasTag(b.sourceSpellId, SPELL_TAG_SWIFTMEND_PREFER));
  if (prefer >= 0) return prefer;
  return unit.buffs.findIndex((b) => spellHasTag(b.sourceSpellId, SPELL_TAG_SWIFTMEND_CONSUMABLE));
}

export function isHeal(spell: { type: string }, spellId: string): boolean {
  if (spellId === 'mana_potion') return false;
  return spell.type === 'DIRECT' || spell.type === 'HOT' || spell.type === 'AOE';
}

export function isDirectHeal(spell: { type: string; healing: number; hotDuration?: number }, spellId: string): boolean {
  if (spellId === 'mana_potion') return false;
  if (spell.type === 'AOE' || spell.type === 'DIRECT') return true;
  if (spell.type === 'HOT' && spell.healing > 0) return true;
  return false;
}

/**
 * Apply damage through shield first, then health.
 * Returns updated health, shield, shieldTicksRemaining, and whether health damage was taken.
 */
export function applyDamage(
  health: number,
  shield: number,
  damage: number,
): { health: number; shield: number; shieldTicksRemaining: number; tookHealthDamage: number } {
  if (shield >= damage) {
    return {
      health,
      shield: shield - damage,
      shieldTicksRemaining: 0,
      tookHealthDamage: 0,
    };
  }
  
  const remainingDamage = damage - shield;
  return {
    health: Math.max(0, health - remainingDamage),
    shield: 0,
    shieldTicksRemaining: 0,
    tookHealthDamage: remainingDamage,
  };
}


