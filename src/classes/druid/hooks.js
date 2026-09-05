import { getRanks, hasBuff, addBuff, getConsumableHotIndex, addSpiritLockoutIfSpent, applyPiAfterCd, getBuffStacks, PLAYER_BUFF_POWER_INFUSION } from "../../talentMechanics.js";
import { applyHealToUnit } from "../../healMath.js";
import { SPELL_TAG_DRUID_CULTIVATION_HOT, SPELL_TAG_DRUID_HOT, spellHasTag } from "../../constants.js";
import { mapEntityById } from "../../mapEntityById.js";
import balanceData from "../../data/balance.json" with { type: "json" };
import { getUniqueStatRating } from "../../playerStats.js";
const PLAYER_BUFF_OMEN_CLEARCASTING = "omen_clearcasting";
const DRUID_HARMONY_HOT_BUFF = "druid_harmony_for_hot";
const DRUID_HARMONY_HOT_TICKS = 6 * 10;
const DRUID = balanceData.combat.druid;
const SHARED = balanceData.combat.shared;
function onHealManaCost(s, spell, spellId, surgeFree) {
  if (hasBuff(s.playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING)) {
    if (spellId === "regrowth" || spellId === "healing_touch") return 0;
  }
  if (getRanks(s.talents, "tree_of_life") > 0) {
    const isHot = spell.type === "HOT" || Boolean(spell.hotDuration && spell.healing > 0);
    if (isHot) return Math.round(spell.manaCost * DRUID.treeOfLifeHotManaCostFactor);
    if (spellHasTag(spellId, "tree-of-life-big-direct")) {
      return Math.round(spell.manaCost * DRUID.treeOfLifeBigDirectManaCostFactor);
    }
  }
  return void 0;
}
function druidHotTickManaReturn(s, sourceSpellId) {
  if (s.playerClass !== "DRUID" || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) return 0;
  const ranks = s.talents.find((t) => t.id === "d_r0c4")?.points ?? 0;
  if (ranks <= 0) return 0;
  return DRUID.hotTickManaReturnPerRank * ranks;
}
function druidHotTickRateMultiplier(s, sourceSpellId) {
  if (s.capstoneForm !== "druid_natures_grace" || !hasBuff(s.playerCombatBuffs, "natures_grace_aura") || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return 1;
  }
  return DRUID.naturesGraceHotTickRateMultiplier;
}
function druidHarmonyHotTickMultiplier(s, pComb) {
  const h = getRanks(s.talents, "druid_harmony");
  if (h <= 0 || !hasBuff(pComb, DRUID_HARMONY_HOT_BUFF)) return 1;
  return 1 + DRUID.harmonyBonusPerRank * h;
}
function druidHarmonyDirectMultiplier(s) {
  const h = getRanks(s.talents, "druid_harmony");
  if (h <= 0 || !partyHasDruidHotOnAnyAlly(s)) return 1;
  return 1 + DRUID.harmonyBonusPerRank * h;
}
function cultivationHotMultiplier(s, sourceSpellId) {
  if (getRanks(s.talents, "druid_path_cultivation") <= 0) return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_CULTIVATION_HOT)) {
    return 1 + DRUID.cultivationBonusPerRank * getRanks(s.talents, "druid_path_cultivation");
  }
  return 1;
}
function deepRootsHotMultiplier(s, unit, sourceSpellId) {
  if (getRanks(s.talents, "druid_path_deep_roots") <= 0) return 1;
  if (unit.role !== "TANK") return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return 1 + DRUID.deepRootsBonusPerRank * getRanks(s.talents, "druid_path_deep_roots");
  }
  return 1;
}
function druidActiveHotCount(s) {
  return s.party.reduce(
    (count, unit) => count + unit.buffs.filter((buff) => buff.remainingTicks > 0 && spellHasTag(buff.sourceSpellId, SPELL_TAG_DRUID_HOT)).length,
    0
  );
}
function druidRampHasteBonus(s) {
  if (s.playerClass !== "DRUID") return 0;
  const ranks = s.talents.find((t) => t.id === "d_r4c3")?.points ?? 0;
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampHastePerHotPerRank * ranks;
}
function druidRampCritBonus(s) {
  if (s.playerClass !== "DRUID") return 0;
  const ranks = s.talents.find((t) => t.id === "d_r5c4")?.points ?? 0;
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampCritPerHotPerRank * ranks;
}
function onHealLand(s, ctx, party, playerCombatBuffs) {
  const seeded = applyLivingSeed(
    s,
    party,
    ctx.targetId,
    ctx.isCrit,
    ctx.spell,
    ctx.healMultB,
    ctx.critH,
    ctx.tMod,
    ctx.rankHealMult
  );
  return { party: seeded, playerCombatBuffs, healEff: 0, healOh: 0 };
}
function druidBarkskinSelfHealOnDamage(s, damageTaken) {
  if (s.playerClass !== "DRUID" || damageTaken <= 0) return 0;
  const ranks = s.talents.find((t) => t.id === "d_r2c0")?.points ?? 0;
  if (ranks <= 0) return 0;
  return damageTaken * DRUID.barkskinSelfHealFractionPerRank * ranks;
}
function applyLivingSeed(s, newParty, targetId, isCritH, spell, healMultB, critH, tMod, rankHealMult) {
  if (!isCritH || getRanks(s.talents, "living_seed") <= 0) {
    return newParty;
  }
  let pct = DRUID.livingSeedPoolFraction;
  if (getRanks(s.talents, "living_seed") > 0 && getRanks(s.talents, "natural_perfection") > 0) {
    pct += DRUID.livingSeedNaturalPerfectionBonusFraction;
  }
  const am = spell.healing * rankHealMult * healMultB * critH * tMod * pct;
  return mapEntityById(newParty, targetId, (x) => ({ ...x, livingSeedPool: am }));
}
function druidVitalityBloomTickExtras(s, tickAmtAfterModifiers, random) {
  if (s.playerClass !== "DRUID" || tickAmtAfterModifiers <= 0) return { extraHeal: 0, mana: 0 };
  const r = getUniqueStatRating(s.playerClass, s.level, s.talents);
  if (r <= 0) return { extraHeal: 0, mana: 0 };
  const p = Math.min(DRUID.vitalityBloomChanceCap, r * DRUID.vitalityBloomChancePerRating);
  if (random() >= p) return { extraHeal: 0, mana: 0 };
  let mana = 0;
  if (random() < DRUID.vitalityBloomManaRefundChance) {
    mana = DRUID.vitalityBloomManaRefundAmount;
  }
  return { extraHeal: tickAmtAfterModifiers * DRUID.vitalityBloomHealFractionOfTick, mana };
}
function vitalityBloomTickExtras(s, tickAmt, random) {
  return druidVitalityBloomTickExtras(s, tickAmt, random);
}
function rollOmenOfClarityOnHotTick(s, tickAmt, sourceSpellId, playerCombatBuffs, random) {
  if (s.playerClass !== "DRUID" || tickAmt <= 0 || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return playerCombatBuffs;
  }
  const r = getUniqueStatRating(s.playerClass, s.level, s.talents);
  if (r <= 0) return playerCombatBuffs;
  const p = Math.min(DRUID.passiveOmenProcChanceCap, r * DRUID.passiveOmenProcPerHotTickPerRating);
  if (random() >= p) return playerCombatBuffs;
  return addBuff(playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING, DRUID.passiveOmenClearcastingTicks, 1);
}
function partyHasDruidHotOnAnyAlly(s) {
  return s.party.some(
    (u) => u.health > 0 && u.buffs.some((b) => spellHasTag(b.sourceSpellId, SPELL_TAG_DRUID_HOT))
  );
}
/**
 * Swiftmend: consumes a Rejuvenation or Regrowth on the target to burst-heal.
 *
 * This is the `trySpecialHealCast` hook the cast pipeline looks for. Without it
 * the spell fell through to a standard cast that consumed no HoT and healed
 * nothing at all.
 */
function trySpecialHealCast(s, ctx) {
  if (s.playerClass !== "DRUID" || ctx.spellId !== "swiftmend") return null;
  const idx = s.party.findIndex((u) => u.id === ctx.targetId);
  if (idx < 0) return null;
  const target = s.party[idx];
  if (!target || target.health <= 0) return null;
  const hotIdx = getConsumableHotIndex(target);
  if (hotIdx < 0) return null;

  const isCrit = ctx.critRoll < ctx.eff.critChancePercent(0, 0);
  const critMod = isCrit ? 1.5 : 1;
  const raw = ctx.spell.healing * ctx.eff.baseHealingMultiplier * critMod;
  const { health, eff, oh } = applyHealToUnit(target, raw);

  const party = s.party.map((u, i) => {
    if (i !== idx) return u;
    return { ...u, health, buffs: u.buffs.filter((_, j) => j !== hotIdx) };
  });

  const piLeft = Math.max(0, getBuffStacks(s.playerCombatBuffs, PLAYER_BUFF_POWER_INFUSION) - 1);
  ctx.runCooldown(ctx.spell.cooldown, piLeft);
  let buffs = addSpiritLockoutIfSpent(s.playerCombatBuffs, ctx.needMana > 0);
  buffs = applyPiAfterCd(buffs, piLeft);

  return {
    ...s,
    party,
    mana: Math.max(0, s.mana - ctx.needMana),
    playerCombatBuffs: buffs,
    dungeonRunHealEffective: s.dungeonRunHealEffective + eff,
    dungeonRunHealOverheal: s.dungeonRunHealOverheal + oh,
    dungeonRunManaSpentHealing: s.dungeonRunManaSpentHealing + ctx.needMana
  };
}
function hasteBonusSum(s) {
  return druidRampHasteBonus(s);
}
function critBonusForHealRoll(s) {
  return druidRampCritBonus(s);
}
function castDirectHealMultiplier(s) {
  return druidHarmonyDirectMultiplier(s);
}
function hotTickRateMultiplier(s, sourceSpellId) {
  return druidHotTickRateMultiplier(s, sourceSpellId);
}
function hotTickManaReturn(s, sourceSpellId) {
  return druidHotTickManaReturn(s, sourceSpellId);
}
function selfHealOnDamage(s, damageTaken) {
  return druidBarkskinSelfHealOnDamage(s, damageTaken);
}
function hotTickAmount(ctx) {
  const { state, unit, buff, healPerTick } = ctx;
  const src = buff.sourceSpellId;
  let amt = healPerTick;
  amt *= cultivationHotMultiplier(state, src);
  amt *= deepRootsHotMultiplier(state, unit, src);
  amt *= druidHarmonyHotTickMultiplier(state, state.playerCombatBuffs);
  return amt;
}
export {
  DRUID_HARMONY_HOT_BUFF,
  vitalityBloomTickExtras,
  trySpecialHealCast,
  castDirectHealMultiplier,
  critBonusForHealRoll,
  hasteBonusSum,
  hotTickAmount,
  hotTickManaReturn,
  hotTickRateMultiplier,
  selfHealOnDamage,
  DRUID_HARMONY_HOT_TICKS,
  PLAYER_BUFF_OMEN_CLEARCASTING,
  applyLivingSeed,
  cultivationHotMultiplier,
  deepRootsHotMultiplier,
  druidBarkskinSelfHealOnDamage,
  druidHarmonyDirectMultiplier,
  druidHarmonyHotTickMultiplier,
  druidHotTickManaReturn,
  druidHotTickRateMultiplier,
  druidRampCritBonus,
  druidRampHasteBonus,
  druidVitalityBloomTickExtras,
  onHealLand,
  onHealManaCost,
  partyHasDruidHotOnAnyAlly,
  rollOmenOfClarityOnHotTick
};
