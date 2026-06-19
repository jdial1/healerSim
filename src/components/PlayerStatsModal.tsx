import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { getStatBreakdown } from '../playerStats.ts';
import { getManaRegenPerSecond } from '../constants.ts';
import { classDisplayName } from '../classUiData.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { sentenceCaseBlock, sentenceCaseLabel } from '../gameUiText.ts';
import { getTransformClass, getIconUrl, getWrapperTransformClass } from '../classIcons.ts';
import { GameIcon } from './GameIcon.tsx';

interface PlayerStatsModalProps {
  playerClass: ClassType;
  level: number;
  xp: number;
  talents: Talent[];
  onClose: () => void;
}



function formatCritChance(pct: number): string {
  const r = Math.round(pct * 100) / 100;
  if (r % 1 === 0) return `${r}%`;
  return `${r.toFixed(2)}%`;
}

function formatManaRegen(perSec: number): string {
  if (Number.isInteger(perSec)) return String(perSec);
  return perSec.toFixed(1);
}

interface StatPanelProps {
  title: string;
  children: ReactNode;
}

function StatPanel({ title, children }: StatPanelProps) {
  const showHeader = title.trim().length > 0;
  return (
    <div className="ui-frame overflow-hidden rounded bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {showHeader ? (
        <div className="ui-frame-divider-bottom flex items-center justify-between bg-slate-800/95 px-4 py-3">
          <span className="ui-heading text-xs tracking-[0.06em] text-slate-300 sm:text-sm">{title}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.5} aria-hidden />
        </div>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

interface BaseStatRowProps {
  label: string;
  value: string | number;
}

function formatAttributeValue(value: string | number): string | number {
  if (typeof value !== 'number') return value;
  return Math.round(value);
}

function formatStatValue(value: string | number): string | number {
  if (typeof value !== 'number') return value;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(rounded)) return rounded;
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function BaseStatRow({ label, value }: BaseStatRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-0.5 py-2.5 text-[15px] leading-tight last:border-b-0 sm:text-base">
      <span className="font-semibold text-slate-200">{label}</span>
      <span className="ml-3 shrink-0 text-right font-mono font-bold tabular-nums text-slate-50">{formatAttributeValue(value)}</span>
    </div>
  );
}

interface SpellStatRowProps {
  label: string;
  value: string | number;
}

function SpellStatRow({ label, value }: SpellStatRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-0.5 py-2.5 text-[15px] leading-tight last:border-b-0 sm:text-base">
      <span className="font-semibold text-slate-200">{label}</span>
      <span className="ml-3 shrink-0 text-right font-mono font-bold tabular-nums text-white">{formatStatValue(value)}</span>
    </div>
  );
}

export function PlayerStatsModal({
  playerClass,
  level,
  xp,
  talents,
  onClose,
}: PlayerStatsModalProps) {
  const b = getStatBreakdown(playerClass, level, talents);
  const regenSec = getManaRegenPerSecond(0, b.spirit);
  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const pctLabel = xpForNextLevel > 0 ? Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100)) : 100;

  return (
    <motion.div
      key="player-stats"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="ui-frame-divider-bottom ui-app-header bg-slate-900 px-4 py-3 sm:py-3.5">
        <div className="ui-app-header-slot" aria-hidden />
        <div className="ui-app-header-title">
          <h2 className="ui-heading text-base tracking-[0.08em] text-white sm:text-lg">
            {classDisplayName(playerClass)}
          </h2>
        </div>
        <div className="ui-app-header-slot-end">
          <button type="button" onClick={onClose} className="ui-close-button" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto sm:max-w-2xl">
        <div className="ui-frame-divider-bottom flex flex-col overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 px-6 pt-0 pb-3 sm:px-10 sm:pt-0 sm:pb-4">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.48, ease: [0.175, 0.885, 0.32, 1.275] }}
            className="mx-auto flex w-full max-w-xl flex-col items-center justify-start sm:max-w-2xl"
          >
            <div className="flex w-full max-w-xl flex-col items-stretch gap-3 sm:max-w-2xl sm:gap-4">
              <div className="flex w-full shrink-0 flex-col items-stretch gap-2 self-stretch sm:gap-2.5">
                <div className="flex w-full min-w-0 flex-col gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-6">
                  <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:justify-center sm:gap-10">
                    <div className="flex shrink-0 flex-col items-center gap-3">
                      <div className={getWrapperTransformClass()}>
                        <img
                          src={getIconUrl(playerClass)}
                          alt=""
                          draggable={false}
                          className={`h-[92px] w-[92px] select-none object-contain [filter:drop-shadow(0_4px_6px_rgba(0,0,0,0.7))] sm:h-[104px] sm:w-[104px] ${getTransformClass(playerClass)}`}
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-center sm:items-stretch sm:text-left">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Level</p>
                        <p className="mt-1 text-5xl font-black tabular-nums leading-none tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-6xl">
                          {level}
                        </p>
                      </div>
                      <div className="w-full space-y-2 pt-1">
                        <div className="flex items-end justify-between gap-3 border-b border-slate-700/70 pb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Experience
                          </span>
                          <span className="font-mono text-xs font-black tabular-nums text-slate-200">
                            <span>{xpIntoLevel}</span>
                            <span className="text-slate-500">/</span>
                            <span className="text-slate-400">{xpForNextLevel}</span>
                          </span>
                        </div>
                        <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-slate-800/90">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-800 via-violet-500 to-amber-300"
                            initial={false}
                            animate={{ width: `${pctLabel}%` }}
                            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                          />
                        </div>
                        <p className="text-[11px] font-medium tabular-nums text-slate-500">
                          {pctLabel.toFixed(1)}% into next level
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5">
          <StatPanel title="Attributes">
            <BaseStatRow label="Intellect" value={Math.round(b.intellect)} />
            <BaseStatRow label="Spirit" value={Math.round(b.spirit)} />
            <BaseStatRow label="Max Health" value={b.maxHealth} />
            <BaseStatRow label="Max Mana" value={b.maxMana} />
          </StatPanel>
          <StatPanel title="Affinities">
            <div className="border-b border-slate-800/80 px-0.5 py-2.5 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-200">Bonus Healing</span>
                <span className="ml-3 shrink-0 text-right font-mono font-bold tabular-nums text-emerald-200">
                  +{formatStatValue(b.totalHealingBonusPct)}%
                </span>
              </div>
              <p className="mt-1 text-[13px] text-slate-500">
                {formatStatValue(b.healingBonusPctFromSpirit)}% from Spirit ·{' '}
                {formatStatValue(b.healingBonusPctFromTalents)}% from talents
              </p>
            </div>
            <SpellStatRow label="Mana Regen" value={`${formatManaRegen(regenSec)}/s`} />
            <SpellStatRow label="Crit Chance" value={formatCritChance(b.critChancePct)} />
            <SpellStatRow label="Haste" value={formatCritChance(b.hastePct)} />
          </StatPanel>
        </div>
        <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
          <StatPanel title="">
            <div className="flex gap-3 px-0.5 py-2">
              <GameIcon iconPath={b.passiveTraitIcon} glow="spell" size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200/95">Class mastery</p>
                <p className="mt-2 text-base font-semibold tracking-tight text-slate-100">
                  {sentenceCaseLabel(b.passiveTraitName)}
                </p>
                <p className="ui-body mt-2 text-sm leading-relaxed text-slate-300">
                  {sentenceCaseBlock(b.passiveTraitDescription)}
                </p>
              </div>
            </div>
          </StatPanel>
          <StatPanel title="">
            <div className="border-b border-amber-500/15 px-0.5 pb-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200/95">
                Unique · {sentenceCaseLabel(b.uniqueStatLabel)}
              </p>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-300">Rating</span>
                <span className="font-mono text-lg font-black tabular-nums text-white">{formatStatValue(b.uniqueStatRating)}</span>
              </div>
            </div>
            <p className="ui-body px-0.5 pt-3 text-sm leading-relaxed text-slate-200">
              {sentenceCaseBlock(b.uniqueStatDescription)}
            </p>
          </StatPanel>
        </div>
      </div>
    </motion.div>
  );
}
