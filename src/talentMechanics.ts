import { CapstoneFormId, ClassType, Talent, Unit, PlayerCombatBuff, Spell, SpellType } from './types.ts';

export const TICKS_1S = 10;
export const TICKS_SPIRIT_REDEMPTION = 10 * TICKS_1S;
export const ICD_SPIRIT_REDEMPTION = 120 * TICKS_1S;
export const SURGE_OF_LIGHT_TICKS = 6 * TICKS_1S;
export const JUDGMENT_PURE_TICKS = 10 * TICKS_1S;
export const ZEAL_MAX_STACKS = 5;
export const ZEAL_TICKS = 10 * TICKS_1S;
export const ZEAL_HASTE_PER_STACK = 5;
export const HEALER_UNIT_ID = '5';

export const DRUID_HOTS = new Set(['rejuvenation', 'regrowth']);
export const PRIEST_RENEW = 'renew';

export function talentRanks(talents: Talent[], mechanicId: string): number {
  return talents
    .filter((t) => t.mechanicId === mechanicId)
    .reduce((a, t) => a + t.points, 0);
}

export function hasTalent(talents: Talent[], mechanicId: string): boolean {
  return talentRanks(talents, mechanicId) > 0;
}

export function applyExclusiveUnlock(talents: Talent[], learnId: string): Talent[] {
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

function buffIndex(buffs: PlayerCombatBuff[], id: string): number {
  return buffs.findIndex((b) => b.id === id);
}

export function hasPlayerBuff(buffs: PlayerCombatBuff[], id: string): boolean {
  return buffs.some((b) => b.id === id && b.remainingTicks > 0);
}

export function getPlayerBuffStacks(buffs: PlayerCombatBuff[], id: string): number {
  const b = buffs.find((x) => x.id === id && x.remainingTicks > 0);
  return b?.stacks ?? 0;
}

export function upsertPlayerBuff(
  buffs: PlayerCombatBuff[],
  id: string,
  ticks: number,
  stacks: number,
): PlayerCombatBuff[] {
  const i = buffIndex(buffs, id);
  if (i < 0) {
    return [...buffs, { id, remainingTicks: ticks, stacks }];
  }
  const next = [...buffs];
  next[i] = {
    id,
    remainingTicks: Math.max(ticks, next[i].remainingTicks),
    stacks,
  };
  return next;
}

export function addOrRefreshBuffTicks(
  buffs: PlayerCombatBuff[],
  id: string,
  ticks: number,
  stacks: number,
): PlayerCombatBuff[] {
  return upsertPlayerBuff(buffs, id, ticks, stacks);
}

export function tickPlayerBuffs(buffs: PlayerCombatBuff[]): PlayerCombatBuff[] {
  return buffs
    .map((b) => ({ ...b, remainingTicks: b.remainingTicks - 1 }))
    .filter((b) => b.remainingTicks > 0);
}

export function decBuffStack(buffs: PlayerCombatBuff[], id: string): PlayerCombatBuff[] {
  return buffs
    .map((b) => {
      if (b.id !== id) return b;
      if (b.stacks <= 1) return { ...b, remainingTicks: 0, stacks: 0 };
      return { ...b, stacks: b.stacks - 1 };
    })
    .filter((b) => b.remainingTicks > 0 && b.stacks > 0);
}

export function withBuffRemoved(buffs: PlayerCombatBuff[], id: string): PlayerCombatBuff[] {
  return buffs.filter((b) => b.id !== id);
}

export function isIcDRdy(icds: Record<string, number>, key: string): boolean {
  return (icds[key] ?? 0) <= 0;
}

export function applyDamageThroughShield(
  health: number,
  shield: number,
  damage: number,
): { health: number; shield: number; shieldTicksRemaining: number; tookHealthDamage: number } {
  if (damage <= 0) {
    return { health, shield, shieldTicksRemaining: 0, tookHealthDamage: 0 };
  }
  if (shield >= damage) {
    return { health, shield: shield - damage, shieldTicksRemaining: 0, tookHealthDamage: 0 };
  }
  const rest = damage - shield;
  return { health: Math.max(0, health - rest), shield: 0, shieldTicksRemaining: 0, tookHealthDamage: rest };
}

export function healerInParty(party: Unit[]): Unit | undefined {
  return party.find((u) => u.role === 'HEALER');
}

export function hasHotOnUnit(unit: Unit, cls: ClassType | null): boolean {
  if (cls === ClassType.DRUID) {
    return unit.buffs.some((b) => DRUID_HOTS.has(b.sourceSpellId));
  }
  if (cls === ClassType.PRIEST) {
    return unit.buffs.some((b) => b.sourceSpellId === PRIEST_RENEW);
  }
  return unit.buffs.some((b) => b.sourceSpellId === 'rejuvenation' || b.sourceSpellId === 'regrowth');
}

export function findConsumableHotIndex(unit: Unit, cls: ClassType | null): number {
  if (cls === ClassType.DRUID) {
    const reg = unit.buffs.findIndex((b) => b.sourceSpellId === 'regrowth');
    if (reg >= 0) return reg;
    return unit.buffs.findIndex((b) => b.sourceSpellId === 'rejuvenation');
  }
  return unit.buffs.findIndex((b) => b.sourceSpellId === PRIEST_RENEW);
}

export function isHealSpell(spell: Spell, spellId: string): boolean {
  if (spellId === 'wand' || spellId === 'mana_potion') return false;
  return spell.type === SpellType.DIRECT || spell.type === SpellType.HOT || spell.type === SpellType.AOE;
}

export function isDirectHealSpell(spell: Spell, spellId: string): boolean {
  if (spellId === 'mana_potion' || spellId === 'wand') return false;
  if (spell.type === SpellType.AOE) return true;
  if (spell.type === SpellType.DIRECT) return true;
  if (spell.type === SpellType.HOT && spell.healing > 0) return true;
  return false;
}

export function capstoneForClass(cls: ClassType): CapstoneFormId {
  if (cls === ClassType.PRIEST) return 'priest_archangel';
  if (cls === ClassType.DRUID) return 'druid_natures_grace';
  return 'paladin_avenging_wrath';
}

export function classSpellOrder(cls: ClassType): string[] {
  if (cls === ClassType.PRIEST) {
    return ['flash_heal', 'renew', 'greater_heal', 'wild_growth'];
  }
  if (cls === ClassType.DRUID) {
    return ['rejuvenation', 'regrowth', 'swiftmend', 'greater_heal', 'wild_growth'];
  }
  return ['flash_heal', 'greater_heal', 'wild_growth'];
}
