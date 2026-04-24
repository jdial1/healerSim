/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType } from './types.ts';

export type IconGlow = 'spell' | 'nature' | 'debuff';

export const CLASS_PORTRAIT_ICON: Record<ClassType, string> = {
  [ClassType.PRIEST]: 'lorc/angel-outfit',
  [ClassType.DRUID]: 'lorc/oak-leaf',
  [ClassType.PALADIN]: 'lorc/winged-shield',
};

export const CLASS_PORTRAIT_GLOW: Record<ClassType, IconGlow> = {
  [ClassType.PRIEST]: 'spell',
  [ClassType.DRUID]: 'nature',
  [ClassType.PALADIN]: 'spell',
};

const GAME_ICONS_REPO =
  'https://cdn.jsdelivr.net/gh/game-icons/icons@master';

export function gameIconUrl(iconPath: string): string {
  return `${GAME_ICONS_REPO}/${iconPath}.svg`;
}

export const SPELL_GLOW: Record<string, IconGlow> = {
  flash_heal: 'spell',
  greater_heal: 'spell',
  renew: 'spell',
  rejuvenation: 'nature',
  regrowth: 'nature',
  wild_growth: 'nature',
  swiftmend: 'nature',
  wand: 'spell',
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

export const ICON_TINT: Record<IconGlow, string> = {
  spell: 'rgba(96,165,250,0.52)',
  nature: 'rgba(74,222,128,0.5)',
  debuff: 'rgba(248,113,113,0.52)',
};

export const BOSS_BUFF_ICON_TINT = 'rgba(252,211,77,0.48)';
