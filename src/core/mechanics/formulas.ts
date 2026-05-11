// formulas.ts - Scaling, stats, progression, and shared combat math

import {
  ALL_CLASSES,
  type DungeonPace,
  type ClassType,
  type MechanicId,
  type CapstoneFormId,
  type Talent,
  type FloatingCombatTextEntry,
  type Unit,
  type BossCombatProfile,
} from '../../systems/Types';
import type {
  ManaCostLogicKey,
  OnHealLandMechanicKey,
  OnCritMechanicKey,
  DirectHealTargetAmpKey,
  CastHasteBonusKey,
  HealCastCooldownKey,
  HolyPowerStepAfterHealKey,
  OnResourceTickMechanicKey,
  PassiveCombatHasteBonusKey,
  HotTickPlayerEffectsKey,
} from '../../systems/Types';
import { BALANCE, PACING } from '../../data/index';
import { SPELLS } from '../../data/index';
import { TICK_RATE, MANA_REGEN_PER_TICK, MANA_SPIRIT_REGEN_LOCKOUT_TICKS } from '../../systems/Constants';
import druidConfig from '../../data/classes/druid_config.json' with { type: 'json' };
import priestConfig from '../../data/classes/priest_config.json' with { type: 'json' };
import paladinConfig from '../../data/classes/paladin_config.json' with { type: 'json' };

// ========= Scaling Functions =========

export const RANK_HEAL_MULT = BALANCE.progression.rankHealMult;
export const RANK_COST_MULT = BALANCE.progression.rankCostMult;

export function getRankHealMult(rank: number): number {
  return Math.pow(BALANCE.progression.rankHealMult, Math.max(0, rank - 1));
}

export function getRankCostMult(rank: number): number {
  return Math.pow(BALANCE.progression.rankCostMult, Math.max(0, rank - 1));
}

export function getBossDamageMultiplier(difficulty: number): number {
  return Math.pow(
    BALANCE.boss.damageMultiplierPerDifficultyStep,
    Math.max(0, difficulty - 1),
  );
}

export function getEndlessMultiplier(stacks: number): number {
  return Math.pow(BALANCE.endless.scalingPerCycle, Math.max(0, stacks));
}

export function getLevelGapDamageMultiplier(
  partyMemberLevel: number,
  dungeonLevelMax: number,
): number {
  const gap = partyMemberLevel - dungeonLevelMax;
  if (gap <= 0) return 1;
  return Math.pow(BALANCE.partyDamageFromDungeonLevelGap.multiplierPerPartyLevelOverDungeonMax, gap);
}

// ========= Dungeon Pace =========

export const DUNGEON_PACES: DungeonPace[] = ['fast', 'normal', 'slow'];

export function dungeonPaceDpsMultiplier(pace: DungeonPace): number {
  return PACING.paces[pace].dpsMultiplier;
}

export function dungeonPaceXpMultiplier(pace: DungeonPace): number {
  return PACING.paces[pace].xpMultiplier;
}

export function dungeonPaceTrashSec(pace: DungeonPace): number {
  return PACING.paces[pace].trashSec;
}

export function dungeonPaceBossSec(pace: DungeonPace): number {
  return PACING.paces[pace].bossSec;
}

// ========= XP Scaling =========

export function dungeonXpTierMultiplier(difficulty: number): number {
  return 1 + BALANCE.xp.dungeonTierAdditivePerDifficultyOver1 * Math.max(0, difficulty - 1);
}

export function dungeonBaseXp(difficulty: number): number {
  return Math.round(
    BALANCE.xp.dungeonBaseAmount * Math.pow(BALANCE.xp.dungeonBaseDifficultyPowBase, difficulty - 1),
  );
}

// ========= Combat Profile =========

export function getCombatProfile(dungeon: {
  bossCombat?: Partial<BossCombatProfile>;
}): BossCombatProfile {
  const defaults = BALANCE.dungeonCombat;

  const c = dungeon.bossCombat;
  return {
    mechanicIntervalTicksMin: c?.mechanicIntervalTicksMin ?? defaults.defaultMechanicIntervalTicksMin,
    mechanicIntervalTicksMax: c?.mechanicIntervalTicksMax ?? defaults.defaultMechanicIntervalTicksMax,
    debuffTemplates: c?.debuffTemplates ?? [],
    selfBuffTemplates: c?.selfBuffTemplates ?? [],
    attackTemplates: c?.attackTemplates ?? [],
  };
}

export const TRASH_PACK_COUNT = BALANCE.trash.pullCount;

export function getTrashMaxHealth(dungeon: { bossHealth: number }): number {
  return Math.max(
    1,
    Math.round(dungeon.bossHealth * BALANCE.trash.maxHealthFractionOfBoss),
  );
}

// ========= Player Stat Curves & Progression =========

const PS = BALANCE.playerStats;
export const MANA_PER_INTELLECT = PS.manaPerIntellect;
export const HEALING_PCT_PER_SPIRIT = PS.healingPctPerSpirit;
export const MANA_REGEN_MULT_PER_SPIRIT = PS.manaRegenMultPerSpirit;

export function getSpiritRegenMultiplier(spirit: number): number {
  return 1 + spirit * MANA_REGEN_MULT_PER_SPIRIT;
}

const TICKS_PER_SECOND_CALC = Math.round(1000 / TICK_RATE);

function roundedManaRegenPerTickAndPerSec(
  spiritLockTicks: number,
  spirit: number,
): { perTick: number; perSec: number } {
  const rawPerTick = MANA_REGEN_PER_TICK * getSpiritRegenMultiplier(spirit);
  if (spiritLockTicks > 0) {
    return { perTick: 0, perSec: 0 };
  }
  const rawPerSec = rawPerTick * TICKS_PER_SECOND_CALC;
  const perSec = Math.round(rawPerSec * 10) / 10;
  const perTick = Math.round((perSec / TICKS_PER_SECOND_CALC) * 1000) / 1000;
  return { perTick, perSec };
}

export function manaRegenAmountPerTick(
  spiritLockTicks: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(spiritLockTicks, spirit).perTick;
}

export function getManaRegenPerSecond(
  spiritLockTicks: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(spiritLockTicks, spirit).perSec;
}

export interface ClassStatCurve {
  baseIntellect: number;
  baseSpirit: number;
  intellectPerLevel: number;
  spiritPerLevel: number;
  baseUniqueStat: number;
  uniqueStatPerLevel: number;
}

export interface ClassParamsBlueprint {
  druid?: {
    omenExpendOnHotTickChance: number;
    hasteClearcasting: number;
    hasteTreeOfLife: number;
  };
}

export interface ClassMechanicsBlueprint {
  manaCost?: ManaCostLogicKey;
  onHealLand?: OnHealLandMechanicKey[];
  onCrit?: OnCritMechanicKey[];
  directHealTargetAmp?: DirectHealTargetAmpKey[];
  castHasteBonus?: CastHasteBonusKey[];
  healCastCooldown?: HealCastCooldownKey[];
  holyPowerStepsAfterHeal?: HolyPowerStepAfterHealKey[];
  onResourceTick?: OnResourceTickMechanicKey[];
  passiveCombatHasteBonus?: PassiveCombatHasteBonusKey[];
  hotTickPlayerEffects?: HotTickPlayerEffectsKey[];
}

export interface ClassBlueprint {
  id: ClassType;
  name: string;
  description: string;
  iconKey: string;
  color: string;
  textColor: string;
  hoverBorderClass: string;
  locked: boolean;
  portraitUrl: string;
  portraitIcon: string;
  portraitGlow: string;
  passiveTraitName: string;
  passiveTraitDescription: string;
  passiveTraitIcon: string;
  unlock?: {
    minMaxLevelAcrossRoster?: number;
  };
  tutorial?: { passiveDescription?: string };
  uiTransform?: string;
  talentGlow?: string;
  capstone?: { id: string; formId: string };
  uniqueStat: {
    label: string;
    description: string;
  };
  statCurves: ClassStatCurve;
  progression: {
    starterSpells: string[];
    spellOrder: string[];
    capstoneForm: CapstoneFormId;
    capstoneMechanicId: string;
    capstonePlayerBuffId: string;
  };
  params?: ClassParamsBlueprint;
  mechanics?: ClassMechanicsBlueprint;
}

const CONFIGS: Record<ClassType, ClassBlueprint> = {
  DRUID: druidConfig as ClassBlueprint,
  PRIEST: priestConfig as ClassBlueprint,
  PALADIN: paladinConfig as ClassBlueprint,
};

export function getClassBlueprint(cls: ClassType): ClassBlueprint {
  return CONFIGS[cls];
}

export function isClassLockedByAccountMaxLevel(cls: ClassType, rosterMaxLevel: number): boolean {
  const min = getClassBlueprint(cls).unlock?.minMaxLevelAcrossRoster;
  if (min === undefined || min <= 0) return false;
  return rosterMaxLevel < min;
}

export function accountProgressLockBannerText(cls: ClassType): string | null {
  const min = getClassBlueprint(cls).unlock?.minMaxLevelAcrossRoster;
  if (min === undefined || min <= 0) return null;
  return `Reach level ${min} on any character`;
}

function getClassJson(cls: ClassType) {
  return CONFIGS[cls];
}

export const CLASS_STAT_CURVE: Record<ClassType, ClassStatCurve> = {
  PRIEST: CONFIGS.PRIEST.statCurves,
  DRUID: CONFIGS.DRUID.statCurves,
  PALADIN: CONFIGS.PALADIN.statCurves,
};

export type ScaledCurveStat = 'intellect' | 'spirit' | 'uniqueStatBase';

export function getScaledStat(cls: ClassType, level: number, stat: ScaledCurveStat): number {
  const curves = CONFIGS[cls].statCurves;
  const lv = Math.max(1, level);
  if (stat === 'intellect') return curves.baseIntellect + (lv - 1) * curves.intellectPerLevel;
  if (stat === 'spirit') return curves.baseSpirit + (lv - 1) * curves.spiritPerLevel;
  return curves.baseUniqueStat + (lv - 1) * curves.uniqueStatPerLevel;
}

export function getPrimaryStats(
  cls: ClassType | null,
  level: number,
): { intellect: number; spirit: number } {
  if (!cls) return { intellect: 0, spirit: 0 };
  return {
    intellect: getScaledStat(cls, level, 'intellect'),
    spirit: getScaledStat(cls, level, 'spirit'),
  };
}

export function getUniqueStatRating(
  cls: ClassType | null,
  level: number,
  talents: { points: number; maxPoints: number; statBonus?: { uniqueStat?: number } }[],
): number {
  if (!cls) return 0;
  const base = getScaledStat(cls, level, 'uniqueStatBase');
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

export function getTalentStats(talents: { points: number; maxPoints: number; statBonus?: any }[]): TalentStatModifiers {
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

export function getTalentMana(talents: { points: number; maxPoints: number; statBonus?: any }[]): number {
  return getTalentStats(talents).flatMana;
}

export function getTalentHealingBonusPct(talents: { points: number; maxPoints: number; statBonus?: any }[]): number {
  return getTalentStats(talents).healingBoostPct;
}

export function getTalentCritChancePct(talents: { points: number; maxPoints: number; statBonus?: any }[]): number {
  return getTalentStats(talents).critChancePct;
}

export function getTalentHastePct(talents: { points: number; maxPoints: number; statBonus?: any }[]): number {
  return getTalentStats(talents).hastePct;
}

export function getNaturePerfectionBonus(naturalPerfectionStacks: number): number {
  return naturalPerfectionStacks * BALANCE.combat.druid.naturalPerfectionCritBonusPerStack;
}

export function getMaxMana(cls: ClassType | null, level: number, talents: { points: number; maxPoints: number; statBonus?: any }[]): number {
  if (!cls) return 100;
  const { intellect } = getPrimaryStats(cls, level);
  return Math.round(intellect * MANA_PER_INTELLECT + getTalentStats(talents).flatMana);
}

export function getHealingMultiplier(
  cls: ClassType | null,
  level: number,
  talents: { points: number; maxPoints: number; statBonus?: any }[],
): number {
  if (!cls) return 1;
  const { spirit } = getPrimaryStats(cls, level);
  const talentPct = getTalentStats(talents).healingBoostPct;
  const spiritPct = spirit * HEALING_PCT_PER_SPIRIT;
  return 1 + (spiritPct + talentPct) / 100;
}

// ========= Stat Breakdown =========

export interface PlayerStatBreakdown {
  intellect: number;
  spirit: number;
  maxHealth: number;
  manaPerIntellect: number;
  healingPctPerSpirit: number;
  manaFromIntellect: number;
  manaFromTalents: number;
  maxMana: number;
  spiritHealBonusPct: number;
  talentHealBonusPct: number;
  totalHealBonusPct: number;
  healEffectMult: number;
  spiritRegenMult: number;
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

// Ally health defaults
export function getMaxHealthForPool(
  role: 'TANK' | 'DPS',
  level: number,
  healthScaling?: { base: number; perLevel: number },
): number {
  const s = healthScaling ?? BALANCE.allyHealth[role];
  const lv = Math.max(1, level);
  return Math.round(s.base + (lv - 1) * s.perLevel);
}

export function getMaxHealth(role: 'TANK' | 'DPS', level: number): number {
  return getMaxHealthForPool(role, level, undefined);
}

export function getStatBreakdown(
  cls: ClassType,
  level: number,
  talents: { points: number; maxPoints: number; statBonus?: any }[],
): PlayerStatBreakdown {
  const { intellect, spirit } = getPrimaryStats(cls, level);
  const tStats = getTalentStats(talents);
  const manaFromTalents = tStats.flatMana;
  const manaFromIntellect = Math.round(intellect * MANA_PER_INTELLECT);
  const maxMana = manaFromIntellect + manaFromTalents;
  const spiritRawPct = spirit * HEALING_PCT_PER_SPIRIT;
  const talentRawPct = tStats.healingBoostPct;
  const spiritHealBonusPct = Math.round(spiritRawPct * 10) / 10;
  const talentHealBonusPct = Math.round(talentRawPct * 10) / 10;
  const totalHealBonusPct = spiritRawPct + talentRawPct;
  const healEffectMult = Math.round((1 + totalHealBonusPct / 100) * 1000) / 1000;
  const spiritRegenMult = Math.round(getSpiritRegenMultiplier(spirit) * 1000) / 1000;
  const critChancePct = tStats.critChancePct;
  const hastePct = tStats.hastePct;
  const bonusHealing = Math.round(100 * (healEffectMult - 1));
  const classJson = getClassJson(cls);
  const uniqueStatRating = Math.round(getUniqueStatRating(cls, level, talents) * 10) / 10;
  return {
    intellect,
    spirit,
    maxHealth: getMaxHealth('DPS', level),
    manaPerIntellect: MANA_PER_INTELLECT,
    healingPctPerSpirit: HEALING_PCT_PER_SPIRIT,
    manaFromIntellect,
    manaFromTalents,
    maxMana,
    spiritHealBonusPct,
    talentHealBonusPct,
    totalHealBonusPct: Math.round(totalHealBonusPct * 10) / 10,
    healEffectMult,
    spiritRegenMult,
    critChancePct,
    hastePct,
    bonusHealing,
    uniqueStatLabel: classJson.uniqueStat.label,
    uniqueStatRating,
    uniqueStatDescription: classJson.uniqueStat.description,
    passiveTraitName: classJson?.passiveTraitName ?? '',
    passiveTraitDescription: classJson?.passiveTraitDescription ?? '',
    passiveTraitIcon: classJson?.passiveTraitIcon ?? 'wow/spell_holy_sealofwisdom',
  };
}

// ========= Spell Helper Functions =========

import type { Spell } from '../../systems/Types';

export function spellHasTag(spellId: string, tag: string): boolean {
  const spell = SPELLS[spellId];
  if (!spell) return false;
  return spell.tags?.includes(tag) ?? false;
}

export function getSpellRank(spellId: string, cls: ClassType, level: number): number {
  const spell = SPELLS[spellId];
  if (!spell) return 0;
  return 1;
}

export function getSpellUpgradeAtLevel(spellId: string, level: number): string[] {
  return [];
}

export function getPotionUpgradeAtLevel(level: number): number | null {
  return null;
}

export function getSpell(spellId: string): Spell | undefined {
  return SPELLS[spellId];
}

export function getSpellOrder(cls: ClassType): string[] {
  const classJson = getClassJson(cls);
  return classJson.progression.spellOrder;
}

export function getStarterSpells(cls: ClassType): string[] {
  const classJson = getClassJson(cls);
  return classJson.progression.starterSpells;
}

export function getCapstone(cls: ClassType): { id: string; formId: string } | null {
  const classJson = getClassJson(cls);
  return classJson?.capstone ?? null;
}

export function getPortrait(cls: ClassType): string {
  const classJson = getClassJson(cls);
  return classJson?.portraitUrl ?? '';
}

export function getTutorialCopy(cls: ClassType): any {
  const classJson = getClassJson(cls);
  return classJson?.tutorial ?? null;
}

export function getTalentGlow(cls: ClassType): string {
  const classJson = getClassJson(cls);
  return classJson?.talentGlow ?? 'holy';
}

export function getClassMetadata(cls: ClassType): any {
  return getClassJson(cls);
}

// ========= Progression =========

export const CLASS_PROGRESSION: Record<
  ClassType,
  { capstoneMechanicId: string; capstoneForm: CapstoneFormId; capstonePlayerBuffId: string }
> = {
  PRIEST: {
    capstoneMechanicId: CONFIGS.PRIEST.progression.capstoneMechanicId,
    capstoneForm: CONFIGS.PRIEST.progression.capstoneForm,
    capstonePlayerBuffId: CONFIGS.PRIEST.progression.capstonePlayerBuffId,
  },
  DRUID: {
    capstoneMechanicId: CONFIGS.DRUID.progression.capstoneMechanicId,
    capstoneForm: CONFIGS.DRUID.progression.capstoneForm,
    capstonePlayerBuffId: CONFIGS.DRUID.progression.capstonePlayerBuffId,
  },
  PALADIN: {
    capstoneMechanicId: CONFIGS.PALADIN.progression.capstoneMechanicId,
    capstoneForm: CONFIGS.PALADIN.progression.capstoneForm,
    capstonePlayerBuffId: CONFIGS.PALADIN.progression.capstonePlayerBuffId,
  },
};

export const CAPSTONE_PLAYER_BUFF_IDS = ALL_CLASSES.map(
  (c) => CONFIGS[c].progression.capstonePlayerBuffId,
);

export function getPrerequisiteIds(talents: Talent[], talent: Talent): string[] {
  const byId = new Map(talents.map((t) => [t.id, t] as const));
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

export function getUnmetPrerequisites(talents: Talent[], talent: Talent): Talent[] {
  const byId = new Map(talents.map((t) => [t.id, t] as const));
  return getPrerequisiteIds(talents, talent)
    .map((id) => byId.get(id))
    .filter((t): t is Talent => !!t && t.points === 0);
}

export function arePrereqsSatisfied(talents: Talent[], talent: Talent): boolean {
  return getUnmetPrerequisites(talents, talent).length === 0;
}

export function pickTutorialFirstTalentId(
  talents: Talent[],
  talentPoints: number,
  playerLevel: number,
): string | null {
  for (const t of talents) {
    if (t.points >= t.maxPoints) continue;
    if (t.levelReq > playerLevel) continue;
    if (getUnmetPrerequisites(talents, t).length > 0) continue;
    if (talentPoints < t.cost) continue;
    return t.id;
  }
  return null;
}

export function rollCritAgainstEffective(
  critRoll0to100: number,
  stats: { critChancePercent: (natPerfStacks: number, extraCritPct?: number) => number },
  natPerfStacks: number,
  extraCritPct = 0,
): boolean {
  return critRoll0to100 < stats.critChancePercent(natPerfStacks, extraCritPct);
}

// ========= Mana Potion Calculations =========

import consumablesData from '../../data/world/consumables.json' with { type: 'json' };

type ManaPotionTier = (typeof consumablesData.mana_potion.tiers)[number];

function potionTierAtLevel(level: number): ManaPotionTier {
  for (const t of consumablesData.mana_potion.tiers) {
    if (level <= t.maxLevel) return t;
  }
  return consumablesData.mana_potion.tiers[consumablesData.mana_potion.tiers.length - 1]!;
}

export function manaPotionInstantMana(level: number): number {
  return potionTierAtLevel(level).instant;
}

export function manaPotionOverTimeTotal(level: number): number {
  return manaPotionInstantMana(level) * consumablesData.mana_potion.overTimeFractionOfInstant;
}

export const FLOATING_COMBAT_TEXT_LIFETIME_TICKS = BALANCE.combat.shared.floatingCombatTextLifetimeTicks;

export function getHealSplit(
  healthBefore: number,
  maxHealth: number,
  rawHeal: number,
): { eff: number; oh: number } {
  if (healthBefore <= 0 || rawHeal <= 0) return { eff: 0, oh: 0 };
  const room = Math.max(0, maxHealth - healthBefore);
  const eff = Math.min(room, rawHeal);
  return { eff, oh: Math.max(0, rawHeal - eff) };
}

export function mapEntityById<T extends { id: string }>(
  list: readonly T[],
  entityId: string,
  next: (row: T) => T,
): T[] {
  return list.map((row) => (row.id === entityId ? next(row) : row));
}

export type FctDraft = {
  unitId: string;
  amount: number;
  kind: 'heal' | 'absorb';
  crit: boolean;
};

export function mergeFloats(
  existing: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
  drafts: FctDraft[],
): FloatingCombatTextEntry[] {
  return appendFloatingCombatDrafts(
    pruneFloats(existing, combatElapsedTicks),
    combatElapsedTicks,
    drafts,
  );
}

export function appendFloatingCombatDrafts(
  pruned: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
  drafts: FctDraft[],
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

export function pruneFloats(
  entries: FloatingCombatTextEntry[],
  combatElapsedTicks: number,
): FloatingCombatTextEntry[] {
  return entries.filter((e) => e.expiresAtCombatTick > combatElapsedTicks);
}

export function diffFloats(before: Unit[], after: Unit[], healCrit: boolean): FctDraft[] {
  const out: FctDraft[] = [];
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

export const T_SPIRIT_AMP = BALANCE.combat.shared.spiritRedemptionAmpTicks;

