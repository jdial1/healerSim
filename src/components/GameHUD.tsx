/**

 * @license

 * SPDX-License-Identifier: Apache-2.0

 */



import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { motion } from 'motion/react';


import type { BossSelfBuff } from '../types.ts';

import { GameIcon } from './GameIcon.tsx';

import { BOSS_BUFF_ICON_TINT, glowForBossSelfBuff } from '../gameIcons.ts';
import { TRASH_PACK_COUNT, endlessCycleMultiplier } from '../constants.ts';

const TRASH_PACKS = TRASH_PACK_COUNT;

function fmtBossBuffNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function bossSelfBuffTooltipText(b: BossSelfBuff): string {
  const pct = Math.round((b.partyDamageMultiplier - 1) * 100);
  const sec = b.remainingTicks / 10;
  return [`+${pct}% damage taken by the party.`, `${fmtBossBuffNumber(sec)} sec remaining.`].join('\n');
}

interface GameHUDProps {

  combatPhase: 'TRASH' | 'BOSS';

  trashPullsRemaining: number;

  enemyHealth: number;

  enemyMaxHealth: number;

  bossName?: string;

  trashEnemyName: string;

  bossSelfBuffs?: BossSelfBuff[];

  endlessStacks?: number;

}



function TrashPackSkull({ defeated }: { defeated: boolean }) {

  return (

    <div className="relative flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10">
      <GameIcon
        iconPath="lorc/skull-crack"
        glow="debuff"
        size="xs"
        dimmed={defeated}
        className={defeated ? 'opacity-45 grayscale' : ''}
      />

      {defeated ? (

        <svg

          className="pointer-events-none absolute inset-0 z-10 text-red-500/90"

          viewBox="0 0 40 40"

          fill="none"

          aria-hidden

        >

          <path
            d="M9 9 L31 31 M31 9 L9 31"

            stroke="currentColor"

            strokeWidth="2.5"

            strokeLinecap="round"

          />

        </svg>

      ) : null}

    </div>

  );

}



function BossSkull({ bossActive }: { bossActive: boolean }) {

  return (

    <div className="relative flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10">
      <GameIcon
        iconPath="lorc/grim-reaper"
        glow="debuff"
        size="xs"
        dimmed={!bossActive}
        className={bossActive ? '' : 'opacity-45 grayscale'}
      />
    </div>

  );

}



export function GameHUD({

  combatPhase,

  trashPullsRemaining,

  enemyHealth,

  enemyMaxHealth,

  bossName,

  trashEnemyName,

  bossSelfBuffs = [],

  endlessStacks,

}: GameHUDProps) {
  const [bossBuffTip, setBossBuffTip] = useState<{
    buff: BossSelfBuff;
    x: number;
    y: number;
  } | null>(null);
  const [bossBuffTipShiftX, setBossBuffTipShiftX] = useState(0);
  const bossBuffTipRef = useRef<HTMLDivElement>(null);

  const enemyPercent = enemyMaxHealth > 0 ? (enemyHealth / enemyMaxHealth) * 100 : 0;

  const pullsCleared = TRASH_PACKS - trashPullsRemaining;

  const bossActive = combatPhase === 'BOSS';

  const enemyBarHeightClass = bossActive
    ? 'h-[3.6rem] sm:h-[4.75rem]'
    : 'h-[4.5rem] sm:h-[4.75rem]';

  const enemyBarFill = bossActive
    ? 'bg-gradient-to-r from-[#2b0f0f] via-[#4a1d1a] to-[#6a2c1e]'
    : 'bg-gradient-to-r from-[#1a1713] via-[#352019] to-[#5a3022]';

  const displayBossName = bossName || 'FINAL BOSS';

  const bossBarRowClass =
    bossActive && bossSelfBuffs.length > 0
      ? 'justify-between gap-2'
      : bossActive
        ? 'justify-end'
        : 'justify-between gap-3';

  useEffect(() => {
    if (!bossBuffTip) return;
    const close = () => setBossBuffTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [bossBuffTip]);

  useEffect(() => {
    if (!bossBuffTip) return;
    const close = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest('[data-boss-buff-hit]')) return;
      setBossBuffTip(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [bossBuffTip]);

  useLayoutEffect(() => {
    if (!bossBuffTip) {
      setBossBuffTipShiftX(0);
      return;
    }
    const tip = bossBuffTipRef.current;
    if (!tip) return;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    if (!vw) return;
    const margin = 12;
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > vw - margin) dx += vw - margin - rect.right;
    if (rect.left + dx < margin) dx += margin - (rect.left + dx);
    setBossBuffTipShiftX(dx);
  }, [bossBuffTip]);

  return (
    <>
    <div className="ui-frame-divider-bottom fixed top-0 left-0 right-0 z-40 bg-slate-950/90 shadow-xl backdrop-blur-md">

      <div className="flex flex-col gap-2 px-3 pb-3 pt-3 sm:gap-2.5 sm:px-4 sm:pb-3.5 sm:pt-4">

        <div className="mx-auto w-full max-w-6xl">

          {bossActive ? (

            <div className="flex w-full flex-col items-center gap-2 sm:gap-2.5">

              <span className="shrink-0 rounded-sm bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white sm:text-[9px]">

                BOSS

              </span>

              <h1 className="ui-heading w-full max-w-full text-balance text-center text-2xl leading-[1.05] tracking-[0.06em] text-white sm:text-3xl md:text-4xl lg:text-5xl">

                {displayBossName}

              </h1>

            </div>

          ) : (

            <div className="flex flex-wrap items-center gap-2">

              <span className="shrink-0 rounded-sm bg-slate-800 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white sm:text-[8px]">
                BATTLE PROGRESS
              </span>
              <span className="text-xs font-black uppercase tracking-tight text-slate-300 sm:text-[10px]">
                {trashPullsRemaining} pack{trashPullsRemaining === 1 ? '' : 's'} left
              </span>

            </div>

          )}

          {endlessStacks !== undefined ? (

            <div className="mt-1.5 flex justify-center sm:mt-2">

              <span className="ui-frame rounded bg-fuchsia-950/45 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-200 sm:text-[9px]">

                Endless ×{endlessCycleMultiplier(endlessStacks).toFixed(2)}

              </span>

            </div>

          ) : null}

        </div>



        <div className="ui-frame-divider-top mx-auto flex w-full max-w-6xl items-center justify-evenly pt-2 sm:pt-2.5">

          {Array.from({ length: TRASH_PACKS }, (_, i) => (

            <Fragment key={i}>

              <TrashPackSkull defeated={pullsCleared > i} />

            </Fragment>

          ))}

          <BossSkull bossActive={bossActive} />

        </div>



        <div className="mx-auto w-full max-w-6xl">

          <div className={`ui-frame relative ${enemyBarHeightClass} w-full overflow-hidden rounded-md bg-slate-900 shadow-inner`}>

            <motion.div

              className={`absolute inset-y-0 left-0 rounded-none ${enemyBarFill}`}

              initial={false}

              animate={{ width: `${enemyPercent}%` }}

              transition={{ type: 'tween', duration: 0.2 }}

            />

            <div

              className={`relative z-10 flex h-full items-center px-3 sm:px-4 ${bossBarRowClass}`}

            >

              {bossActive && bossSelfBuffs.length > 0 ? (

                <div className="flex min-w-0 shrink items-center gap-1 sm:gap-1.5">

                  {bossSelfBuffs.map((b) => {

                    const secondsLeft = Math.ceil(b.remainingTicks / 10);

                    const showCountdown = b.remainingTicks < 50;

                    return (

                      <button
                        key={b.id}
                        type="button"
                        data-boss-buff-hit
                        className="ui-state-frame ui-state-hover relative touch-manipulation rounded-md sm:p-0.5"
                        aria-label={`${b.name}, show details`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setBossBuffTip((prev) =>
                            prev?.buff.id === b.id
                              ? null
                              : { buff: b, x: r.left + r.width / 2, y: r.bottom },
                          );
                        }}
                      >

                        <GameIcon

                          iconPath={b.icon}

                          glow={glowForBossSelfBuff(b.sourceAbilityId)}

                          size="xs"

                          accentTint={BOSS_BUFF_ICON_TINT}

                        />

                        {showCountdown ? (

                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/90 px-0.5 text-[10px] font-black text-amber-300 sm:text-[7px]">

                            {secondsLeft}

                          </div>

                        ) : null}

                      </button>

                    );

                  })}

                </div>

              ) : null}

              {!bossActive ? (
                <span className="min-w-0 text-sm font-semibold uppercase tracking-[0.08em] text-slate-100 sm:text-base">
                  TARGET: {trashEnemyName}
                </span>
              ) : null}

              <span className="shrink-0 font-mono text-lg font-black tabular-nums text-white sm:text-xl">

                {Math.max(0, Math.floor(enemyHealth))}

                <span className="ml-0.5 text-base font-normal text-slate-400 opacity-90 sm:text-lg">

                  / {Math.floor(enemyMaxHealth)}

                </span>

              </span>

            </div>

          </div>

        </div>

      </div>

    </div>

      {bossBuffTip
        ? createPortal(
            <div
              ref={bossBuffTipRef}
              className="ui-debuff-tooltip-wrap pointer-events-none relative"
              style={{
                position: 'fixed',
                left: bossBuffTip.x,
                top: bossBuffTip.y,
                transform: `translate(calc(-50% + ${bossBuffTipShiftX}px), 10px)`,
                zIndex: 400,
              }}
            >
              <div className="ui-spell-tooltip-arrow-up" aria-hidden />
              <GameIcon
                iconPath={bossBuffTip.buff.icon}
                glow={glowForBossSelfBuff(bossBuffTip.buff.sourceAbilityId)}
                size="md"
                className="ui-spell-tooltip-icon"
                accentTint={BOSS_BUFF_ICON_TINT}
              />
              <div className="ui-spell-tooltip-body">
                <div className="ui-spell-tooltip-title">
                  <span className="ui-spell-tooltip-title-text">{bossBuffTip.buff.name}</span>
                </div>
                <div className="ui-spell-tooltip-desc mt-1.5 text-amber-100/95">
                  {bossSelfBuffTooltipText(bossBuffTip.buff)}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );

}


