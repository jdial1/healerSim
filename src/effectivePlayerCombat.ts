import { GameState } from './types.ts';
import { hasBuff, getHealer } from './talentMechanics.ts';
import {
  getHealingMultiplier,
  getTalentCritChancePct,
  getTalentHastePct,
  getNaturePerfectionBonus,
} from './playerStats.ts';
import { getHasteBonus } from './combatHookRegistry.ts';

export type EffectivePlayerCombatStats = {
  hastePercent: number;
  hasteTickScale: number;
  baseHealingMultiplier: number;
  spiritRedemptionHealingMultiplier: number;
  critChancePercent: (naturalPerfectionStacks: number, extraCritPct?: number) => number;
};

export function computeEffectivePlayerCombatStats(s: GameState): EffectivePlayerCombatStats | null {
  if (!s.playerClass) return null;
  const cls = s.playerClass;
  const healer = getHealer(s.party);
  const hastePercent = getTalentHastePct(s.talents) + getHasteBonus(s, cls, healer);
  const talentCrit = getTalentCritChancePct(s.talents);
  return {
    hastePercent,
    hasteTickScale: 1 + hastePercent / 100,
    baseHealingMultiplier: getHealingMultiplier(cls, s.level, s.talents),
    spiritRedemptionHealingMultiplier: hasBuff(s.playerCombatBuffs, 'spirit_of_redemption_amp')
      ? 1.5
      : 1,
    critChancePercent: (naturalStacks, extraCrit = 0) =>
      talentCrit + getNaturePerfectionBonus(naturalStacks) + extraCrit,
  };
}

export function rollCritAgainstEffective(
  critRoll0to100: number,
  stats: Pick<EffectivePlayerCombatStats, 'critChancePercent'>,
  naturalPerfectionStacks: number,
  extraCritPct = 0,
): boolean {
  return critRoll0to100 < stats.critChancePercent(naturalPerfectionStacks, extraCritPct);
}
