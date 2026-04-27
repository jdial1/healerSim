import { Buff, Unit } from './types.ts';
import { SPELLS } from './constants.ts';
import { manaPotionDisplayName, manaPotionIconPath } from './manaPotionIcon.ts';

export function partyWithHealerManaRegenDisplayBuff(
  party: Unit[],
  manaRegenBuffTicksRemaining: number,
  playerLevel: number,
): Unit[] {
  if (manaRegenBuffTicksRemaining <= 0) return party;
  const source = SPELLS.mana_potion;
  const b: Buff = {
    id: '__display_mana_regen',
    name: `${manaPotionDisplayName(playerLevel)} — bonus regen`,
    remainingTicks: manaRegenBuffTicksRemaining,
    healingPerTick: 0,
    icon: manaPotionIconPath(playerLevel),
    sourceSpellId: source.id,
    isManaRegenBuff: true,
    durationTicksMax: manaRegenBuffTicksRemaining,
  };
  return party.map((u) =>
    u.role === 'HEALER' ? { ...u, buffs: [...u.buffs, b] } : u,
  );
}
