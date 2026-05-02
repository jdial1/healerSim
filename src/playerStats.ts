import { CapstoneFormId, ClassType, IconGlow, Talent } from './types.ts';
import { ClassRegistry } from './classes/index.ts';
import npcPoolsData from './data/npc_pools.json';
import { BALANCE, type MechanicId } from './data/index.ts';

const PS = BALANCE.playerStats;

export const MANA_PER_INTELLECT = PS.manaPerIntellect;
export const HEALING_PCT_PER_SPIRIT = PS.healingPctPerSpirit;
export const MANA_REGEN_MULT_PER_SPIRIT = PS.manaRegenMultPerSpirit;

export function getSpiritRegenMultiplier(spirit: number): number {
  return 1 + spirit * PS.manaRegenMultPerSpirit;
}

export interface ClassStatCurve {
  baseIntellect: number;
  baseSpirit: number;
  intellectPerLevel: number;
  spiritPerLevel: number;
  baseUniqueStat: number;
  uniqueStatPerLevel: number;
}

export const UNIQUE_STAT_LABELS: Record<ClassType, string> = {
  PRIEST: 'Divinity',
  DRUID: 'Vitality',
  PALADIN: 'Radiance',
};

export const UNIQUE_STAT_DESCRIPTIONS: Record<ClassType, string> = {
  PRIEST:
    'Turns overhealing from direct heals into absorb shields and strengthens critical Divine Aegis shields. Higher Divinity improves both effects.',
  DRUID:
    'Makes HoT ticks more explosive: a chance to bloom for extra healing on tick, with a chance to return a little mana on that bloom. Higher Vitality improves bloom odds and impact.',
  PALADIN:
    'Increases healing on injured targets—the lower their health, the larger the bonus, up to a cap. Higher Radiance raises how much missing health amplifies your heals.',
};

function getClassJson(cls: ClassType) {
  return ClassRegistry.getMetadata(cls);
}

export const CLASS_STAT_CURVE: Record<ClassType, ClassStatCurve> = {
  PRIEST: getClassJson('PRIEST')?.statCurves || {
    baseIntellect: 30,
    baseSpirit: 20,
    intellectPerLevel: 3.5,
    spiritPerLevel: 1.5,
    baseUniqueStat: 8,
    uniqueStatPerLevel: 0.55,
  },
  DRUID: getClassJson('DRUID')?.statCurves || {
    baseIntellect: 32,
    baseSpirit: 25,
    intellectPerLevel: 2.5,
    spiritPerLevel: 1.8,
    baseUniqueStat: 10,
    uniqueStatPerLevel: 0.65,
  },
  PALADIN: getClassJson('PALADIN')?.statCurves || {
    baseIntellect: 35,
    baseSpirit: 18,
    intellectPerLevel: 3.5,
    spiritPerLevel: 1.5,
    baseUniqueStat: 7,
    uniqueStatPerLevel: 0.5,
  },
};

export interface ClassProgressionRow {
  starterSpells: string[];
  spellOrder: string[];
  capstoneForm: CapstoneFormId;
  capstoneMechanicId: MechanicId;
  capstonePlayerBuffId: string;
}

const defaultProgression: Record<ClassType, ClassProgressionRow> = {
  PRIEST: {
    starterSpells: ['flash_heal', 'renew'],
    spellOrder: ['flash_heal', 'renew', 'greater_heal', 'circle_of_healing'],
    capstoneForm: 'priest_archangel' as CapstoneFormId,
    capstoneMechanicId: 'capstone_archangel',
    capstonePlayerBuffId: 'archangel',
  },
  DRUID: {
    starterSpells: ['rejuvenation', 'regrowth'],
    spellOrder: ['rejuvenation', 'regrowth', 'healing_touch', 'lifebloom', 'swiftmend', 'wild_growth'],
    capstoneForm: 'druid_natures_grace' as CapstoneFormId,
    capstoneMechanicId: 'capstone_natures_grace',
    capstonePlayerBuffId: 'natures_grace_aura',
  },
  PALADIN: {
    starterSpells: ['flash_heal'],
    spellOrder: ['flash_heal', 'holy_light', 'light_of_dawn'],
    capstoneForm: 'paladin_avenging_wrath' as CapstoneFormId,
    capstoneMechanicId: 'capstone_avenging_wrath',
    capstonePlayerBuffId: 'avenging_wrath_aura',
  },
};

export const CLASS_PROGRESSION: Record<ClassType, ClassProgressionRow> = {
  PRIEST: getClassJson('PRIEST')?.progression as ClassProgressionRow ?? defaultProgression.PRIEST,
  DRUID: getClassJson('DRUID')?.progression as ClassProgressionRow ?? defaultProgression.DRUID,
  PALADIN: getClassJson('PALADIN')?.progression as ClassProgressionRow ?? defaultProgression.PALADIN,
};

export const CAPSTONE_PLAYER_BUFF_IDS = Array.from(
  new Set(Object.values(CLASS_PROGRESSION).map((p) => p.capstonePlayerBuffId)),
);

export const RANK_HEAL_MULT = 1.15;
export const RANK_COST_MULT = 1.1;

export function getRankHealMult(rank: number): number {
  return Math.pow(RANK_HEAL_MULT, Math.max(0, rank - 1));
}

export function getRankCostMult(rank: number): number {
  return Math.pow(RANK_COST_MULT, Math.max(0, rank - 1));
}

export function getSpellRank(spellId: string, cls: ClassType, level: number): number {
  const order = CLASS_PROGRESSION[cls].spellOrder;
  const idx = order.indexOf(spellId);
  if (idx === -1) return 1;
  const slot = idx % 3;
  const firstUpgradeLevel = 2 + slot;
  if (level < firstUpgradeLevel) return 1;
  return 2 + Math.floor((level - firstUpgradeLevel) / 3);
}

export function getSpellUpgradeAtLevel(cls: ClassType, level: number): string[] {
  if (level < 2) return [];
  const order = CLASS_PROGRESSION[cls].spellOrder;
  const slot = (level - 2) % 3;
  const out: string[] = [];
  if (order[slot]) out.push(order[slot]!);
  if (order[slot + 3]) out.push(order[slot + 3]!);
  return out;
}

export function getPotionUpgradeAtLevel(level: number): boolean {
  return level > 0 && level % 5 === 0;
}

export function getSpellOrder(cls: ClassType): string[] {
  return CLASS_PROGRESSION[cls].spellOrder;
}

export function getStarterSpells(cls: ClassType): string[] {
  return CLASS_PROGRESSION[cls].starterSpells;
}

export function getCapstone(cls: ClassType): CapstoneFormId {
  return CLASS_PROGRESSION[cls].capstoneForm;
}

export function getPortrait(cls: ClassType): { portraitIcon: string; portraitGlow: IconGlow } {
  const row = getClassJson(cls);
  if (!row) return { portraitIcon: 'lorc/angel-outfit', portraitGlow: 'spell' };
  const g = row.portraitGlow;
  if (g !== 'spell' && g !== 'nature' && g !== 'debuff') return { portraitIcon: row.portraitIcon, portraitGlow: 'spell' };
  return { portraitIcon: row.portraitIcon, portraitGlow: g };
}

export function getTutorialCopy(cls: ClassType): { passiveDescription: string } {
  const row = getClassJson(cls);
  if (!row?.tutorial) {
    return { passiveDescription: 'Passive effect active. Keep healing.' };
  }
  return row.tutorial;
}

export function getTalentGlow(cls: ClassType): IconGlow {
  return getPortrait(cls).portraitGlow;
}

export function getPrimaryStats(
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

export function getUniqueStatRating(
  cls: ClassType | null,
  level: number,
  talents: Talent[],
): number {
  if (!cls) return 0;
  const c = CLASS_STAT_CURVE[cls];
  const lv = Math.max(1, level);
  const base = c.baseUniqueStat + (lv - 1) * c.uniqueStatPerLevel;
  return base + getTalentStats(talents).uniqueStatFlat;
}

export interface TalentStatModifiers {
  flatMana: number;
  healingBoostPct: number;
  critChancePct: number;
  hastePct: number;
  uniqueStatFlat: number;
}

export function getTalentWeight(points: number, maxPoints: number): number {
  const spent = Math.max(0, Math.min(points, maxPoints));
  if (spent === 0) return 0;
  return spent === maxPoints ? spent * 1.2 : spent;
}

export function getTalentStats(talents: Talent[]): TalentStatModifiers {
  return talents.reduce(
    (acc, t) => {
      const p = getTalentWeight(t.points, t.maxPoints);
      const sb = t.statBonus;
      if (!sb) return acc;
      return {
        flatMana: acc.flatMana + (sb.manaPool ?? 0) * p,
        healingBoostPct: acc.healingBoostPct + (sb.healingBoost ?? 0) * p,
        critChancePct: acc.critChancePct + (sb.critChance ?? 0) * p,
        hastePct: acc.hastePct + (sb.haste ?? 0) * p,
        uniqueStatFlat: acc.uniqueStatFlat + (sb.uniqueStat ?? 0) * p,
      };
    },
    { flatMana: 0, healingBoostPct: 0, critChancePct: 0, hastePct: 0, uniqueStatFlat: 0 },
  );
}

export function getTalentMana(talents: Talent[]): number {
  return getTalentStats(talents).flatMana;
}

export function getTalentHealingBonusPct(talents: Talent[]): number {
  return getTalentStats(talents).healingBoostPct;
}

export function getTalentCritChancePct(talents: Talent[]): number {
  return getTalentStats(talents).critChancePct;
}

export function getTalentHastePct(talents: Talent[]): number {
  return getTalentStats(talents).hastePct;
}

export function getNaturePerfectionBonus(naturalPerfectionStacks: number): number {
  return naturalPerfectionStacks * 2;
}

export function getMaxMana(cls: ClassType | null, level: number, talents: Talent[]): number {
  if (!cls) return 100;
  const { intellect } = getPrimaryStats(cls, level);
  return Math.round(intellect * MANA_PER_INTELLECT + getTalentStats(talents).flatMana);
}

export function getHealingMultiplier(
  cls: ClassType | null,
  level: number,
  talents: Talent[],
): number {
  if (!cls) return 1;
  const { spirit } = getPrimaryStats(cls, level);
  const talentPct = getTalentStats(talents).healingBoostPct;
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
  spiritRegenMultiplier: number;
  critChancePct: number;
  hastePct: number;
  bonusHealing: number;
  uniqueStatLabel: string;
  uniqueStatRating: number;
  uniqueStatDescription: string;
  passiveTraitName: string;
  passiveTraitDescription: string;
  passiveTraitIcon: string;
}

export function randomAllyLevel(playerLevel: number): number {
  return Math.max(1, playerLevel + Math.floor(Math.random() * 3) - 1);
}

const ALLY_HEALTH_DEFAULTS = npcPoolsData.allyHealthDefaults as Record<'TANK' | 'DPS', { base: number; perLevel: number }>;

export function getMaxHealthForPool(
  role: 'TANK' | 'DPS',
  level: number,
  healthScaling?: { base: number; perLevel: number },
): number {
  const s = healthScaling ?? ALLY_HEALTH_DEFAULTS[role];
  const lv = Math.max(1, level);
  return Math.round(s.base + (lv - 1) * s.perLevel);
}

export function getMaxHealth(role: 'TANK' | 'DPS', level: number): number {
  return getMaxHealthForPool(role, level, undefined);
}

export function getHealerMaxHealth(_cls: ClassType | null, level: number): number {
  return getMaxHealth('DPS', level);
}

export function getStatBreakdown(
  cls: ClassType,
  level: number,
  talents: Talent[],
): PlayerStatBreakdown {
  const { intellect, spirit } = getPrimaryStats(cls, level);
  const tStats = getTalentStats(talents);
  const manaFromTalents = tStats.flatMana;
  const manaFromIntellect = Math.round(intellect * MANA_PER_INTELLECT);
  const maxMana = manaFromIntellect + manaFromTalents;
  const spiritRawPct = spirit * HEALING_PCT_PER_SPIRIT;
  const talentRawPct = tStats.healingBoostPct;
  const healingBonusPctFromSpirit = Math.round(spiritRawPct * 10) / 10;
  const healingBonusPctFromTalents = Math.round(talentRawPct * 10) / 10;
  const totalHealingBonusPct = spiritRawPct + talentRawPct;
  const healingEffectMultiplier = Math.round((1 + totalHealingBonusPct / 100) * 1000) / 1000;
  const spiritRegenMult = Math.round(getSpiritRegenMultiplier(spirit) * 1000) / 1000;
  const critChancePct = tStats.critChancePct;
  const hastePct = tStats.hastePct;
  const bonusHealing = Math.round(100 * (healingEffectMultiplier - 1));
  const classJson = getClassJson(cls);
  const uniqueStatRating = Math.round(getUniqueStatRating(cls, level, talents) * 10) / 10;
  return {
    intellect,
    spirit,
    maxHealth: getHealerMaxHealth(cls, level),
    manaPerIntellect: MANA_PER_INTELLECT,
    healingPctPerSpirit: HEALING_PCT_PER_SPIRIT,
    manaFromIntellect,
    manaFromTalents,
    maxMana,
    healingBonusPctFromSpirit,
    healingBonusPctFromTalents,
    totalHealingBonusPct: Math.round(totalHealingBonusPct * 10) / 10,
    healingEffectMultiplier,
    spiritRegenMultiplier: spiritRegenMult,
    critChancePct,
    hastePct,
    bonusHealing,
    uniqueStatLabel: UNIQUE_STAT_LABELS[cls],
    uniqueStatRating,
    uniqueStatDescription: UNIQUE_STAT_DESCRIPTIONS[cls],
    passiveTraitName: classJson?.passiveTraitName ?? '',
    passiveTraitDescription: classJson?.passiveTraitDescription ?? '',
    passiveTraitIcon: classJson?.passiveTraitIcon ?? 'wow/spell_holy_sealofwisdom',
  };
}

export function getPrerequisiteIds(allTalents: Talent[], talent: Talent): string[] {
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

export function getUnmetPrerequisites(allTalents: Talent[], talent: Talent): Talent[] {
  const byId = new Map(allTalents.map((t) => [t.id, t] as const));
  return getPrerequisiteIds(allTalents, talent)
    .map((id) => byId.get(id))
    .filter((t): t is Talent => !!t && t.points === 0);
}

export function arePrereqsSatisfied(allTalents: Talent[], talent: Talent): boolean {
  return getUnmetPrerequisites(allTalents, talent).length === 0;
}