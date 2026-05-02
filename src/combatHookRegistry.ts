import {
  Buff,
  ClassType,
  GameState,
  PlayerCombatBuff,
  Spell,
  Unit,
} from './types.ts';
import { ClassRegistry } from './classes/index.ts';
import { diffFloats, mergeFloats } from './floatingCombatText.ts';
import { getSpellRank, getRankCostMult } from './playerStats.ts';
import { isDirectHeal } from './talentMechanics.ts';

export type SpecialHealCastEff = {
  baseHealingMultiplier: number;
  critChancePercent: (naturalPerfectionStacks: number, extraCritPct?: number) => number;
};

export type HealCastContext = {
  spell: Spell;
  spellId: string;
  targetId: string;
  needMana: number;
  surgeFree: boolean;
};

export type HealLandContext = {
  spell: Spell;
  spellId: string;
  targetId: string;
  partyBeforeCast: Unit[];
  healMultB: number;
  critH: number;
  tMod: number;
  isCrit: boolean;
  rankHealMult: number;
};

export type PostHealAccumulator = {
  party: Unit[];
  playerCombatBuffs: PlayerCombatBuff[];
  healEff: number;
  healOh: number;
};

export type HotTickModifierContext = {
  state: GameState;
  unit: Unit;
  buff: Buff;
  healPerTick: number;
  appliedTickHeal?: number;
  vitalityBloomMana?: number;
};

export type HealManaCostContext = {
  classType: ClassType;
  spell: Spell;
  spellId: string;
  surgeFree: boolean;
};

export type ManaAfterHealContext = {
  spell: Spell;
  spellId: string;
  needMana: number;
  surgeFree: boolean;
  isCritH: boolean;
  healTargetId: string;
};

export type SpecialHealCastContext = {
  spellId: string;
  targetId: string;
  spell: Spell;
  needMana: number;
  critRoll: number;
  runCooldown: (rawCd: number, piLeft: number) => number;
  eff: SpecialHealCastEff;
};

/**
 * DELEGATOR: getManaCost
 * Fixes error: Module has no exported member 'getManaCost'
 */
export function getManaCost(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  const hooks = ClassRegistry.getHooks(classType);
  const base = hooks?.onHealManaCost?.(s, spell, spellId, surgeFree) ?? spell.manaCost;
  
  if (base > 0) {
    const rank = getSpellRank(spellId, classType, s.level);
    return Math.round(base * getRankCostMult(rank));
  }
  return base;
}

/**
 * DELEGATOR: onHealCast
 */
export function onHealCast(s: GameState, ctx: HealCastContext): void {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  hooks?.onHealCast?.(s, ctx);
}

/**
 * DELEGATOR: onCrit
 */
export function onCrit(s: GameState, ctx: HealLandContext): void {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  hooks?.onCrit?.(s, ctx);
}

/**
 * DELEGATOR: getHasteBonus
 * Replaces hardcoded class checks with Registry delegation.
 */
export function getHasteBonus(
  s: GameState,
  classType: ClassType,
  healer: Unit | undefined,
): number {
  const hooks = ClassRegistry.getHooks(classType);
  // Executes class-specific haste logic (e.g., Druid Ramp or Priest Shield Maintenance)
  return hooks?.hasteBonusSum?.(s, healer) ?? 0;
}

/**
 * DELEGATOR: getHotTickAmount
 */
export function getHotTickAmount(ctx: HotTickModifierContext): number {
  const hooks = ctx.state.playerClass ? ClassRegistry.getHooks(ctx.state.playerClass) : null;
  if (hooks?.hotTickAmount) {
    return hooks.hotTickAmount(ctx);
  }
  return ctx.healPerTick;
}

/**
 * DELEGATOR: getHotTickRateMultiplier
 */
export function getHotTickRateMultiplier(ctx: HotTickModifierContext): number {
  const hooks = ctx.state.playerClass ? ClassRegistry.getHooks(ctx.state.playerClass) : null;
  return hooks?.hotTickRateMultiplier?.(ctx.state, ctx.buff.sourceSpellId) ?? 1;
}

/**
 * DELEGATOR: getHotTickManaReturn
 */
export function getHotTickManaReturn(ctx: HotTickModifierContext): number {
  const hooks = ctx.state.playerClass ? ClassRegistry.getHooks(ctx.state.playerClass) : null;
  let m = hooks?.hotTickManaReturn?.(ctx.state, ctx.buff.sourceSpellId) ?? 0;
  m += ctx.vitalityBloomMana ?? 0;
  return m;
}

/**
 * DELEGATOR: getDirectHealMultiplier
 */
export function getDirectHealMultiplier(s: GameState, spell: Spell, spellId: string): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.castDirectHealMultiplier?.(s, spell, spellId) ?? 1;
}

/**
 * DELEGATOR: getCritBonus
 */
export function getCritBonus(s: GameState, spellId: string, targetId: string): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.critBonusForHealRoll?.(s, spellId, targetId) ?? 0;
}

/**
 * DELEGATOR: trySpecialHealCast
 * Moves specific spell logic (like Druid Swiftmend) into the Class folder.
 */
export function trySpecialHealCast(s: GameState, ctx: SpecialHealCastContext): GameState | null {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.trySpecialHealCast?.(s, ctx) ?? null;
}

/**
 * DELEGATOR: onHealLand
 * The primary aggregator for post-cast effects. 
 * Logic like Divine Aegis or Beacon of Light now live in their respective class hooks.
 */
export function onHealLand(
  s: GameState,
  ctx: HealLandContext,
  partyAfterDirect: Unit[],
  playerCombatBuffs: PlayerCombatBuff[],
): PostHealAccumulator {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  
  // If the class has a specialized land-handler, use it.
  if (hooks?.onHealLand) {
    return hooks.onHealLand(s, ctx, partyAfterDirect, playerCombatBuffs);
  }

  // Fallback to basic accumulator if no hooks exist
  return {
    party: partyAfterDirect,
    playerCombatBuffs,
    healEff: 0,
    healOh: 0,
  };
}

/**
 * DELEGATOR: getDamageTakenMultiplier
 */
export function getDamageTakenMultiplier(s: GameState, ctx: { source: 'boss_attack' | 'trash_tick' }): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.damageTakenMultiplier?.(s, ctx) ?? 1;
}

/**
 * DELEGATOR: getManaReturn
 * Replaces hardcoded runPriestMeditative...
 */
export function getManaReturn(
  s: GameState,
  spiritRegenLockoutTicksRemaining: number,
): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.manaReturnOnTick?.(s, spiritRegenLockoutTicksRemaining) ?? 0;
}

/**
 * DELEGATOR: getEmergencyHaste
 */
export function getEmergencyHaste(s: GameState, targetId: string): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.emergencyHasteBonus?.(s, targetId) ?? 0;
}

/**
 * DELEGATOR: getSelfHealOnDamage
 */
export function getSelfHealOnDamage(s: GameState, damageTaken: number): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  return hooks?.selfHealOnDamage?.(s, damageTaken) ?? 0;
}

/**
 * DELEGATOR: onShieldTransition
 */
export function onShieldTransition(
  s: GameState,
  partyBefore: Unit[],
  partyAfter: Unit[],
): { party: Unit[]; eff: number; oh: number } {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  if (hooks?.onShieldTransition) {
    return hooks.onShieldTransition(s, partyBefore, partyAfter);
  }
  return { party: partyAfter, eff: 0, oh: 0 };
}

/**
 * DELEGATOR: onManaAfterHeal
 * Fixes error: Cannot find name 'onManaAfterHeal' in spellCastPipeline
 */
export function onManaAfterHeal(
  s: GameState,
  spell: Spell,
  spellId: string,
  needMana: number,
  surgeFree: boolean,
  isCritH: boolean,
  healTargetId: string,
  initialMana: number
): number {
  const hooks = s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
  // 1. Run class specific logic (Illumination, Path of the Moon)
  let m = hooks?.manaAfterHeal?.(s, spellId, needMana, surgeFree, isCritH, healTargetId, initialMana) ?? initialMana;
  
  // 2. Run global/shared logic (e.g. general mana return from talents)
  const manaR = s.talents.reduce(
    (a, t) => a + (t.statBonus?.manaReturnOnDirectHeal || 0) * (t.points > 0 ? t.points : 0),
    0,
  );
  if (isDirectHeal(spell, spellId)) {
    m = Math.min(s.maxMana, m + manaR);
  }
  
  return m;
}
