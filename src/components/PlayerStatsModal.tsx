import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { buildPlayerStatBreakdown } from '../playerStats.ts';
import { getManaRegenPerSecond } from '../constants.ts';
import { classDisplayName } from '../classUiData.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { classIconBorderClass, classIconTransformClass, classIconUrl, classIconWrapperTransformClass } from '../classIcons.ts';
import { GameIcon } from './GameIcon.tsx';

interface PlayerStatsModalProps {
  playerClass: ClassType;
  level: number;
  xp: number;
  talents: Talent[];
  onClose: () => void;
}

interface VerticalResourceBarProps {
  pool: number;
  fillClass: string;
  trackClass: string;
  valueClassName: string;
  label: string;
}

function VerticalResourceBar({ pool, fillClass, trackClass, valueClassName, label }: VerticalResourceBarProps) {
  const display = Math.max(0, Math.floor(pool));
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 rounded-md bg-slate-900/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="ui-heading pt-0.5 text-xs tracking-[0.1em] text-slate-200">{label}</div>
        <span className={`shrink-0 whitespace-nowrap font-mono text-sm font-black tabular-nums tracking-tight sm:text-base ${valueClassName}`}>
          {display}
        </span>
      </div>
      <div className={`relative h-3 w-full overflow-hidden rounded-sm ${trackClass}`}>
        <div className={`h-full w-full ${fillClass}`} />
      </div>
    </div>
  );
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
        <div className="ui-frame-divider-bottom flex items-center justify-between bg-slate-800/95 px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-100/95">{title}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.5} aria-hidden />
        </div>
      ) : null}
      <div className="px-1.5 py-1.5">{children}</div>
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
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 px-1.5 py-1 text-[13px] leading-tight">
      <span className="font-semibold text-slate-200">{label}</span>
      <span className="text-right font-mono font-bold tabular-nums text-slate-100">{formatAttributeValue(value)}</span>
    </div>
  );
}

interface SpellStatRowProps {
  label: string;
  value: string | number;
}

function SpellStatRow({ label, value }: SpellStatRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 px-1.5 py-1 text-[13px] leading-tight">
      <span className="font-semibold text-slate-300">{label}</span>
      <span className="text-right font-mono font-bold tabular-nums text-white">{formatStatValue(value)}</span>
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
  const b = buildPlayerStatBreakdown(playerClass, level, talents);
  const regenSec = getManaRegenPerSecond(0, b.spirit);
  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const xpRingPct = xpForNextLevel > 0 ? Math.min(1, Math.max(0, xpIntoLevel / xpForNextLevel)) : 0;
  const ringSize = 132;
  const ringStroke = 8;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringLength = 2 * Math.PI * ringRadius;

  return (
    <motion.div
      key="player-stats"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="ui-frame-divider-bottom flex w-full items-center justify-between bg-slate-900 px-4 py-2.5">
        <h2 className="ui-heading text-base tracking-[0.08em] text-white sm:text-lg">
          {classDisplayName(playerClass)}
        </h2>
        <button type="button" onClick={onClose} className="ui-close-button">
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto sm:max-w-2xl">
        <div className="ui-frame-divider-bottom flex min-h-[44vh] max-h-[50vh] flex-col overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-5 sm:min-h-0 sm:px-10 sm:py-6">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col items-center sm:max-w-2xl"
          >
            <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col items-stretch justify-center gap-3 sm:max-w-2xl sm:gap-4">
              <div className="flex w-full shrink-0 flex-col items-stretch gap-2 self-stretch sm:gap-2.5">
                <div className="flex h-full items-center justify-center">
                  <div className="relative flex items-center justify-center">
                      <svg
                        width={ringSize}
                        height={ringSize}
                        viewBox={`0 0 ${ringSize} ${ringSize}`}
                        className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2"
                        aria-hidden
                      >
                        <circle
                          cx={ringSize / 2}
                          cy={ringSize / 2}
                          r={ringRadius}
                          fill="none"
                          className="stroke-slate-700/90"
                          strokeWidth={ringStroke}
                        />
                        <motion.circle
                          cx={ringSize / 2}
                          cy={ringSize / 2}
                          r={ringRadius}
                          fill="none"
                          className="stroke-amber-400"
                          strokeWidth={ringStroke}
                          strokeLinecap="round"
                          strokeDasharray={ringLength}
                          initial={false}
                          animate={{ strokeDashoffset: ringLength * (1 - xpRingPct) }}
                          transition={{ type: 'tween', duration: 0.4 }}
                          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                        />
                      </svg>
                      <div
                        className={`relative z-10 rounded-xl border-2 bg-slate-900 p-3 text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] sm:p-3.5 ${classIconBorderClass(playerClass)}`}
                      >
                        <div className={classIconWrapperTransformClass()}>
                          <img
                            src={classIconUrl(playerClass)}
                            alt=""
                            draggable={false}
                            className={`h-[104px] w-[104px] select-none object-contain [filter:drop-shadow(0_3px_3px_rgba(0,0,0,0.65))] ${classIconTransformClass(playerClass)}`}
                          />
                        </div>
                      </div>
                  </div>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 rounded-md bg-slate-900/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="ui-heading pt-0.5 text-xs tracking-[0.1em] text-slate-200">Level</div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-sm font-black tabular-nums tracking-tight text-amber-200 sm:text-base">
                      {level}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="ui-heading pt-0.5 text-xs tracking-[0.1em] text-slate-300/90">XP</div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-sm font-black tabular-nums tracking-tight text-amber-300/90 sm:text-base">
                      {xpIntoLevel}/{xpForNextLevel}
                    </span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-sm bg-slate-950">
                    <motion.div
                      className="h-full bg-gradient-to-r from-amber-700 via-amber-500 to-amber-300"
                      initial={false}
                      animate={{ width: `${xpRingPct * 100}%` }}
                      transition={{ type: 'tween', duration: 0.3 }}
                    />
                  </div>
                </div>
              </div>
              <VerticalResourceBar
                pool={b.maxHealth}
                label="Health"
                fillClass="bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-400"
                trackClass="bg-slate-950"
                valueClassName="text-emerald-300"
              />
              <VerticalResourceBar
                pool={b.maxMana}
                label="Mana"
                fillClass="bg-gradient-to-r from-cyan-950 via-cyan-800 to-sky-400"
                trackClass="bg-slate-950"
                valueClassName="text-sky-200"
              />
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
          <StatPanel title="Attributes">
            <BaseStatRow label="Intellect" value={b.intellect} />
            <BaseStatRow label="Spirit" value={b.spirit} />
            <BaseStatRow label="Health" value={b.maxHealth} />
            <BaseStatRow label="Mana" value={b.maxMana} />
          </StatPanel>
          <StatPanel title="Affinities">
            <SpellStatRow label="Bonus Healing" value={b.bonusHealing} />
            <SpellStatRow label="Crit Chance" value={formatCritChance(b.critChancePct)} />
            <SpellStatRow label="Mana Regen" value={`${formatManaRegen(regenSec)}/s`} />
            <SpellStatRow label="Haste" value={formatCritChance(b.hastePct)} />
          </StatPanel>
        </div>
        <div className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
          <StatPanel title="">
            <div className="flex gap-3 px-1.5 py-2">
              <GameIcon iconPath={b.passiveTraitIcon} glow="spell" size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase tracking-wide text-amber-100">{b.passiveTraitName}</p>
                <p className="mt-1 text-[12px] leading-snug text-slate-400">{b.passiveTraitDescription}</p>
              </div>
            </div>
          </StatPanel>
          <StatPanel title="">
            <div className="px-1.5 py-2">
              <SpellStatRow label={b.uniqueStatLabel} value={String(b.uniqueStatRating)} />
              <p className="mt-2 px-1.5 text-[12px] leading-snug text-slate-400">{b.uniqueStatDescription}</p>
            </div>
          </StatPanel>
        </div>
      </div>
    </motion.div>
  );
}
