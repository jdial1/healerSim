import { getRanks, hasBuff, addBuff } from "../../talentMechanics.js";
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
function druidVitalityBloomTickExtras(s, tickAmtAfterModifiers) {
  if (s.playerClass !== "DRUID" || tickAmtAfterModifiers <= 0) return { extraHeal: 0, mana: 0 };
  const r = getUniqueStatRating(s.playerClass, s.level, s.talents);
  if (r <= 0) return { extraHeal: 0, mana: 0 };
  const p = Math.min(DRUID.vitalityBloomChanceCap, r * DRUID.vitalityBloomChancePerRating);
  if (Math.random() >= p) return { extraHeal: 0, mana: 0 };
  let mana = 0;
  if (Math.random() < DRUID.vitalityBloomManaRefundChance) {
    mana = DRUID.vitalityBloomManaRefundAmount;
  }
  return { extraHeal: tickAmtAfterModifiers * DRUID.vitalityBloomHealFractionOfTick, mana };
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
export {
  DRUID_HARMONY_HOT_BUFF,
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
