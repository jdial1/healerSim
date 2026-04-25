import { CapstoneFormId, ClassType, IconGlow, Talent } from './types.ts';
import classesData from './data/classes.json';
import npcPoolsData from './data/npc_pools.json';
import type { MechanicId } from './mechanicsRegistry.ts';
import { BALANCE } from './balance.ts';

const PS = BALANCE.playerStats;

export const MANA_PER_INTELLECT = PS.manaPerIntellect;
export const HEALING_PCT_PER_SPIRIT = PS.healingPctPerSpirit;
export const MANA_REGEN_MULT_PER_SPIRIT = PS.manaRegenMultPerSpirit;

export function spiritManaRegenMultiplier(spirit: number): number {
  return 1 + spirit * PS.manaRegenMultPerSpirit;
}

export interface ClassStatCurve {
  baseIntellect: number;
  baseSpirit: number;
  intellectPerLevel: number;
  spiritPerLevel: number;
}

export const CLASS_STAT_CURVE = classesData.statCurves as Record<ClassType, ClassStatCurve>;

export interface ClassProgressionRow {
  starterSpells: string[];
  spellOrder: string[];
  capstoneForm: CapstoneFormId;
  capstoneMechanicId: MechanicId;
  capstonePlayerBuffId: string;
}

export const CLASS_PROGRESSION = classesData.progression as Record<ClassType, ClassProgressionRow>;

export const CAPSTONE_PLAYER_BUFF_IDS = Array.from(
  new Set(Object.values(CLASS_PROGRESSION).map((p) => p.capstonePlayerBuffId)),
);

export function classSpellOrder(cls: ClassType): string[] {
  return CLASS_PROGRESSION[cls].spellOrder;
}

export function starterSpellsForClass(cls: ClassType): string[] {
  return CLASS_PROGRESSION[cls].starterSpells;
}

export function capstoneForClass(cls: ClassType): CapstoneFormId {
  return CLASS_PROGRESSION[cls].capstoneForm;
}

export function classPortraitForPlayer(cls: ClassType): { portraitIcon: string; portraitGlow: IconGlow } {
  const row = classesData.selector.find((r) => r.id === cls);
  if (!row) throw new Error(`Unknown class ${cls}`);
  const g = row.portraitGlow;
  if (g !== 'spell' && g !== 'nature' && g !== 'debuff') throw new Error(`Invalid portraitGlow for ${cls}`);
  return { portraitIcon: row.portraitIcon as string, portraitGlow: g };
}

export function talentTreeGlowForClass(cls: ClassType): IconGlow {
  return classPortraitForPlayer(cls).portraitGlow;
}

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

export interface TalentStatModifiers {
  flatMana: number;
  healingBoostPct: number;
  critChancePct: number;
  hastePct: number;
}

export function computeTalentStats(talents: Talent[]): TalentStatModifiers {
  return talents.reduce(
    (acc, t) => {
      const p = t.points;
      const sb = t.statBonus;
      if (!sb) return acc;
      return {
        flatMana: acc.flatMana + (sb.manaPool ?? 0) * p,
        healingBoostPct: acc.healingBoostPct + (sb.healingBoost ?? 0) * p,
        critChancePct: acc.critChancePct + (sb.critChance ?? 0) * p,
        hastePct: acc.hastePct + (sb.haste ?? 0) * p,
      };
    },
    { flatMana: 0, healingBoostPct: 0, critChancePct: 0, hastePct: 0 },
  );
}

export function talentFlatManaFromTalents(talents: Talent[]): number {
  return computeTalentStats(talents).flatMana;
}

export function talentHealingBonusPctFromTalents(talents: Talent[]): number {
  return computeTalentStats(talents).healingBoostPct;
}

export function talentCritChancePctFromTalents(talents: Talent[]): number {
  return computeTalentStats(talents).critChancePct;
}

export function talentHastePctFromTalents(talents: Talent[]): number {
  return computeTalentStats(talents).hastePct;
}

export function naturePerfectionCritBonus(naturalPerfectionStacks: number): number {
  return naturalPerfectionStacks * 2;
}

export function computedMaxMana(cls: ClassType | null, level: number, talents: Talent[]): number {
  if (!cls) return 100;
  const { intellect } = effectivePrimaryStats(cls, level);
  return Math.round(intellect * MANA_PER_INTELLECT + computeTalentStats(talents).flatMana);
}

export function spellHealingMultiplierFromProgress(
  cls: ClassType | null,
  level: number,
  talents: Talent[],
): number {
  if (!cls) return 1;
  const { spirit } = effectivePrimaryStats(cls, level);
  const talentPct = computeTalentStats(talents).healingBoostPct;
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

const ALLY_HEALTH_DEFAULTS = npcPoolsData.allyHealthDefaults as Record<'TANK' | 'DPS', { base: number; perLevel: number }>;

export function allyMaxHealthForPoolEntry(
  role: 'TANK' | 'DPS',
  level: number,
  healthScaling?: { base: number; perLevel: number },
): number {
  const s = healthScaling ?? ALLY_HEALTH_DEFAULTS[role];
  const lv = Math.max(1, level);
  return Math.round(s.base + (lv - 1) * s.perLevel);
}

export function allyMaxHealthForRoleAndLevel(role: 'TANK' | 'DPS', level: number): number {
  return allyMaxHealthForPoolEntry(role, level, undefined);
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
  const tStats = computeTalentStats(talents);
  const manaFromTalents = tStats.flatMana;
  const manaFromIntellect = Math.round(intellect * MANA_PER_INTELLECT);
  const maxMana = manaFromIntellect + manaFromTalents;
  const spiritRawPct = spirit * HEALING_PCT_PER_SPIRIT;
  const talentRawPct = tStats.healingBoostPct;
  const healingBonusPctFromSpirit = Math.round(spiritRawPct * 10) / 10;
  const healingBonusPctFromTalents = Math.round(talentRawPct * 10) / 10;
  const totalHealingBonusPct = spiritRawPct + talentRawPct;
  const healingEffectMultiplier = Math.round((1 + totalHealingBonusPct / 100) * 1000) / 1000;
  const spiritRegenMult = Math.round(spiritManaRegenMultiplier(spirit) * 1000) / 1000;
  const critChancePct = tStats.critChancePct;
  const hastePct = tStats.hastePct;
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
