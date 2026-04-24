/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { DUNGEONS, bossCombatProfileForDungeon, TICKS_PER_SECOND } from '../constants.ts';
import { type BossDebuffTargeting, type Dungeon } from '../types.ts';
import { computeDungeonXpGain, levelsOverDungeonMax } from '../gameStorage.ts';
import { Lock } from 'lucide-react';
import { GameIcon } from './GameIcon.tsx';
import { BOSS_BUFF_ICON_TINT } from '../gameIcons.ts';

interface DungeonSelectorProps {
  onSelect: (dungeon: Dungeon) => void;
  level: number;
  completedDungeonIds: string[];
}

const DRAG_THRESHOLD_PX = 10;

type DungeonCardId = (typeof DUNGEONS)[number]['id'];

type DungeonCardTheme = {
  borderLeft: string;
  viaTint: string;
  ring: string;
  cardShadow: string;
  borderHover: string;
  deploy: string;
  iconTint: string;
};

const DUNGEON_CARD_THEME = {
  deadmines: {
    borderLeft: 'border-l-amber-700',
    viaTint: 'via-amber-950/40',
    ring: 'ring-amber-900/30',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(180,83,9,0.32)]',
    borderHover: 'hover:border-amber-500',
    deploy: 'bg-amber-700 text-amber-50',
    iconTint: 'rgba(251,191,36,0.5)',
  },
  wailing_caverns: {
    borderLeft: 'border-l-teal-600',
    viaTint: 'via-teal-950/45',
    ring: 'ring-teal-800/25',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(13,148,136,0.32)]',
    borderHover: 'hover:border-teal-500',
    deploy: 'bg-teal-600 text-white',
    iconTint: 'rgba(45,212,191,0.48)',
  },
  scarlet_monastery: {
    borderLeft: 'border-l-rose-600',
    viaTint: 'via-rose-950/40',
    ring: 'ring-rose-900/30',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(225,29,72,0.28)]',
    borderHover: 'hover:border-rose-500',
    deploy: 'bg-rose-700 text-rose-50',
    iconTint: 'rgba(251,113,133,0.5)',
  },
  zul_farrak: {
    borderLeft: 'border-l-yellow-500',
    viaTint: 'via-yellow-950/35',
    ring: 'ring-yellow-900/25',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(202,138,4,0.32)]',
    borderHover: 'hover:border-yellow-400',
    deploy: 'bg-amber-600 text-amber-50',
    iconTint: 'rgba(250,204,21,0.48)',
  },
  sunken_temple: {
    borderLeft: 'border-l-emerald-600',
    viaTint: 'via-emerald-950/40',
    ring: 'ring-emerald-900/25',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(5,150,105,0.32)]',
    borderHover: 'hover:border-emerald-500',
    deploy: 'bg-emerald-700 text-emerald-50',
    iconTint: 'rgba(52,211,153,0.5)',
  },
  blackrock_depths: {
    borderLeft: 'border-l-orange-600',
    viaTint: 'via-orange-950/45',
    ring: 'ring-orange-950/30',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(234,88,12,0.35)]',
    borderHover: 'enabled:hover:border-orange-500',
    deploy: 'bg-orange-700 text-orange-50',
    iconTint: 'rgba(251,146,60,0.52)',
  },
  stratholme: {
    borderLeft: 'border-l-violet-600',
    viaTint: 'via-violet-950/38',
    ring: 'ring-violet-900/25',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(124,58,237,0.28)]',
    borderHover: 'hover:border-violet-500',
    deploy: 'bg-violet-800 text-violet-50',
    iconTint: 'rgba(167,139,250,0.48)',
  },
  scholomance: {
    borderLeft: 'border-l-indigo-500',
    viaTint: 'via-indigo-950/45',
    ring: 'ring-indigo-900/30',
    cardShadow: 'shadow-[0_20px_50px_-12px_rgba(99,102,241,0.32)]',
    borderHover: 'hover:border-indigo-500',
    deploy: 'bg-indigo-700 text-indigo-50',
    iconTint: 'rgba(129,140,248,0.5)',
  },
} satisfies Record<DungeonCardId, DungeonCardTheme>;

const CARD_SHELL =
  'relative flex h-full min-h-0 w-[min(88vw,22rem)] shrink-0 snap-center flex-col rounded-xl border border-slate-800/90 bg-gradient-to-br from-slate-950 to-slate-900 px-5 py-8 text-left ring-1 ring-inset sm:w-[min(24rem,40vw)] sm:px-6 sm:py-10 max-sm:px-6 max-sm:py-9';

const LOCKED_ROSTER_ICON = 'badges/question';

function debuffTargetShort(t: BossDebuffTargeting): string {
  if (t === 'single_random') return '1 tgt';
  if (t === 'all_living') return 'All';
  return '2 tgt';
}

function durationSecLabel(durationTicks: number): string {
  return `${Math.round(durationTicks / TICKS_PER_SECOND)}s`;
}

function BossMechanicsStrip({
  dungeon,
  isLocked,
  dimmed,
}: {
  dungeon: Dungeon;
  isLocked: boolean;
  dimmed: boolean;
}) {
  const profile = bossCombatProfileForDungeon(dungeon);
  const cardTheme = DUNGEON_CARD_THEME[dungeon.id as DungeonCardId];

  const cardShell =
    'flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 rounded-md border bg-slate-900/75 px-2 py-2 sm:gap-1.5 sm:px-2 sm:py-2';

  if (isLocked) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-1.5 sm:gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`${cardShell} border-slate-800/90 opacity-[0.55]`}
            >
              <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 sm:text-[9px]">?</span>
              <GameIcon
                iconPath={LOCKED_ROSTER_ICON}
                glow="spell"
                size="md"
                dimmed
                accentTint={cardTheme.iconTint}
                className="mx-auto shrink-0"
              />
              <div className="flex min-h-0 flex-1 flex-col justify-center py-0.5">
                <p className="text-center text-xs font-bold uppercase leading-snug text-slate-400 sm:text-[11px]">
                  Hidden
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-1.5 sm:gap-2">
        {profile.debuffTemplates.map((d) => (
          <div
            key={d.abilityId}
            className={`${cardShell} border-rose-900/45`}
          >
            <span className="shrink-0 text-[10px] font-black uppercase tracking-tight text-rose-400 sm:text-[9px]">
              Debuff
            </span>
            <GameIcon
              iconPath={d.icon}
              glow="debuff"
              size="md"
              title={d.name}
              dimmed={dimmed}
              className="mx-auto shrink-0"
            />
            <div className="flex min-h-0 flex-1 flex-col justify-center py-0.5">
              <p className="line-clamp-3 break-words text-center text-xs font-bold uppercase leading-snug tracking-tight text-slate-100 sm:text-[11px]">
                {d.name}
              </p>
            </div>
            <div className="mt-auto min-h-0 shrink-0 space-y-1 text-center">
              <p className="break-words text-[11px] font-bold tabular-nums leading-snug text-slate-300 sm:text-[10px]">
                {d.damagePerTick}/t · {durationSecLabel(d.durationTicks)}
              </p>
              <p className="text-[10px] font-black uppercase tracking-tight text-slate-400 sm:text-[9px]">
                {debuffTargetShort(d.targeting)}
              </p>
            </div>
          </div>
        ))}
        {profile.selfBuffTemplates.map((b) => {
          const pct = Math.round((b.partyDamageMultiplier - 1) * 100);
          return (
            <div
              key={b.abilityId}
              className={`${cardShell} border-amber-800/40`}
            >
              <span className="shrink-0 text-[10px] font-black uppercase tracking-tight text-amber-300 sm:text-[9px]">
                Buff
              </span>
              <GameIcon
                iconPath={b.icon}
                glow="spell"
                size="md"
                title={b.name}
                dimmed={dimmed}
                accentTint={BOSS_BUFF_ICON_TINT}
                className="mx-auto shrink-0"
              />
              <div className="flex min-h-0 flex-1 flex-col justify-center py-0.5">
                <p className="line-clamp-3 break-words text-center text-xs font-bold uppercase leading-snug tracking-tight text-slate-100 sm:text-[11px]">
                  {b.name}
                </p>
              </div>
              <div className="mt-auto min-h-0 shrink-0 space-y-1 text-center">
                <p className="text-[11px] font-bold tabular-nums leading-snug text-amber-200 sm:text-[10px]">
                  +{pct}% dmg
                </p>
                <p className="text-[10px] font-black uppercase tracking-tight text-slate-400 sm:text-[9px]">
                  {durationSecLabel(b.durationTicks)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DungeonSelector({ onSelect, level, completedDungeonIds }: DungeonSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    dragging: false,
    startX: 0,
    startScroll: 0,
    pointerId: -1,
    suppressClick: false,
  });

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el || dragRef.current.active) return;

    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    const pointerId = e.pointerId;

    dragRef.current = {
      active: true,
      dragging: false,
      startX,
      startScroll,
      pointerId,
      suppressClick: false,
    };

    const onWindowMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const d = dragRef.current;
      if (!d.active) return;
      const dx = ev.clientX - startX;
      const scr = scrollRef.current;
      if (!scr) return;
      if (!d.dragging && Math.abs(dx) > DRAG_THRESHOLD_PX) {
        d.dragging = true;
        scr.setPointerCapture(pointerId);
      }
      if (d.dragging) {
        scr.scrollLeft = startScroll - dx;
      }
    };

    const onWindowUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const d = dragRef.current;
      const scr = scrollRef.current;
      if (d.dragging && scr) {
        try {
          scr.releasePointerCapture(pointerId);
        } catch {}
      }
      d.suppressClick = d.dragging;
      d.active = false;
      d.dragging = false;
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp, true);
      window.removeEventListener('pointercancel', onWindowUp, true);
    };

    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp, true);
    window.addEventListener('pointercancel', onWindowUp, true);
  }, []);

  const trySelect = useCallback(
    (dungeon: Dungeon, isLocked: boolean) => {
      if (dragRef.current.suppressClick) {
        dragRef.current.suppressClick = false;
        return;
      }
      if (!isLocked) onSelect(dungeon);
    },
    [onSelect],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-3 sm:px-8">
        <div>
          <h1 className="text-xl font-black uppercase italic leading-none tracking-tighter text-white sm:text-2xl">
            DUNGEON <span className="text-blue-500">FINDER</span>
          </h1>
        </div>
      </div>

      <div className="mt-16 min-h-0 flex-1 bg-gradient-to-b from-slate-950 to-slate-900/30" />

      <div
        className="fixed left-0 right-0 z-[45] flex min-h-0 flex-col border-t border-white/10 bg-slate-950/90 pb-3 pt-3 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
        style={{
          top: 'calc(4rem + env(safe-area-inset-top, 0px))',
          bottom: 'max(11rem, calc(10.25rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div
          ref={scrollRef}
          onPointerDown={handlePointerDown}
          className="flex min-h-0 flex-1 cursor-grab snap-x snap-mandatory flex-nowrap items-stretch gap-4 overflow-x-auto overflow-y-hidden px-4 py-2 select-none active:cursor-grabbing [scrollbar-width:thin] sm:gap-5 sm:px-6"
        >
          {DUNGEONS.map((dungeon) => {
            const isLocked = level < dungeon.levelMin;
            const isCompleted = completedDungeonIds.includes(dungeon.id);
            const showReducedXp = !isLocked && levelsOverDungeonMax(dungeon, level) > 0;
            const nominalClearXp = computeDungeonXpGain(dungeon, dungeon.levelMax);
            const clearXp = computeDungeonXpGain(dungeon, level);
            const theme = DUNGEON_CARD_THEME[dungeon.id as DungeonCardId];
            const bossCombat = bossCombatProfileForDungeon(dungeon);
            const showBossMechanicsRow =
              isLocked ||
              bossCombat.debuffTemplates.length + bossCombat.selfBuffTemplates.length > 0;

            return (
              <button
                key={dungeon.id}
                type="button"
                onClick={() => trySelect(dungeon, isLocked)}
                className={`
                  ${CARD_SHELL}
                  ${theme.borderLeft}
                  ${theme.viaTint}
                  ${theme.ring}
                  ${theme.cardShadow}
                  ${isLocked ? 'cursor-default opacity-[0.45]' : `${theme.borderHover} cursor-pointer`}
                `}
              >
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-2xl font-black uppercase italic leading-[1.05] tracking-tighter text-white sm:text-2xl">
                        {dungeon.name.replace(/^The /i, '')}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-xs font-black uppercase leading-snug sm:mt-0.5 sm:text-[11px]">
                        <span className="text-slate-500">Lv {dungeon.levelMin}–{dungeon.levelMax}</span>
                        {!isLocked ? (
                          <>
                            <span className="text-slate-700">•</span>
                            {showReducedXp ? (
                              <span className="tabular-nums tracking-tight">
                                <span className="text-slate-500 line-through decoration-slate-500">+{nominalClearXp}</span>
                                <span className="ml-1.5 text-amber-400">+{clearXp} XP</span>
                              </span>
                            ) : (
                              <span className="tabular-nums tracking-tight text-slate-300">+{clearXp} XP</span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="relative shrink-0 self-center">
                      <GameIcon
                        iconPath={dungeon.cardIcon}
                        glow="spell"
                        size="dungeonCard"
                        title={dungeon.name}
                        dimmed={isLocked}
                        accentTint={theme.iconTint}
                        className={isLocked ? 'ring-1 ring-slate-700' : ''}
                      />
                      {isLocked ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/55">
                          <Lock className="text-slate-200" size={28} strokeWidth={2.5} aria-hidden />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg bg-slate-950/35 px-1 py-2 sm:px-0 sm:py-1">
                    {isLocked ? (
                      <>
                        {dungeon.enemies.map((enemy) => (
                          <div
                            key={`${dungeon.id}-${enemy.name}`}
                            className="flex min-h-[2.5rem] shrink-0 items-center justify-start sm:min-h-0"
                          >
                            <GameIcon
                              iconPath={LOCKED_ROSTER_ICON}
                              glow="spell"
                              size="dungeonRoster"
                              title="Unknown"
                              accentTint={theme.iconTint}
                            />
                          </div>
                        ))}
                        <div className="flex min-h-[2.5rem] shrink-0 items-center justify-start sm:min-h-0">
                          <GameIcon
                            iconPath={LOCKED_ROSTER_ICON}
                            glow="spell"
                            size="dungeonRoster"
                            title="Unknown"
                            accentTint={theme.iconTint}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {dungeon.enemies.map((enemy) => (
                          <div
                            key={`${dungeon.id}-${enemy.name}`}
                            className="flex min-h-[2.5rem] shrink-0 items-center gap-3 sm:min-h-0 sm:gap-2.5"
                          >
                            <GameIcon
                              iconPath={enemy.icon}
                              glow="spell"
                              size="dungeonRoster"
                              title={enemy.name}
                              dimmed={isCompleted}
                              accentTint={theme.iconTint}
                            />
                            <span
                              className={`min-w-0 flex-1 truncate text-[15px] font-bold uppercase leading-snug tracking-tight sm:text-sm ${isCompleted ? 'text-slate-500 line-through decoration-slate-500' : 'text-slate-300'}`}
                            >
                              {enemy.name}
                            </span>
                          </div>
                        ))}
                        <div className="flex min-h-[2.5rem] shrink-0 items-center gap-3 sm:min-h-0 sm:gap-2.5">
                          <GameIcon
                            iconPath={dungeon.bossIcon}
                            glow="spell"
                            size="dungeonRoster"
                            title={dungeon.bossName}
                            dimmed={isCompleted}
                            accentTint={theme.iconTint}
                          />
                          <span
                            className={`min-w-0 flex-1 truncate text-[15px] font-bold uppercase leading-snug tracking-tight sm:text-sm ${isCompleted ? 'text-slate-500 line-through decoration-slate-500' : 'text-slate-200'}`}
                          >
                            {dungeon.bossName}
                          </span>
                        </div>
                      </>
                    )}
                    {showBossMechanicsRow ? (
                      <div className="flex min-h-0 flex-1 flex-col pt-1">
                        <BossMechanicsStrip
                          dungeon={dungeon}
                          isLocked={isLocked}
                          dimmed={isCompleted}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  className={`mt-auto w-full shrink-0 rounded-lg py-4 text-center text-lg font-black uppercase tracking-wider sm:py-4 sm:text-base ${
                    isLocked
                      ? 'border border-slate-800 bg-slate-950/50 text-slate-600'
                      : theme.deploy
                  }`}
                >
                  {isLocked ? 'LOCKED' : 'DEPLOY'}
                </div>

                {isLocked ? <div className="pointer-events-none absolute inset-0 rounded-xl bg-slate-950/15" /> : null}
              </button>
            );
          })}
        </div>
        <div className="mx-auto mt-2 h-px w-16 shrink-0 bg-white/25" aria-hidden />
      </div>
    </div>
  );
}
