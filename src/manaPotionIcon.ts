const MANA_POTION_TIERS = [
  { maxLevel: 5, icon: 'wow/inv_potion_70', label: 'Minor' as const, instant: 40 },
  { maxLevel: 10, icon: 'wow/inv_potion_71', label: 'Lesser' as const, instant: 60 },
  { maxLevel: 15, icon: 'wow/inv_potion_72', label: null, instant: 90 },
  { maxLevel: 20, icon: 'wow/inv_potion_73', label: 'Greater' as const, instant: 135 },
  { maxLevel: 25, icon: 'wow/inv_potion_74', label: 'Superior' as const, instant: 202 },
] as const;

const MANA_POTION_TOP = {
  icon: 'wow/inv_potion_76',
  label: 'Major' as const,
  instant: 303,
} as const;

type ManaPotionTierRow = (typeof MANA_POTION_TIERS)[number];
type ManaPotionResolvedTier = ManaPotionTierRow | typeof MANA_POTION_TOP;

function tierAtLevel(level: number): ManaPotionResolvedTier {
  for (const t of MANA_POTION_TIERS) {
    if (level <= t.maxLevel) return t;
  }
  return MANA_POTION_TOP;
}

export function manaPotionIconPath(level: number): string {
  return tierAtLevel(level).icon;
}

export function manaPotionDisplayName(level: number): string {
  const t = tierAtLevel(level);
  if ('maxLevel' in t && t.label === null) return 'Mana Potion';
  return `${t.label} Mana Potion`;
}

export function manaPotionInstantMana(level: number): number {
  return tierAtLevel(level).instant;
}

export function manaPotionOverTimeTotal(level: number): number {
  return manaPotionInstantMana(level) * 0.5;
}
