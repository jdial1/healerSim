/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { GameIcon } from './GameIcon.tsx';
import type { IconGlow } from '../gameIcons.ts';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onClose: () => void;
  playerLevel: number;
  playerClass: ClassType;
}

function learnBlockedReason(talent: Talent, allTalents: Talent[], talentPoints: number, playerLevel: number): string | null {
  if (talent.levelReq > playerLevel) {
    return `Requires level ${talent.levelReq} (you are level ${playerLevel})`;
  }
  const prereqs = talent.prerequisites ?? [];
  const unmet = prereqs
    .map((id) => allTalents.find((t) => t.id === id))
    .filter((p): p is Talent => !!p && p.points === 0);
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

  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === selectedTalentId),
    [talents, selectedTalentId],
  );

  const selectedLearnReason = useMemo(() => {
    if (!selectedTalent || selectedTalent.points >= selectedTalent.maxPoints) return null;
    return learnBlockedReason(selectedTalent, talents, talentPoints, playerLevel);
  }, [selectedTalent, talents, talentPoints, playerLevel]);

  const isTalentAccessible = (talent: Talent) => {
    if (talent.levelReq > playerLevel) return false;
    if (!talent.prerequisites) return true;
    return talent.prerequisites.every((pid) => {
      const p = talents.find((t) => t.id === pid);
      return p && p.points > 0;
    });
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
        <div className="relative mx-auto grid aspect-[3/5] w-full max-w-lg grid-cols-4 grid-rows-7 gap-4">
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {talents.flatMap((t) =>
              (t.prerequisites || []).flatMap((pid) => {
                const p = talents.find((parent) => parent.id === pid);
                if (!p) return [];
                const x1 = `${p.gridX * 25 + 12.5}%`;
                const y1 = `${p.gridY * (100 / 7) + 100 / 14}%`;
                const x2 = `${t.gridX * 25 + 12.5}%`;
                const y2 = `${t.gridY * (100 / 7) + 100 / 14}%`;
                return [
                  <line
                    key={`${p.id}-${t.id}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={p.points > 0 ? '#3b82f6' : '#1e293b'}
                    strokeWidth="2"
                    strokeDasharray={p.points > 0 ? '0' : '4'}
                  />,
                ];
              }),
            )}
          </svg>

          {talents.map((talent) => {
            const accessible = isTalentAccessible(talent);
            const hasPoints = talent.points > 0;
            const isSelected = selectedTalentId === talent.id;

            return (
              <div
                key={talent.id}
                className="relative z-10 flex flex-col items-center justify-center"
                style={{ gridColumnStart: talent.gridX + 1, gridRowStart: talent.gridY + 1 }}
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
                          : 'border-slate-800 bg-slate-900 opacity-40 grayscale'
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
              <h3 className="text-lg font-bold uppercase italic text-white">{selectedTalent.name}</h3>
              <p className="mt-1 text-sm italic text-slate-400">{selectedTalent.description}</p>
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
