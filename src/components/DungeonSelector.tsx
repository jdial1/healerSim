/**

 * @license

 * SPDX-License-Identifier: Apache-2.0

 */



import { useRef, useCallback, type PointerEvent as ReactPointerEvent } from 'react';

import { DUNGEONS } from '../constants.ts';

import { Dungeon } from '../types.ts';

import { Skull, Swords, Lock, Check } from 'lucide-react';

import { motion } from 'motion/react';



interface DungeonSelectorProps {

  onSelect: (dungeon: Dungeon) => void;

  level: number;

  completedDungeonIds: string[];

}



const DRAG_THRESHOLD_PX = 10;

type DungeonCardId = (typeof DUNGEONS)[number]['id'];

type DungeonCardVisual = {

  card: string;

  titleHover: string;

  accentBar: string;

  swords: string;

  skullEnemy: string;

  skullBoss: string;

  bossRowBorder: string;

  deploy: string;

  deployHover: string;

};

const DUNGEON_CARD_THEME = {

  deadmines: {

    card: 'rounded-sm border-l-[6px] border-l-amber-800 bg-gradient-to-br from-slate-950 via-amber-950/40 to-slate-900 shadow-[0_20px_50px_-12px_rgba(180,83,9,0.35)] ring-1 ring-inset ring-amber-900/25 hover:border-amber-500',

    titleHover: 'group-hover:text-amber-300',

    accentBar: 'bg-amber-500',

    swords: 'text-amber-600/80',

    skullEnemy: 'text-amber-700/70',

    skullBoss: 'text-amber-500',

    bossRowBorder: 'border-t border-amber-900/50',

    deploy: 'bg-amber-700 text-amber-50',

    deployHover: 'group-hover:bg-amber-100 group-hover:text-amber-950',

  },

  wailing_caverns: {

    card: 'rounded-2xl border-l-[6px] border-l-teal-500 bg-gradient-to-br from-slate-950 via-teal-950/50 to-emerald-950/40 shadow-[0_20px_50px_-12px_rgba(13,148,136,0.35)] ring-1 ring-inset ring-teal-800/20 hover:border-teal-400',

    titleHover: 'group-hover:text-teal-300',

    accentBar: 'bg-teal-400',

    swords: 'text-teal-500/80',

    skullEnemy: 'text-teal-600/70',

    skullBoss: 'text-emerald-400',

    bossRowBorder: 'border-t border-teal-900/40',

    deploy: 'bg-teal-600 text-white',

    deployHover: 'group-hover:bg-teal-100 group-hover:text-teal-900',

  },

  scarlet_monastery: {

    card: 'rounded-none border-l-[6px] border-l-rose-600 bg-gradient-to-br from-rose-950 via-slate-950 to-rose-950/80 shadow-[0_20px_50px_-12px_rgba(225,29,72,0.3)] ring-1 ring-inset ring-rose-900/30 hover:border-rose-400',

    titleHover: 'group-hover:text-rose-200',

    accentBar: 'bg-rose-500',

    swords: 'text-rose-400/80',

    skullEnemy: 'text-rose-300/60',

    skullBoss: 'text-rose-400',

    bossRowBorder: 'border-t border-rose-900/40',

    deploy: 'bg-rose-700 text-rose-50',

    deployHover: 'group-hover:bg-rose-50 group-hover:text-rose-950',

  },

  zul_farrak: {

    card: 'rounded-sm border-l-[6px] border-l-yellow-500 bg-gradient-to-br from-amber-950 via-yellow-950/30 to-stone-900 shadow-[0_20px_50px_-12px_rgba(202,138,4,0.35)] ring-1 ring-inset ring-yellow-900/20 hover:border-yellow-400',

    titleHover: 'group-hover:text-yellow-200',

    accentBar: 'bg-yellow-500',

    swords: 'text-yellow-600/70',

    skullEnemy: 'text-amber-600/70',

    skullBoss: 'text-orange-400',

    bossRowBorder: 'border-t border-amber-900/50',

    deploy: 'bg-amber-600 text-amber-50',

    deployHover: 'group-hover:bg-yellow-100 group-hover:text-amber-950',

  },

  sunken_temple: {

    card: 'rounded-tr-3xl border-l-[6px] border-l-emerald-600 bg-gradient-to-br from-slate-950 via-emerald-950/45 to-cyan-950/30 shadow-[0_20px_50px_-12px_rgba(5,150,105,0.35)] ring-1 ring-inset ring-emerald-900/25 hover:border-emerald-400',

    titleHover: 'group-hover:text-emerald-300',

    accentBar: 'bg-emerald-500',

    swords: 'text-emerald-500/70',

    skullEnemy: 'text-cyan-700/60',

    skullBoss: 'text-emerald-400',

    bossRowBorder: 'border-t border-emerald-900/40',

    deploy: 'bg-emerald-700 text-emerald-50',

    deployHover: 'group-hover:bg-emerald-100 group-hover:text-emerald-950',

  },

  blackrock_depths: {

    card: 'rounded-sm border-l-[6px] border-l-orange-600 bg-gradient-to-br from-neutral-950 via-orange-950/50 to-stone-950 shadow-[0_20px_50px_-12px_rgba(234,88,12,0.4)] ring-1 ring-inset ring-orange-950/30 hover:border-orange-400',

    titleHover: 'group-hover:text-orange-300',

    accentBar: 'bg-orange-500',

    swords: 'text-orange-500/70',

    skullEnemy: 'text-stone-500',

    skullBoss: 'text-orange-500',

    bossRowBorder: 'border-t border-orange-950/50',

    deploy: 'bg-orange-700 text-orange-50',

    deployHover: 'group-hover:bg-orange-100 group-hover:text-orange-950',

  },

  stratholme: {

    card: 'rounded-lg border-l-[6px] border-l-violet-600 bg-gradient-to-br from-slate-950 via-violet-950/40 to-emerald-950/20 shadow-[0_20px_50px_-12px_rgba(124,58,237,0.3)] ring-1 ring-inset ring-violet-900/25 hover:border-violet-400',

    titleHover: 'group-hover:text-violet-300',

    accentBar: 'bg-violet-500',

    swords: 'text-violet-400/70',

    skullEnemy: 'text-emerald-800/60',

    skullBoss: 'text-violet-400',

    bossRowBorder: 'border-t border-violet-900/40',

    deploy: 'bg-violet-800 text-violet-50',

    deployHover: 'group-hover:bg-violet-100 group-hover:text-violet-950',

  },

  scholomance: {

    card: 'rounded-md border-l-[6px] border-l-indigo-500 bg-gradient-to-br from-slate-950 via-indigo-950/55 to-purple-950/40 shadow-[0_20px_50px_-12px_rgba(99,102,241,0.35)] ring-1 ring-inset ring-indigo-900/30 hover:border-indigo-400',

    titleHover: 'group-hover:text-indigo-300',

    accentBar: 'bg-indigo-400',

    swords: 'text-indigo-400/70',

    skullEnemy: 'text-purple-500/60',

    skullBoss: 'text-indigo-300',

    bossRowBorder: 'border-t border-indigo-900/45',

    deploy: 'bg-indigo-700 text-indigo-50',

    deployHover: 'group-hover:bg-indigo-100 group-hover:text-indigo-950',

  },

} satisfies Record<DungeonCardId, DungeonCardVisual>;



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

        className="fixed left-0 right-0 z-[45] border-t border-white/10 bg-slate-950/90 pb-3 pt-3 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"

        style={{ bottom: 'max(11rem, calc(10.25rem + env(safe-area-inset-bottom, 0px)))' }}

      >

        <div

          ref={scrollRef}

          onPointerDown={handlePointerDown}

          className="flex w-full cursor-grab snap-x snap-mandatory flex-nowrap gap-5 overflow-x-auto overflow-y-visible px-4 py-2 select-none active:cursor-grabbing [scrollbar-width:thin] sm:gap-6 sm:px-6"

        >

          {DUNGEONS.map((dungeon) => {

            const isLocked = level < dungeon.difficulty;

            const isCompleted = completedDungeonIds.includes(dungeon.id);

            const theme = DUNGEON_CARD_THEME[dungeon.id as DungeonCardId];



            return (

              <motion.button

                key={dungeon.id}

                type="button"

                onClick={() => trySelect(dungeon, isLocked)}

                whileHover={!isLocked ? { y: -2 } : {}}

                className={`

                  group relative flex h-[min(55dvh,32rem)] w-[min(88vw,22rem)] shrink-0 snap-center flex-col justify-between px-6 py-10 text-left transition-all sm:w-[min(24rem,40vw)] sm:px-8 sm:py-12

                  ${theme.card}

                  ${isLocked ? 'opacity-[0.42] grayscale' : 'shadow-lg'}

                `}

              >

                <div className="flex min-h-0 flex-1 flex-col justify-between gap-8">

                  <div className="flex items-start justify-between gap-3">

                    <h3

                      className={`line-clamp-2 text-xl font-black uppercase italic leading-tight tracking-tighter text-white sm:text-2xl ${theme.titleHover}`}

                    >

                      {dungeon.name.replace(/^The /i, '')}

                    </h3>

                    {isLocked ? (

                      <Lock className="shrink-0 text-slate-600" size={32} />

                    ) : (

                      <Swords className={`shrink-0 ${theme.swords}`} size={32} />

                    )}

                  </div>



                  <div className="flex items-center gap-3 text-base font-black uppercase text-slate-500 sm:text-sm">

                    <span>L{dungeon.difficulty}</span>

                    <span className="text-slate-700">•</span>

                    <div className="flex gap-1.5">

                      {[...Array(5)].map((_, i) => (

                        <div

                          key={i}

                          className={`h-4 w-1.5 rounded-sm ${i < dungeon.difficulty ? (isLocked ? 'bg-slate-600' : theme.accentBar) : 'bg-slate-800'}`}

                        />

                      ))}

                    </div>

                    {isCompleted ? (

                      <span className="flex items-center gap-1 text-emerald-500">

                        <Check size={16} strokeWidth={3} aria-hidden />

                        <span className="text-[10px] font-black uppercase tracking-widest">Clear</span>

                      </span>

                    ) : null}

                  </div>



                  <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 py-2">

                    {dungeon.enemies.map((enemyName) => (

                      <div

                        key={`${dungeon.id}-${enemyName}`}

                        className="flex items-center gap-3"

                      >

                        <Skull size={20} className={`shrink-0 ${isLocked ? 'text-slate-600' : theme.skullEnemy}`} />

                        <span className="truncate text-sm font-bold uppercase tracking-tight text-slate-400">

                          {enemyName}

                        </span>

                      </div>

                    ))}

                  </div>



                  <div className={`flex items-center gap-3 pt-6 ${isLocked ? 'border-t border-slate-800/80' : theme.bossRowBorder}`}>

                    <Skull size={24} className={`shrink-0 ${isLocked ? 'text-slate-600' : theme.skullBoss}`} />

                    <span className="truncate text-base font-bold uppercase text-slate-400 sm:text-sm">

                      {dungeon.bossName}

                    </span>

                  </div>

                </div>



                <div

                  className={`mt-8 w-full py-4 text-center text-base font-black uppercase tracking-wider sm:py-5 sm:text-lg ${

                    isLocked

                      ? 'border border-slate-800 bg-slate-950/50 text-slate-600'

                      : `${theme.deploy} ${theme.deployHover}`

                  }`}

                >

                  {isLocked ? 'LOCKED' : 'DEPLOY'}

                </div>



                {isLocked && <div className="pointer-events-none absolute inset-0 bg-slate-950/20" />}

              </motion.button>

            );

          })}

        </div>

        <div className="mx-auto mt-2 h-px w-16 bg-white/25" aria-hidden />

      </div>

    </div>

  );

}


