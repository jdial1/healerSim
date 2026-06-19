import {
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  SPELL_TAG_DRUID_HOT,
  SPELL_TAG_SWIFTMEND_CONSUMABLE,
  SPELL_TAG_SWIFTMEND_PREFER,
  spellHasTag
} from "./constants.js";
import { CLASS_PROGRESSION } from "./playerStats.js";
const TICKS_1S = 10;
const PLAYER_BUFF_MANA_REGEN_POTION = "mana_regen_potion";
const PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT = "spirit_regen_lockout";
const PLAYER_BUFF_POWER_INFUSION = "power_infusion";
const PLAYER_BUFF_NATURAL_PERFECTION = "natural_perfection";
const PLAYER_COMBAT_BUFF_NO_TIME_DECAY = new Set([
  PLAYER_BUFF_POWER_INFUSION,
  PLAYER_BUFF_NATURAL_PERFECTION
]);
const TICKS_SPIRIT_REDEMPTION = 10 * TICKS_1S;
const ICD_SPIRIT_REDEMPTION = 120 * TICKS_1S;
const SURGE_OF_LIGHT_TICKS = 6 * TICKS_1S;
const HEALER_UNIT_ID = "5";
function getRanks(talents, mechanicId) {
  return talents.filter((t) => t.mechanicId === mechanicId).reduce((a, t) => a + t.points, 0);
}
function hasTalent(talents, mechanicId) {
  return getRanks(talents, mechanicId) > 0;
}
function exclusiveUnlock(talents, learnId) {
  const t = talents.find((x) => x.id === learnId);
  if (!t) return talents;
  const toClear = new Set(t.exclusiveWith ?? []);
  return talents.map((row) => {
    if (row.id === learnId) {
      return { ...row, points: row.points + 1 };
    }
    if (toClear.has(row.id)) {
      return { ...row, points: 0 };
    }
    return row;
  });
}
function buffIsActive(b) {
  if (PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id)) return b.stacks > 0;
  return b.remainingTicks > 0;
}
function getActiveBuff(buffs, id) {
  const b = buffs.find((x) => x.id === id);
  return b && buffIsActive(b) ? b : void 0;
}
function hasBuff(buffs, id) {
  return !!getActiveBuff(buffs, id);
}
function getBuffTicks(buffs, id) {
  if (PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(id)) return 0;
  return getActiveBuff(buffs, id)?.remainingTicks ?? 0;
}
function getBuffStacks(buffs, id) {
  return getActiveBuff(buffs, id)?.stacks ?? 0;
}
function getNaturalPerfectionStacks(buffs) {
  return getBuffStacks(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
}
function getCapstoneAfterTick(form, buffs, playerClass) {
  if (!form || !playerClass) return null;
  const config = CLASS_PROGRESSION[playerClass];
  if (form === config.capstoneForm) {
    return hasBuff(buffs, config.capstonePlayerBuffId) ? form : null;
  }
  return null;
}
function addSpiritLockoutIfSpent(buffs, spentMana) {
  if (!spentMana) return buffs;
  return addBuff(buffs, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT, MANA_SPIRIT_REGEN_LOCKOUT_TICKS, 1);
}
function addBuff(buffs, id, ticks, stacks, opts) {
  const i = buffs.findIndex((b) => b.id === id);
  const drip = opts?.potionDripPerTick;
  if (i < 0) {
    return [
      ...buffs,
      { id, remainingTicks: ticks, stacks, ...drip !== void 0 ? { potionDripPerTick: drip } : {} }
    ];
  }
  const prev = buffs[i];
  const nextDrip = drip !== void 0 ? drip : prev.potionDripPerTick;
  const next = [...buffs];
  next[i] = {
    id,
    remainingTicks: Math.max(ticks, prev.remainingTicks),
    stacks,
    ...nextDrip !== void 0 ? { potionDripPerTick: nextDrip } : {}
  };
  return next;
}
function getPotionDrip(buffs) {
  const b = buffs.find((x) => x.id === PLAYER_BUFF_MANA_REGEN_POTION);
  if (!b || b.remainingTicks <= 0) return 0;
  return b.potionDripPerTick ?? 0;
}
function tickBuffs(buffs) {
  return buffs.map(
    (b) => PLAYER_COMBAT_BUFF_NO_TIME_DECAY.has(b.id) ? b : { ...b, remainingTicks: b.remainingTicks - 1 }
  ).filter(buffIsActive);
}
function decrementBuff(buffs, id) {
  return buffs.map((b) => {
    if (b.id !== id) return b;
    if (b.stacks <= 1) return { ...b, remainingTicks: 0, stacks: 0 };
    return { ...b, stacks: b.stacks - 1 };
  }).filter((b) => b.remainingTicks > 0 && b.stacks > 0);
}
function removeBuff(buffs, id) {
  return buffs.filter((b) => b.id !== id);
}
function applyPiAfterCd(buffs, castsRemaining) {
  if (castsRemaining <= 0) return removeBuff(buffs, PLAYER_BUFF_POWER_INFUSION);
  return addBuff(buffs, PLAYER_BUFF_POWER_INFUSION, 1, castsRemaining);
}
function addPiCharges(buffs, minCharges) {
  const cur = getBuffStacks(buffs, PLAYER_BUFF_POWER_INFUSION);
  return addBuff(buffs, PLAYER_BUFF_POWER_INFUSION, 1, Math.max(cur, minCharges));
}
function addNaturalPerfection(buffs, stacks) {
  if (stacks <= 0) return removeBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION);
  return addBuff(buffs, PLAYER_BUFF_NATURAL_PERFECTION, 1, stacks);
}
function isReady(icds, key) {
  return (icds[key] ?? 0) <= 0;
}
function getHealer(party) {
  return party.find((u) => u.role === "HEALER");
}
function hasHot(unit) {
  return unit.buffs.some(
    (b) => spellHasTag(b.sourceSpellId, SPELL_TAG_DRUID_HOT) || spellHasTag(b.sourceSpellId, "synergy-primer-source")
  );
}
function getConsumableHotIndex(unit) {
  const prefer = unit.buffs.findIndex(
    (b) => (b.category ?? "helpful") === "helpful" && spellHasTag(b.sourceSpellId, SPELL_TAG_SWIFTMEND_PREFER)
  );
  if (prefer >= 0) return prefer;
  return unit.buffs.findIndex(
    (b) => (b.category ?? "helpful") === "helpful" && spellHasTag(b.sourceSpellId, SPELL_TAG_SWIFTMEND_CONSUMABLE)
  );
}
function isHeal(spell, spellId) {
  if (spellId === "mana_potion") return false;
  return spell.type === "DIRECT" || spell.type === "HOT" || spell.type === "AOE";
}
function isDirectHeal(spell, spellId) {
  if (spellId === "mana_potion") return false;
  if (spell.type === "AOE" || spell.type === "DIRECT") return true;
  if (spell.type === "HOT" && spell.healing > 0) return true;
  return false;
}
function applyDamage(health, shield, damage) {
  if (shield >= damage) {
    return {
      health,
      shield: shield - damage,
      shieldTicksRemaining: 0,
      tookHealthDamage: 0
    };
  }
  const remainingDamage = damage - shield;
  return {
    health: Math.max(0, health - remainingDamage),
    shield: 0,
    shieldTicksRemaining: 0,
    tookHealthDamage: remainingDamage
  };
}
export {
  HEALER_UNIT_ID,
  ICD_SPIRIT_REDEMPTION,
  PLAYER_BUFF_MANA_REGEN_POTION,
  PLAYER_BUFF_NATURAL_PERFECTION,
  PLAYER_BUFF_POWER_INFUSION,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  SURGE_OF_LIGHT_TICKS,
  TICKS_1S,
  TICKS_SPIRIT_REDEMPTION,
  addBuff,
  addNaturalPerfection,
  addPiCharges,
  addSpiritLockoutIfSpent,
  applyDamage,
  applyPiAfterCd,
  decrementBuff,
  exclusiveUnlock,
  getActiveBuff,
  getBuffStacks,
  getBuffTicks,
  getCapstoneAfterTick,
  getConsumableHotIndex,
  getHealer,
  getNaturalPerfectionStacks,
  getPotionDrip,
  getRanks,
  hasBuff,
  hasHot,
  hasTalent,
  isDirectHeal,
  isHeal,
  isReady,
  removeBuff,
  tickBuffs
};
