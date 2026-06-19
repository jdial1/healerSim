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
export {
  applyHealToUnit,
  getHealSplit
};
