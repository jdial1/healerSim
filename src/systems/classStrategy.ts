import { BALANCE } from '../data/index';
import { PLAYER_BUFF_OMEN_CLEARCASTING } from './Constants';
import type {
  ClassType,
  ClassStrategy,
  GameState,
  HealLandContext,
  HotTickPlayerEffectsCtx,
  ResourceTickOutcome,
  Spell,
  StatusEffect,
  Talent,
} from './Types';
import { getClassBlueprint, getSpellRank, getUniqueStatRating, spellHasTag } from '../core/mechanics/formulas';
import {
  CAST_HASTE_BONUS_FRAC,
  devotionDamageTakenMultiplier,
  DIRECT_HEAL_TARGET_AMP,
  HEAL_CAST_COOLDOWN_HOOKS,
  HOT_TICK_PLAYER_EFFECTS,
  HOLY_POWER_AFTER_HEAL_HOOKS,
  ON_CRIT_MECHANICS,
  ON_HEAL_LAND_MECHANICS,
  PASSIVE_COMBAT_HASTE_BONUS,
  RESOURCE_TICK_MECHANICS,
} from './MechanicsRegistry';
import type { ManaCostLogicKey } from './Types';

const DRUID_BC = BALANCE.combat.druid;
const STACK_ID_NO_TICK = new Set<string>(['power_infusion', 'natural_perfection']);

function buffPresent(effects: StatusEffect[], id: string): boolean {
  const b = effects.find((x) => x.id === id);
  if (!b) return false;
  if (STACK_ID_NO_TICK.has(id)) return b.stacks > 0;
  return b.remainingTicks > 0;
}

function talentRanks(talents: Talent[], idOrMechanicId: string): number {
  const t = talents.find((x) => x.id === idOrMechanicId || x.mechanicId === idOrMechanicId);
  return t?.points ?? 0;
}

function defaultRankManaCost(spell: Spell, cls: ClassType, level: number): number {
  let base = spell.manaCost;
  if (base > 0) {
    const rank = getSpellRank(spell.id, cls, level);
    base = Math.round(base * Math.pow(1.1, Math.max(0, rank - 1)));
  }
  return base;
}

function resolveManaCostByKey(
  key: ManaCostLogicKey | undefined,
  spell: Spell,
  state: GameState,
  surgeFree: boolean,
): number | undefined {
  if (key === 'druidManaCost') {
    if (buffPresent(state.playerEffects, PLAYER_BUFF_OMEN_CLEARCASTING)) {
      if (spell.id === 'regrowth' || spell.id === 'healing_touch') return 0;
    }
    if (talentRanks(state.talents, 'tree_of_life') > 0) {
      const isHot = spell.type === 'HOT' || Boolean(spell.hotDuration && spell.healing > 0);
      if (isHot) return Math.round(spell.manaCost * DRUID_BC.treeOfLifeHotManaCostFactor);
    }
    return undefined;
  }
  if (key === 'priestManaCost') {
    if (surgeFree && spellHasTag(spell.id, 'surge-finisher')) return 0;
    return undefined;
  }
  if (key === 'paladinManaCost') {
    return undefined;
  }
  return undefined;
}

function buildCalculateManaCost(cls: ClassType): ClassStrategy['calculateManaCost'] {
  return (spell, state) => {
    const surgeFree =
      buffPresent(state.playerEffects, 'surge_of_light') && spellHasTag(spell.id, 'surge-finisher');
    const key = getClassBlueprint(cls).mechanics?.manaCost;
    const special = resolveManaCostByKey(key, spell, state, surgeFree);
    if (special !== undefined) return special;
    return defaultRankManaCost(spell, cls, state.level);
  };
}

function buildOnHealLand(cls: ClassType): ClassStrategy['onHealLand'] {
  const keys = getClassBlueprint(cls).mechanics?.onHealLand ?? [];
  return (context, accumulator) =>
    keys.reduce((acc, key) => ON_HEAL_LAND_MECHANICS[key](context, acc), accumulator);
}

function buildOnCrit(cls: ClassType): ClassStrategy['onCrit'] {
  const keys = getClassBlueprint(cls).mechanics?.onCrit ?? [];
  return (ctx, state) => keys.reduce((s, key) => ON_CRIT_MECHANICS[key](ctx, s), state);
}

function buildDirectHealTargetMultiplier(cls: ClassType): ClassStrategy['directHealTargetMultiplier'] {
  const keys = getClassBlueprint(cls).mechanics?.directHealTargetAmp ?? [];
  return (state, spell, spellId, unit) =>
    keys.reduce((m, key) => m * DIRECT_HEAL_TARGET_AMP[key](state, spell, spellId, unit), 1);
}

function buildCastHasteBonusFraction(cls: ClassType): ClassStrategy['castHasteBonusFraction'] {
  const keys = getClassBlueprint(cls).mechanics?.castHasteBonus ?? [];
  return (state, targetId) =>
    keys.reduce((sum, key) => sum + CAST_HASTE_BONUS_FRAC[key](state, targetId), 0);
}

function buildResolveHealCastCooldownTicks(cls: ClassType): ClassStrategy['resolveHealCastCooldownTicks'] {
  const keys = getClassBlueprint(cls).mechanics?.healCastCooldown ?? [];
  return (state, spellId, spell, baseTicks) =>
    keys.reduce(
      (ticks, key) => HEAL_CAST_COOLDOWN_HOOKS[key](state, spellId, spell, ticks),
      baseTicks,
    );
}

function buildApplyHolyPowerStepsAfterHeal(cls: ClassType): ClassStrategy['applyHolyPowerStepsAfterHeal'] {
  const keys = getClassBlueprint(cls).mechanics?.holyPowerStepsAfterHeal ?? [];
  return (state, ctx) =>
    keys.reduce(
      (hp, key) => HOLY_POWER_AFTER_HEAL_HOOKS[key](state, { ...ctx, holyPower: hp }),
      ctx.holyPower,
    );
}

function mergeResourceTickOutcome(a: ResourceTickOutcome, b: ResourceTickOutcome): ResourceTickOutcome {
  const ae = a.resourceHealDelta;
  const be = b.resourceHealDelta;
  const mergedHeal =
    ae || be
      ? {
          eff: (ae?.eff ?? 0) + (be?.eff ?? 0),
          oh: (ae?.oh ?? 0) + (be?.oh ?? 0),
          drafts: [...(ae?.drafts ?? []), ...(be?.drafts ?? [])],
        }
      : undefined;
  return {
    ...a,
    ...b,
    ...(mergedHeal !== undefined ? { resourceHealDelta: mergedHeal } : {}),
  };
}

function buildOnResourceTick(cls: ClassType): ClassStrategy['onResourceTick'] {
  const keys = getClassBlueprint(cls).mechanics?.onResourceTick ?? [];
  return (state, deltaTicks) =>
    keys.reduce<ResourceTickOutcome>(
      (acc, key) => mergeResourceTickOutcome(acc, RESOURCE_TICK_MECHANICS[key](state, deltaTicks)),
      {},
    );
}

function buildPassiveCombatHasteBonusPct(cls: ClassType): ClassStrategy['passiveCombatHasteBonusPct'] {
  const keys = getClassBlueprint(cls).mechanics?.passiveCombatHasteBonus ?? [];
  return (state) => keys.reduce((sum, key) => sum + PASSIVE_COMBAT_HASTE_BONUS[key](state), 0);
}

function buildRollHotTickPlayerEffects(cls: ClassType): ClassStrategy['rollHotTickPlayerEffects'] {
  const keys = getClassBlueprint(cls).mechanics?.hotTickPlayerEffects ?? [];
  return (ctx) =>
    keys.reduce(
      (effects, key) => HOT_TICK_PLAYER_EFFECTS[key]({ ...ctx, playerEffects: effects }),
      ctx.playerEffects,
    );
}

function buildStrategyForClass(cls: ClassType): ClassStrategy {
  return {
    calculateManaCost: buildCalculateManaCost(cls),
    calculateUniqueStat: (level, talents) => getUniqueStatRating(cls, level, talents),
    onHealLand: buildOnHealLand(cls),
    onCrit: buildOnCrit(cls),
    onResourceTick: buildOnResourceTick(cls),
    onDamageTaken: (state, _damage, _target) => devotionDamageTakenMultiplier(state),
    passiveCombatHasteBonusPct: buildPassiveCombatHasteBonusPct(cls),
    rollHotTickPlayerEffects: buildRollHotTickPlayerEffects(cls),
    directHealTargetMultiplier: buildDirectHealTargetMultiplier(cls),
    castHasteBonusFraction: buildCastHasteBonusFraction(cls),
    resolveHealCastCooldownTicks: buildResolveHealCastCooldownTicks(cls),
    applyHolyPowerStepsAfterHeal: buildApplyHolyPowerStepsAfterHeal(cls),
  };
}

const cache = new Map<ClassType, ClassStrategy>();

export function getClassStrategy(cls: ClassType): ClassStrategy {
  let s = cache.get(cls);
  if (!s) {
    s = buildStrategyForClass(cls);
    cache.set(cls, s);
  }
  return s;
}
