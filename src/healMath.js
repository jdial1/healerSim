function getHealSplit(healthBefore, maxHealth, rawHeal) {
  if (healthBefore <= 0 || rawHeal <= 0) return { eff: 0, oh: 0 };
  const room = Math.max(0, maxHealth - healthBefore);
  const eff = Math.min(room, rawHeal);
  return { eff, oh: Math.max(0, rawHeal - eff) };
}
function applyHealToUnit(unit, rawHeal) {
  const { eff, oh } = getHealSplit(unit.health, unit.maxHealth, rawHeal);
  return {
    health: Math.min(unit.maxHealth, unit.health + rawHeal),
    eff,
    oh
  };
}
/**
 * Healing already committed to a unit by its active heal-over-time effects.
 *
 * There are no cast times in this game, so nothing is ever in flight and classic
 * incoming-heal prediction has nothing to predict. What a healer can still be
 * told is how much healing is already on the way, which is what stops you
 * stacking a second HoT onto a target that is about to cap.
 *
 * `remainingTicks` counts heal ticks rather than seconds, so haste does not
 * enter into it. Class hooks can scale an individual tick at execution time, so
 * this is an estimate and can read low — the same estimate the Android app makes
 * in committedHealing() in CombatScreen.kt.
 *
 * Shields are excluded deliberately: they expire rather than heal, and they have
 * their own indicator.
 */
function committedHealing(unit) {
  return (unit.buffs ?? []).reduce(
    (sum, b) => sum + (b.healingPerTick ?? 0) * (b.remainingTicks ?? 0) + (b.bloomBurstHeal ?? 0),
    0
  );
}
export {
  applyHealToUnit,
  committedHealing,
  getHealSplit
};
