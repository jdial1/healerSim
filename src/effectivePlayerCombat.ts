import { GameState } from './types.ts';
import { hasPlayerBuff, healerInParty } from './talentMechanics.ts';
import {
  spellHealingMultiplierFromProgress,
  talentCritChancePctFromTalents,
  talentHastePctFromTalents,
  naturePerfectionCritBonus,
} from './playerStats.ts';
import { runHasteBonusSum } from './combatHookRegistry.ts';

export type EffectivePlayerCombatStats = {
  hastePercent: number;
  hasteTickScale: number;
  healingFromProgress: number;
  spiritRedemptionHealingMultiplier: number;
  critChancePercent: (naturalPerfectionStacks: number, extraCritPct?: number) => number;
};

export function computeEffectivePlayerCombatStats(s: GameState): EffectivePlayerCombatStats | null {
  if (!s.playerClass) return null;
  const cls = s.playerClass;
  const healer = healerInParty(s.party);
  const hastePercent = talentHastePctFromTalents(s.talents) + runHasteBonusSum(s, cls, healer);
  const talentCrit = talentCritChancePctFromTalents(s.talents);
  return {
    hastePercent,
    hasteTickScale: 1 + hastePercent / 100,
    healingFromProgress: spellHealingMultiplierFromProgress(cls, s.level, s.talents),
    spiritRedemptionHealingMultiplier: hasPlayerBuff(s.playerCombatBuffs, 'spirit_of_redemption_amp')
      ? 1.5
      : 1,
    critChancePercent: (naturalStacks, extraCrit = 0) =>
      talentCrit + naturePerfectionCritBonus(naturalStacks) + extraCrit,
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
