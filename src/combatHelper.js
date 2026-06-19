import { getConsumableHotIndex } from "./talentMechanics.js";
import { getManaCost as getManaCostRegistry } from "./combatHookRegistry.js";
import { BALANCE, SPELLS } from "./data/index.js";
import { spellHasTag } from "./constants.js";
import { getHealSplit } from "./healMath.js";
const T_SPIRIT_AMP = 10 * 10;
const SHIELD_DEFAULT_TICKS = BALANCE.combat.shared.shieldDefaultTicks;
const SHARED = BALANCE.combat.shared;
const DRUID = BALANCE.combat.druid;
function hotPandemicCapMult(spell) {
  return spell.balance?.hotPandemicDurationCapMult ?? SHARED.hotPandemicDurationCapMultDefault;
}
function getSynergyMultiplier(unit, spellId) {
  if (!spellHasTag(spellId, "synergy-direct")) return 1;
  if (!unit.buffs.some((b) => spellHasTag(b.sourceSpellId, "synergy-primer-source"))) return 1;
  const sp = SPELLS[spellId];
  return sp?.balance?.directHealSynergyMultiplier ?? SHARED.directHealSynergyMultiplierDefault;
}
function unitBuffIdMatch(b, spellId) {
  return b.sourceSpellId === spellId || b.id === spellId;
}
function getPartyBuffStacks(unit, spellId) {
  const b = unit.buffs.find(
    (x) => unitBuffIdMatch(x, spellId) && (x.category ?? "helpful") === "helpful"
  );
  if (!b) return 0;
  if ((b.stacks ?? 0) > 0) return b.stacks;
  return b.remainingTicks > 0 ? 1 : 0;
}
function debuffIdMatch(d, abilityId) {
  return d.sourceAbilityId === abilityId || d.id === abilityId;
}
function getPartyDebuffStacks(unit, abilityOrDebuffId) {
  const d = unit.debuffs.find(
    (x) => debuffIdMatch(x, abilityOrDebuffId) && (x.category ?? "harmful") === "harmful"
  );
  if (!d) return 0;
  return d.remainingTicks > 0 ? 1 : 0;
}
function dispelOne(debuffs) {
  const i = debuffs.findIndex(
    (d) => (d.category ?? "harmful") === "harmful" && (d.isDispellable ?? d.dispellable)
  );
  if (i < 0) return debuffs;
  return debuffs.filter((_, j) => j !== i);
}
function applyHot(unit, spell, healingPerTick, opts) {
  const baseTicks = spell.hotDuration ?? 0;
  if (baseTicks <= 0) return unit;
  const capTicks = Math.max(baseTicks, Math.floor(baseTicks * hotPandemicCapMult(spell)));
  const existingIdx = unit.buffs.findIndex((b) => b.sourceSpellId === spell.id);
  let carried = 0;
  let kept = unit.buffs;
  if (existingIdx >= 0) {
    carried = unit.buffs[existingIdx].remainingTicks;
    kept = unit.buffs.filter((_, i) => i !== existingIdx);
  }
  const combined = Math.min(carried + baseTicks, capTicks);
  const scale = opts?.hasteTickScale ?? 1;
  const bloom = opts?.bloomBurstHeal ?? (spell.id === "lifebloom" ? Math.max(0, spell.healing) : void 0);
  const buff = {
    id: spell.id,
    name: spell.name,
    remainingTicks: combined,
    healingPerTick,
    icon: spell.icon,
    sourceSpellId: spell.id,
    durationTicksMax: combined,
    tickIntervalScale: scale,
    tickAccumulator: 0,
    bloomBurstHeal: bloom && bloom > 0 ? bloom : void 0,
    rendersAsHoTRing: true
  };
  return { ...unit, buffs: [...kept, buff] };
}
function getManaCost(s, classType, spell, spellId, surgeFree) {
  return getManaCostRegistry(s, classType, spell, spellId, surgeFree);
}
function canSwiftmend(s, targetId) {
  if (s.playerClass !== "DRUID") return false;
  const u = s.party.find((x) => x.id === targetId);
  if (!u || u.health <= 0) return false;
  return getConsumableHotIndex(u) >= 0;
}
function resolveSwiftmend(s, classType, targetId, healMult, critMod, spell, rankHealMult) {
  if (classType !== "DRUID") return { party: s.party, applied: false, eff: 0, oh: 0 };
  const p = s.party.map((u2) => ({ ...u2, buffs: [...u2.buffs] }));
  const idx = p.findIndex((u2) => u2.id === targetId);
  if (idx < 0) return { party: s.party, applied: false, eff: 0, oh: 0 };
  const u = p[idx];
  if (u.health <= 0) return { party: s.party, applied: false, eff: 0, oh: 0 };
  const hotIdx = getConsumableHotIndex(u);
  if (hotIdx < 0) {
    return { party: s.party, applied: false, eff: 0, oh: 0 };
  }
  const raw = spell.healing * rankHealMult * healMult * critMod;
  const { eff, oh } = getHealSplit(u.health, u.maxHealth, raw);
  u.buffs = u.buffs.filter((_, j) => j !== hotIdx);
  const h = Math.min(u.maxHealth, u.health + raw);
  p[idx] = { ...u, health: h };
  return { party: p, applied: true, eff, oh };
}
function isDoubleTick(photosynthPoints) {
  if (photosynthPoints <= 0) return false;
  return Math.random() < photosynthPoints * DRUID.photosynthesisDoubleTickChancePerRank;
}
export {
  SHIELD_DEFAULT_TICKS,
  T_SPIRIT_AMP,
  applyHot,
  canSwiftmend,
  dispelOne,
  getManaCost,
  getPartyBuffStacks,
  getPartyDebuffStacks,
  getSynergyMultiplier,
  isDoubleTick,
  resolveSwiftmend
};
