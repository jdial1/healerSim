import aurasData from "./data/auras.json" with { type: "json" };
const raw = aurasData;
const GRACE_PARTY_AURA = raw.partyUnitBuffs.priest_grace;
const GRACE_SOURCE_ID = GRACE_PARTY_AURA.sourceSpellId;
function getAuraTicks(buffId) {
  const n = raw.playerCombatAuras[buffId]?.defaultDurationTicks;
  if (typeof n !== "number" || n <= 0) {
    throw new Error(`Unknown player combat aura: ${buffId}`);
  }
  return n;
}
export {
  GRACE_PARTY_AURA,
  GRACE_SOURCE_ID,
  getAuraTicks
};
