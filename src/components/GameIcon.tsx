import { memo, useEffect, useMemo, useState } from 'react';

import { gameIconUrlCandidates, GLOW_BOX, ICON_TINT, type IconGlow } from '../gameIcons.ts';

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
    'h-28 w-28 min-h-28 min-w-28 p-2 sm:h-36 sm:w-36 sm:min-h-36 sm:min-w-36 sm:p-2.5',
  hero: 'h-40 w-40 min-h-40 min-w-40 p-3 sm:h-48 sm:w-48 sm:min-h-48 sm:min-w-48 sm:p-3.5',
  heroTall: 'h-full w-full min-h-0 flex-col p-3 sm:p-3.5',
};

/**
 * GameIcon component renders a game icon with a glow effect.
 * Memoized to prevent unnecessary re-renders during the rapid game tick cycle.
 */
export const GameIcon = memo(function GameIcon({
  iconPath,
  glow,
  size = 'md',
  className = '',
  title,
  dimmed = false,
  accentTint,
  imageFit = 'contain',
}: {
  iconPath: string;
  glow: IconGlow;
  size?: GameIconSize;
  className?: string;
  title?: string;
  dimmed?: boolean;
  accentTint?: string;
  imageFit?: 'contain' | 'cover';
}) {
  const tint = accentTint ?? ICON_TINT[glow];
  const tall = size === 'heroTall';
  const candidates = useMemo(() => gameIconUrlCandidates(iconPath), [iconPath]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [iconPath]);

  const src = candidates[candidateIndex] ?? candidates[0];
  return (
    <div
      title={title}
      className={`${tall ? 'flex min-h-0 min-w-0 flex-1 shrink' : 'inline-flex shrink-0'} align-middle box-border rounded-md bg-[#212121] ${frameSize[size]} ${dimmed ? 'opacity-[0.48]' : ''} ${className}`}
      style={{ boxShadow: GLOW_BOX[glow] }}
    >
      <div className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden rounded-sm">
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => {
            setCandidateIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
          }}
          className={`pointer-events-none h-full w-full select-none object-center ${imageFit === 'cover' ? 'object-cover' : 'object-contain'} mix-blend-screen opacity-95 [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.88))_drop-shadow(0_1px_1px_rgba(0,0,0,0.55))]`}
        />
        <div
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{ backgroundColor: tint }}
          aria-hidden
        />
      </div>
    </div>
  );
});
