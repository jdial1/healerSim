import { Buff, ClassType, GameState, Unit, PlayerCombatBuff, Spell } from './types.ts';
import { talentRanks, hasPlayerBuff, healerInParty, hasHotOnUnit, findConsumableHotIndex } from './talentMechanics.ts';
import {
  naturePerfectionCritBonus,
  talentCritChancePctFromTalents,
  talentHastePctFromTalents,
} from './playerStats.ts';

export const T_ARCHANGEL = 15 * 10;
export const T_NATURES_GRACE = 20 * 10;
export const T_AVENGING = 20 * 10;
export const T_SPIRIT_AMP = 10 * 10;
export const SHIELD_DEFAULT_TICKS = 10 * 10;

export const HOT_PANDEMIC_MULT = 1.3;

const DIRECT_HEAL_SYNERGY_SPELL_IDS = new Set(['flash_heal', 'greater_heal', 'swiftmend', 'regrowth']);
const SYNERGY_PRIMER_SOURCE_SPELL_IDS = new Set(['renew', 'rejuvenation', 'regrowth', 'wild_growth']);

export function directHealSynergyMultiplier(unit: Unit, spellId: string): number {
  if (!DIRECT_HEAL_SYNERGY_SPELL_IDS.has(spellId)) return 1;
  if (!unit.buffs.some((b) => SYNERGY_PRIMER_SOURCE_SPELL_IDS.has(b.sourceSpellId))) return 1;
  return 1.15;
}

export function applyPandemicHotToUnit(unit: Unit, spell: Spell, healingPerTick: number): Unit {
  const baseTicks = spell.hotDuration ?? 0;
  if (baseTicks <= 0) return unit;
  const capTicks = Math.max(baseTicks, Math.floor(baseTicks * HOT_PANDEMIC_MULT));
  const existingIdx = unit.buffs.findIndex((b) => b.sourceSpellId === spell.id);
  let carried = 0;
  let kept = unit.buffs;
  if (existingIdx >= 0) {
    carried = unit.buffs[existingIdx].remainingTicks;
    kept = unit.buffs.filter((_, i) => i !== existingIdx);
  }
  const combined = Math.min(carried + baseTicks, capTicks);
  const buff: Buff = {
    id: spell.id,
    name: spell.name,
    remainingTicks: combined,
    healingPerTick,
    icon: spell.icon,
    sourceSpellId: spell.id,
    durationTicksMax: combined,
  };
  return { ...unit, buffs: [...kept, buff] };
}

function zealHasteFromBuffs(buffs: PlayerCombatBuff[], stacks: number): number {
  const b = buffs.find((x) => x.id === 'zeal' && x.remainingTicks > 0);
  const s = b ? b.stacks : stacks;
  return s * 5;
}

function judgmentHaste(buffs: PlayerCombatBuff[]): number {
  return hasPlayerBuff(buffs, 'judgment_of_the_pure') ? 8 : 0;
}

export function photosynthesisHasteBonus(
  s: GameState,
  classType: ClassType,
  healer: Unit,
): number {
  if (classType !== ClassType.DRUID) return 0;
  const p = talentRanks(s.talents, 'photosynthesis');
  if (p === 0) return 0;
  if (hasHotOnUnit(healer, ClassType.DRUID)) {
    return p * 3;
  }
  return 0;
}

export function totalHastePercent(
  s: GameState,
  classType: ClassType,
  healer: Unit,
  zealStackCount: number,
): number {
  const t = talentHastePctFromTalents(s.talents);
  return (
    t +
    zealHasteFromBuffs(s.playerCombatBuffs, zealStackCount) +
    judgmentHaste(s.playerCombatBuffs) +
    photosynthesisHasteBonus(s, classType, healer)
  );
}

export function effectiveSpellCritChance(s: GameState, naturalStacks: number): number {
  return talentCritChancePctFromTalents(s.talents) + naturePerfectionCritBonus(naturalStacks);
}

export function rollCrit(critRoll: number, s: GameState, naturalStacks: number): boolean {
  return critRoll < effectiveSpellCritChance(s, naturalStacks);
}

export function nextManaForSpell(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  if (surgeFree && spellId === 'greater_heal') return 0;
  if (classType && talentRanks(s.talents, 'tree_of_life') > 0) {
    const hot = spell.type === 'HOT' || (spell.hotDuration && spell.healing > 0);
    if (hot) return Math.round(spell.manaCost * 0.7);
    if (spellId === 'greater_heal' || (spellId === 'flash_heal' && spell.healing > 20)) {
      return Math.round(spell.manaCost * 1.2);
    }
  }
  return spell.manaCost;
}

export function resolveSwiftmend(
  s: GameState,
  classType: ClassType,
  targetId: string,
  healMult: number,
  critMod: number,
  spell: Spell,
): { party: Unit[]; applied: boolean } {
  if (classType !== ClassType.DRUID) return { party: s.party, applied: false };
  const p = s.party.map((u) => ({ ...u, buffs: [...u.buffs] }));
  const idx = p.findIndex((u) => u.id === targetId);
  if (idx < 0) return { party: s.party, applied: false };
  const u = p[idx];
  const hotIdx = findConsumableHotIndex(u, ClassType.DRUID);
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
  return Math.random() < photosynthPoints * 0.02;
}
