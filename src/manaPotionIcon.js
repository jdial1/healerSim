import consumables from "./data/consumables.json" with { type: "json" };
function tierAtLevel(level) {
  for (const t of consumables.mana_potion.tiers) {
    if (level <= t.maxLevel) return t;
  }
  return consumables.mana_potion.tiers[consumables.mana_potion.tiers.length - 1];
}
function manaPotionIconPath(level) {
  return tierAtLevel(level).icon;
}
function manaPotionDisplayName(level) {
  const t = tierAtLevel(level);
  if (t.label === null) return "Mana Potion";
  return `${t.label} Mana Potion`;
}
function manaPotionInstantMana(level) {
  return tierAtLevel(level).instant;
}
function manaPotionOverTimeTotal(level) {
  return manaPotionInstantMana(level) * 0.5;
}
export {
  manaPotionDisplayName,
  manaPotionIconPath,
  manaPotionInstantMana,
  manaPotionOverTimeTotal
};
