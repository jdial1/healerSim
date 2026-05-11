// combat.ts — mechanics, casting pipeline, class helpers, ClassRegistry
// Class-specific behavior lives in this module; legacy `src/classes/` is removed.

import { GameState, Spell, Unit, StatusEffect, EffectCategory, ClassType, Talent, EffectivePlayerCombatStats,CapstoneFormId,MechanicId, PlayerCombatStats } from '../../systems/Types';
import type { CastRuntime, ReadyCast, HotTickModifierContext, HealLandContext, StandardReady } from '../../systems/Types';
import { BALANCE } from '../../data/index';
import {
  MANA_POTION_USES_PER_DUNGEON,
  TICKS_PER_SECOND,
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  SPELLS,
} from '../../systems/Constants';
import {
  getSpellRank,
  getRankHealMult,
  spellHasTag,
  rollCritAgainstEffective,
  getUniqueStatRating,
  getHealingMultiplier,
  getTalentHastePct,
  getTalentCritChancePct,
  getNaturePerfectionBonus,
  getMaxMana,
  getPrimaryStats,
  getTalentStats,
  diffFloats,
  mergeFloats,
  getHealSplit,
  CLASS_PROGRESSION,
} from './formulas';
import { getClassStrategy } from '../../systems/classStrategy';
import { mergePowerInfusionCharges } from '../../systems/powerInfusionCharges';

const TICKS_1S = 10;
export const PLAYER_BUFF_MANA_REGEN_POTION = 'mana_regen_potion';
export const PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT = 'spirit_regen_lockout';
export const PLAYER_BUFF_POWER_INFUSION = 'power_infusion';
export const PLAYER_BUFF_NATURAL_PERFECTION = 'natural_perfection';

const PLAYER_COMBAT_BUFF_NO_TIME_DECAY = new Set([
  PLAYER_BUFF_POWER_INFUSION,
  PLAYER_BUFF_NATURAL_PERFECTION,
]);

export const EffectManager = {
  isActive(b: StatusEffect): boolean {
    if (PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id)) return b.stacks > 0;
    return b.remainingTicks > 0;
  },

  has(effects: StatusEffect[], id: string): boolean {
    return effects.some((b) => b.id === id && EffectManager.isActive(b));
  },

  getTicks(effects: StatusEffect[], id: string): number {
    const b = effects.find((x) => x.id === id);
    if (!b || PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(id)) return 0;
    return b.remainingTicks > 0 ? b.remainingTicks : 0;
  },

  getStacks(effects: StatusEffect[], id: string): number {
    const b = effects.find((x) => x.id === id);
    if (!b || !EffectManager.isActive(b)) return 0;
    return b.stacks;
  },

  add(
    buffs: StatusEffect[],
    id: string,
    ticks: number,
    stacks: number,
    extra?: {
      potionDripPerTick?: number;
      category?: StatusEffect['category'];
      sourceId?: string;
      name?: string;
      icon?: string;
      valuePerTick?: number;
    },
  ): StatusEffect[] {
    const i = buffs.findIndex((b) => b.id === id);
    const drip = extra?.potionDripPerTick;
    const vpt = extra?.valuePerTick;
    if (i < 0) {
      const newBuff: StatusEffect = {
        id,
        name: extra?.name ?? id,
        icon: extra?.icon ?? '',
        remainingTicks: ticks,
        category: extra?.category ?? 'helpful',
        sourceId: extra?.sourceId ?? id,
        stacks,
        valuePerTick: vpt,
        ...(drip !== undefined ? { potionDripPerTick: drip } : {}),
      };
      return [...buffs, newBuff];
    }
    const prev = buffs[i];
    const nextDrip = drip !== undefined ? drip : prev.potionDripPerTick;
    const nextVpt = vpt !== undefined ? vpt : prev.valuePerTick;
    const next = [...buffs];
    next[i] = {
      ...prev,
      remainingTicks: Math.max(ticks, prev.remainingTicks),
      stacks,
      valuePerTick: nextVpt,
      ...(nextDrip !== undefined ? { potionDripPerTick: nextDrip } : {}),
    };
    return next;
  },

  remove(effects: StatusEffect[], id: string): StatusEffect[] {
    return effects.filter((b) => b.id !== id);
  },

  decrementStack(buffs: StatusEffect[], id: string): StatusEffect[] {
    return buffs
      .map((b) => {
        if (b.id !== id) return b;
        if (b.stacks <= 1) return { ...b, remainingTicks: 0, stacks: 0 };
        return { ...b, stacks: b.stacks - 1 };
      })
      .filter((b) => b.remainingTicks > 0 && b.stacks > 0);
  },

  dispelOne(effects: StatusEffect[]): StatusEffect[] {
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].isDispellable) {
        return effects.filter((_, j) => j !== i);
      }
    }
    return effects;
  },

  tickPlayerBuffs(buffs: StatusEffect[]): StatusEffect[] {
    return buffs
      .map((b) =>
        PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id) ? b : { ...b, remainingTicks: b.remainingTicks - 1 },
      )
      .filter((b) => EffectManager.isActive(b));
  },

  tickSimpleDurations(effects: StatusEffect[]): StatusEffect[] {
    return effects
      .map((e) => ({ ...e, remainingTicks: e.remainingTicks - 1 }))
      .filter((e) => e.remainingTicks > 0);
  },

  afterHarmfulDamageTick(effect: StatusEffect): StatusEffect | null {
    const nextTicks = effect.remainingTicks - 1;
    if (nextTicks <= 0) return null;
    return { ...effect, remainingTicks: nextTicks };
  },

  getPotionDrip(buffs: StatusEffect[]): number {
    const b = buffs.find((x) => x.id === PLAYER_BUFF_MANA_REGEN_POTION);
    if (!b || b.remainingTicks <= 0) return 0;
    return b.potionDripPerTick ?? 0;
  },

  hotPandemicCapMult(spell: Spell): number {
    const SHARED = BALANCE.combat.shared;
    return spell.balance?.hotPandemicDurationCapMult ?? SHARED.hotPandemicDurationCapMultDefault;
  },

  applyHot(
    unit: Unit,
    spell: Spell,
    healingPerTick: number,
    opts?: { hasteTickScale?: number; bloomBurstHeal?: number },
  ): Unit {
    const baseTicks = spell.hotDuration ?? 0;
    if (baseTicks <= 0) return unit;
    const capTicks = Math.max(baseTicks, Math.floor(baseTicks * EffectManager.hotPandemicCapMult(spell)));
    const existingIdx = unit.effects.findIndex((effect) => effect.sourceId === spell.id);

    let carried = 0;
    let kept = unit.effects;
    if (existingIdx >= 0) {
      carried = unit.effects[existingIdx].remainingTicks;
      kept = unit.effects.filter((_, i) => i !== existingIdx);
    }

    const combined = Math.min(carried + baseTicks, capTicks);
    const scale = opts?.hasteTickScale ?? 1;
    const bloom =
      opts?.bloomBurstHeal ?? (spell.id === 'lifebloom' ? Math.max(0, spell.healing) : undefined);

    const effect: StatusEffect = {
      id: spell.id,
      name: spell.name,
      remainingTicks: combined,
      valuePerTick: healingPerTick,
      icon: spell.icon,
      sourceId: spell.id,
      durationTicksMax: combined,
      tickIntervalScale: scale,
      tickAccumulator: 0,
      bloomBurstHeal: bloom && bloom > 0 ? bloom : undefined,
      rendersAsHoTRing: true,
      category: 'helpful',
      stacks: 1,
    };

    return { ...unit, effects: [...kept, effect] };
  },

  rollOmenOnHotTick(
    state: GameState,
    tickAmt: number,
    sourceSpellId: string,
    playerEffects: StatusEffect[],
    random: () => number,
  ): StatusEffect[] {
    if (!state.playerClass) return playerEffects;
    return getClassStrategy(state.playerClass).rollHotTickPlayerEffects({
      state,
      tickAmt,
      sourceSpellId,
      playerEffects,
      random,
    });
  },

  tickHelpfulHoTs(
    state: GameState,
    party: Unit[],
    random: () => number,
  ): {
    party: Unit[];
    hotManaReturn: number;
    playerEffects: StatusEffect[];
    tickHealEff: number;
    tickHealOh: number;
    fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  } {
    let hotManaReturn = 0;
    let playerEffects = state.playerEffects;
    let tickHealEff = 0;
    let tickHealOh = 0;
    const fctDrafts: Array<{
      unitId: string;
      amount: number;
      kind: 'heal' | 'absorb';
      crit: boolean;
    }> = [];

    const newParty = party.map((unit) => {
      let currentHealth = unit.health;
      const activeEffects: StatusEffect[] = [];
      const hpBeforeBuffTick = currentHealth;

      unit.effects.forEach((effect) => {
        if (effect.category === 'helpful' && effect.remainingTicks > 0 && effect.valuePerTick) {
          const hpTick = effect.valuePerTick;
          let tickAcc =
            (effect.tickAccumulator ?? 0) +
            (effect.tickIntervalScale ?? 1) *
              getHotTickRateMultiplier({ state, unit, effect, healPerTick: hpTick });
          let rem = effect.remainingTicks;
          while (tickAcc >= 1 && rem > 0 && hpTick > 0) {
            tickAcc -= 1;
            const tickCtx: HotTickModifierContext = {
              state,
              unit,
              effect,
              healPerTick: hpTick,
            };
            const tickAmt = getHotTickAmount(tickCtx);
            if (currentHealth > 0) {
              const ht = getHealSplit(currentHealth, unit.maxHealth, tickAmt);
              tickHealEff += ht.eff;
              tickHealOh += ht.oh;
              currentHealth = Math.min(unit.maxHealth, currentHealth + tickAmt);
            }
            hotManaReturn += getHotTickManaReturn({
              ...tickCtx,
              appliedTickHeal: tickAmt,
            });
            playerEffects = EffectManager.rollOmenOnHotTick(
              state,
              tickAmt,
              effect.sourceId,
              playerEffects,
              random,
            );
            rem -= 1;
            if (rem > 0) {
              activeEffects.push({
                ...effect,
                remainingTicks: rem,
                tickAccumulator: tickAcc,
              });
            }
          }
        } else if (effect.remainingTicks > 0) {
          activeEffects.push(effect);
        }
      });

      const buffHealGain = currentHealth - hpBeforeBuffTick;
      if (buffHealGain > 0) {
        fctDrafts.push({
          unitId: unit.id,
          amount: buffHealGain,
          kind: 'heal',
          crit: false,
        });
      }

      return { ...unit, health: currentHealth, effects: activeEffects };
    });

    return { party: newParty, hotManaReturn, playerEffects, tickHealEff, tickHealOh, fctDrafts };
  },
};

export const TICKS_SPIRIT_REDEMPTION = 10 * TICKS_1S;
export { ICD_SPIRIT_REDEMPTION } from '../../systems/Constants';
export const SURGE_OF_LIGHT_TICKS = 6 * TICKS_1S;
export const HEALER_UNIT_ID = '5';

const MENTAL_FORTITUDE_MANA_FRACTION_PER_5S = 0.01;

// ========= Talent / buff rule helpers =========

export function getRanks(talents: Talent[], idOrMechanicId: string): number {
  return talents
    .filter((t) => t.mechanicId === idOrMechanicId || t.id === idOrMechanicId)
    .reduce((a, t) => a + t.points, 0);
}

export function hasTalent(talents: Talent[], mechanicId: string | MechanicId): boolean {
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

export function hasBuff(buffs: StatusEffect[], id: string): boolean {
  return EffectManager.has(buffs, id);
}

export function getBuffTicks(buffs: StatusEffect[], id: string): number {
  return EffectManager.getTicks(buffs, id);
}

export function getBuffStacks(buffs: StatusEffect[], id: string): number {
  return EffectManager.getStacks(buffs, id);
}

export function getNaturalPerfectionStacks(buffs: StatusEffect[]): number {
  return getBuffStacks(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
}

export function getCapstoneAfterTick(
  form: CapstoneFormId | null,
  buffs: StatusEffect[],
  playerClass: ClassType | null,
): CapstoneFormId | null {
  if (!form || !playerClass) return null;
  const config = CLASS_PROGRESSION[playerClass];
  if ((form as string) === (config.capstoneForm as string)) {
    return hasBuff(buffs, config.capstonePlayerBuffId) ? form : null;
  }
  return null;
}

export function addSpiritLockoutIfSpent(
  buffs: StatusEffect[],
  spentMana: boolean,
): StatusEffect[] {
  if (!spentMana) return buffs;
  return addBuff(buffs, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT, MANA_SPIRIT_REGEN_LOCKOUT_TICKS, 1);
}

export function addBuff(
  buffs: StatusEffect[],
  id: string,
  ticks: number,
  stacks: number,
  extra?: {
    potionDripPerTick?: number;
    category?: StatusEffect['category'];
    sourceId?: string;
    name?: string;
    icon?: string;
    valuePerTick?: number;
  },
): StatusEffect[] {
  return EffectManager.add(buffs, id, ticks, stacks, extra);
}

export function getPotionDrip(buffs: StatusEffect[]): number {
  return EffectManager.getPotionDrip(buffs);
}

export function tickBuffs(buffs: StatusEffect[]): StatusEffect[] {
  return EffectManager.tickPlayerBuffs(buffs);
}

export function decrementBuff(buffs: StatusEffect[], id: string): StatusEffect[] {
  return EffectManager.decrementStack(buffs, id);
}

export function removeBuff(buffs: StatusEffect[], id: string): StatusEffect[] {
  return EffectManager.remove(buffs, id);
}

export function applyPiAfterCd(
  buffs: StatusEffect[],
  castsRemaining: number,
): StatusEffect[] {
  if (castsRemaining <= 0) return removeBuff(buffs, PLAYER_BUFF_POWER_INFUSION);
  return addBuff(buffs, PLAYER_BUFF_POWER_INFUSION, 1, castsRemaining);
}

export function addPiCharges(buffs: StatusEffect[], minCharges: number): StatusEffect[] {
  return mergePowerInfusionCharges(buffs, minCharges);
}

export function addNaturalPerfection(buffs: StatusEffect[], stacks: number): StatusEffect[] {
  if (stacks <= 0) return removeBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
  return addBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION, 1, stacks);
}

export function isReady(icds: Record<string, number>, key: string): boolean {
  return (icds[key] ?? 0) <= 0;
}

export function getHealer(party: Unit[]): Unit | undefined {
  return party.find((u) => u.role === 'HEALER');
}

export function hasHot(unit: Unit): boolean {
  return unit.effects.some((b) => 
    spellHasTag(b.sourceId, 'druid-hot') || 
    spellHasTag(b.sourceId, 'synergy-primer-source')
  );
}

export function getConsumableHotIndex(unit: Unit): number {
  const prefer = unit.effects.findIndex((b) => spellHasTag(b.sourceId, 'swiftmend-prefer'));
  if (prefer >= 0) return prefer;
  return unit.effects.findIndex((b) => spellHasTag(b.sourceId, 'swiftmend-consumable'));
}

export function isHeal(spell: { type: string }, spellId: string): boolean {
  if (spellId === 'mana_potion') return false;
  return spell.type === 'DIRECT' || spell.type === 'HOT' || spell.type === 'AOE';
}

export function isDirectHeal(spell: { type: string; healing: number; hotDuration?: number } | undefined, spellId: string): boolean {
  if (spellId === 'mana_potion') return false;
  if (!spell) return false;
  if (spell.type === 'AOE' || spell.type === 'DIRECT') return true;
  if (spell.type === 'HOT' && (spell.healing ?? 0) > 0) return true;
  return false;
}

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

export function getGeneralManaReturn(
  maxMana: number,
  talents: Talent[],
  spiritLockTicks: number,
): number {
  if (spiritLockTicks > 0) return 0;
  const t = talents.find((x) => x.mechanicId === 'priest_meditative_wellspring');
  if (!t || t.points < t.maxPoints) return 0;
  return (maxMana * MENTAL_FORTITUDE_MANA_FRACTION_PER_5S) / (5 * TICKS_PER_SECOND);
}
import consumablesData from '../../data/world/consumables.json' with { type: 'json' };
import aurasData from '../../data/world/auras.json' with { type: 'json' };


export type { CombatUidRandom } from '../../uids';
// ========= Types =========

export type CastInput = {
  spell: Spell;
  spellId: string;
  targetId: string;
  critRoll: number;
};

type SwiftmendReady = {
  kind: 'swiftmend';
  spell: Spell;
  spellId: string;
  targetId: string;
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
  critRoll: number;
};

type ManaPotionReady = {
  kind: 'mana_potion';
  spell: Spell;
  spellId: string;
  targetId: string;
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
};

// ========= Pipeline Logic (from engine.ts) =========

type CommonValidated = {
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
  healer: Unit;
};

function buildCommonValidated(
  state: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
): CommonValidated | null {
  const { spell, spellId, targetId, critRoll: _critRoll } = input;
  if (!state.playerClass) return null;
  if (cooldownRemainTicks > 0) return null;
  if (spellId === 'mana_potion' && state.potionsUsed >= MANA_POTION_USES_PER_DUNGEON) return null;
  const healerUnit = state.party.find((unit) => unit.role === 'HEALER');
  if (!healerUnit) return null;
  const effectiveStats = computeEffectivePlayerCombatStats(state);
  if (!effectiveStats) return null;
  const surgeFree =
    hasBuff(state.playerEffects, 'surge_of_light') && spellHasTag(spellId, 'surge-finisher');
  const needMana = getManaCost(state, state.playerClass, spell, spellId, surgeFree);
  if (state.mana < needMana) return null;
  const healTgt0 = state.party.find((unit) => unit.id === targetId);
  if (spell.type !== 'AOE' && isHeal(spell, spellId) && healTgt0 && healTgt0.health <= 0) {
    return null;
  }
  return { effectiveStats, needMana, healer: healerUnit };
}

function validateSwiftmendExclusive(
  state: GameState,
  input: CastInput,
  common: CommonValidated,
): SwiftmendReady | null {
  if (!canSwiftmend(state, input.targetId)) return null;
  return {
    kind: 'swiftmend',
    spell: input.spell,
    spellId: input.spellId,
    targetId: input.targetId,
    effectiveStats: common.effectiveStats,
    needMana: common.needMana,
    critRoll: input.critRoll,
  };
}

function validateManaPotionReady(
  _state: GameState,
  input: CastInput,
  common: CommonValidated,
): ManaPotionReady {
  return {
    kind: 'mana_potion',
    spell: input.spell,
    spellId: input.spellId,
    targetId: input.targetId,
    effectiveStats: common.effectiveStats,
    needMana: common.needMana,
  };
}

function validateStandardHeal(state: GameState, input: CastInput, common: CommonValidated): StandardReady {
  const { spell, spellId, targetId, critRoll } = input;
  const surgeFree =
    hasBuff(state.playerEffects, 'surge_of_light') && spellHasTag(spellId, 'surge-finisher');
  const healMultB =
    common.effectiveStats.baseHealingMultiplier * common.effectiveStats.spiritRedemptionMult;
  const flashCrit = getCritBonus(state, spellId, targetId);
  const isCrit = rollCritAgainstEffective(
    critRoll,
    common.effectiveStats,
    getNaturalPerfectionStacks(state.playerEffects),
    flashCrit,
  );
  const critH = isCrit ? 1.5 : 1.0;
  const tower2 = state.holyPower >= 3 && isDirectHeal(spell, spellId);
  const tMod = tower2 ? 2 : 1;
  const arch = state.capstoneForm === 'priest_archangel' && hasBuff(state.playerEffects, 'archangel');
  const bonusCastHasteFraction = getClassStrategy(state.playerClass).castHasteBonusFraction(state, targetId);
  let playerEffectsBaseline = state.playerEffects;
  if (surgeFree) {
    playerEffectsBaseline = removeBuff(playerEffectsBaseline, 'surge_of_light');
  }
  if (
    state.playerClass === 'DRUID' &&
    hasBuff(state.playerEffects, 'omen_clearcasting') &&
    (spellId === 'regrowth' || spellId === 'healing_touch')
  ) {
    playerEffectsBaseline = removeBuff(playerEffectsBaseline, 'omen_clearcasting');
  }
  const rankHealMult = state.playerClass
    ? getRankHealMult(getSpellRank(spellId, state.playerClass, state.level))
    : 1;
  return {
    kind: 'standard',
    spell,
    spellId,
    targetId,
    effectiveStats: common.effectiveStats,
    needMana: common.needMana,
    surgeFree,
    healMultB,
    isCrit,
    critH,
    tower2,
    tMod,
    arch,
    bonusCastHasteFraction,
    playerEffectsBaseline,
    rankHealMult,
  };
}

const SPECIAL_CAST_BY_SPELL_ID: Partial<
  Record<string, (state: GameState, input: CastInput, common: CommonValidated) => ReadyCast | null | 'standard'>
> = {
  swiftmend: (state, input, common) => {
    if (state.playerClass !== 'DRUID') return 'standard';
    return validateSwiftmendExclusive(state, input, common);
  },
  mana_potion: (_state, input, common) => validateManaPotionReady(_state, input, common),
};

export function validateCast(
  state: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
): ReadyCast | null {
  const common = buildCommonValidated(state, input, cooldownRemainTicks);
  if (!common) return null;
  const special = SPECIAL_CAST_BY_SPELL_ID[input.spellId];
  if (special) {
    const r = special(state, input, common);
    if (r === 'standard') return validateStandardHeal(state, input, common);
    return r;
  }
  return validateStandardHeal(state, input, common);
}

export function applyCast(state: GameState, ready: ReadyCast, rt: CastRuntime): GameState {
  switch (ready.kind) {
    case 'swiftmend':
      return applySwiftmendCast(state, ready, rt);
    case 'mana_potion':
      return applyManaPotionCast(state, ready, rt);
    case 'standard':
      return applyStandardHealCast(state, ready, rt);
  }
}

export function tryCast(
  state: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
  rt: CastRuntime,
): GameState {
  const ready = validateCast(state, input, cooldownRemainTicks);
  if (!ready) return state;
  return applyCast(state, ready, rt);
}

function applySwiftmendCast(state: GameState, ready: SwiftmendReady, rt: CastRuntime): GameState {
  const { spell, spellId, targetId, effectiveStats, needMana, critRoll } = ready;
  const out = trySpecialHealCast(state, {
    spell,
    spellId,
    targetId,
    needMana,
    critRoll,
    eff: {
      baseHealingMultiplier: effectiveStats.baseHealingMultiplier,
      critChancePercent: effectiveStats.critChancePercent,
    },
    runCooldown: (_rawCd: number, _piLeft: number) => 0,
  });
  return out ?? state;
}

function applyManaPotionCast(state: GameState, ready: ManaPotionReady, rt: CastRuntime): GameState {
  const { spell, spellId, effectiveStats } = ready;
  const durTicks = spell.manaRegenTicks ?? 0;
  const potionTier = consumablesData.mana_potion.tiers
    .slice()
    .reverse()
    .find((t: any) => state.level <= t.maxLevel) ?? consumablesData.mana_potion.tiers[0];
  const overTimeTotal = (spell as any).overTimeTotal ?? 0;
  const dripPerTick = durTicks > 0 ? overTimeTotal / durTicks : 0;
  const newManaP = Math.min(state.maxMana, state.mana + (potionTier.instant || 0));
  const nPiP = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks: spell.cooldown,
    hastePct: effectiveStats.hastePercent,
    powerInfusionStacks: getBuffStacks(state.playerEffects, PLAYER_BUFF_POWER_INFUSION),
  });
  let playerEffectsMp = addBuff(
    state.playerEffects,
    PLAYER_BUFF_MANA_REGEN_POTION,
    durTicks,
    1,
    { potionDripPerTick: dripPerTick },
  );
  playerEffectsMp = applyPiAfterCd(playerEffectsMp, nPiP);
  return {
    ...state,
    mana: newManaP,
    potionsUsed: state.potionsUsed + 1,
    playerEffects: playerEffectsMp,
  };
}

function patchPartyStandardDirectAndHot(
  state: GameState,
  ready: StandardReady,
): { newParty: Unit[]; healEff: number; healOh: number } {
  const { spell, spellId, targetId, healMultB, critH, tMod, arch, effectiveStats, rankHealMult } = ready;
  const hTickScale = effectiveStats.hasteTickScale;
  const shieldBonus = arch ? 0 : 0;
  const archEchoTargets = arch
    ? state.party.filter((unit) => unit.health > 0 && unit.id !== targetId).length
    : 0;
  const archEchoBonusPerTarget = archEchoTargets > 0 ? shieldBonus / archEchoTargets : 0;
  const splash = awsplashFraction(state);
  const graceRanks = getRanks(state.talents, 'priest_grace');
  const shieldTicksDefault = BALANCE.combat.shared.shieldDefaultTicks;
  const stratMul = state.playerClass ? getClassStrategy(state.playerClass) : null;
  let partyAfterHeal = state.party.map((unit) => ({ ...unit, effects: unit.effects.map((effect) => ({ ...effect })) }));
  let patchEffectiveHealing = 0;
  let patchOverhealing = 0;
  let lastDirectAmt = 0;
  
  const healOne = (unit: Unit) => {
    if (unit.health <= 0) return unit;
    const syn = getSynergyMultiplier(unit, spellId);
    const gr = graceHealMultiplierOnTarget(unit, graceRanks);
    const healAmp = getDirectHealMultiplier(state, spell, spellId);
    const rad = stratMul ? stratMul.directHealTargetMultiplier(state, spell, spellId, unit) : 1;
    const directAmt = spell.healing * rankHealMult * healMultB * critH * tMod * syn * gr * healAmp * rad;
    lastDirectAmt = directAmt;
    const room = Math.max(0, unit.maxHealth - unit.health);
    const applied = Math.min(room, directAmt);
    const overheal = Math.max(0, directAmt - applied);
    patchEffectiveHealing += applied;
    patchOverhealing += overheal;
    let shieldAdd = 0;
    if (state.playerClass === 'PRIEST' && overheal > 0) {
      const rating = getUniqueStatRating(state.playerClass, state.level, state.talents);
      shieldAdd = divinityOverhealAbsorb(overheal, rating);
    }
    const th = Math.min(unit.maxHealth, unit.health + directAmt);
    const nextShield = unit.shield + shieldAdd;
    let nextShieldTicks = unit.shieldTicks;
    if (shieldAdd > 0) nextShieldTicks = shieldTicksDefault;
    if (nextShield <= 0) nextShieldTicks = 0;
    return { ...unit, health: th, shield: nextShield, shieldTicks: nextShieldTicks };
  };
  
  if (spell.type === 'AOE') {
    partyAfterHeal = partyAfterHeal.map((unit) => (unit.health > 0 ? healOne(unit) : unit));
  } else {
    let splashDone = false;
    partyAfterHeal = partyAfterHeal.map((unit) => {
      if (unit.id === targetId) {
        const healed = healOne(unit);
        if (splash > 0 && !splashDone && isDirectHeal(spell, spellId)) {
          splashDone = true;
          let bestId: string | null = null;
          let bestPct = 2;
          for (const ally of partyAfterHeal) {
            if (ally.id === targetId || ally.health <= 0) continue;
            const pct = ally.health / ally.maxHealth;
            if (pct < bestPct) {
              bestPct = pct;
              bestId = ally.id;
            }
          }
          if (bestId) {
            const splashRaw = lastDirectAmt * splash;
            partyAfterHeal = partyAfterHeal.map((ally) => {
              if (ally.id !== bestId) return ally;
              const { eff, oh } = getHealSplit(ally.health, ally.maxHealth, splashRaw);
              patchEffectiveHealing += eff;
              patchOverhealing += oh;
              return { ...ally, health: Math.min(ally.maxHealth, ally.health + splashRaw) };
            });
          }
        }
        return healed;
      }
      return unit;
    });
  }
  if (arch && shieldBonus > 0) {
    partyAfterHeal = partyAfterHeal.map((unit) => ({ ...unit, shield: 0, shieldTicks: 0 }));
  }
  return { newParty: partyAfterHeal, healEff: patchEffectiveHealing, healOh: patchOverhealing };
}

function applyStandardHealCast(state: GameState, ready: StandardReady, rt: CastRuntime): GameState {
  const {
    spell,
    spellId,
    targetId,
    needMana,
    surgeFree,
    isCrit: isCritH,
    tower2,
    bonusCastHasteFraction,
    playerEffectsBaseline,
    effectiveStats,
  } = ready;
  let castEffects = playerEffectsBaseline;
  let weaveDirectMult = 1;
  let weaveHotMult = 1;
  if (state.playerClass === 'PRIEST') {
    if (spell.type === 'HOT' && hasBuff(castEffects, 'priest_weave_hot')) {
      weaveHotMult += 0.2;
      castEffects = removeBuff(castEffects, 'priest_weave_hot');
    }
    if (isDirectHeal(spell, spellId) && hasBuff(castEffects, 'priest_weave_direct')) {
      weaveDirectMult += 0.15;
      castEffects = removeBuff(castEffects, 'priest_weave_direct');
    }
  }
  const readyWithWeave = {
    ...ready,
    healMultB: ready.healMultB * (isDirectHeal(spell, spellId) ? weaveDirectMult : weaveHotMult),
    pEffectsBaseline: castEffects,
  };
  const {
    newParty: partyAfterDirectHot,
    healEff: patchEffectiveHealing,
    healOh: patchOverhealing,
  } = patchPartyStandardDirectAndHot(state, readyWithWeave);
  const landCtx: HealLandContext = {
    state,
    spell,
    spellId,
    targetId,
    partyBeforeCast: state.party,
    healMultB: ready.healMultB,
    critH: ready.critH,
    tMod: ready.tMod,
    isCrit: isCritH,
    rankHealMult: ready.rankHealMult,
  };
  let postHeal = onHealLand(state, landCtx, partyAfterDirectHot, castEffects);
  let partyAfterHeal = postHeal.party;
  let playerEffects = postHeal.playerEffects;

  let sMerged: GameState = { ...state, party: partyAfterHeal, playerEffects };
  if (state.playerClass) {
    sMerged = getClassStrategy(state.playerClass).onCrit(landCtx, sMerged);
  }
  partyAfterHeal = sMerged.party;
  playerEffects = sMerged.playerEffects;

  if (state.playerClass === 'PRIEST' && spell.type === 'HOT') {
    playerEffects = addBuff(playerEffects, 'priest_weave_direct', 80, 1, { category: 'helpful' });
  }
  let resultingMana = onManaAfterHeal(state, spell, spellId, needMana, surgeFree, isCritH, targetId, state.mana - needMana);
  const rawCooldownTicks = state.playerClass
    ? getClassStrategy(state.playerClass).resolveHealCastCooldownTicks(state, spellId, spell, spell.cooldown)
    : spell.cooldown;
  const nPi = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks,
    hastePct: effectiveStats.hastePercent + bonusCastHasteFraction * 100,
    powerInfusionStacks: getBuffStacks(playerEffects, PLAYER_BUFF_POWER_INFUSION),
  });
  let hp2 = state.playerClass
    ? getClassStrategy(state.playerClass).applyHolyPowerStepsAfterHeal(state, {
        spell,
        spellId,
        targetId,
        holyPower: sMerged.holyPower,
        playerEffects,
        preHealParty: state.party,
      })
    : sMerged.holyPower;
  if (tower2) {
    hp2 = 0;
  }
  const spentManaForSpiritRegen =
    needMana > 0 && !(surgeFree && spellHasTag(spellId, 'surge-finisher'));
  playerEffects = addSpiritLockoutIfSpent(playerEffects, spentManaForSpiritRegen);
  playerEffects = applyPiAfterCd(playerEffects, nPi);
  const floats = diffFloats(state.party, partyAfterHeal, isCritH);
  const effectiveHealingCast = patchEffectiveHealing + postHeal.healEff;
  const overhealingCast = patchOverhealing + postHeal.healOh;
  const manaSpentHeal = isDirectHeal(spell, spellId) ? Math.max(0, state.mana - resultingMana) : 0;
  return {
    ...state,
    party: partyAfterHeal,
    mana: resultingMana,
    playerEffects,
    holyPower: hp2,
    enemyHealth: state.enemyHealth,
    combatFloats: mergeFloats(
      state.combatFloats,
      state.combatElapsedTicks,
      floats,
    ),
    runHealEff: state.runHealEff + effectiveHealingCast,
    runHealOh: state.runHealOh + overhealingCast,
    runManaSpent: state.runManaSpent + manaSpentHeal,
  };
}

export function computeEffectivePlayerCombatStats(state: GameState): EffectivePlayerCombatStats | null {
  if (!state.playerClass) return null;
  const cls = state.playerClass;
  const passiveHaste = getClassStrategy(cls).passiveCombatHasteBonusPct(state);
  const hastePercent = getTalentHastePct(state.talents) + passiveHaste;
  const talentCrit = getTalentCritChancePct(state.talents);
  return {
    hastePercent,
    hasteTickScale: 1 + hastePercent / 100,
    baseHealingMultiplier: getHealingMultiplier(cls, state.level, state.talents),
    spiritRedemptionMult: hasBuff(state.playerEffects, 'spirit_of_redemption_amp')
      ? 1.5
      : 1,
    critChancePercent: (natPerfStacks, extraCritPct = 0) =>
      talentCrit + getNaturePerfectionBonus(natPerfStacks) + extraCritPct,
  };
}

export function canSwiftmend(state: GameState, targetId: string): boolean {
  if (state.playerClass !== 'DRUID') return false;
  const spell = SPELLS['swiftmend'];
  if (!spell) return false;
  if (!spellHasTag('swiftmend', 'swiftmend-consumable')) return false;
  const target = state.party.find((u) => u.id === targetId);
  if (!target || target.health <= 0) return false;
  return true;
}

export function getManaCost(
  state: GameState,
  cls: ClassType,
  spell: Spell,
  spellId: string,
  _surgeFree: boolean,
): number {
  void spellId;
  void _surgeFree;
  return getClassStrategy(cls).calculateManaCost(spell, state);
}

export function getHotTickAmount(ctx: HotTickModifierContext): number {
  return ctx.healPerTick;
}

export function getHotTickRateMultiplier(ctx: HotTickModifierContext): number {
  return 1;
}

export function getHotTickManaReturn(ctx: HotTickModifierContext): number {
  return 0;
}

export function getDirectHealMultiplier(_state: GameState, _spell: Spell, _spellId: string): number {
  void _state;
  void _spell;
  void _spellId;
  return 1;
}

export function getCritBonus(state: GameState, spellId: string, targetId: string): number {
  return 0;
}

export function trySpecialHealCast(
  state: GameState,
  ctx: {
    spell: Spell;
    spellId: string;
    targetId: string;
    needMana: number;
    critRoll: number;
    eff: { baseHealingMultiplier: number; critChancePercent: any };
    runCooldown: (rawCd: number, piLeft: number) => number;
  },
): GameState | null {
  if (ctx.spellId === 'swiftmend') {
    return state;
  }
  return null;
}

export function onHealLand(
  _state: GameState,
  ctx: HealLandContext,
  partyAfterDirect: Unit[],
  playerEffects: StatusEffect[],
): { party: Unit[]; playerEffects: StatusEffect[]; healEff: number; healOh: number } {
  const cls = ctx.state.playerClass;
  if (!cls) {
    return { party: partyAfterDirect, playerEffects, healEff: 0, healOh: 0 };
  }
  const acc = getClassStrategy(cls).onHealLand(ctx, {
    party: partyAfterDirect,
    playerEffects,
    healEff: 0,
    healOh: 0,
  });
  return {
    party: acc.party,
    playerEffects: acc.playerEffects,
    healEff: acc.healEff,
    healOh: acc.healOh,
  };
}

export function getDamageTakenMultiplier(state: GameState, _ctx: { source: 'boss_attack' | 'trash_tick' }): number {
  void _ctx;
  if (!state.playerClass) return 1;
  const ref = state.party[0];
  if (!ref) return 1;
  return getClassStrategy(state.playerClass).onDamageTaken(state, 0, ref);
}

export function getManaReturn(
  state: GameState,
  spiritLockTicks: number,
): number {
  return 0;
}

export function getSelfHealOnDamage(state: GameState, damageTaken: number): number {
  return 0;
}

export function onShieldTransition(
  state: GameState,
  partyBefore: Unit[],
  partyAfter: Unit[],
): { party: Unit[]; eff: number; oh: number } {
  return { party: partyAfter, eff: 0, oh: 0 };
}

export function rollOmenOnHotTick(
  state: GameState,
  tickAmt: number,
  sourceSpellId: string,
  playerEffects: StatusEffect[],
  random: () => number,
): StatusEffect[] {
  return EffectManager.rollOmenOnHotTick(state, tickAmt, sourceSpellId, playerEffects, random);
}

export function onManaAfterHeal(
  state: GameState,
  spell: Spell,
  spellId: string,
  needMana: number,
  surgeFree: boolean,
  isCritH: boolean,
  healTargetId: string,
  initialMana: number,
): number {
  return initialMana;
}

export function getSynergyMultiplier(unit: Unit, spellId: string): number {
  const spell = SPELLS[spellId];
  if (!spell?.balance?.directHealSynergyMultiplier) return 1;
  const hasSynergyHot = unit.effects.some(
    (e) => e.category === 'helpful' && e.remainingTicks > 0 && spellHasTag(e.sourceId, 'druid-hot'),
  );
  return hasSynergyHot ? spell.balance.directHealSynergyMultiplier : 1;
}

export function graceHealMultiplierOnTarget(unit: Unit, graceRanks: number): number {
  if (graceRanks <= 0) return 1;
  const hasGrace = unit.effects.some((e) => e.sourceId === 'priest_grace' && e.remainingTicks > 0);
  return hasGrace ? 1 + graceRanks * 0.1 : 1;
}

export function divinityOverhealAbsorb(overheal: number, rating: number): number {
  if (overheal <= 0) return 0;
  return overheal * Math.min(0.5, rating * 0.05);
}

export function awsplashFraction(state: GameState): number {
  if (state.playerClass !== 'PRIEST') return 0;
  const ranks = getRanks(state.talents, 'echo_of_light');
  if (ranks <= 0) return 0;
  return 0.3;
}

export function getSynergyMultiplierByIds(unit: Unit, spellId: string): number {
  if (!spellHasTag(spellId, 'synergy-direct')) return 1;
  if (!unit.effects.some((effect) => spellHasTag(effect.sourceId, 'synergy-primer-source'))) return 1;
  const spellData = SPELLS[spellId];
  const SHARED = BALANCE.combat.shared;
  return spellData?.balance?.directHealSynergyMultiplier ?? SHARED.directHealSynergyMultiplierDefault;
}

export function dispelOne(effects: StatusEffect[]): StatusEffect[] {
  return EffectManager.dispelOne(effects);
}

export function applyHot(
  unit: Unit,
  spell: Spell,
  healingPerTick: number,
  opts?: { hasteTickScale?: number; bloomBurstHeal?: number },
): Unit {
  return EffectManager.applyHot(unit, spell, healingPerTick, opts);
}

/**
 * SHARED LOGIC: swiftmend resolution
 */
export function resolveSwiftmend(
  state: GameState,
  classType: ClassType,
  targetId: string,
  healMult: number,
  critMod: number,
  spell: Spell,
  rankHealMult: number,
): { party: Unit[]; applied: boolean; eff: number; oh: number } {
  if (classType !== 'DRUID') return { party: state.party, applied: false, eff: 0, oh: 0 };
  const party = state.party.map((unit) => ({ ...unit, effects: [...unit.effects] }));
  const idx = party.findIndex((unit) => unit.id === targetId);
  if (idx < 0) return { party: state.party, applied: false, eff: 0, oh: 0 };
  const unit = party[idx];
  if (unit.health <= 0) return { party: state.party, applied: false, eff: 0, oh: 0 };

  const hotIdx = getConsumableHotIndex(unit);
  if (hotIdx < 0) {
    return { party: state.party, applied: false, eff: 0, oh: 0 };
  }

  const raw = spell.healing * rankHealMult * healMult * critMod;
  const { eff, oh } = getHealSplit(unit.health, unit.maxHealth, raw);

  // Consume the HoT
  unit.effects = unit.effects.filter((_, j) => j !== hotIdx);
  const health = Math.min(unit.maxHealth, unit.health + raw);
  party[idx] = { ...unit, health };

  return { party, applied: true, eff, oh };
}

export function isDoubleTick(photosynthPoints: number): boolean {
  const DRUID = BALANCE.combat.druid;
  if (photosynthPoints <= 0) return false;
  return Math.random() < photosynthPoints * DRUID.photosynthesisDoubleTickChancePerRank;
}

export function buildPlayerCombatStats(
  state: GameState,
  actionBarHighlights: Record<string, boolean>,
): PlayerCombatStats | null {
  if (!state.playerClass) return null;
  const manaRegenTicks = state.currentDungeon
    ? getBuffTicks(state.playerEffects, PLAYER_BUFF_MANA_REGEN_POTION)
    : 0;
  const spiritLockTicks = state.currentDungeon
    ? getBuffTicks(state.playerEffects, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT)
    : 0;
  return {
    playerClass: state.playerClass,
    level: state.level,
    xp: state.xp,
    mana: state.currentDungeon ? state.mana : state.maxMana,
    maxMana: state.maxMana,
    manaRegenTicks,
    manaPotionDripPerSec: getPotionDrip(state.playerEffects) * TICKS_PER_SECOND,
    spiritLockTicks,
    spirit: getPrimaryStats(state.playerClass, state.level).spirit,
    spellsEnabled: !!state.currentDungeon,
    potionCharges: Math.max(0, MANA_POTION_USES_PER_DUNGEON - state.potionsUsed),
    spellHealMult: getHealingMultiplier(state.playerClass, state.level, state.talents),
    unlockedSpells: state.unlockedSpells,
    actionBarHighlights,
  };
}

// ========= UI-facing buff display (mana potion labels) =========

import { manaPotionDisplayName, manaPotionIconPath } from '../../components';

export function partyWithHealerManaRegenDisplayBuff(
  party: Unit[],
  manaRegenTicks: number,
  playerLevel: number,
): Unit[] {
  if (manaRegenTicks <= 0) return party;
  const source = SPELLS.mana_potion;
  const b: StatusEffect = {
    id: '__display_mana_regen',
    name: `${manaPotionDisplayName(playerLevel)} — bonus regen`,
    remainingTicks: manaRegenTicks,
    valuePerTick: 0,
    icon: manaPotionIconPath(playerLevel),
    sourceId: source.id,
    isManaRegen: true,
    durationTicksMax: manaRegenTicks,
    category: 'helpful',
    stacks: 1,
  };
  return party.map((u) =>
    u.role === 'HEALER' ? { ...u, effects: [...u.effects, b] } : u,
  );
}

// ========= Class Registry (simplified) =========

import priestTalents from '../../data/classes/priest_talents.json';
import druidTalents from '../../data/classes/druid_talents.json';
import paladinTalents from '../../data/classes/paladin_talents.json';
import { randomAllyLevel, getMaxHealth } from './formulas';

export function generateRandomParty(level: number, playerClass: ClassType | null): Unit[] {
  const tankLevel = randomAllyLevel(level);
  const dps1Level = randomAllyLevel(level);
  const dps2Level = randomAllyLevel(level);
  return [
    {
      id: 'tank',
      name: 'Tank',
      role: 'TANK',
      level: tankLevel,
      health: getMaxHealth('TANK', tankLevel),
      maxHealth: getMaxHealth('TANK', tankLevel),
      shield: 0,
      shieldTicks: 0,
      effects: [],
      livingSeedPool: 0,
    },
    {
      id: 'dps1',
      name: 'DPS 1',
      role: 'DPS',
      level: dps1Level,
      health: getMaxHealth('DPS', dps1Level),
      maxHealth: getMaxHealth('DPS', dps1Level),
      shield: 0,
      shieldTicks: 0,
      effects: [],
      livingSeedPool: 0,
    },
    {
      id: 'dps2',
      name: 'DPS 2',
      role: 'DPS',
      level: dps2Level,
      health: getMaxHealth('DPS', dps2Level),
      maxHealth: getMaxHealth('DPS', dps2Level),
      shield: 0,
      shieldTicks: 0,
      effects: [],
      livingSeedPool: 0,
    },
  ];
}
const talentMap: Record<string, Talent[]> = {
  'PRIEST': priestTalents as Talent[],
  'DRUID': druidTalents as Talent[],
  'PALADIN': paladinTalents as Talent[],
};

export const ClassRegistry = {
  getTalents(cls: string): Talent[] {
    return talentMap[cls] || [];
  },
};
