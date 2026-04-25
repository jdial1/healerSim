/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SPELLS } from './constants.ts';
import type { IconGlow } from './types.ts';
import theme from './data/theme.json';

export type { IconGlow };

const GAME_ICON_BASES = [
  'https://cdn.jsdelivr.net/gh/game-icons/icons@master',
  'https://cdn.statically.io/gh/game-icons/icons/master',
  'https://raw.githubusercontent.com/game-icons/icons/master',
] as const;

export function gameIconUrl(iconPath: string): string {
  return `${GAME_ICON_BASES[0]}/${iconPath}.svg`;
}

export function gameIconUrlCandidates(iconPath: string): readonly string[] {
  const suffix = `/${iconPath}.svg`;
  return GAME_ICON_BASES.map((base) => `${base}${suffix}`);
}

export function glowForSpellId(spellId: string | undefined): IconGlow {
  if (!spellId) return 'nature';
  const g = SPELLS[spellId]?.glowType;
  if (g === 'nature' || g === 'debuff' || g === 'spell') return g;
  return 'spell';
}

export function glowForBossAbilityId(_abilityId: string | undefined): IconGlow {
  return 'debuff';
}

export function glowForBossSelfBuff(_abilityId: string | undefined): IconGlow {
  return 'spell';
}

const glowCfg = theme.iconGlow;

export const GLOW_BOX: Record<IconGlow, string> = {
  spell: glowCfg.boxShadow.spell,
  nature: glowCfg.boxShadow.nature,
  debuff: glowCfg.boxShadow.debuff,
};

export const ICON_TINT: Record<IconGlow, string> = {
  spell: glowCfg.tint.spell,
  nature: glowCfg.tint.nature,
  debuff: glowCfg.tint.debuff,
};

export const BOSS_BUFF_ICON_TINT = glowCfg.bossBuffTint;
