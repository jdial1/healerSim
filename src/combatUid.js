const UID_RANDOM_RANGE = 4294967296;
function generateCombatUid(prefix, now, random) {
  const n = Math.floor(random() * UID_RANDOM_RANGE);
  return `${prefix}-${now}-${n.toString(36)}`;
}
export {
  generateCombatUid
};
