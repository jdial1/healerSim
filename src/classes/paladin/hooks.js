import { getRanks, hasBuff, isDirectHeal } from "../../talentMechanics.js";
import { mapEntityById } from "../../mapEntityById.js";
import balanceData from "../../data/balance.json" with { type: "json" };
import { getUniqueStatRating } from "../../playerStats.js";
import { applyHealToUnit } from "../../healMath.js";
const PLAYER_BUFF_OMEN_CLEARCASTING = "omen_clearcasting";
const PALADIN = balanceData.combat.paladin;
const SHARED = balanceData.combat.shared;
function devotionDamageTakenMultiplier(s) {
  if (s.playerClass !== "PALADIN") return 1;
  const r = getRanks(s.talents, "devotion_aura");
  if (r <= 0) return 1;
  return Math.max(PALADIN.devotionDamageTakenFloor, 1 - PALADIN.devotionDamageReductionPerRank * r);
}
function paladinEmergencyCritBonusForTarget(s, target) {
  if (s.playerClass !== "PALADIN" || !target || target.maxHealth <= 0) return 0;
  const ranks = getRanks(s.talents, "tower_of_radiance");
  if (ranks <= 0) return 0;
  if (target.health / target.maxHealth >= PALADIN.emergencyCritHealthThreshold) return 0;
  return PALADIN.emergencyCritBonusPerRankBelowHealthFraction * ranks;
}
function paladinEmergencyHasteBonusForTarget(s, target) {
  if (s.playerClass !== "PALADIN" || !target || target.maxHealth <= 0) return 0;
  const missingHealthFraction = 1 - target.health / target.maxHealth;
  if (missingHealthFraction <= 0) return 0;
  return missingHealthFraction * PALADIN.emergencyHasteFromMissingHealthMax;
}
function paladinAvengingWrathSplashFraction(s) {
  if (s.playerClass !== "PALADIN" || s.capstoneForm !== "paladin_avenging_wrath" || !hasBuff(s.playerCombatBuffs, "avenging_wrath_aura")) {
    return 0;
  }
  return PALADIN.avengingWrathSplashFraction;
}
function beaconEchoMultiplier(s) {
  let m = PALADIN.beaconEchoBaseMultiplier;
  if (getRanks(s.talents, "paladin_vow_protector") > 0) {
    m += PALADIN.beaconEchoVowBonusPerRank * getRanks(s.talents, "paladin_vow_protector");
  }
  return m;
}
function applyBeaconEcho(s, newParty, targetId, spell, spellId, primaryHealToTarget) {
  if (getRanks(s.talents, "beacon_of_light") <= 0) return { party: newParty, eff: 0, oh: 0 };
  const tankId = s.beaconTargetId;
  if (targetId === tankId || spell.type === "AOE" || spellId === "mana_potion") return { party: newParty, eff: 0, oh: 0 };
  const amount = isDirectHeal(spell, spellId) && primaryHealToTarget > 0 ? primaryHealToTarget * beaconEchoMultiplier(s) : 0;
  if (amount <= 0) return { party: newParty, eff: 0, oh: 0 };
  const tank = newParty.find((u) => u.id === tankId);
  if (!tank || tank.health <= 0) return { party: newParty, eff: 0, oh: 0 };
  const { health, eff, oh } = applyHealToUnit(tank, amount);
  return {
    party: mapEntityById(newParty, tankId, (u) => u.health > 0 ? { ...u, health } : u),
    eff,
    oh
  };
}
function onHealLand(s, ctx, party, playerCombatBuffs) {
  let healEff = 0;
  let healOh = 0;
  let p = party;
  if (ctx.spell.type !== "AOE" && ctx.spellId !== "mana_potion") {
    const bef = ctx.partyBeforeCast.find((x) => x.id === ctx.targetId);
    const aft = p.find((x) => x.id === ctx.targetId);
    const primaryHealed = bef && aft && aft.health > 0 ? Math.max(0, aft.health - bef.health) : 0;
    const be = applyBeaconEcho(s, p, ctx.targetId, ctx.spell, ctx.spellId, primaryHealed);
    p = be.party;
    healEff += be.eff;
    healOh += be.oh;
  }
  const lb = applyLightbringerResolveSplash(s, ctx.partyBeforeCast, p, ctx.spell, ctx.spellId, ctx.targetId);
  return {
    party: lb.party,
    playerCombatBuffs,
    healEff: healEff + lb.eff,
    healOh: healOh + lb.oh
  };
}
function manaAfterHealPaladinIllumination(s, ctx, mOut) {
  if (s.playerClass === "PALADIN" && ctx.isCritH && isDirectHeal(ctx.spell, ctx.spellId) && getRanks(s.talents, "illumination") > 0) {
    return Math.min(s.maxMana, mOut + ctx.needMana * PALADIN.illuminationManaRefundFraction);
  }
  return mOut;
}
function manaAfterHealPaladinBeaconVow(s, ctx, mOut) {
  const beaconId = s.beaconTargetId;
  if (s.playerClass === "PALADIN" && ctx.isCritH && getRanks(s.talents, "beacon_of_light") > 0 && getRanks(s.talents, "paladin_vow_protector") > 0 && ctx.spellId !== "mana_potion" && ctx.spell.type !== "AOE" && ctx.healTargetId === beaconId) {
    const refund = ctx.needMana * PALADIN.vowProtectorCritManaRefundFraction * getRanks(s.talents, "paladin_vow_protector");
    return Math.min(s.maxMana, mOut + refund);
  }
  return mOut;
}
function paladinRadianceHealMultiplier(s, unit) {
  if (s.playerClass !== "PALADIN" || unit.maxHealth <= 0) return 1;
  const r = getUniqueStatRating(s.playerClass, s.level, s.talents);
  const missing = Math.max(0, 1 - unit.health / unit.maxHealth);
  const bonus = Math.min(
    PALADIN.radianceHealMultBonusCap,
    missing * r * PALADIN.radianceHealMultPerMissingHealthPerRating
  );
  return 1 + bonus;
}
function applyLightbringerResolveSplash(s, partyBefore, party, spell, spellId, targetId) {
  if (s.playerClass !== "PALADIN" || spellId === "mana_potion" || !isDirectHeal(spell, spellId)) {
    return { party, eff: 0, oh: 0 };
  }
  if (spell.type === "AOE") return { party, eff: 0, oh: 0 };
  const tank = party.find((u) => u.role === "TANK" && u.health > 0);
  if (!tank || targetId !== tank.id) return { party, eff: 0, oh: 0 };
  const beforeT = partyBefore.find((u) => u.id === tank.id);
  const afterT = party.find((u) => u.id === tank.id);
  if (!beforeT || !afterT) return { party, eff: 0, oh: 0 };
  const healed = afterT.health - beforeT.health;
  if (healed <= 0) return { party, eff: 0, oh: 0 };
  const splash = healed * PALADIN.passiveLightbringerSplashFraction;
  let bestId = null;
  let bestPct = 2;
  for (const u of party) {
    if (u.health <= 0 || u.id === tank.id) continue;
    const pct = u.maxHealth > 0 ? u.health / u.maxHealth : 1;
    if (pct < bestPct) {
      bestPct = pct;
      bestId = u.id;
    }
  }
  if (!bestId) return { party, eff: 0, oh: 0 };
  const splashTgt = party.find((u) => u.id === bestId);
  if (!splashTgt) return { party, eff: 0, oh: 0 };
  const { health, eff, oh } = applyHealToUnit(splashTgt, splash);
  return {
    party: mapEntityById(party, bestId, (u) => ({ ...u, health })),
    eff,
    oh
  };
}
function vowCrusaderAoEMultiplier(s, spellId) {
  if (spellId !== "light_of_dawn" || getRanks(s.talents, "paladin_vow_crusader") <= 0) return 1;
  return 1 + PALADIN.vowCrusaderAoEBonusPerRank * getRanks(s.talents, "paladin_vow_crusader");
}
function dispellableCurseCleanseProcChance(s) {
  if (!s.playerClass) return 0;
  let c = 0;
  if (s.playerClass === "PALADIN") c = getRanks(s.talents, "purify");
  if (c <= 0) return 0;
  let p = SHARED.dispellableCurseCleanseProcPerRank * c;
  if (s.playerClass === "PALADIN" && getRanks(s.talents, "tower_of_radiance") > 0) {
    p *= PALADIN.purifyTowerOfRadianceMultiplier;
  }
  return p;
}
function damageTakenMultiplier(s) {
  return devotionDamageTakenMultiplier(s);
}
function emergencyHasteBonus(s, targetId) {
  const target = s.party.find((u) => u.id === targetId);
  return paladinEmergencyHasteBonusForTarget(s, target);
}
function critBonusForHealRoll(s, spellId, targetId) {
  const target = s.party.find((u) => u.id === targetId);
  return paladinEmergencyCritBonusForTarget(s, target);
}
function castDirectHealMultiplier(s, spell, spellId) {
  return vowCrusaderAoEMultiplier(s, spellId);
}
function manaAfterHeal(s, spellId, needMana, surgeFree, isCritH, healTargetId, initialMana) {
  const ctx = { spell: { type: "DIRECT", healing: 1 }, spellId, isCritH, needMana, healTargetId };
  let m = manaAfterHealPaladinIllumination(s, ctx, initialMana);
  m = manaAfterHealPaladinBeaconVow(s, ctx, m);
  return m;
}
export {
  PLAYER_BUFF_OMEN_CLEARCASTING,
  castDirectHealMultiplier,
  critBonusForHealRoll,
  damageTakenMultiplier,
  emergencyHasteBonus,
  manaAfterHeal,
  applyBeaconEcho,
  applyLightbringerResolveSplash,
  beaconEchoMultiplier,
  devotionDamageTakenMultiplier,
  dispellableCurseCleanseProcChance,
  manaAfterHealPaladinBeaconVow,
  manaAfterHealPaladinIllumination,
  onHealLand,
  paladinAvengingWrathSplashFraction,
  paladinEmergencyCritBonusForTarget,
  paladinEmergencyHasteBonusForTarget,
  paladinRadianceHealMultiplier,
  vowCrusaderAoEMultiplier
};
