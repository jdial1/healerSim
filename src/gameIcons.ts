/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type IconGlow = 'spell' | 'nature' | 'debuff';

const GAME_ICONS_REPO =
  'https://raw.githubusercontent.com/game-icons/icons/master';

export function gameIconUrl(iconPath: string): string {
  return `${GAME_ICONS_REPO}/${iconPath}.svg`;
}

export const SPELL_GLOW: Record<string, IconGlow> = {
  flash_heal: 'spell',
  greater_heal: 'spell',
  renew: 'nature',
  rejuvenation: 'nature',
  regrowth: 'nature',
  wild_growth: 'spell',
  mana_potion: 'spell',
};

export function glowForSpellId(spellId: string | undefined): IconGlow {
  if (!spellId) return 'nature';
  return SPELL_GLOW[spellId] ?? 'spell';
}

export function glowForBossAbilityId(_abilityId: string | undefined): IconGlow {
  return 'debuff';
}

export function glowForBossSelfBuff(_abilityId: string | undefined): IconGlow {
  return 'spell';
}

export const GLOW_BOX: Record<IconGlow, string> = {
  spell: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 0 14px rgba(59,130,246,0.5)',
  nature: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 0 14px rgba(34,197,94,0.48)',
  debuff: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 0 14px rgba(239,68,68,0.52)',
};
