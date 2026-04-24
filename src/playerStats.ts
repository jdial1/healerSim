import { ClassType, Talent } from './types.ts';

export const MANA_PER_INTELLECT = 5;
export const HEALING_PCT_PER_SPIRIT = 0.4;

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
  manaPerIntellect: number;
  healingPctPerSpirit: number;
  manaFromIntellect: number;
  manaFromTalents: number;
  maxMana: number;
  healingBonusPctFromSpirit: number;
  healingBonusPctFromTalents: number;
  totalHealingBonusPct: number;
  healingEffectMultiplier: number;
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

export function healerMaxHealthFromStats(cls: ClassType | null, level: number): number {
  const lv = Math.max(1, level);
  if (!cls) {
    return Math.round(48 + (lv - 1) * 6);
  }
  const { intellect, spirit } = effectivePrimaryStats(cls, lv);
  return Math.round(18 + lv * 3 + intellect * 1.5 + spirit * 1.1);
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
  return {
    intellect,
    spirit,
    manaPerIntellect: MANA_PER_INTELLECT,
    healingPctPerSpirit: HEALING_PCT_PER_SPIRIT,
    manaFromIntellect,
    manaFromTalents,
    maxMana,
    healingBonusPctFromSpirit,
    healingBonusPctFromTalents,
    totalHealingBonusPct: Math.round(totalHealingBonusPct * 10) / 10,
    healingEffectMultiplier,
  };
}
