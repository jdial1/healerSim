import { ClassType, Talent } from './types.ts';

export const MANA_PER_INTELLECT = 5;
export const HEALING_PCT_PER_SPIRIT = 0.4;
export const MANA_REGEN_MULT_PER_SPIRIT = 0.015;

export function spiritManaRegenMultiplier(spirit: number): number {
  return 1 + spirit * MANA_REGEN_MULT_PER_SPIRIT;
}

export interface ClassStatCurve {
  baseIntellect: number;
  baseSpirit: number;
  intellectPerLevel: number;
  spiritPerLevel: number;
}

export const CLASS_STAT_CURVE: Record<ClassType, ClassStatCurve> = {
  [ClassType.PRIEST]: {
    baseIntellect: 20,
    baseSpirit: 18,
    intellectPerLevel: 2,
    spiritPerLevel: 1,
  },
  [ClassType.DRUID]: {
    baseIntellect: 16,
    baseSpirit: 22,
    intellectPerLevel: 1,
    spiritPerLevel: 2,
  },
  [ClassType.PALADIN]: {
    baseIntellect: 22,
    baseSpirit: 16,
    intellectPerLevel: 2,
    spiritPerLevel: 1,
  },
};

export function effectivePrimaryStats(
  cls: ClassType | null,
  level: number,
): { intellect: number; spirit: number } {
  if (!cls) return { intellect: 0, spirit: 0 };
  const c = CLASS_STAT_CURVE[cls];
  const lv = Math.max(1, level);
  return {
    intellect: c.baseIntellect + (lv - 1) * c.intellectPerLevel,
    spirit: c.baseSpirit + (lv - 1) * c.spiritPerLevel,
  };
}

export function talentFlatManaFromTalents(talents: Talent[]): number {
  return talents.reduce((a, t) => a + (t.statBonus?.manaPool ?? 0) * t.points, 0);
}

export function talentHealingBonusPctFromTalents(talents: Talent[]): number {
  return talents.reduce((a, t) => a + (t.statBonus?.healingBoost ?? 0) * t.points, 0);
}

export function talentCritChancePctFromTalents(talents: Talent[]): number {
  return talents.reduce((a, t) => a + (t.statBonus?.critChance ?? 0) * t.points, 0);
}

export function talentHastePctFromTalents(talents: Talent[]): number {
  return talents.reduce((a, t) => a + (t.statBonus?.haste ?? 0) * t.points, 0);
}

export function naturePerfectionCritBonus(naturalPerfectionStacks: number): number {
  return naturalPerfectionStacks * 2;
}

export function computedMaxMana(cls: ClassType | null, level: number, talents: Talent[]): number {
  if (!cls) return 100;
  const { intellect } = effectivePrimaryStats(cls, level);
  return Math.round(intellect * MANA_PER_INTELLECT + talentFlatManaFromTalents(talents));
}

export function spellHealingMultiplierFromProgress(
  cls: ClassType | null,
  level: number,
  talents: Talent[],
): number {
  if (!cls) return 1;
  const { spirit } = effectivePrimaryStats(cls, level);
  const talentPct = talentHealingBonusPctFromTalents(talents);
  const spiritPct = spirit * HEALING_PCT_PER_SPIRIT;
  return 1 + (spiritPct + talentPct) / 100;
}

export interface PlayerStatBreakdown {
  intellect: number;
  spirit: number;
  maxHealth: number;
  manaPerIntellect: number;
  healingPctPerSpirit: number;
  manaFromIntellect: number;
  manaFromTalents: number;
  maxMana: number;
  healingBonusPctFromSpirit: number;
  healingBonusPctFromTalents: number;
  totalHealingBonusPct: number;
  healingEffectMultiplier: number;
  spiritManaRegenMultiplier: number;
  critChancePct: number;
  hastePct: number;
  bonusHealing: number;
}

export function randomAllyLevel(playerLevel: number): number {
  return Math.max(1, playerLevel + Math.floor(Math.random() * 3) - 1);
}

export function allyMaxHealthForRoleAndLevel(role: 'TANK' | 'DPS', level: number): number {
  const lv = Math.max(1, level);
  if (role === 'TANK') {
    return Math.round(98 + (lv - 1) * 14);
  }
  return Math.round(52 + (lv - 1) * 5.5);
}

export function healerMaxHealthFromStats(_cls: ClassType | null, level: number): number {
  return allyMaxHealthForRoleAndLevel('DPS', level);
}

export function buildPlayerStatBreakdown(
  cls: ClassType,
  level: number,
  talents: Talent[],
): PlayerStatBreakdown {
  const { intellect, spirit } = effectivePrimaryStats(cls, level);
  const manaFromTalents = talentFlatManaFromTalents(talents);
  const manaFromIntellect = Math.round(intellect * MANA_PER_INTELLECT);
  const maxMana = manaFromIntellect + manaFromTalents;
  const spiritRawPct = spirit * HEALING_PCT_PER_SPIRIT;
  const talentRawPct = talentHealingBonusPctFromTalents(talents);
  const healingBonusPctFromSpirit = Math.round(spiritRawPct * 10) / 10;
  const healingBonusPctFromTalents = Math.round(talentRawPct * 10) / 10;
  const totalHealingBonusPct = spiritRawPct + talentRawPct;
  const healingEffectMultiplier = Math.round((1 + totalHealingBonusPct / 100) * 1000) / 1000;
  const spiritRegenMult = Math.round(spiritManaRegenMultiplier(spirit) * 1000) / 1000;
  const critChancePct = talentCritChancePctFromTalents(talents);
  const hastePct = talentHastePctFromTalents(talents);
  const bonusHealing = Math.round(100 * (healingEffectMultiplier - 1));
  return {
    intellect,
    spirit,
    maxHealth: healerMaxHealthFromStats(cls, level),
    manaPerIntellect: MANA_PER_INTELLECT,
    healingPctPerSpirit: HEALING_PCT_PER_SPIRIT,
    manaFromIntellect,
    manaFromTalents,
    maxMana,
    healingBonusPctFromSpirit,
    healingBonusPctFromTalents,
    totalHealingBonusPct: Math.round(totalHealingBonusPct * 10) / 10,
    healingEffectMultiplier,
    spiritManaRegenMultiplier: spiritRegenMult,
    critChancePct,
    hastePct,
    bonusHealing,
  };
}

export function transitivePrerequisiteTalentIds(allTalents: Talent[], talent: Talent): string[] {
  const byId = new Map(allTalents.map((t) => [t.id, t] as const));
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [...(talent.prerequisites ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const p = byId.get(id);
    if (p?.prerequisites) for (const x of p.prerequisites) stack.push(x);
  }
  return out;
}

export function unmetChainedPrerequisiteTalents(allTalents: Talent[], talent: Talent): Talent[] {
  const byId = new Map(allTalents.map((t) => [t.id, t] as const));
  return transitivePrerequisiteTalentIds(allTalents, talent)
    .map((id) => byId.get(id))
    .filter((t): t is Talent => !!t && t.points === 0);
}

export function talentChainedPrereqsSatisfied(allTalents: Talent[], talent: Talent): boolean {
  return unmetChainedPrerequisiteTalents(allTalents, talent).length === 0;
}
