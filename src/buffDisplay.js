import { SPELLS } from "./constants.js";
import { manaPotionDisplayName, manaPotionIconPath } from "./manaPotionIcon.js";
function partyWithHealerManaRegenDisplayBuff(party, manaRegenBuffTicksRemaining, playerLevel) {
  if (manaRegenBuffTicksRemaining <= 0) return party;
  const source = SPELLS.mana_potion;
  const b = {
    id: "__display_mana_regen",
    name: `${manaPotionDisplayName(playerLevel)} \u2014 bonus regen`,
    remainingTicks: manaRegenBuffTicksRemaining,
    healingPerTick: 0,
    icon: manaPotionIconPath(playerLevel),
    sourceSpellId: source.id,
    isManaRegenBuff: true,
    durationTicksMax: manaRegenBuffTicksRemaining
  };
  return party.map(
    (u) => u.role === "HEALER" ? { ...u, buffs: [...u.buffs, b] } : u
  );
}
export {
  partyWithHealerManaRegenDisplayBuff
};
