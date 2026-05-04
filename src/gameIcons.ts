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

export function getIconUrl(iconPath: string): string {
  return getIconUrlCandidates(iconPath)[0];
}

const iconUrlCache = new Map<string, readonly string[]>();

export function getIconUrlCandidates(iconPath: string): readonly string[] {
  const cached = iconUrlCache.get(iconPath);
  if (cached) return cached;

  const source = parseIconSource(iconPath);
  let result: readonly string[];

  if (source.kind === 'wow') {
    const local = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${source.icon}.${ext}`);
    const remote = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${source.icon}.${ext}`);
    result = [...local, ...remote];
  } else if (source.kind === 'game-icons') {
    const local = [`${LOCAL_ICON_BASE}/game-icons/${source.author}/${source.icon}.png`];
    const remote = GAME_ICON_CANDIDATE_PATHS.map(
      (palette) => `${GAME_ICONS_BASE}/${palette}/1x1/${source.author}/${source.icon}.png`,
    );
    result = [...local, ...remote];
  } else {
    const local = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${FALLBACK_WOW_ICON}.${ext}`);
    const remote = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${FALLBACK_WOW_ICON}.${ext}`);
    result = [...local, ...remote];
  }

  iconUrlCache.set(iconPath, result);
  return result;
}

export function getSpellGlow(spellId: string | undefined): IconGlow {
  if (!spellId) return 'nature';
  const g = SPELLS[spellId]?.glowType;
  if (g === 'nature' || g === 'debuff' || g === 'spell') return g;
  return 'spell';
}

export function getAbilityGlow(_abilityId: string | undefined): IconGlow {
  return 'debuff';
}

export function getSelfBuffGlow(_abilityId: string | undefined): IconGlow {
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
