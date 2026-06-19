import { ClassRegistry } from "./classes/index.js";
import { getSpellRank, getRankCostMult } from "./playerStats.js";
import { isDirectHeal } from "./talentMechanics.js";
function getHooks(s) {
  return s.playerClass ? ClassRegistry.getHooks(s.playerClass) : null;
}
function getManaCost(s, classType, spell, spellId, surgeFree) {
  const base = getHooks(s)?.onHealManaCost?.(s, spell, spellId, surgeFree) ?? spell.manaCost;
  if (base > 0) {
    const rank = getSpellRank(spellId, classType, s.level);
    return Math.round(base * getRankCostMult(rank));
  }
  return base;
}
function onHealCast(s, ctx) {
  getHooks(s)?.onHealCast?.(s, ctx);
}
function onCrit(s, ctx) {
  getHooks(s)?.onCrit?.(s, ctx);
}
function getHasteBonus(s, classType, healer) {
  return getHooks(s)?.hasteBonusSum?.(s, healer) ?? 0;
}
function getHotTickAmount(ctx) {
  return getHooks(ctx.state)?.hotTickAmount?.(ctx) ?? ctx.healPerTick;
}
function getHotTickRateMultiplier(ctx) {
  return getHooks(ctx.state)?.hotTickRateMultiplier?.(ctx.state, ctx.buff.sourceSpellId) ?? 1;
}
function getHotTickManaReturn(ctx) {
  const base = getHooks(ctx.state)?.hotTickManaReturn?.(ctx.state, ctx.buff.sourceSpellId) ?? 0;
  return base + (ctx.vitalityBloomMana ?? 0);
}
function getDirectHealMultiplier(s, spell, spellId) {
  return getHooks(s)?.castDirectHealMultiplier?.(s, spell, spellId) ?? 1;
}
function getCritBonus(s, spellId, targetId) {
  return getHooks(s)?.critBonusForHealRoll?.(s, spellId, targetId) ?? 0;
}
function trySpecialHealCast(s, ctx) {
  return getHooks(s)?.trySpecialHealCast?.(s, ctx) ?? null;
}
function onHealLand(s, ctx, partyAfterDirect, playerCombatBuffs) {
  const hook = getHooks(s)?.onHealLand;
  if (hook) return hook(s, ctx, partyAfterDirect, playerCombatBuffs);
  return { party: partyAfterDirect, playerCombatBuffs, healEff: 0, healOh: 0 };
}
function getDamageTakenMultiplier(s, ctx) {
  return getHooks(s)?.damageTakenMultiplier?.(s, ctx) ?? 1;
}
function getManaReturn(s, spiritRegenLockoutTicksRemaining) {
  return getHooks(s)?.manaReturnOnTick?.(s, spiritRegenLockoutTicksRemaining) ?? 0;
}
function getEmergencyHaste(s, targetId) {
  return getHooks(s)?.emergencyHasteBonus?.(s, targetId) ?? 0;
}
function getSelfHealOnDamage(s, damageTaken) {
  return getHooks(s)?.selfHealOnDamage?.(s, damageTaken) ?? 0;
}
function onShieldTransition(s, partyBefore, partyAfter) {
  const hook = getHooks(s)?.onShieldTransition;
  if (hook) return hook(s, partyBefore, partyAfter);
  return { party: partyAfter, eff: 0, oh: 0 };
}
function onManaAfterHeal(s, spell, spellId, needMana, surgeFree, isCritH, healTargetId, initialMana) {
  let m = getHooks(s)?.manaAfterHeal?.(s, spellId, needMana, surgeFree, isCritH, healTargetId, initialMana) ?? initialMana;
  const manaR = s.talents.reduce(
    (a, t) => a + (t.statBonus?.manaReturnOnDirectHeal || 0) * (t.points > 0 ? t.points : 0),
    0
  );
  if (isDirectHeal(spell, spellId)) {
    m = Math.min(s.maxMana, m + manaR);
  }
  return m;
}
export {
  getCritBonus,
  getDamageTakenMultiplier,
  getDirectHealMultiplier,
  getEmergencyHaste,
  getHasteBonus,
  getHotTickAmount,
  getHotTickManaReturn,
  getHotTickRateMultiplier,
  getManaCost,
  getManaReturn,
  getSelfHealOnDamage,
  onCrit,
  onHealCast,
  onHealLand,
  onManaAfterHeal,
  onShieldTransition,
  trySpecialHealCast
};
