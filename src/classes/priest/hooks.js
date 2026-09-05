import { getRanks, hasBuff, HEALER_UNIT_ID, isDirectHeal } from "../../talentMechanics.js";
import { spellHasTag } from "../../constants.js";
import { generateCombatUid } from "../../combatUid.js";
import { mapEntityById } from "../../mapEntityById.js";
import { getUniqueStatRating } from "../../playerStats.js";
import { applyHealToUnit } from "../../healMath.js";
import balanceData from "../../data/balance.json" with { type: "json" };
import aurasData from "../../data/auras.json" with { type: "json" };
const PLAYER_BUFF_OMEN_CLEARCASTING = "omen_clearcasting";
const ECHO_OF_LIGHT_SOURCE = "echo_of_light";
const GRACE_SOURCE_ID = "priest_grace";
const PRIEST = balanceData.combat.priest;
const SHARED = balanceData.combat.shared;
const AURAS = aurasData;
function onHealManaCost(s, spell, spellId, surgeFree) {
  if (surgeFree && spellHasTag(spellId, "surge-finisher")) return 0;
  return void 0;
}
function isPriestSurgeFinisher(spellId) {
  return spellHasTag(spellId, "surge-finisher");
}
function archangelSkipsSpell(spellId) {
  return spellHasTag(spellId, "archangel-skip");
}
function manaAfterHeal(s, spellId, needMana, surgeFree, isCritH, healTargetId, initialMana) {
  if (s.playerClass === "PRIEST" && getRanks(s.talents, "path_moon") > 0 && (spellHasTag(spellId, "synergy-direct") || isDirectHeal({ type: "DIRECT", healing: 1 }, spellId))) {
    return Math.min(
      s.maxMana,
      initialMana + s.maxMana * PRIEST.pathMoonMaxManaReturnPerRank * getRanks(s.talents, "path_moon")
    );
  }
  return initialMana;
}
function priestMeditativeManaReturnPerTick(s, spiritRegenLockoutTicksRemaining) {
  if (s.playerClass !== "PRIEST" || spiritRegenLockoutTicksRemaining <= 0) return 0;
  const ranks = s.talents.find((t) => t.id === "p_r0c4")?.points ?? 0;
  if (ranks <= 0) return 0;
  return s.maxMana * PRIEST.meditativeManaReturnPerRankPerTick * ranks;
}
function manaReturnOnTick(s, spiritRegenLockoutTicksRemaining) {
  return priestMeditativeManaReturnPerTick(s, spiritRegenLockoutTicksRemaining);
}
function onHealLand(s, ctx, party, playerCombatBuffs) {
  let healEff = 0;
  let healOh = 0;
  let p = applyDivineAegis(s, ctx.partyBeforeCast, party, ctx.isCrit);
  p = applyEchoOfLightPriest(s, ctx.partyBeforeCast, p, ctx.spell, ctx.spellId, ctx.targetId);
  p = applyGraceStacksFromDirectHeal(s, p, ctx.targetId, ctx.spell, ctx.spellId);
  const bind = applyBindingHealSelf(
    s,
    p,
    ctx.targetId,
    ctx.spell,
    ctx.healMultB,
    ctx.critH,
    ctx.tMod,
    ctx.rankHealMult
  );
  p = bind.party;
  healEff += bind.eff;
  healOh += bind.oh;
  const bursts = applyAegisBurstsFromShieldTransitions(s, ctx.partyBeforeCast, p);
  p = bursts.party;
  healEff += bursts.eff;
  healOh += bursts.oh;
  return { party: p, playerCombatBuffs, healEff, healOh };
}
function priestShieldMaintenanceHasteBonus(s) {
  if (s.playerClass !== "PRIEST") return 0;
  const ranks = s.talents.find((t) => t.id === "p_r5c3")?.points ?? 0;
  if (ranks <= 0) return 0;
  const hasAnyShield = s.party.some((unit) => unit.health > 0 && unit.shield > 0);
  if (!hasAnyShield) return 0;
  return PRIEST.shieldMaintenanceHastePerRank * ranks;
}
function priestSelfShieldDamageReduction(s) {
  if (s.playerClass !== "PRIEST") return 0;
  const ranks = s.talents.find((t) => t.id === "p_r3c3")?.points ?? 0;
  if (ranks <= 0) return 0;
  const healer = s.party.find((unit) => unit.role === "HEALER");
  if (!healer || healer.shield <= 0) return 0;
  return PRIEST.selfShieldDamageReductionPerRank * ranks;
}
function applyDivineAegis(s, oldParty, newParty, isCritH) {
  if (!isCritH || getRanks(s.talents, "divine_aegis") <= 0) {
    return newParty;
  }
  const daRanks = getRanks(s.talents, "divine_aegis");
  let mult = PRIEST.divineAegisShieldFractionPerRank * daRanks;
  if (s.playerClass === "PRIEST") {
    const rating = getUniqueStatRating(s.playerClass, s.level, s.talents);
    mult *= 1 + rating * PRIEST.divinityAegisMultBonusPerRating;
  }
  if (getRanks(s.talents, "luminous_aegis") > 0) {
    mult *= 1 + PRIEST.luminousAegisMultiplierPerRank * getRanks(s.talents, "luminous_aegis");
  }
  return newParty.map((uNow) => {
    const uOld = oldParty.find((x) => x.id === uNow.id);
    if (!uOld || uOld.health <= 0) return uNow;
    const gained = uNow.health - uOld.health;
    if (gained <= 0) return uNow;
    return {
      ...uNow,
      shield: uNow.shield + gained * mult,
      shieldTicksRemaining: SHARED.shieldDefaultTicks
    };
  });
}
function applyBindingHealSelf(s, newParty, targetId, spell, healMultB, critH, tMod, rankHealMult) {
  if (!s.playerClass || getRanks(s.talents, "binding_heal") <= 0) {
    return { party: newParty, eff: 0, oh: 0 };
  }
  const healerW = newParty.find((x) => x.id === HEALER_UNIT_ID);
  const thp = s.party.find((x) => x.id === targetId);
  const bind = spell.healing * rankHealMult * healMultB * critH * tMod * PRIEST.bindingHealSelfFraction * Math.min(PRIEST.bindingHealMaxRanksForCap, getRanks(s.talents, "binding_heal"));
  if (!healerW || !thp || thp.id === healerW.id) return { party: newParty, eff: 0, oh: 0 };
  const { health, eff, oh } = applyHealToUnit(healerW, bind);
  return {
    party: mapEntityById(newParty, HEALER_UNIT_ID, (u) => ({ ...u, health })),
    eff,
    oh
  };
}
function rollSurgeOfLight(s, spellId) {
  return spellId === "flash_heal" && getRanks(s.talents, "surge_of_light") > 0 && Math.random() < PRIEST.surgeOfLightProcChancePerRank * getRanks(s.talents, "surge_of_light");
}
function priestFlashCritBonusFromSynergy(s) {
  if (getRanks(s.talents, "gleaming_proclamation") <= 0) return 0;
  if (getRanks(s.talents, "surge_of_light") <= 0) return 0;
  return PRIEST.gleamingProclamationFlashHealCritBonusPct;
}
const ECHO_DURATION_TICKS = 6 * 10;
function appendEchoOfLightBuff(unit, echoTotal) {
  const dur = ECHO_DURATION_TICKS;
  const hpt = echoTotal / dur;
  const buff = {
    id: generateCombatUid(`echo-${unit.id}`, Date.now(), Math.random),
    name: "Echo of Light",
    remainingTicks: dur,
    healingPerTick: hpt,
    icon: "wow/spell_holy_surgeoflight",
    sourceSpellId: ECHO_OF_LIGHT_SOURCE,
    rendersAsHoTRing: true
  };
  const kept = unit.buffs.filter((b) => b.sourceSpellId !== ECHO_OF_LIGHT_SOURCE);
  return { ...unit, buffs: [...kept, buff] };
}
function applyEchoOfLightPriest(s, partyBefore, party, spell, spellId, targetId) {
  if (s.playerClass !== "PRIEST" || spellId === "mana_potion" || !isDirectHeal(spell, spellId)) {
    return party;
  }
  if (spell.type === "AOE") {
    let out = party;
    for (const u2 of party) {
      const b2 = partyBefore.find((x) => x.id === u2.id);
      if (!b2 || u2.health <= 0) continue;
      const gained2 = u2.health - b2.health;
      if (gained2 <= 0) continue;
      const echoTotal2 = gained2 * PRIEST.passiveEchoOfLightHealFraction;
      out = mapEntityById(out, u2.id, (unit) => appendEchoOfLightBuff(unit, echoTotal2));
    }
    return out;
  }
  const b = partyBefore.find((x) => x.id === targetId);
  const u = party.find((x) => x.id === targetId);
  if (!b || !u || u.health <= 0) return party;
  const gained = u.health - b.health;
  if (gained <= 0) return party;
  const echoTotal = gained * PRIEST.passiveEchoOfLightHealFraction;
  return mapEntityById(party, targetId, (unit) => appendEchoOfLightBuff(unit, echoTotal));
}
function applyGraceStacksFromDirectHeal(s, party, targetId, spell, spellId) {
  const g = getRanks(s.talents, "priest_grace");
  if (g <= 0 || !isDirectHeal(spell, spellId) || spell.type === "AOE") return party;
  return mapEntityById(
    party,
    targetId,
    (u) => u.health > 0 ? upsertGraceOnTarget(u, 1, g) : u
  );
}
function graceHealMultiplierOnTarget(target, graceRanks) {
  if (graceRanks <= 0) return 1;
  const g = target.buffs.find((b) => b.sourceSpellId === GRACE_SOURCE_ID && b.remainingTicks > 0);
  if (!g || !g.stacks) return 1;
  const { maxStacks, healingPerStackLinearBonus } = AURAS.partyUnitBuffs.priest_grace;
  return 1 + healingPerStackLinearBonus * graceRanks * Math.min(maxStacks, g.stacks);
}
function upsertGraceOnTarget(unit, stacksAdd, graceRanks) {
  if (graceRanks <= 0) return unit;
  const dur = AURAS.partyUnitBuffs.priest_grace.defaultDurationTicks;
  const maxS = AURAS.partyUnitBuffs.priest_grace.maxStacks;
  const idx = unit.buffs.findIndex((b) => b.sourceSpellId === GRACE_SOURCE_ID);
  const nextStacks = Math.min(
    maxS,
    (idx >= 0 ? unit.buffs[idx].stacks ?? 1 : 0) + stacksAdd
  );
  const graceBuff = {
    id: generateCombatUid(`grace-${unit.id}`, Date.now(), Math.random),
    name: AURAS.partyUnitBuffs.priest_grace.displayName,
    remainingTicks: dur,
    healingPerTick: 0,
    icon: AURAS.partyUnitBuffs.priest_grace.icon,
    sourceSpellId: GRACE_SOURCE_ID,
    stacks: Math.max(1, nextStacks)
  };
  const kept = idx >= 0 ? unit.buffs.filter((_, i) => i !== idx) : unit.buffs;
  return { ...unit, buffs: [...kept, graceBuff] };
}
function aegisBurstHealFromAbsorb(s, absorbed) {
  const r = getRanks(s.talents, "aegis_burst");
  if (r <= 0 || absorbed <= 0) return 0;
  return absorbed * PRIEST.aegisBurstHealPerAbsorbPerRank * r;
}
function applyAegisBurstSplash(s, party, shieldedUnitId, shieldBefore, shieldAfter) {
  if (shieldAfter > 0 || shieldBefore <= 0) return { party, eff: 0, oh: 0 };
  const splash = aegisBurstHealFromAbsorb(s, shieldBefore - shieldAfter);
  if (splash <= 0) return { party, eff: 0, oh: 0 };
  let bestId = null;
  let bestPct = 2;
  for (const u of party) {
    if (u.health <= 0 || u.id === shieldedUnitId) continue;
    const pct = u.health / u.maxHealth;
    if (pct < bestPct) {
      bestPct = pct;
      bestId = u.id;
    }
  }
  if (!bestId) return { party, eff: 0, oh: 0 };
  const tgt = party.find((u) => u.id === bestId);
  if (!tgt) return { party, eff: 0, oh: 0 };
  const { health, eff, oh } = applyHealToUnit(tgt, splash);
  return {
    party: mapEntityById(party, bestId, (u) => ({ ...u, health })),
    eff,
    oh
  };
}
function applyAegisBurstsFromShieldTransitions(s, before, after) {
  return before.reduce((acc, bu, i) => {
    const au = after[i];
    if (bu && au && bu.id === au.id && bu.shield > 0 && au.shield <= 0) {
      const r = applyAegisBurstSplash(s, acc.party, au.id, bu.shield, au.shield);
      return { party: r.party, eff: acc.eff + r.eff, oh: acc.oh + r.oh };
    }
    return acc;
  }, { party: [...after], eff: 0, oh: 0 });
}
function archangelEchoShieldBonusFraction(s, spellId, spell) {
  if (s.capstoneForm !== "priest_archangel" || !hasBuff(s.playerCombatBuffs, "archangel") || archangelSkipsSpell(spellId) || !isDirectHeal(spell, spellId)) {
    return 0;
  }
  const totalShield = s.party.reduce((sum, unit) => sum + Math.max(0, unit.shield), 0);
  if (totalShield <= 0) return 0;
  return totalShield * PRIEST.archangelEchoShieldConsumeBonusFraction;
}
function priestDivinityOverhealAbsorb(overheal, rating) {
  if (overheal <= 0 || rating <= 0) return 0;
  return overheal * Math.min(0.45, rating * PRIEST.divinityOverhealToShieldPerRating);
}
function hasteBonusSum(s) {
  return priestShieldMaintenanceHasteBonus(s);
}
function critBonusForHealRoll(s, spellId) {
  if (spellId !== "flash_heal") return 0;
  return priestFlashCritBonusFromSynergy(s);
}
function damageTakenMultiplier(s, ctx) {
  const unit = ctx?.unit;
  if (!unit || unit.role !== "HEALER") return 1;
  return Math.max(0, 1 - priestSelfShieldDamageReduction(s));
}
function onShieldTransition(s, partyBefore, partyAfter) {
  return applyAegisBurstsFromShieldTransitions(s, partyBefore, partyAfter);
}
export {
  ECHO_OF_LIGHT_SOURCE,
  critBonusForHealRoll,
  damageTakenMultiplier,
  hasteBonusSum,
  onShieldTransition,
  GRACE_SOURCE_ID,
  PLAYER_BUFF_OMEN_CLEARCASTING,
  aegisBurstHealFromAbsorb,
  applyAegisBurstSplash,
  applyAegisBurstsFromShieldTransitions,
  applyBindingHealSelf,
  applyDivineAegis,
  applyEchoOfLightPriest,
  applyGraceStacksFromDirectHeal,
  archangelEchoShieldBonusFraction,
  archangelSkipsSpell,
  graceHealMultiplierOnTarget,
  isPriestSurgeFinisher,
  manaAfterHeal,
  manaReturnOnTick,
  onHealLand,
  onHealManaCost,
  priestDivinityOverhealAbsorb,
  priestFlashCritBonusFromSynergy,
  priestMeditativeManaReturnPerTick,
  priestSelfShieldDamageReduction,
  priestShieldMaintenanceHasteBonus,
  rollSurgeOfLight,
  upsertGraceOnTarget
};
