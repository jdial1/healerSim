/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, RotateCcw, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import {
  effectiveTalentPointWeight,
  talentTreeGlowForClass,
  transitivePrerequisiteTalentIds,
  unmetChainedPrerequisiteTalents,
  UNIQUE_STAT_LABELS,
} from '../playerStats.ts';
import { GameIcon } from './GameIcon.tsx';
import { sentenceCaseBlock, sentenceCaseLabel } from '../gameUiText.ts';
import type { ExclusiveSplitPair } from '../talentSplitPairs.ts';
import {
  buildTalentTreeUiGraph,
  pairHasAnyPoints,
  prereqConnectionStroke,
  TALENT_GRID_COLS,
  TALENT_GRID_ROWS,
  talentInExclusiveSplit,
} from '../talentTreeUiGraph.ts';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onDecrement: (talentId: string) => void;
  onRespec: () => void;
  onClose: () => void;
  playerLevel: number;
  playerClass: ClassType;
  tutorialHighlightTalentId?: string | null;
}

type TalentStatKey = keyof NonNullable<Talent['statBonus']>;

const STAT_ORDER: TalentStatKey[] = [
  'healingBoost',
  'manaPool',
  'haste',
  'critChance',
  'manaReturnOnDirectHeal',
  'uniqueStat',
];

const STAT_LABELS: Record<TalentStatKey, string> = {
  healingBoost: 'Healing',
  manaPool: 'Mana',
  haste: 'Haste',
  critChance: 'Crit',
  manaReturnOnDirectHeal: 'Regen',
  uniqueStat: '',
};

const STAT_SUFFIX: Record<TalentStatKey, string> = {
  healingBoost: '%',
  manaPool: '',
  haste: '%',
  critChance: '%',
  manaReturnOnDirectHeal: '',
  uniqueStat: '',
};

function statKeysFromBonus(t: Talent): TalentStatKey[] {
  const b = t.statBonus;
  if (!b) return [];
  const out: TalentStatKey[] = [];
  if (b.healingBoost) out.push('healingBoost');
  if (b.manaPool) out.push('manaPool');
  if (b.haste) out.push('haste');
  if (b.critChance) out.push('critChance');
  if (b.manaReturnOnDirectHeal) out.push('manaReturnOnDirectHeal');
  if (b.uniqueStat) out.push('uniqueStat');
  return out;
}

function uniqueStatsPresent(all: Talent[]): TalentStatKey[] {
  const seen = new Set<TalentStatKey>();
  for (const t of all) {
    for (const k of statKeysFromBonus(t)) seen.add(k);
  }
  return STAT_ORDER.filter((k) => seen.has(k));
}

function totalStatFromTalents(all: Talent[], key: TalentStatKey): number {
  return all.reduce((sum, t) => {
    if (t.points <= 0 || !t.statBonus?.[key]) return sum;
    const weightedPoints = effectiveTalentPointWeight(t.points, t.maxPoints);
    return sum + (t.statBonus[key] ?? 0) * weightedPoints;
  }, 0);
}

function splitPairMatchesStat(pair: ExclusiveSplitPair, key: TalentStatKey): boolean {
  return statKeysFromBonus(pair.top).includes(key) || statKeysFromBonus(pair.bottom).includes(key);
}

function detailDescription(
  talent: Talent,
  pairIndexByTalentId: Map<string, number>,
): string {
  if (talentInExclusiveSplit(talent.id, pairIndexByTalentId)) {
    return talent.description.replace(/\s*Exclusive with [^.]+\.?/gi, '').trim();
  }
  return talent.description;
}

function rankDescriptionBase(
  talent: Talent,
  pairIndexByTalentId: Map<string, number>,
): string {
  return detailDescription(talent, pairIndexByTalentId)
    .replace(/\s*Max rank:[^.]+\.?/gi, '')
    .trim();
}

function formatRankValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
}

function scalePerPointValues(description: string, rank: number): string {
  if (rank <= 1) return description;
  return description.replace(/(-?\d+(?:\.\d+)?)(%?)(?=[^.\n]*\bper point\b)/gi, (match, raw, suffix) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return match;
    return `${formatRankValue(numeric * rank)}${suffix}`;
  });
}

function rankDescriptionFromStatBonus(talent: Talent, rank: number): string | null {
  const bonus = talent.statBonus;
  if (!bonus) return null;
  const parts: string[] = [];
  if (bonus.healingBoost) parts.push(`+${formatRankValue(bonus.healingBoost * rank)}% healing`);
  if (bonus.manaPool) parts.push(`+${formatRankValue(bonus.manaPool * rank)} mana`);
  if (bonus.haste) parts.push(`+${formatRankValue(bonus.haste * rank)}% haste`);
  if (bonus.critChance) parts.push(`+${formatRankValue(bonus.critChance * rank)}% crit`);
  if (bonus.manaReturnOnDirectHeal)
    parts.push(`+${formatRankValue(bonus.manaReturnOnDirectHeal * rank)} mana return`);
  if (bonus.uniqueStat) parts.push(`+${formatRankValue(bonus.uniqueStat * rank)} class stat`);
  return parts.length > 0 ? parts.join(', ') : null;
}

function rankDescriptionForTalent(
  talent: Talent,
  rank: number,
  pairIndexByTalentId: Map<string, number>,
): string {
  const statLine = rankDescriptionFromStatBonus(talent, rank);
  const baseLine = statLine ?? scalePerPointValues(rankDescriptionBase(talent, pairIndexByTalentId), rank);
  if (rank === talent.maxPoints && talent.maxRankBonusDescription) {
    const normalizedMaxBonus = scalePerPointValues(
      talent.maxRankBonusDescription.replace(/^If maxed,\s*/i, '').trim(),
      rank,
    );
    return `${baseLine}\n${normalizedMaxBonus}`.trim();
  }
  return baseLine;
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

function canLearnTalent(talent: Talent, allTalents: Talent[], talentPoints: number, playerLevel: number): boolean {
  return learnBlockedReason(talent, allTalents, talentPoints, playerLevel) === null;
}

function canRemoveTalentPoint(talent: Talent, allTalents: Talent[]): boolean {
  if (talent.points <= 0) return false;
  return !allTalents.some(
    (candidate) =>
      candidate.points > 0 &&
      candidate.id !== talent.id &&
      transitivePrerequisiteTalentIds(allTalents, candidate).includes(talent.id),
  );
}

export function TalentTree({
  talents,
  talentPoints,
  onUnlock,
  onDecrement,
  onRespec,
  onClose,
  playerLevel,
  playerClass,
  tutorialHighlightTalentId,
}: TalentTreeProps) {
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [statHighlightKey, setStatHighlightKey] = useState<TalentStatKey | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const [treePan, setTreePan] = useState({ x: 0, y: 0 });
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextTalentClickRef = useRef(false);
  const talentGlow = talentTreeGlowForClass(playerClass);

  const uiGraph = useMemo(() => buildTalentTreeUiGraph(talents), [talents]);
  const { pairs: exclusiveSplitPairs, pairIndexByTalentId, connections } = uiGraph;
  const talentById = useMemo(() => new Map(talents.map((t) => [t.id, t] as const)), [talents]);
  const hasSpentTalents = talents.some((t) => t.points > 0);
  useEffect(() => {
    if (!hasSpentTalents) setConfirmRespec(false);
  }, [hasSpentTalents]);

  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === selectedTalentId),
    [talents, selectedTalentId],
  );

  const selectedLearnReason = useMemo(() => {
    if (!selectedTalent || selectedTalent.points >= selectedTalent.maxPoints) return null;
    return learnBlockedReason(selectedTalent, talents, talentPoints, playerLevel);
  }, [selectedTalent, talents, talentPoints, playerLevel]);

  const statPills = useMemo(() => uniqueStatsPresent(talents), [talents]);
  const statTotals = useMemo(
    () =>
      STAT_ORDER.reduce(
        (acc, key) => {
          acc[key] = totalStatFromTalents(talents, key);
          return acc;
        },
        {} as Record<TalentStatKey, number>,
      ),
    [talents],
  );
  function isTalentAccessible(talent: Talent): boolean {
    if (talent.levelReq > playerLevel) return false;
    return unmetChainedPrerequisiteTalents(talents, talent).length === 0;
  }
  const effectiveStatHighlight =
    statHighlightKey !== null && statPills.includes(statHighlightKey) ? statHighlightKey : null;
  const availableTalentIds = useMemo(
    () => new Set(talents.filter((talent) => isTalentAccessible(talent)).map((talent) => talent.id)),
    [talents, playerLevel],
  );

  const toggleStatHighlight = (key: TalentStatKey) => {
    setSelectedTalentId(null);
    setStatHighlightKey((prev) => (prev === key ? null : key));
  };

  const onTalentNodePress = (talent: Talent) => {
    setSelectedTalentId(talent.id);
    if (!canLearnTalent(talent, talents, talentPoints, playerLevel)) return;
    onUnlock(talent.id);
  };

  const canSelectedTalentLearn =
    !!selectedTalent && canLearnTalent(selectedTalent, talents, talentPoints, playerLevel);
  const canSelectedTalentRemove = !!selectedTalent && canRemoveTalentPoint(selectedTalent, talents);

  const PAN_DRAG_THRESHOLD = 10;

  const startTreePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const target = event.target as HTMLElement;
    const startedOnTalentNode = target.closest('[data-talent-node="true"]') !== null;
    if (!startedOnTalentNode) return;
    event.preventDefault();
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: treePan.x,
      originY: treePan.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveTreePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const panGesture = panGestureRef.current;
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - panGesture.startX;
    const deltaY = event.clientY - panGesture.startY;
    if (!panGesture.moved && Math.hypot(deltaX, deltaY) >= PAN_DRAG_THRESHOLD) {
      panGesture.moved = true;
    }
    if (!panGesture.moved) return;
    setTreePan({
      x: panGesture.originX + deltaX,
      y: panGesture.originY + deltaY,
    });
  };

  const endTreePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const panGesture = panGestureRef.current;
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    if (panGesture.moved) suppressNextTalentClickRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panGestureRef.current = null;
  };

  const onTreeClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextTalentClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextTalentClickRef.current = false;
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-950">
      <div className="ui-frame-divider-bottom ui-app-header bg-slate-900 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="ui-app-header-slot" aria-hidden />
        <div className="ui-app-header-title">
          <h2 className="ui-heading text-lg tracking-[0.08em] text-white sm:text-xl">Talents</h2>
          <div className="mt-1 text-xs font-semibold tabular-nums tracking-[0.06em] text-slate-400 sm:text-sm">
            Points: <span className="font-black text-amber-200">{talentPoints}</span>
          </div>
        </div>
        <div className="ui-app-header-slot-end flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirmRespec) {
                onRespec();
                setConfirmRespec(false);
                return;
              }
              setConfirmRespec(true);
            }}
            disabled={!hasSpentTalents}
            className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-black uppercase tracking-widest transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600 disabled:hover:border-slate-800 sm:px-3 ${
              confirmRespec
                ? 'ui-state-frame ui-state-selected bg-red-600 text-white hover:bg-red-500'
                : 'ui-state-frame ui-state-hover border-slate-500/55 bg-slate-800 text-slate-100 hover:border-amber-400/45 hover:bg-slate-700 hover:text-amber-50'
            }`}
          >
            <RotateCcw size={16} className="shrink-0" />
            {confirmRespec ? 'Confirm' : 'Respec'}
          </button>
          <button type="button" onClick={onClose} className="ui-close-button" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-fixed p-4">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-3 flex min-h-[2rem] flex-wrap items-center justify-center gap-2">
            <span className="w-full text-center text-xs font-black tracking-[0.08em] text-slate-200 sm:text-sm">
              Core Masteries
            </span>
            {statPills.map((key) => {
              const sel = effectiveStatHighlight === key;
              const suffix = STAT_SUFFIX[key];
              const total = formatRankValue(statTotals[key]);
              const pillLabel =
                key === 'uniqueStat' ? UNIQUE_STAT_LABELS[playerClass] : STAT_LABELS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStatHighlight(key)}
                  className={`flex min-h-[3.35rem] min-w-[5.75rem] flex-col items-center justify-center gap-1 rounded-full border px-3.5 py-2.5 text-xs font-black tracking-[0.03em] transition-colors sm:min-h-[3.6rem] sm:min-w-[6.25rem] sm:px-4 sm:py-3 sm:text-sm ${
                    sel
                      ? 'ui-state-frame ui-state-selected bg-amber-900/35 text-amber-50'
                      : 'ui-state-frame ui-state-hover bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <span className="leading-tight">{pillLabel}</span>
                  <span
                    className={`text-xs font-mono leading-none tabular-nums sm:text-sm ${sel ? 'text-amber-100' : 'text-slate-400'}`}
                  >
                    +{total}
                    {suffix}
                  </span>
                </button>
              );
            })}
          </div>
        <div
          className="relative overflow-hidden rounded-md"
          onPointerDown={startTreePan}
          onPointerMove={moveTreePan}
          onPointerUp={endTreePan}
          onPointerCancel={endTreePan}
          onClickCapture={onTreeClickCapture}
          style={{ touchAction: 'pan-y' }}
        >
        <div
          className="relative grid aspect-[5/7] w-full gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${TALENT_GRID_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${TALENT_GRID_ROWS}, 1fr)`,
            transform: `translate3d(${treePan.x}px, ${treePan.y}px, 0)`,
          }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {connections.map((conn) => {
              const strokeProps = prereqConnectionStroke(
                conn,
                talentById,
                exclusiveSplitPairs,
                pairIndexByTalentId,
                availableTalentIds,
              );
              return (
                <line
                  key={conn.key}
                  x1={conn.x1}
                  y1={conn.y1}
                  x2={conn.x2}
                  y2={conn.y2}
                  stroke={strokeProps.stroke}
                  strokeWidth={strokeProps.strokeWidth}
                  strokeDasharray={strokeProps.strokeDasharray}
                  className={strokeProps.className}
                />
              );
            })}
          </svg>

          {exclusiveSplitPairs.map((pair) => {
            const posTop = { gridX: pair.top.gridX, gridY: pair.top.gridY };
            const posBot = { gridX: pair.bottom.gridX, gridY: pair.bottom.gridY };
            const pairStatMatch =
              effectiveStatHighlight !== null && splitPairMatchesStat(pair, effectiveStatHighlight);
            const pairStatDim = effectiveStatHighlight !== null && !pairStatMatch;
            const accTop = isTalentAccessible(pair.top);
            const accBot = isTalentAccessible(pair.bottom);
            const ptTop = pair.top.points > 0;
            const ptBot = pair.bottom.points > 0;
            const isSelected =
              selectedTalentId === pair.top.id || selectedTalentId === pair.bottom.id;

            const sideButton = (side: Talent, acc: boolean, pts: boolean) => {
              const sel = selectedTalentId === side.id;
              const base = pts
                ? 'ui-state-frame ui-state-selected bg-slate-800'
                : acc
                  ? 'ui-state-frame ui-state-hover bg-slate-800 hover:bg-slate-700'
                  : 'ui-state-frame ui-state-disabled border-slate-500/50 bg-slate-800/90 grayscale';
              return (
                <button
                  key={side.id}
                  data-talent-node="true"
                  type="button"
                  onClick={() => onTalentNodePress(side)}
                  className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center py-0.5 transition-all active:scale-[0.96] ${base} ${
                    sel ? 'z-[1] ui-state-selected' : ''
                  }`}
                >
                  <GameIcon
                    iconPath={side.icon}
                    glow={talentGlow}
                    size="sm"
                    title={side.name}
                    dimmed={!pts}
                    imageFit="cover"
                    className={`h-full w-full min-h-0 min-w-0 rounded-sm p-0 ${!acc ? 'grayscale opacity-[0.68]' : ''}`}
                  />
                  <div className="ui-frame absolute bottom-0.5 right-0.5 rounded border border-slate-600/80 bg-slate-950/95 px-1 py-0.5 text-[11px] font-bold leading-none text-white sm:text-xs">
                    {side.points}/{side.maxPoints}
                  </div>
                  {!acc ? (
                    <Lock size={14} strokeWidth={2.5} className="absolute left-0.5 top-0.5 text-slate-300 drop-shadow sm:left-1 sm:top-1" />
                  ) : null}
                </button>
              );
            };

            return (
              <div
                key={`split-${pair.top.id}-${pair.bottom.id}`}
                className={`relative z-10 flex flex-col items-center justify-center ${pairStatDim ? 'opacity-[0.38]' : ''}`}
                style={{
                  gridColumnStart: posTop.gridX + 1,
                  gridRowStart: posTop.gridY + 1,
                  gridRowEnd: posBot.gridY + 2,
                }}
              >
                <div
                  className={`flex h-12 w-full max-w-[6.75rem] flex-row overflow-hidden rounded-md border border-slate-600 bg-slate-950 shadow-sm transition-transform sm:h-16 sm:max-w-[8.75rem] ${
                    isSelected ? 'scale-110 ui-state-selected ring-offset-2 ring-offset-slate-950' : ''
                  } ${pairStatMatch ? 'ui-state-selected ring-offset-2 ring-offset-slate-950' : ''}`}
                >
                  {sideButton(pair.top, accTop, ptTop)}
                  <div className="w-px shrink-0 self-stretch bg-slate-400" aria-hidden />
                  {sideButton(pair.bottom, accBot, ptBot)}
                </div>
              </div>
            );
          })}

          {talents.map((talent) => {
            if (talentInExclusiveSplit(talent.id, pairIndexByTalentId)) return null;

            const accessible = isTalentAccessible(talent);
            const hasPoints = talent.points > 0;
            const isSelected = selectedTalentId === talent.id;
            const { gridX, gridY } = talent;
            const statMatch =
              effectiveStatHighlight !== null &&
              statKeysFromBonus(talent).includes(effectiveStatHighlight);
            const statDim = effectiveStatHighlight !== null && !statMatch;

            return (
              <div
                key={talent.id}
                className={`relative z-10 flex flex-col items-center justify-center ${statDim ? 'opacity-[0.38]' : ''}`}
                style={{ gridColumnStart: gridX + 1, gridRowStart: gridY + 1 }}
              >
                <button
                  data-talent-node="true"
                  data-tutorial-id={
                    tutorialHighlightTalentId === talent.id ? 'tutorial-first-talent' : undefined
                  }
                  type="button"
                  onClick={() => onTalentNodePress(talent)}
                  className={`
                    relative flex h-12 min-h-11 w-12 min-w-11 items-center justify-center rounded-md border transition-all active:scale-[0.96] sm:h-16 sm:w-16
                    ${
                      hasPoints
                        ? 'ui-state-frame ui-state-selected bg-slate-800'
                        : accessible
                          ? 'ui-state-frame ui-state-hover bg-slate-800'
                          : 'ui-state-frame ui-state-disabled border-slate-500/50 bg-slate-800/90 grayscale'
                    }
                    ${isSelected ? 'scale-110 ui-state-selected ring-offset-2 ring-offset-slate-950' : ''}
                    ${statMatch ? 'ui-state-selected ring-offset-2 ring-offset-slate-950' : ''}
                  `}
                >
                  <GameIcon
                    iconPath={talent.icon}
                    glow={talentGlow}
                    size="sm"
                    title={talent.name}
                    dimmed={!hasPoints}
                    imageFit="cover"
                    className={`h-full w-full min-h-0 min-w-0 rounded-sm p-0 ${!accessible ? 'grayscale opacity-[0.68]' : ''}`}
                  />
                  <div className="ui-frame absolute -bottom-2 -right-2 rounded-md border border-slate-600/80 bg-slate-950/95 px-1.5 py-0.5 text-xs font-bold text-white sm:text-sm">
                    {talent.points}/{talent.maxPoints}
                  </div>
                  {!accessible ? (
                    <Lock size={16} strokeWidth={2.5} className="absolute left-1 top-1 text-slate-200 drop-shadow" />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
        </div>
        </div>
      </div>

      <div className="ui-frame-divider-top h-52 shrink-0 overflow-y-auto bg-slate-900 p-4">
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
                <div className="min-w-0 flex-1">
                  <h3 className="ui-heading min-w-0 text-lg tracking-[0.06em] text-white">
                    {sentenceCaseLabel(selectedTalent.name)}
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDecrement(selectedTalent.id)}
                    disabled={!canSelectedTalentRemove}
                    className="ui-state-frame ui-state-hover flex h-8 w-8 items-center justify-center rounded-md border border-slate-500/70 bg-slate-800 text-base font-black leading-none text-slate-100 disabled:ui-state-disabled disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600"
                    aria-label="Remove talent point"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => onUnlock(selectedTalent.id)}
                    disabled={!canSelectedTalentLearn}
                    className="ui-state-frame ui-state-hover flex h-8 w-8 items-center justify-center rounded-md border border-slate-500/70 bg-slate-800 text-base font-black leading-none text-slate-100 disabled:ui-state-disabled disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600"
                    aria-label="Add talent point"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="ui-body mt-1 text-sm text-slate-300">
                {selectedTalent.maxPoints > 1 ? (
                  <span className="mt-1 block space-y-1">
                    {Array.from({ length: selectedTalent.maxPoints }, (_, i) => i + 1).map((rank) => {
                      const isCurrentRank = rank === selectedTalent.points && selectedTalent.points > 0;
                      return (
                        <span
                          key={`${selectedTalent.id}-rank-${rank}`}
                          className={`block rounded px-2 py-1.5 text-xs leading-snug ${
                            isCurrentRank
                              ? 'bg-amber-950/45 text-slate-100 ring-1 ring-inset ring-amber-400/45'
                              : 'bg-slate-900/75 text-slate-300'
                          }`}
                        >
                          <span className="block whitespace-pre-line">
                            Rank {rank}:{' '}
                            {sentenceCaseBlock(
                              rankDescriptionForTalent(selectedTalent, rank, pairIndexByTalentId),
                            )}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  sentenceCaseBlock(detailDescription(selectedTalent, pairIndexByTalentId))
                )}
              </div>
              {selectedLearnReason &&
              selectedTalent.points < selectedTalent.maxPoints ? (
                <div className="ui-frame mt-2 rounded-md bg-amber-950/25 px-2 py-1.5 text-[10px] font-semibold leading-snug text-amber-200/95 sm:text-[11px]">
                  {selectedLearnReason}
                </div>
              ) : null}
            </motion.div>
          ) : (
            <div
              key="talent-detail-empty"
              className="flex h-full items-center justify-center px-4 text-center text-xs font-medium text-slate-500"
            >
              Select a talent to view details
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
