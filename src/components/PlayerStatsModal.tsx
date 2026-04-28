import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { buildPlayerStatBreakdown } from '../playerStats.ts';
import { getManaRegenPerSecond } from '../constants.ts';
import { classDisplayName } from '../classUiData.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { sentenceCaseBlock, sentenceCaseLabel } from '../gameUiText.ts';
import { classIconTransformClass, classIconUrl, classIconWrapperTransformClass } from '../classIcons.ts';
import { GameIcon } from './GameIcon.tsx';

interface PlayerStatsModalProps {
  playerClass: ClassType;
  level: number;
  xp: number;
  talents: Talent[];
  onClose: () => void;
}

interface ResourceBarRowProps {
  value: number;
  fillClass: string;
  trackClass: string;
  valueClassName: string;
  label: string;
  max?: number;
  percent?: number;
}

function ResourceBarRow({
  value,
  fillClass,
  trackClass,
  valueClassName,
  label,
  max,
  percent,
}: ResourceBarRowProps) {
  const displayValue = Math.max(0, Math.floor(value));
  const displayMax = max === undefined ? null : Math.max(0, Math.floor(max));
  const fillPercent =
    percent === undefined ? 100 : Math.min(100, Math.max(0, percent));
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="pt-0.5 text-xs font-semibold tracking-wide text-slate-400 sm:text-sm">{label}</div>
        <span className={`shrink-0 whitespace-nowrap font-mono text-base font-black tabular-nums tracking-tight sm:text-lg ${valueClassName}`}>
          {displayValue}
          {displayMax !== null ? <span className="text-slate-400">/{displayMax}</span> : null}
        </span>
      </div>
      <div className={`relative h-3 w-full overflow-hidden rounded-sm ${trackClass}`}>
        <motion.div
          className={`h-full ${fillClass}`}
          initial={false}
          animate={{ width: `${fillPercent}%` }}
          transition={{ type: 'tween', duration: 0.3 }}
        />
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
  const b = buildPlayerStatBreakdown(playerClass, level, talents);
  const regenSec = getManaRegenPerSecond(0, b.spirit);
  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const xpRingPct = xpForNextLevel > 0 ? Math.min(1, Math.max(0, xpIntoLevel / xpForNextLevel)) : 0;

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
                <div className="flex w-full min-w-0 flex-col gap-4 rounded-md bg-slate-900/70 px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-3">
                  <div className="flex w-full min-w-0 flex-col gap-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
                      <div className="pt-0.5 text-xs font-semibold tracking-wide text-slate-400">Level</div>
                      <div className="row-span-2 justify-self-center rounded-xl bg-transparent p-0 text-white shadow-none">
                        <div className={classIconWrapperTransformClass()}>
                          <img
                            src={classIconUrl(playerClass)}
                            alt=""
                            draggable={false}
                            className={`h-[76px] w-[76px] select-none object-contain [filter:drop-shadow(0_3px_3px_rgba(0,0,0,0.65))] sm:h-[84px] sm:w-[84px] ${classIconTransformClass(playerClass)}`}
                          />
                        </div>
                      </div>
                      <span className="justify-self-end shrink-0 whitespace-nowrap font-mono text-lg font-black tabular-nums tracking-tight text-slate-100 sm:text-xl">
                        {level}
                      </span>

                      <div className="pt-0.5 text-xs font-semibold tracking-wide text-slate-400">XP</div>
                      <span className="justify-self-end shrink-0 whitespace-nowrap font-mono text-lg font-black tabular-nums tracking-tight text-slate-100 sm:text-xl">
                        {xpIntoLevel}
                        <span className="text-slate-400">/</span>
                        {xpForNextLevel}
                      </span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-sm bg-slate-950">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-800 via-amber-500 to-amber-300"
                        initial={false}
                        animate={{ width: `${xpRingPct * 100}%` }}
                        transition={{ type: 'tween', duration: 0.3 }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-3">
                    <ResourceBarRow
                      value={b.maxHealth}
                      max={b.maxHealth}
                      percent={100}
                      label="Health"
                      fillClass="bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-400"
                      trackClass="bg-slate-950"
                      valueClassName="text-emerald-300"
                    />
                    <ResourceBarRow
                      value={b.maxMana}
                      max={b.maxMana}
                      percent={100}
                      label="Mana"
                      fillClass="bg-gradient-to-r from-cyan-950 via-cyan-800 to-sky-400"
                      trackClass="bg-slate-950"
                      valueClassName="text-sky-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5">
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
        <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
          <StatPanel title="">
            <div className="flex gap-3 px-0.5 py-1">
              <GameIcon iconPath={b.passiveTraitIcon} glow="spell" size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold tracking-tight text-slate-100">
                  {sentenceCaseLabel(b.passiveTraitName)}
                </p>
                <p className="ui-body mt-1.5 text-sm leading-snug text-slate-300">
                  {sentenceCaseBlock(b.passiveTraitDescription)}
                </p>
              </div>
            </div>
          </StatPanel>
          <StatPanel title="">
            <div className="px-0.5 py-1">
              <SpellStatRow label={b.uniqueStatLabel} value={String(b.uniqueStatRating)} />
              <p className="ui-body mt-2 px-0.5 text-sm leading-snug text-slate-300">
                {sentenceCaseBlock(b.uniqueStatDescription)}
              </p>
            </div>
          </StatPanel>
        </div>
      </div>
    </motion.div>
  );
}
