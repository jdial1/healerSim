import consumables from './data/consumables.json';

type ManaPotionTier = (typeof consumables.mana_potion.tiers)[number];

function tierAtLevel(level: number): ManaPotionTier {
  for (const t of consumables.mana_potion.tiers) {
    if (level <= t.maxLevel) return t;
  }
  return consumables.mana_potion.tiers[consumables.mana_potion.tiers.length - 1]!;
}

export function manaPotionIconPath(level: number): string {
  return tierAtLevel(level).icon;
}

export function manaPotionDisplayName(level: number): string {
  const t = tierAtLevel(level);
  if (t.label === null) return 'Mana Potion';
  return `${t.label} Mana Potion`;
}

export function manaPotionInstantMana(level: number): number {
  return tierAtLevel(level).instant;
}

export function manaPotionOverTimeTotal(level: number): number {
  return manaPotionInstantMana(level) * 0.5;
}
