import { AnimatePresence, motion } from 'motion/react';
import { ALL_CLASSES, type ClassType, type IconGlow, type StatusEffect } from '../types';
import consumables from '../data/world/consumables.json' with { type: 'json' };
import { SPELLS } from '../data/index';
import theme from '../assets/theme.json' with { type: 'json' };
import druidConfig from '../data/classes/druid_config.json' with { type: 'json' };
import priestConfig from '../data/classes/priest_config.json' with { type: 'json' };
import paladinConfig from '../data/classes/paladin_config.json' with { type: 'json' };

const CONFIGS: Record<ClassType, any> = {
  DRUID: druidConfig,
  PRIEST: priestConfig,
  PALADIN: paladinConfig,
};

function getClassConfig(cls: ClassType) {
  return CONFIGS[cls];
}

export type ClassTheme = {
  ribbon: string;
  iconFrame: string;
  tapShadow: string;
};

const THEMES: Record<ClassType, ClassTheme> = {
  PRIEST: {
    ribbon: 'border-l-4 border-l-amber-400/80',
    iconFrame: 'border-amber-400/55',
    tapShadow: '0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(251, 191, 36, 0.22)',
  },
  DRUID: {
    ribbon: 'border-l-emerald-400/75',
    iconFrame: 'border-emerald-400/50',
    tapShadow: '0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(52, 211, 153, 0.2)',
  },
  PALADIN: {
    ribbon: 'border-l-4 border-l-fuchsia-400/75',
    iconFrame: 'border-fuchsia-400/50',
    tapShadow: '0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(232, 121, 249, 0.2)',
  },
};

export function getTheme(cls: ClassType): ClassTheme {
  return THEMES[cls];
}

// ========== Icon Helpers ==========

const WOW_ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/large';
const GAME_ICONS_BASE = 'https://game-icons.net/icons';
const LOCAL_ICON_BASE = `${(import.meta as any).env?.BASE_URL || '/'}icons`;

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

export function getIconUrlCandidates(iconPath: string): readonly string[] {
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

function classIconFile(cls: ClassType): string {
  return getClassConfig(cls)?.portraitIcon?.split('/').pop()?.replace('.svg', '') ?? 'default';
}

export function getIconUrlForClass(cls: ClassType): string {
  const iconFile = classIconFile(cls);
  return `${((import.meta as any).env?.BASE_URL) || '/'}icons/class-icons/${iconFile}.png`;
}

export function getBorderClass(cls: ClassType): string {
  return getTheme(cls).iconFrame;
}

export function getTransformClass(cls: ClassType): string {
  return getClassConfig(cls)?.uiTransform ?? '';
}

export function getWrapperTransformClass(): string {
  return '-rotate-3 transform';
}

// ========== Spell/Aura Glow Helpers ==========

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

// ========== UI Row Data ==========

export type ClassUiRow = {
  id: ClassType;
  name: string;
  description: string;
  iconKey: string;
  iconPath: string;
  color: string;
  textColor: string;
  hoverBorderClass: string;
  jsonLocked: boolean;
  portraitUrl: string;
  portraitIcon: string;
  portraitGlow: string;
  passiveTraitName: string;
  passiveTraitDescription: string;
  passiveTraitIcon: string;
  theme: ClassTheme;
};

export function classUiRows(): ClassUiRow[] {
  return ALL_CLASSES.map((cls) => {
    const config = getClassConfig(cls);
    return {
      id: cls,
      name: config?.name ?? cls,
      description: config?.description ?? '',
      iconKey: config?.iconKey ?? '',
      iconPath: config?.portraitIcon ?? '',
      color: config?.color ?? '',
      textColor: config?.textColor ?? '',
      hoverBorderClass: config?.hoverBorderClass ?? '',
      jsonLocked: config?.locked ?? false,
      portraitUrl: config?.portraitUrl ?? '',
      portraitIcon: config?.portraitIcon ?? '',
      portraitGlow: config?.portraitGlow ?? 'spell',
      passiveTraitName: config?.passiveTraitName ?? '',
      passiveTraitDescription: config?.passiveTraitDescription ?? '',
      passiveTraitIcon: config?.passiveTraitIcon ?? 'wow/spell_holy_sealofwisdom',
      theme: getTheme(cls),
    };
  });
}

export function classDisplayName(cls: ClassType): string {
  return getClassConfig(cls)?.name ?? cls;
}

export function getUiRow(cls: ClassType): ClassUiRow {
  const row = classUiRows().find((x) => x.id === cls);
  if (!row) throw new Error(`Unknown class ${cls}`);
  return row;
}

// ========== Potion Helpers ==========

type ManaPotionTier = (typeof consumables.mana_potion.tiers)[number];

function tierAtLevel(level: number): ManaPotionTier {
  for (const t of consumables.mana_potion.tiers) {
    if (level <= t.maxLevel) return t;
  }
  return consumables.mana_potion.tiers[consumables.mana_potion.tiers.length - 1]!;
}

export function manaPotionIconPath(level: number): string {
  return tierAtLevel(level).icon;
}

export function manaPotionDisplayName(level: number): string {
  const t = tierAtLevel(level);
  if (t.label === null) return 'Mana Potion';
  return `${t.label} Mana Potion`;
}

export function manaPotionInstantMana(level: number): number {
  return tierAtLevel(level).instant;
}

export function manaPotionOverTimeTotal(level: number): number {
  return manaPotionInstantMana(level) * 0.5;
}

// ========= GameIcon Component =========

type GameIconSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'dungeonCard'
  | 'dungeonRoster'
  | 'portrait'
  | 'hero'
  | 'heroTall';

const frameSize: Record<GameIconSize, string> = {
  xs: 'h-6 w-6 min-h-6 min-w-6 p-0.5',
  sm: 'h-9 w-9 min-h-9 min-w-9 p-1',
  md: 'h-11 w-11 min-h-11 min-w-11 p-1',
  lg: 'h-[2.75rem] w-[2.75rem] min-h-[2.75rem] min-w-[2.75rem] p-1',
  dungeonCard:
    'h-14 w-14 min-h-14 min-w-14 p-1.5 sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10 sm:p-1',
  dungeonRoster:
    'h-10 w-10 min-h-10 min-w-10 p-1 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8 sm:p-1',
  portrait:
    'h-28 w-28 min-h-28 min-w-28 p-2 sm:h-36 sm:w-36 sm:min-h-36 sm:min-w-36 sm:p-2',
  hero: 'h-40 w-40 min-h-40 min-w-40 p-3 sm:h-48 sm:w-48 sm:min-h-48 sm:min-w-48 sm:p-3.5',
  heroTall: 'h-full w-full min-h-0 flex-col p-3 sm:p-3.5',
};

export function GameIcon({
  iconPath,
  glow,
  size = 'md',
  className = '',
  title,
  dimmed = false,
  imageFit = 'contain',
}: {
  iconPath: string;
  glow?: IconGlow;
  size?: GameIconSize;
  className?: string;
  title?: string;
  dimmed?: boolean;
  imageFit?: string;
}) {
  const candidates = getIconUrlCandidates(iconPath);
  const frameCls = frameSize[size] ?? frameSize['md'];
  const glowCls = glow ? GLOW_BOX[glow] : '';
  const opacityCls = dimmed ? 'opacity-60' : '';
  return (
    <div className={`relative flex items-center justify-center ${frameCls} ${glowCls} ${opacityCls} ${className}`}>
      {candidates.map((url, i) => (
        <img
          key={url}
          src={url}
          title={title}
          className={`absolute inset-0 h-full w-full object-${imageFit}`}
          style={i > 0 ? ICON_TINT : undefined}
          alt={title ?? ''}
        />
      ))}
    </div>
  );
}

// ========= TutorialOverlay Component =========

export type TutorialOverlayProps = {
  overlay: {
    open: boolean;
    targetId: string | null;
    message: string;
    showTapCatcher: boolean;
    showResumeButton?: boolean;
    tone?: 'benefit' | 'threat';
    resumeLabel?: string;
    ghostHand?: { fromId: string; toId: string };
  };
  onTapContinue?: () => void;
  highlightTalentIdForTree?: string | null;
};

export function TutorialOverlay({ overlay, onTapContinue, highlightTalentIdForTree }: TutorialOverlayProps) {
  if (!overlay.open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className={`relative z-10 rounded-lg bg-slate-900 p-6 text-white ${overlay.tone === 'threat' ? 'border-red-500' : 'border-emerald-500'}`}>
        <p>{overlay.message}</p>
        {overlay.showResumeButton && (
          <button onClick={onTapContinue} className="mt-4 ui-button ui-button-primary">
            {overlay.resumeLabel || 'Resume'}
          </button>
        )}
      </div>
    </div>
  );
}

// ========= DungeonQueueModal =========

export function DungeonQueueModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 rounded-lg bg-slate-900 p-6 text-white">
        <h2 className="text-xl font-bold mb-4">Select Dungeon</h2>
        <p>Dungeon queue modal - implementation needed</p>
        <button onClick={onClose} className="mt-4 ui-button ui-button-primary">Close</button>
      </div>
    </div>
  );
}

// ========= DungeonOutcomeModal =========

export type DungeonOutcome = {
  kind: 'success' | 'failure';
  dungeonName: string;
  xpGained?: number;
  levelUp?: boolean;
  levelAfter?: number;
  playerClass?: string;
  upgradedSpellIds?: string[];
  upgradedPotion?: boolean;
};

export function DungeonOutcomeModal({ outcome, onDismiss }: { outcome: DungeonOutcome; onDismiss: () => void }) {
  if (!outcome) return null;
  
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative z-10 rounded-lg bg-slate-900 p-6 text-white max-w-md"
        >
          <h2 className="text-2xl font-bold mb-4">
            {outcome.kind === 'success' ? 'Dungeon Complete!' : 'Defeat'}
          </h2>
          <p className="mb-2">{outcome.dungeonName}</p>
          {outcome.xpGained && <p>XP Gained: {outcome.xpGained}</p>}
          {outcome.levelUp && <p className="text-emerald-400">Level Up! Now level {outcome.levelAfter}</p>}
          <button onClick={onDismiss} className="mt-4 ui-button ui-button-primary">Continue</button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ========= PlayerStatsModal =========

export function PlayerStatsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 rounded-lg bg-slate-900 p-6 text-white max-w-lg">
        <h2 className="text-xl font-bold mb-4">Player Stats</h2>
        <p>Stats modal - implementation needed</p>
        <button onClick={onClose} className="mt-4 ui-button ui-button-primary">Close</button>
      </div>
    </div>
  );
}

// ========= NavPrimerModal =========

export function NavPrimerModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div className="relative z-10 rounded-lg bg-slate-900 p-6 text-white max-w-md">
        <h2 className="text-xl font-bold mb-4">Navigation Primer</h2>
        <p>Learn the game controls...</p>
        <button onClick={onDismiss} className="mt-4 ui-button ui-button-primary">Got it</button>
      </div>
    </div>
  );
}

export { PlayerStatsModal as StatsModal };
