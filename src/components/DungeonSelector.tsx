/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useRef,
  useCallback,
  useState,
  useLayoutEffect,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { bossCombatProfileForDungeon, TICKS_PER_SECOND } from '../constants.ts';
import { DUNGEONS } from '../dungeons/index.ts';
import { type BossDebuffTargeting, type Dungeon, type DungeonPace } from '../types.ts';
import { computeDungeonXpGain, levelsOverDungeonMax } from '../gameStorage.ts';
import { BALANCE } from '../balance.ts';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { GameIcon } from './GameIcon.tsx';
import { DungeonQueueModal } from './DungeonQueueModal.tsx';
import { BOSS_BUFF_ICON_TINT, LOCKED_DUNGEON_ICON } from '../gameIcons.ts';

interface DungeonSelectorProps {
  onSelect: (dungeon: Dungeon, pace: DungeonPace) => void;
  level: number;
  completedDungeonIds: string[];
}

const DRAG_THRESHOLD_PX = 10;

function scrollEnds(el: HTMLDivElement): { atStart: boolean; atEnd: boolean } {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0) return { atStart: true, atEnd: true };
  const sl = el.scrollLeft;
  return { atStart: sl < 2, atEnd: sl > max - 2 };
}

function centeredChildIndex(el: HTMLDivElement): number {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < el.children.length; i++) {
    const cr = el.children[i].getBoundingClientRect();
    const mx = cr.left + cr.width / 2;
    const d = Math.abs(mx - cx);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

const CARD_SHELL =
  'relative flex h-full max-h-full min-h-0 w-[min(88vw,22rem)] shrink-0 snap-center flex-col rounded-xl border border-slate-800/90 bg-gradient-to-br from-slate-950 to-slate-900 px-5 pt-4 pb-4 text-left ring-1 ring-inset sm:w-[min(24rem,40vw)] sm:px-6 sm:pt-5 sm:pb-5 md:px-7 md:pt-6 md:pb-6 max-sm:px-6 max-sm:pt-3.5 max-sm:pb-3.5';

const CAROUSEL_SCROLL =
  'flex min-h-0 flex-1 cursor-grab snap-x snap-mandatory flex-nowrap items-stretch gap-4 overflow-x-auto overflow-y-clip overscroll-x-contain px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] select-none active:cursor-grabbing sm:gap-5 sm:px-6 [&::-webkit-scrollbar]:hidden';

function debuffTargetingDescription(t: BossDebuffTargeting): string {
  if (t === 'single_random') return 'Hits 1 ally';
  if (t === 'all_living') return 'Hits all allies';
  return 'Hits 2 allies';
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
  const cardTheme = dungeon.cardTheme;

  const cardShell =
    'flex h-full min-h-[12rem] min-w-0 flex-1 basis-0 flex-col gap-1.5 rounded-md border bg-slate-900/75 px-2.5 py-2 sm:gap-1.5 sm:px-2.5 sm:py-2 md:gap-2 md:px-3 md:py-2.5';

  if (isLocked) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-1.5 sm:gap-2 md:gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`${cardShell} border-slate-800/90 opacity-[0.55]`}
            >
              <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 sm:text-[9px] md:text-xs">?</span>
              <GameIcon
                iconPath={LOCKED_DUNGEON_ICON}
                glow="spell"
                size="md"
                dimmed
                accentTint={cardTheme.iconTint}
                className="mx-auto shrink-0"
              />
              <div className="flex min-h-0 flex-1 flex-col justify-center py-0.5">
                <p className="text-center text-xs font-bold uppercase leading-snug text-slate-400 sm:text-[11px] md:text-sm">
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
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch gap-1.5 sm:gap-2 md:gap-2.5">
        {profile.debuffTemplates.map((d) => (
          <div
            key={d.abilityId}
            className={`${cardShell} border-rose-900/45`}
          >
            <p className="line-clamp-2 min-h-[2.5rem] shrink-0 break-normal hyphens-auto px-1 text-center text-[10px] font-bold uppercase leading-snug tracking-tight text-slate-100 sm:min-h-[2.25rem] sm:text-[10px] md:min-h-[2.75rem] md:text-xs">
              {d.name}
            </p>
            <GameIcon
              iconPath={d.icon}
              glow="debuff"
              size="md"
              title={d.dispellable ? `${d.name} (Dispellable)` : d.name}
              dimmed={dimmed}
              className="mx-auto shrink-0"
            />
            <div className="mt-auto min-h-0 shrink-0 space-y-1.5 text-center md:space-y-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px] md:text-[11px]">
                  Dmg per tick
                </p>
                <p className="text-[11px] font-bold tabular-nums leading-snug text-slate-200 sm:text-[10px] md:text-sm">
                  {d.damagePerTick}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px] md:text-[11px]">
                  Duration
                </p>
                <p className="text-[11px] font-bold tabular-nums leading-snug text-slate-200 sm:text-[10px] md:text-sm">
                  {durationSecLabel(d.durationTicks)}
                </p>
              </div>
              <p className="text-[10px] font-semibold leading-snug text-slate-400 sm:text-[9px] md:text-xs">
                {debuffTargetingDescription(d.targeting)}
              </p>
              {d.dispellable && (
                <p className="text-[9px] font-bold uppercase tracking-wide text-sky-300/90 sm:text-[8px] md:text-[10px]">
                  Dispellable
                </p>
              )}
            </div>
          </div>
        ))}
        {profile.attackTemplates.map((a) => (
          <div
            key={a.abilityId}
            className={`${cardShell} border-orange-900/50`}
          >
            <p className="line-clamp-2 min-h-[2.5rem] shrink-0 break-normal hyphens-auto px-1 text-center text-[10px] font-bold uppercase leading-snug tracking-tight text-slate-100 sm:min-h-[2.25rem] sm:text-[10px] md:min-h-[2.75rem] md:text-xs">
              {a.name}
            </p>
            <GameIcon
              iconPath={a.icon}
              glow="debuff"
              size="md"
              title={a.name}
              dimmed={dimmed}
              className="mx-auto shrink-0"
            />
            <div className="mt-auto min-h-0 shrink-0 space-y-1.5 text-center md:space-y-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px] md:text-[11px]">
                  Special
                </p>
                <p className="text-[11px] font-bold tabular-nums leading-snug text-orange-200 sm:text-[10px] md:text-sm">
                  {a.damage}
                </p>
              </div>
              <p className="text-[10px] font-semibold leading-snug text-slate-400 sm:text-[9px] md:text-xs">
                {debuffTargetingDescription(a.targeting)}
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
            <p className="line-clamp-2 min-h-[2.5rem] shrink-0 break-normal hyphens-auto px-1 text-center text-[10px] font-bold uppercase leading-snug tracking-tight text-slate-100 sm:min-h-[2.25rem] sm:text-[10px] md:min-h-[2.75rem] md:text-xs">
                {b.name}
              </p>
              <GameIcon
                iconPath={b.icon}
                glow="spell"
                size="md"
                title={b.name}
                dimmed={dimmed}
                accentTint={BOSS_BUFF_ICON_TINT}
                className="mx-auto shrink-0"
              />
              <div className="mt-auto min-h-0 shrink-0 space-y-1.5 text-center md:space-y-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px] md:text-[11px]">
                    Damage done
                  </p>
                  <p className="text-[11px] font-bold tabular-nums leading-snug text-amber-200 sm:text-[10px] md:text-sm">
                    +{pct}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[8px] md:text-[11px]">
                    Duration
                  </p>
                  <p className="text-[11px] font-bold tabular-nums leading-snug text-slate-200 sm:text-[10px] md:text-sm">
                    {durationSecLabel(b.durationTicks)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GALLERY_NAV_BTN =
  'ui-state-frame ui-state-hover pointer-events-auto absolute top-1/2 z-[1] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/90 text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[opacity,transform] active:scale-95 max-sm:h-10 max-sm:w-10 sm:h-12 sm:w-12';

export function DungeonSelector({ onSelect, level, completedDungeonIds }: DungeonSelectorProps) {
  const [queueDungeon, setQueueDungeon] = useState<Dungeon | null>(null);
  const [scrollEndsState, setScrollEndsState] = useState({ atStart: true, atEnd: false });
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

  const syncScrollEnds = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollEndsState(scrollEnds(el));
  }, []);

  useLayoutEffect(() => {
    syncScrollEnds();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncScrollEnds());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncScrollEnds]);

  const scrollGalleryBy = useCallback(
    (dir: -1 | 1) => {
      const el = scrollRef.current;
      if (!el || el.children.length === 0) return;
      const i = centeredChildIndex(el);
      const j = i + dir;
      if (j < 0 || j >= el.children.length) return;
      (el.children[j] as HTMLElement).scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    },
    [],
  );

  const trySelect = useCallback(
    (dungeon: Dungeon, isLocked: boolean) => {
      if (dragRef.current.suppressClick) {
        dragRef.current.suppressClick = false;
        return;
      }
      if (!isLocked) setQueueDungeon(dungeon);
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ui-frame-divider-bottom fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-slate-900/50 px-4 py-3 sm:px-8">
        <div className="w-[3.5rem] sm:w-[4.25rem]" aria-hidden />
        <div>
          <h1 className="ui-heading text-xl leading-none tracking-[0.08em] text-white sm:text-2xl">
            DUNGEONS
          </h1>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 sm:text-[11px]">
          Lvl <span className="font-black text-slate-100">{level}</span>
        </div>
      </div>

      <div className="mt-16 min-h-0 flex-1 bg-gradient-to-b from-slate-950 to-slate-900/30" />

      <div
        className="ui-frame-divider-top fixed left-0 right-0 z-[45] flex min-h-0 flex-col bg-slate-950/90 pb-3 pt-3 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
        style={{
          top: 'calc(4rem + env(safe-area-inset-top, 0px))',
          bottom: 'max(4.75rem, calc(4rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            aria-label="Previous dungeon"
            disabled={scrollEndsState.atStart}
            onClick={() => scrollGalleryBy(-1)}
            className={`${GALLERY_NAV_BTN} left-2 max-sm:left-1 sm:left-3 ${scrollEndsState.atStart ? 'pointer-events-none opacity-30' : 'opacity-100 hover:bg-slate-900/95'}`}
          >
            <ChevronLeft className="size-6 max-sm:size-5 sm:size-7" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next dungeon"
            disabled={scrollEndsState.atEnd}
            onClick={() => scrollGalleryBy(1)}
            className={`${GALLERY_NAV_BTN} right-2 max-sm:right-1 sm:right-3 ${scrollEndsState.atEnd ? 'pointer-events-none opacity-30' : 'opacity-100 hover:bg-slate-900/95'}`}
          >
            <ChevronRight className="size-6 max-sm:size-5 sm:size-7" strokeWidth={2.25} aria-hidden />
          </button>
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onScroll={syncScrollEnds}
            className={CAROUSEL_SCROLL}
          >
          {DUNGEONS.map((dungeon) => {
            const isLocked = level < dungeon.levelMin;
            const isCompleted = completedDungeonIds.includes(dungeon.id);
            const showReducedXp = !isLocked && levelsOverDungeonMax(dungeon, level) > 0;
            const nominalClearXp = computeDungeonXpGain(dungeon, dungeon.levelMax);
            const clearXp = computeDungeonXpGain(dungeon, level);
            const theme = dungeon.cardTheme;
            const bossCombat = bossCombatProfileForDungeon(dungeon);
            const showBossMechanicsRow =
              isLocked ||
              bossCombat.debuffTemplates.length +
                bossCombat.selfBuffTemplates.length +
                bossCombat.attackTemplates.length >
                0;

            return (
              <button
                key={dungeon.id}
                type="button"
                onClick={() => trySelect(dungeon, isLocked)}
                className={`
                  ${CARD_SHELL}
                  ui-state-frame
                  ${theme.borderLeft}
                  ${theme.viaTint}
                  ${theme.ring}
                  ${theme.cardShadow}
                  ${isLocked ? 'ui-state-disabled cursor-default' : `ui-state-hover ${theme.borderHover} cursor-pointer`}
                `}
              >
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:gap-4">
                  <div className="flex shrink-0 items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {dungeon.id === 'deadmines' ? (
                          <GameIcon
                            iconPath={dungeon.bossIcon}
                            glow="spell"
                            size="xs"
                            title={dungeon.bossName}
                            dimmed={isLocked}
                            accentTint={theme.iconTint}
                            className="shrink-0"
                          />
                        ) : null}
                        <h3 className="ui-heading line-clamp-2 min-w-0 text-2xl leading-[1.05] tracking-[0.06em] text-white sm:text-2xl md:text-3xl">
                          {dungeon.name.replace(/^The /i, '')}
                        </h3>
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-xs font-black uppercase leading-snug sm:mt-0.5 sm:text-[11px] md:text-sm">
                        <span className="text-slate-500">Lv {dungeon.levelMin}–{dungeon.levelMax}</span>
                        {!isLocked ? (
                          <>
                            <span className="text-slate-700">•</span>
                            {dungeon.endless ? (
                              <span className="tabular-nums tracking-tight text-fuchsia-300/90">
                                ×{BALANCE.endless.scalingPerCycle} / wave · boss XP {Math.round(BALANCE.endless.bossKillXpFraction * 100)}%
                              </span>
                            ) : showReducedXp ? (
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
                        iconPath={isLocked ? LOCKED_DUNGEON_ICON : dungeon.cardIcon}
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
                              iconPath={LOCKED_DUNGEON_ICON}
                              glow="spell"
                              size="dungeonRoster"
                              title="Unknown"
                              accentTint={theme.iconTint}
                            />
                          </div>
                        ))}
                        <div className="flex min-h-[2.5rem] shrink-0 items-center justify-start sm:min-h-0">
                          <GameIcon
                            iconPath={LOCKED_DUNGEON_ICON}
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
                              className={`min-w-0 flex-1 text-[15px] font-bold uppercase leading-snug tracking-tight sm:text-sm md:text-base ${isCompleted ? 'text-slate-500 line-through decoration-slate-500' : 'text-slate-300'}`}
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
                            className={`min-w-0 flex-1 text-[15px] font-bold uppercase leading-snug tracking-tight sm:text-sm md:text-base ${isCompleted ? 'text-slate-500 line-through decoration-slate-500' : 'text-slate-200'}`}
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
                  className={`mt-auto w-full shrink-0 rounded-md py-4 text-center text-lg font-semibold uppercase tracking-[0.12em] sm:py-4 sm:text-base md:text-xl ${
                    isLocked
                      ? 'border border-slate-800 bg-slate-950/50 text-slate-600'
                      : 'ui-state-frame ui-state-hover border-amber-400/45 bg-amber-700/70 text-amber-50'
                  }`}
                >
                  {isLocked ? 'LOCKED' : 'QUEUE'}
                </div>

                {isLocked ? <div className="pointer-events-none absolute inset-0 rounded-xl bg-slate-950/15" /> : null}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {queueDungeon ? (
          <DungeonQueueModal
            dungeon={queueDungeon}
            onClose={() => setQueueDungeon(null)}
            onConfirmEnter={(d, pace) => {
              onSelect(d, pace);
              setQueueDungeon(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
