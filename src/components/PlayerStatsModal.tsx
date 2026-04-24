import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { buildPlayerStatBreakdown } from '../playerStats.ts';
import { getManaRegenPerSecond } from '../constants.ts';
import { CLASS_PORTRAIT_GLOW, CLASS_PORTRAIT_ICON } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';

const CLASS_LABEL: Record<ClassType, string> = {
  [ClassType.PRIEST]: 'Holy Priest',
  [ClassType.DRUID]: 'Resto Druid',
  [ClassType.PALADIN]: 'Holy Paladin',
};

interface PlayerStatsModalProps {
  playerClass: ClassType;
  level: number;
  talents: Talent[];
  onClose: () => void;
}

interface VerticalResourceBarProps {
  pool: number;
  fillClass: string;
  glowClass: string;
  valueClassName: string;
}

function VerticalResourceBar({ pool, fillClass, glowClass, valueClassName }: VerticalResourceBarProps) {
  const display = Math.max(0, Math.floor(pool));
  return (
    <div className="flex min-h-0 w-24 flex-col items-stretch gap-2 self-stretch sm:w-28">
      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-lg border-2 border-slate-600/95 bg-slate-950/95 shadow-[inset_0_3px_10px_rgba(0,0,0,0.72)] ${glowClass}`}
      >
        <motion.div
          className={`absolute bottom-0 left-0 right-0 rounded-b-md ${fillClass} shadow-[0_0_14px_rgba(0,0,0,0.4)]`}
          initial={false}
          animate={{ height: '100%' }}
          transition={{ type: 'tween', duration: 0.25 }}
        />
      </div>
      <span
        className={`shrink-0 whitespace-nowrap text-center font-mono text-sm font-black tabular-nums tracking-tight sm:text-base ${valueClassName}`}
      >
        {display}
      </span>
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
  return (
    <div className="overflow-hidden rounded border border-slate-600/90 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/95 px-2 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-100/95">{title}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.5} aria-hidden />
      </div>
      <div className="px-1.5 py-1.5">{children}</div>
    </div>
  );
}

interface BaseStatRowProps {
  label: string;
  value: string | number;
}

function BaseStatRow({ label, value }: BaseStatRowProps) {
  return (
    <div className="flex justify-between gap-2 px-1.5 py-1 text-[13px] leading-tight">
      <span className="font-semibold text-amber-200">{label}</span>
      <span className="font-mono font-bold tabular-nums text-green-400">{value}</span>
    </div>
  );
}

interface SpellStatRowProps {
  label: string;
  value: string | number;
}

function SpellStatRow({ label, value }: SpellStatRowProps) {
  return (
    <div className="flex justify-between gap-2 px-1.5 py-1 text-[13px] leading-tight">
      <span className="font-semibold text-amber-200">{label}</span>
      <span className="font-mono font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

export function PlayerStatsModal({
  playerClass,
  level,
  talents,
  onClose,
}: PlayerStatsModalProps) {
  const b = buildPlayerStatBreakdown(playerClass, level, talents);
  const regenSec = getManaRegenPerSecond(0, 0, b.spirit);

  return (
    <motion.div
      key="player-stats"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="flex w-full items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <h2 className="text-base font-black uppercase italic tracking-tighter text-white sm:text-lg">
          Character
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-800 p-2 text-white transition-colors hover:bg-red-600"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto sm:max-w-2xl">
        <div className="flex min-h-[44vh] max-h-[50vh] flex-col overflow-hidden border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-5 sm:min-h-0 sm:px-10 sm:py-6">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col items-center sm:max-w-2xl"
          >
            <p className="mb-2 w-full shrink-0 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-300 sm:mb-3 sm:text-base sm:tracking-[0.16em]">
              {CLASS_LABEL[playerClass]}
            </p>
            <div className="flex min-h-0 w-full max-w-xl flex-1 items-stretch justify-center gap-3 sm:max-w-2xl sm:gap-4">
              <VerticalResourceBar
                pool={b.maxHealth}
                fillClass="bg-gradient-to-t from-red-950 to-red-500"
                glowClass="shadow-[inset_0_0_0_1px_rgba(248,113,113,0.2)]"
                valueClassName="text-red-300"
              />
              <div className="flex w-[9rem] shrink-0 flex-col items-stretch gap-2 self-stretch sm:w-[11rem] sm:gap-2.5">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-slate-600 bg-slate-900/80 shadow-[0_16px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <GameIcon
                    iconPath={CLASS_PORTRAIT_ICON[playerClass]}
                    glow={CLASS_PORTRAIT_GLOW[playerClass]}
                    size="heroTall"
                    title={CLASS_LABEL[playerClass]}
                    className="rounded-none"
                  />
                </div>
                <p className="shrink-0 text-center text-sm font-bold uppercase tracking-widest text-slate-400 sm:text-base">
                  Level {level}
                </p>
              </div>
              <VerticalResourceBar
                pool={b.maxMana}
                fillClass="bg-gradient-to-t from-blue-900 to-sky-400"
                glowClass="shadow-[inset_0_0_0_1px_rgba(56,189,248,0.12)]"
                valueClassName="text-sky-300"
              />
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
          <StatPanel title="Base Stats">
            <BaseStatRow label="Intellect" value={b.intellect} />
            <BaseStatRow label="Spirit" value={b.spirit} />
            <BaseStatRow label="Health" value={b.maxHealth} />
            <BaseStatRow label="Mana" value={b.maxMana} />
          </StatPanel>
          <StatPanel title="Spell">
            <SpellStatRow label="Bonus Healing" value={b.bonusHealing} />
            <SpellStatRow label="Crit Chance" value={formatCritChance(b.critChancePct)} />
            <SpellStatRow label="Mana Regen" value={`${formatManaRegen(regenSec)}/s`} />
          </StatPanel>
        </div>
      </div>
    </motion.div>
  );
}
