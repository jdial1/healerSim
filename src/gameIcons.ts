/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SPELLS } from './constants.ts';
import type { IconGlow } from './types.ts';
import theme from './data/theme.json';

export type { IconGlow };

const WOW_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/large';
const GAME_ICONS_BASE = 'https://game-icons.net/icons';
const LOCAL_ICON_BASE = `${import.meta.env.BASE_URL}icons`;

const WOW_ICON_EXTS = ['jpg', 'png'] as const;
const GAME_ICON_CANDIDATE_PATHS = ['ffffff/transparent', 'ffffff/000000'] as const;
const FALLBACK_WOW_ICON = 'inv_misc_questionmark';

export const LOCKED_DUNGEON_ICON = 'lorc/padlock';

type IconSource =
  | { kind: 'wow'; icon: string }
  | { kind: 'game-icons'; author: string; icon: string }
  | { kind: 'fallback' };

function parseIconSource(iconPath: string): IconSource {
  const normalized = iconPath.trim().toLowerCase();
  if (!normalized) return { kind: 'fallback' };
  if (normalized.startsWith('wow/')) {
    const icon = normalized.slice('wow/'.length);
    return icon ? { kind: 'wow', icon } : { kind: 'fallback' };
  }
  if (!normalized.includes('/')) return { kind: 'wow', icon: normalized };
  const [author, icon] = normalized.split('/', 2);
  if (!author || !icon) return { kind: 'fallback' };
  return { kind: 'game-icons', author, icon };
}

export function gameIconUrl(iconPath: string): string {
  return gameIconUrlCandidates(iconPath)[0];
}

export function gameIconUrlCandidates(iconPath: string): readonly string[] {
  const source = parseIconSource(iconPath);
  if (source.kind === 'wow') {
    const local = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${source.icon}.${ext}`);
    const remote = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${source.icon}.${ext}`);
    return [...local, ...remote];
  }
  if (source.kind === 'game-icons') {
    const local = [`${LOCAL_ICON_BASE}/game-icons/${source.author}/${source.icon}.png`];
    const remote = GAME_ICON_CANDIDATE_PATHS.map(
      (palette) => `${GAME_ICONS_BASE}/${palette}/1x1/${source.author}/${source.icon}.png`,
    );
    return [...local, ...remote];
  }
  const local = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${FALLBACK_WOW_ICON}.${ext}`);
  const remote = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${FALLBACK_WOW_ICON}.${ext}`);
  return [...local, ...remote];
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
