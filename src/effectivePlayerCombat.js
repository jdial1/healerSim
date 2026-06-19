import { hasBuff, getHealer } from "./talentMechanics.js";
import {
  getHealingMultiplier,
  getTalentCritChancePct,
  getTalentHastePct,
  getNaturePerfectionBonus
} from "./playerStats.js";
import { getHasteBonus } from "./combatHookRegistry.js";
function computeEffectivePlayerCombatStats(s) {
  if (!s.playerClass) return null;
  const cls = s.playerClass;
  const healer = getHealer(s.party);
  const hastePercent = getTalentHastePct(s.talents) + getHasteBonus(s, cls, healer);
  const talentCrit = getTalentCritChancePct(s.talents);
  return {
    hastePercent,
    hasteTickScale: 1 + hastePercent / 100,
    baseHealingMultiplier: getHealingMultiplier(cls, s.level, s.talents),
    spiritRedemptionHealingMultiplier: hasBuff(s.playerCombatBuffs, "spirit_of_redemption_amp") ? 1.5 : 1,
    critChancePercent: (naturalStacks, extraCrit = 0) => talentCrit + getNaturePerfectionBonus(naturalStacks) + extraCrit
  };
}
function rollCritAgainstEffective(critRoll0to100, stats, naturalPerfectionStacks, extraCritPct = 0) {
  return critRoll0to100 < stats.critChancePercent(naturalPerfectionStacks, extraCritPct);
}
export {
  computeEffectivePlayerCombatStats,
  rollCritAgainstEffective
};
