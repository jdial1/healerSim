export function healEffectiveAndOverheal(
  healthBefore: number,
  maxHealth: number,
  rawHeal: number,
): { eff: number; oh: number } {
  if (healthBefore <= 0 || rawHeal <= 0) return { eff: 0, oh: 0 };
  const room = Math.max(0, maxHealth - healthBefore);
  const eff = Math.min(room, rawHeal);
  return { eff, oh: Math.max(0, rawHeal - eff) };
}
