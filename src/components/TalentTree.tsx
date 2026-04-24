/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { unmetChainedPrerequisiteTalents } from '../playerStats.ts';
import { GameIcon } from './GameIcon.tsx';
import type { IconGlow } from '../gameIcons.ts';
import {
  computeScatteredTalentPositions,
  collectExclusiveSplitPairs,
  splitPairContaining,
  type ExclusiveSplitPair,
} from '../talentGridScatter.ts';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onClose: () => void;
  playerLevel: number;
  playerClass: ClassType;
}

const GRID_COLS = 5;
const GRID_ROWS = 7;
const PCT_W = 100 / GRID_COLS;
const PCT_H = 100 / GRID_ROWS;

function skipDuplicatePrereqLineToBottom(
  pairs: ExclusiveSplitPair[],
  child: Talent,
  parentId: string,
): boolean {
  const pair = pairs.find((x) => x.bottom.id === child.id);
  if (!pair) return false;
  const topPrereqs = pair.top.prerequisites ?? [];
  return topPrereqs.includes(parentId);
}

function lineAnchorPct(
  t: Talent,
  pairs: ExclusiveSplitPair[],
  pos: (u: Talent) => { gridX: number; gridY: number },
): { x: string; y: string } {
  const pair = splitPairContaining(t.id, pairs);
  const ppos = pos(t);
  if (pair) {
    const a = pos(pair.top);
    const b = pos(pair.bottom);
    const midY = (a.gridY + b.gridY) / 2;
    return {
      x: `${a.gridX * PCT_W + PCT_W / 2}%`,
      y: `${midY * PCT_H + PCT_H / 2}%`,
    };
  }
  return {
    x: `${ppos.gridX * PCT_W + PCT_W / 2}%`,
    y: `${ppos.gridY * PCT_H + PCT_H / 2}%`,
  };
}

function pairHasAnyPoints(pair: ExclusiveSplitPair): boolean {
  return pair.top.points > 0 || pair.bottom.points > 0;
}

function prereqLineLit(p: Talent, t: Talent, pairs: ExclusiveSplitPair[]): boolean {
  const pairP = splitPairContaining(p.id, pairs);
  const parentLit = pairP ? pairHasAnyPoints(pairP) : p.points > 0;
  if (!parentLit) return false;
  const pairT = splitPairContaining(t.id, pairs);
  if (pairT) return pairHasAnyPoints(pairT);
  return t.points > 0;
}

function detailDescription(talent: Talent, pairs: ExclusiveSplitPair[]): string {
  if (splitPairContaining(talent.id, pairs)) {
    return talent.description.replace(/\s*Exclusive with [^.]+\.?/gi, '').trim();
  }
  return talent.description;
}

function learnBlockedReason(talent: Talent, allTalents: Talent[], talentPoints: number, playerLevel: number): string | null {
  if (talent.levelReq > playerLevel) {
    return `Requires level ${talent.levelReq} (you are level ${playerLevel})`;
  }
  const unmet = unmetChainedPrerequisiteTalents(allTalents, talent);
  if (unmet.length > 0) {
    return `Spend at least 1 point in ${unmet.map((p) => p.name).join(' · ')}`;
  }
  if (talentPoints < talent.cost) {
    return `Not enough talent points (need ${talent.cost}, have ${talentPoints})`;
  }
  return null;
}

function talentGlowForClass(cls: ClassType): IconGlow {
  return cls === ClassType.DRUID ? 'nature' : 'spell';
}

export function TalentTree({
  talents,
  talentPoints,
  onUnlock,
  onClose,
  playerLevel,
  playerClass,
}: TalentTreeProps) {
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const talentGlow = talentGlowForClass(playerClass);

  const exclusiveSplitPairs = useMemo(() => collectExclusiveSplitPairs(talents), [talents]);

  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === selectedTalentId),
    [talents, selectedTalentId],
  );

  const selectedLearnReason = useMemo(() => {
    if (!selectedTalent || selectedTalent.points >= selectedTalent.maxPoints) return null;
    return learnBlockedReason(selectedTalent, talents, talentPoints, playerLevel);
  }, [selectedTalent, talents, talentPoints, playerLevel]);

  const displayGrid = useMemo(
    () => computeScatteredTalentPositions(talents, GRID_COLS, GRID_ROWS),
    [talents],
  );

  const gridPos = (t: Talent) => displayGrid.get(t.id) ?? { gridX: t.gridX, gridY: t.gridY };

  const isTalentAccessible = (talent: Talent) => {
    if (talent.levelReq > playerLevel) return false;
    return unmetChainedPrerequisiteTalents(talents, talent).length === 0;
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-950">
      <div className="flex w-full items-center justify-between border-b border-slate-800 bg-slate-900 p-4">
        <div>
          <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">Specialization</h2>
          <div className="text-[10px] font-bold tracking-[0.2em] text-blue-500">POINTS AVAILABLE: {talentPoints}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-800 p-2 text-white transition-colors hover:bg-red-600"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-fixed p-4">
        <div
          className="relative mx-auto grid aspect-[5/7] w-full max-w-2xl gap-2 sm:gap-3"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {talents.flatMap((t) =>
              (t.prerequisites || []).flatMap((pid) => {
                const p = talents.find((parent) => parent.id === pid);
                if (!p) return [];
                if (skipDuplicatePrereqLineToBottom(exclusiveSplitPairs, t, pid)) return [];
                const a1 = lineAnchorPct(p, exclusiveSplitPairs, gridPos);
                const a2 = lineAnchorPct(t, exclusiveSplitPairs, gridPos);
                const lit = prereqLineLit(p, t, exclusiveSplitPairs);
                const syn =
                  t.synergyWith?.includes(p.id) || p.synergyWith?.includes(t.id) || false;
                const pairP = splitPairContaining(p.id, exclusiveSplitPairs);
                const dashUnlocked = pairP ? pairHasAnyPoints(pairP) : p.points > 0;
                return [
                  <line
                    key={`${p.id}-${t.id}`}
                    x1={a1.x}
                    y1={a1.y}
                    x2={a2.x}
                    y2={a2.y}
                    stroke={lit ? (syn ? '#a855f7' : '#3b82f6') : '#1e293b'}
                    strokeWidth={syn && lit ? '3' : '2'}
                    strokeDasharray={dashUnlocked ? '0' : '4'}
                    className={syn && lit ? 'drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]' : undefined}
                  />,
                ];
              }),
            )}
          </svg>

          {exclusiveSplitPairs.map((pair) => {
            const posTop = gridPos(pair.top);
            const posBot = gridPos(pair.bottom);
            const accTop = isTalentAccessible(pair.top);
            const accBot = isTalentAccessible(pair.bottom);
            const ptTop = pair.top.points > 0;
            const ptBot = pair.bottom.points > 0;
            const isSelected =
              selectedTalentId === pair.top.id || selectedTalentId === pair.bottom.id;

            const sideButton = (side: Talent, acc: boolean, pts: boolean) => {
              const sel = selectedTalentId === side.id;
              const base = pts
                ? 'bg-blue-600 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.65)]'
                : acc
                  ? 'bg-slate-800 hover:bg-slate-700'
                  : 'bg-slate-950 opacity-55';
              return (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => setSelectedTalentId(side.id)}
                  className={`relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center py-0.5 transition-all ${base} ${
                    sel ? 'z-[1] ring-2 ring-inset ring-blue-400' : ''
                  }`}
                >
                  <GameIcon
                    iconPath={side.icon}
                    glow={talentGlow}
                    size="sm"
                    title={side.name}
                    dimmed={!pts}
                    className={!acc ? 'opacity-50' : ''}
                  />
                  <div className="absolute bottom-0.5 right-0.5 rounded border border-slate-700 bg-slate-900 px-0.5 text-[9px] font-bold leading-none text-white sm:text-[10px]">
                    {side.points}/{side.maxPoints}
                  </div>
                  {!acc ? (
                    <Lock size={10} className="absolute left-0.5 top-0.5 text-slate-500 sm:left-1 sm:top-1" />
                  ) : null}
                </button>
              );
            };

            return (
              <div
                key={`split-${pair.top.id}-${pair.bottom.id}`}
                className="relative z-10 flex flex-col items-center justify-center"
                style={{
                  gridColumnStart: posTop.gridX + 1,
                  gridRowStart: posTop.gridY + 1,
                  gridRowEnd: posBot.gridY + 2,
                }}
              >
                <div
                  className={`flex h-12 w-full max-w-[6.75rem] flex-row overflow-hidden rounded-md border-2 border-slate-600 bg-slate-950 shadow-sm transition-transform sm:h-16 sm:max-w-[8.75rem] ${
                    isSelected ? 'scale-110 ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-950' : ''
                  }`}
                >
                  {sideButton(pair.top, accTop, ptTop)}
                  <div className="w-px shrink-0 self-stretch bg-slate-400" aria-hidden />
                  {sideButton(pair.bottom, accBot, ptBot)}
                </div>
              </div>
            );
          })}

          {talents.map((talent) => {
            const pair = splitPairContaining(talent.id, exclusiveSplitPairs);
            if (pair && talent.id === pair.bottom.id) return null;
            if (pair && talent.id === pair.top.id) return null;

            const accessible = isTalentAccessible(talent);
            const hasPoints = talent.points > 0;
            const isSelected = selectedTalentId === talent.id;
            const { gridX, gridY } = gridPos(talent);

            return (
              <div
                key={talent.id}
                className="relative z-10 flex flex-col items-center justify-center"
                style={{ gridColumnStart: gridX + 1, gridRowStart: gridY + 1 }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedTalentId(talent.id)}
                  className={`
                    relative flex h-12 w-12 items-center justify-center rounded border-2 transition-all sm:h-16 sm:w-16
                    ${
                      hasPoints
                        ? 'border-yellow-400 bg-blue-600 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                        : accessible
                          ? 'border-slate-600 bg-slate-800 hover:border-white'
                          : 'border-slate-800 bg-slate-900 opacity-50'
                    }
                    ${isSelected ? 'scale-110 ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-950' : ''}
                  `}
                >
                  <GameIcon
                    iconPath={talent.icon}
                    glow={talentGlow}
                    size="sm"
                    title={talent.name}
                    dimmed={!hasPoints}
                    className={!accessible ? 'opacity-50' : ''}
                  />
                  <div className="absolute -bottom-2 -right-2 rounded border border-slate-700 bg-slate-900 px-1 text-[10px] font-bold text-white">
                    {talent.points}/{talent.maxPoints}
                  </div>
                  {!accessible ? <Lock size={12} className="absolute left-1 top-1 text-slate-500" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-48 shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-900 p-4">
        <AnimatePresence mode="wait">
          {selectedTalent ? (
            <motion.div key={selectedTalent.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-3">
                <GameIcon
                  iconPath={selectedTalent.icon}
                  glow={talentGlow}
                  size="md"
                  title={selectedTalent.name}
                  dimmed={selectedTalent.points === 0}
                />
                <h3 className="min-w-0 flex-1 text-lg font-bold uppercase italic text-white">
                  {selectedTalent.name}
                </h3>
              </div>
              <p className="mt-1 text-sm italic text-slate-400">
                {detailDescription(selectedTalent, exclusiveSplitPairs)}
                {selectedTalent.maxRankBonusDescription && selectedTalent.points === selectedTalent.maxPoints ? (
                  <span className="mt-2 block text-xs not-italic text-amber-200/90">
                    {selectedTalent.maxRankBonusDescription}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => onUnlock(selectedTalent.id)}
                disabled={
                  selectedTalent.points >= selectedTalent.maxPoints || selectedLearnReason !== null
                }
                className="mt-3 min-h-[44px] w-full rounded bg-blue-600 px-2 py-2.5 text-xs font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:bg-slate-800 sm:min-h-0 sm:py-2"
              >
                {selectedTalent.points >= selectedTalent.maxPoints ? (
                  'MAXED'
                ) : selectedLearnReason ? (
                  <span className="block text-[10px] font-semibold normal-case leading-snug tracking-normal text-amber-200/95 sm:text-[11px]">
                    {selectedLearnReason}
                  </span>
                ) : (
                  'LEARN TALENT'
                )}
              </button>
            </motion.div>
          ) : (
            <div
              key="talent-detail-empty"
              className="flex h-full items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-600"
            >
              Select a talent to view details
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
