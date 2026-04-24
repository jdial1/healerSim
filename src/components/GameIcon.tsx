/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { gameIconUrl, GLOW_BOX, type IconGlow } from '../gameIcons.ts';

type GameIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'dungeonCard' | 'dungeonRoster';

const frameSize: Record<GameIconSize, string> = {
  xs: 'h-6 w-6 min-h-6 min-w-6 p-0.5',
  sm: 'h-9 w-9 min-h-9 min-w-9 p-1',
  md: 'h-11 w-11 min-h-11 min-w-11 p-1',
  lg: 'h-[2.75rem] w-[2.75rem] min-h-[2.75rem] min-w-[2.75rem] p-1',
  dungeonCard:
    'h-14 w-14 min-h-14 min-w-14 p-1.5 sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10 sm:p-1',
  dungeonRoster:
    'h-10 w-10 min-h-10 min-w-10 p-1 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8 sm:p-1',
};

export function GameIcon({
  iconPath,
  glow,
  size = 'md',
  className = '',
  title,
  dimmed = false,
}: {
  iconPath: string;
  glow: IconGlow;
  size?: GameIconSize;
  className?: string;
  title?: string;
  dimmed?: boolean;
}) {
  return (
    <div
      title={title}
      className={`box-border shrink-0 rounded-md bg-[#212121] ${frameSize[size]} ${dimmed ? 'opacity-45 grayscale' : ''} ${className}`}
      style={{ boxShadow: GLOW_BOX[glow] }}
    >
      <img
        src={gameIconUrl(iconPath)}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain mix-blend-screen opacity-95 [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.88))_drop-shadow(0_1px_1px_rgba(0,0,0,0.55))]"
      />
    </div>
  );
}
