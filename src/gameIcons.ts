/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SPELLS } from './constants.ts';
import type { IconGlow } from './types.ts';
import theme from './data/theme.json';

export type { IconGlow };

const WOW_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/large';

const WOW_ICON_EXTS = ['jpg', 'png'] as const;

export const LOCKED_DUNGEON_WOW_ICON = 'wow/inv_misc_questionmark';

function toWowIconName(iconPath: string): string {
  const normalized = iconPath.trim().toLowerCase();
  if (!normalized) return 'spell_holy_heal';
  if (normalized.startsWith('wow/')) return normalized.slice('wow/'.length);
  if (!normalized.includes('/')) return normalized;
  return 'spell_holy_heal';
}

export function gameIconUrl(iconPath: string): string {
  const wowIcon = toWowIconName(iconPath);
  return `${WOW_ICON_BASE}/${wowIcon}.${WOW_ICON_EXTS[0]}`;
}

export function gameIconUrlCandidates(iconPath: string): readonly string[] {
  const wowIcon = toWowIconName(iconPath);
  return WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${wowIcon}.${ext}`);
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
