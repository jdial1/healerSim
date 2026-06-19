import { ClassRegistry } from "./classes/index.js";
import npcPoolsData from "./data/npc_pools.json" with { type: "json" };
import { BALANCE } from "./data/index.js";
const PS = BALANCE.playerStats;
const MANA_PER_INTELLECT = PS.manaPerIntellect;
const HEALING_PCT_PER_SPIRIT = PS.healingPctPerSpirit;
const MANA_REGEN_MULT_PER_SPIRIT = PS.manaRegenMultPerSpirit;
function getSpiritRegenMultiplier(spirit) {
  return 1 + spirit * PS.manaRegenMultPerSpirit;
}
const UNIQUE_STAT_LABELS = {
  PRIEST: "Divinity",
  DRUID: "Vitality",
  PALADIN: "Radiance"
};
const UNIQUE_STAT_DESCRIPTIONS = {
  PRIEST: "Turns overhealing from direct heals into absorb shields and strengthens critical Divine Aegis shields. Higher Divinity improves both effects.",
  DRUID: "Makes HoT ticks more explosive: a chance to bloom for extra healing on tick, with a chance to return a little mana on that bloom. Higher Vitality improves bloom odds and impact.",
  PALADIN: "Increases healing on injured targets\u2014the lower their health, the larger the bonus, up to a cap. Higher Radiance raises how much missing health amplifies your heals."
};
function getClassJson(cls) {
  return ClassRegistry.getMetadata(cls);
}
const CLASS_STAT_CURVE = {
  PRIEST: getClassJson("PRIEST")?.statCurves || {
    baseIntellect: 30,
    baseSpirit: 20,
    intellectPerLevel: 3.5,
    spiritPerLevel: 1.5,
    baseUniqueStat: 8,
    uniqueStatPerLevel: 0.55
  },
  DRUID: getClassJson("DRUID")?.statCurves || {
    baseIntellect: 32,
    baseSpirit: 25,
    intellectPerLevel: 2.5,
    spiritPerLevel: 1.8,
    baseUniqueStat: 10,
    uniqueStatPerLevel: 0.65
  },
  PALADIN: getClassJson("PALADIN")?.statCurves || {
    baseIntellect: 35,
    baseSpirit: 18,
    intellectPerLevel: 3.5,
    spiritPerLevel: 1.5,
    baseUniqueStat: 7,
    uniqueStatPerLevel: 0.5
  }
};
const defaultProgression = {
  PRIEST: {
    starterSpells: ["flash_heal", "renew"],
    spellOrder: ["flash_heal", "renew", "greater_heal", "circle_of_healing"],
    capstoneForm: "priest_archangel",
    capstoneMechanicId: "capstone_archangel",
    capstonePlayerBuffId: "archangel"
  },
  DRUID: {
    starterSpells: ["rejuvenation", "regrowth"],
    spellOrder: ["rejuvenation", "regrowth", "healing_touch", "lifebloom", "swiftmend", "wild_growth"],
    capstoneForm: "druid_natures_grace",
    capstoneMechanicId: "capstone_natures_grace",
    capstonePlayerBuffId: "natures_grace_aura"
  },
  PALADIN: {
    starterSpells: ["flash_heal"],
    spellOrder: ["flash_heal", "holy_light", "light_of_dawn"],
    capstoneForm: "paladin_avenging_wrath",
    capstoneMechanicId: "capstone_avenging_wrath",
    capstonePlayerBuffId: "avenging_wrath_aura"
  }
};
const CLASS_PROGRESSION = {
  PRIEST: getClassJson("PRIEST")?.progression ?? defaultProgression.PRIEST,
  DRUID: getClassJson("DRUID")?.progression ?? defaultProgression.DRUID,
  PALADIN: getClassJson("PALADIN")?.progression ?? defaultProgression.PALADIN
};
const CAPSTONE_PLAYER_BUFF_IDS = Array.from(
  new Set(Object.values(CLASS_PROGRESSION).map((p) => p.capstonePlayerBuffId))
);
const RANK_HEAL_MULT = 1.15;
const RANK_COST_MULT = 1.1;
function getRankHealMult(rank) {
  return Math.pow(RANK_HEAL_MULT, Math.max(0, rank - 1));
}
function getRankCostMult(rank) {
  return Math.pow(RANK_COST_MULT, Math.max(0, rank - 1));
}
function getSpellRank(spellId, cls, level) {
  const order = CLASS_PROGRESSION[cls].spellOrder;
  const idx = order.indexOf(spellId);
  if (idx === -1) return 1;
  const slot = idx % 3;
  const firstUpgradeLevel = 2 + slot;
  if (level < firstUpgradeLevel) return 1;
  return 2 + Math.floor((level - firstUpgradeLevel) / 3);
}
function getSpellUpgradeAtLevel(cls, level) {
  if (level < 2) return [];
  const order = CLASS_PROGRESSION[cls].spellOrder;
  const slot = (level - 2) % 3;
  const out = [];
  if (order[slot]) out.push(order[slot]);
  if (order[slot + 3]) out.push(order[slot + 3]);
  return out;
}
function getPotionUpgradeAtLevel(level) {
  return level > 0 && level % 5 === 0;
}
function getSpellOrder(cls) {
  return CLASS_PROGRESSION[cls].spellOrder;
}
function getStarterSpells(cls) {
  return CLASS_PROGRESSION[cls].starterSpells;
}
function getCapstone(cls) {
  return CLASS_PROGRESSION[cls].capstoneForm;
}
function getPortrait(cls) {
  const row = getClassJson(cls);
  if (!row) return { portraitIcon: "lorc/angel-outfit", portraitGlow: "spell" };
  const g = row.portraitGlow;
  if (g !== "spell" && g !== "nature" && g !== "debuff") return { portraitIcon: row.portraitIcon, portraitGlow: "spell" };
  return { portraitIcon: row.portraitIcon, portraitGlow: g };
}
function getTutorialCopy(cls) {
  const row = getClassJson(cls);
  if (!row?.tutorial) {
    return { passiveDescription: "Passive effect active. Keep healing." };
  }
  return row.tutorial;
}
function getTalentGlow(cls) {
  return getPortrait(cls).portraitGlow;
}
function getPrimaryStats(cls, level) {
  if (!cls) return { intellect: 0, spirit: 0 };
  const c = CLASS_STAT_CURVE[cls];
  const lv = Math.max(1, level);
  return {
    intellect: c.baseIntellect + (lv - 1) * c.intellectPerLevel,
    spirit: c.baseSpirit + (lv - 1) * c.spiritPerLevel
  };
}
function getUniqueStatRating(cls, level, talents) {
  if (!cls) return 0;
  const c = CLASS_STAT_CURVE[cls];
  const lv = Math.max(1, level);
  const base = c.baseUniqueStat + (lv - 1) * c.uniqueStatPerLevel;
  return base + getTalentStats(talents).uniqueStatFlat;
}
function getTalentWeight(points, maxPoints) {
  const spent = Math.max(0, Math.min(points, maxPoints));
  if (spent === 0) return 0;
  return spent === maxPoints ? spent * 1.2 : spent;
}
function getTalentStats(talents) {
  const acc = { flatMana: 0, healingBoostPct: 0, critChancePct: 0, hastePct: 0, uniqueStatFlat: 0 };
  for (const t of talents) {
    const p = getTalentWeight(t.points, t.maxPoints);
    if (t.statBonus) {
      acc.flatMana += (t.statBonus.manaPool ?? 0) * p;
      acc.healingBoostPct += (t.statBonus.healingBoost ?? 0) * p;
      acc.critChancePct += (t.statBonus.critChance ?? 0) * p;
      acc.hastePct += (t.statBonus.haste ?? 0) * p;
      acc.uniqueStatFlat += (t.statBonus.uniqueStat ?? 0) * p;
    }
  }
  return acc;
}
function getTalentMana(talents) {
  return getTalentStats(talents).flatMana;
}
function getTalentHealingBonusPct(talents) {
  return getTalentStats(talents).healingBoostPct;
}
function getTalentCritChancePct(talents) {
  return getTalentStats(talents).critChancePct;
}
function getTalentHastePct(talents) {
  return getTalentStats(talents).hastePct;
}
function getNaturePerfectionBonus(naturalPerfectionStacks) {
  return naturalPerfectionStacks * 2;
}
function getMaxMana(cls, level, talents) {
  if (!cls) return 100;
  const { intellect } = getPrimaryStats(cls, level);
  return Math.round(intellect * MANA_PER_INTELLECT + getTalentStats(talents).flatMana);
}
function getHealingMultiplier(cls, level, talents) {
  if (!cls) return 1;
  const { spirit } = getPrimaryStats(cls, level);
  const talentPct = getTalentStats(talents).healingBoostPct;
  const spiritPct = spirit * HEALING_PCT_PER_SPIRIT;
  return 1 + (spiritPct + talentPct) / 100;
}
function randomAllyLevel(playerLevel) {
  return Math.max(1, playerLevel + Math.floor(Math.random() * 3) - 1);
}
const ALLY_HEALTH_DEFAULTS = npcPoolsData.allyHealthDefaults;
function getMaxHealthForPool(role, level, healthScaling) {
  const s = healthScaling ?? ALLY_HEALTH_DEFAULTS[role];
  const lv = Math.max(1, level);
  return Math.round(s.base + (lv - 1) * s.perLevel);
}
function getMaxHealth(role, level) {
  return getMaxHealthForPool(role, level, void 0);
}
function getHealerMaxHealth(_cls, level) {
  return getMaxHealth("DPS", level);
}
function getStatBreakdown(cls, level, talents) {
  const { intellect, spirit } = getPrimaryStats(cls, level);
  const tStats = getTalentStats(talents);
  const classJson = getClassJson(cls);
  const spiritRawPct = spirit * HEALING_PCT_PER_SPIRIT;
  const totalHealingBonusPct = spiritRawPct + tStats.healingBoostPct;
  return {
    intellect, spirit, maxHealth: getHealerMaxHealth(cls, level),
    manaPerIntellect: MANA_PER_INTELLECT, healingPctPerSpirit: HEALING_PCT_PER_SPIRIT,
    manaFromIntellect: Math.round(intellect * MANA_PER_INTELLECT), manaFromTalents: tStats.flatMana,
    maxMana: Math.round(intellect * MANA_PER_INTELLECT) + tStats.flatMana,
    healingBonusPctFromSpirit: Math.round(spiritRawPct * 10) / 10,
    healingBonusPctFromTalents: Math.round(tStats.healingBoostPct * 10) / 10,
    totalHealingBonusPct: Math.round(totalHealingBonusPct * 10) / 10,
    healingEffectMultiplier: Math.round((1 + totalHealingBonusPct / 100) * 1e3) / 1e3,
    spiritRegenMultiplier: Math.round(getSpiritRegenMultiplier(spirit) * 1e3) / 1e3,
    critChancePct: tStats.critChancePct, hastePct: tStats.hastePct,
    bonusHealing: Math.round(100 * (Math.round((1 + totalHealingBonusPct / 100) * 1e3) / 1e3 - 1)),
    uniqueStatLabel: UNIQUE_STAT_LABELS[cls], uniqueStatRating: Math.round(getUniqueStatRating(cls, level, talents) * 10) / 10,
    uniqueStatDescription: UNIQUE_STAT_DESCRIPTIONS[cls],
    passiveTraitName: classJson?.passiveTraitName ?? "",
    passiveTraitDescription: classJson?.passiveTraitDescription ?? "",
    passiveTraitIcon: classJson?.passiveTraitIcon ?? "wow/spell_holy_sealofwisdom"
  };
}
function getPrerequisiteIds(allTalents, talent) {
  const byId = new Map(allTalents.map((t) => [t.id, t]));
  const out = [];
  const seen = new Set();
  const stack = [...talent.prerequisites ?? []];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const p = byId.get(id);
    if (p?.prerequisites) for (const x of p.prerequisites) stack.push(x);
  }
  return out;
}
function getUnmetPrerequisites(allTalents, talent) {
  const byId = new Map(allTalents.map((t) => [t.id, t]));
  return getPrerequisiteIds(allTalents, talent).map((id) => byId.get(id)).filter((t) => !!t && t.points === 0);
}
function arePrereqsSatisfied(allTalents, talent) {
  return getUnmetPrerequisites(allTalents, talent).length === 0;
}
export {
  CAPSTONE_PLAYER_BUFF_IDS,
  CLASS_PROGRESSION,
  CLASS_STAT_CURVE,
  HEALING_PCT_PER_SPIRIT,
  MANA_PER_INTELLECT,
  MANA_REGEN_MULT_PER_SPIRIT,
  RANK_COST_MULT,
  RANK_HEAL_MULT,
  UNIQUE_STAT_DESCRIPTIONS,
  UNIQUE_STAT_LABELS,
  arePrereqsSatisfied,
  getCapstone,
  getHealerMaxHealth,
  getHealingMultiplier,
  getMaxHealth,
  getMaxHealthForPool,
  getMaxMana,
  getNaturePerfectionBonus,
  getPortrait,
  getPotionUpgradeAtLevel,
  getPrerequisiteIds,
  getPrimaryStats,
  getRankCostMult,
  getRankHealMult,
  getSpellOrder,
  getSpellRank,
  getSpellUpgradeAtLevel,
  getSpiritRegenMultiplier,
  getStarterSpells,
  getStatBreakdown,
  getTalentCritChancePct,
  getTalentGlow,
  getTalentHastePct,
  getTalentHealingBonusPct,
  getTalentMana,
  getTalentStats,
  getTalentWeight,
  getTutorialCopy,
  getUniqueStatRating,
  getUnmetPrerequisites,
  randomAllyLevel
};
