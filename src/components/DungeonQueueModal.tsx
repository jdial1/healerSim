import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { type Dungeon, type DungeonPace } from '../types.ts';
import { DUNGEON_PACES, dungeonPaceXpMultiplier, pacingData } from '../constants.ts';
import { GameIcon } from './GameIcon.tsx';

interface DungeonQueueModalProps {
  dungeon: Dungeon;
  onClose: () => void;
  onConfirmEnter: (dungeon: Dungeon, pace: DungeonPace) => void;
}

function shuffleRoles(): ('tank' | 'dps')[] {
  const roles: ('tank' | 'dps')[] = ['tank', 'dps', 'dps', 'dps'];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = roles[i]!;
    const b = roles[j]!;
    roles[i] = b;
    roles[j] = a;
  }
  return roles;
}

const PACE_ICON_PATHS: Record<string, string> = {
  Zap: 'lorc/crossed-swords',
  Gauge: 'lorc/winged-shield',
  Snail: 'wow/spell_nature_tranquility',
};

const PACE_THEME_CLASSES: Record<
  string,
  { ring: string; labelClass: string; subClass: string; selected: string }
> = {
  emerald: {
    ring: 'ui-state-frame ui-state-hover bg-slate-900/90',
    labelClass: 'text-emerald-100',
    subClass: 'text-emerald-300/90',
    selected: 'ui-state-frame ui-state-selected bg-emerald-950/70',
  },
  amber: {
    ring: 'ui-state-frame ui-state-hover bg-slate-900/90',
    labelClass: 'text-amber-100',
    subClass: 'text-amber-300/90',
    selected: 'ui-state-frame ui-state-selected bg-amber-950/70',
  },
  sky: {
    ring: 'ui-state-frame ui-state-hover bg-slate-900/90',
    labelClass: 'text-cyan-100',
    subClass: 'text-cyan-300/90',
    selected: 'ui-state-frame ui-state-selected bg-cyan-950/70',
  },
};

const PACE_OPTIONS = DUNGEON_PACES.map((pace) => {
  const def = pacingData.paces[pace];
  const theme = PACE_THEME_CLASSES[def.theme]!;
  return {
    pace,
    label: def.label,
    trashSec: def.trashSec,
    bossSec: def.bossSec,
    iconPath: PACE_ICON_PATHS[def.icon] ?? 'lorc/holy-grail',
    ring: theme.ring,
    labelClass: theme.labelClass,
    subClass: theme.subClass,
    selected: theme.selected,
  };
});

export function DungeonQueueModal({ dungeon, onClose, onConfirmEnter }: DungeonQueueModalProps) {
  const [tank, setTank] = useState(0);
  const [dps, setDps] = useState(0);
  const [groupReady, setGroupReady] = useState(false);
  const [borderFlash, setBorderFlash] = useState(false);

  useEffect(() => {
    setTank(0);
    setDps(0);
    setGroupReady(false);
    setBorderFlash(false);

    let cancelled = false;
    const totalMs = 1000 + 3000 * Math.random() ** 2;
    const roles = shuffleRoles();
    const events = roles
      .map((role) => ({ role, t: Math.random() * totalMs }))
      .sort((a, b) => a.t - b.t);

    const ids: number[] = [];
    let completed = 0;
    for (const { role, t } of events) {
      ids.push(
        window.setTimeout(() => {
          if (cancelled) return;
          if (role === 'tank') setTank(1);
          else setDps((d) => Math.min(3, d + 1));
          completed += 1;
          if (completed === 4) {
            setGroupReady(true);
            setBorderFlash(true);
            window.setTimeout(() => {
              if (!cancelled) setBorderFlash(false);
            }, 1600);
          }
        }, t),
      );
    }

    return () => {
      cancelled = true;
      for (const id of ids) window.clearTimeout(id);
    };
  }, [dungeon.id]);

  return (
    <motion.div
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[108] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dungeon-queue-heading"
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="ui-panel relative w-full max-w-sm p-5 ring-1 ring-inset ring-slate-500/40"
        style={
          borderFlash
            ? {
                animation: 'lfg-border-flash 0.42s ease-in-out 4',
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="ui-close-button absolute right-2.5 top-2.5 z-10 p-1" aria-label="Close">
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>

        <h2
          id="dungeon-queue-heading"
          className="ui-heading mb-5 pr-9 pt-0.5 text-center text-xl leading-tight tracking-[0.06em] text-white sm:text-2xl"
        >
          {dungeon.name}
        </h2>

        <div className="flex items-end justify-center gap-4 sm:gap-6">
          <RoleSlot
            current={tank}
            max={1}
            icon={<GameIcon iconPath="lorc/winged-shield" glow="spell" size="sm" imageFit="cover" />}
            activeTint="text-slate-200"
            dimTint="text-slate-600"
            ringActive="border-slate-400/80 shadow-[0_0_14px_rgba(148,163,184,0.2)]"
            ringDim="border-slate-700/90"
          />
          <RoleSlot
            current={1}
            max={1}
            icon={<GameIcon iconPath="wow/spell_holy_renew" glow="spell" size="sm" imageFit="cover" />}
            activeTint="text-emerald-400"
            dimTint="text-emerald-700"
            ringActive="border-emerald-500/70 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
            ringDim="border-emerald-900/50"
            forceLit
          />
          <RoleSlot
            current={dps}
            max={3}
            icon={<GameIcon iconPath="lorc/crossed-swords" glow="debuff" size="sm" imageFit="cover" />}
            activeTint="text-red-400"
            dimTint="text-red-900/80"
            ringActive="border-red-500/60 shadow-[0_0_14px_rgba(248,113,113,0.25)]"
            ringDim="border-red-950/80"
          />
        </div>

        <AnimatePresence mode="wait">
          {groupReady ? (
            <motion.div
              key="enter"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mt-5 space-y-2"
            >
              <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Dungeon pace
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PACE_OPTIONS.map(({ pace, label, trashSec, bossSec, iconPath, ring, labelClass, subClass, selected }) => (
                  <button
                    key={pace}
                    type="button"
                    onClick={() => onConfirmEnter(dungeon, pace)}
                    className={`flex flex-col items-center gap-1 rounded-lg px-1.5 py-2.5 text-center transition-colors ${pace === 'normal' ? selected : ring}`}
                  >
                    <GameIcon iconPath={iconPath} glow="spell" size="sm" imageFit="cover" />
                    <span className={`text-[11px] font-black uppercase leading-tight tracking-tight ${labelClass}`}>
                      {label}
                    </span>
                    <span className={`font-mono text-[9px] font-bold tabular-nums leading-none ${subClass}`}>
                      {trashSec}s / {bossSec}s
                    </span>
                    <span className={`font-mono text-[9px] font-bold tabular-nums leading-none ${subClass}`}>
                      ×{dungeonPaceXpMultiplier(pace)} XP
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-5 text-center text-xs font-bold uppercase tracking-widest text-slate-500"
            >
              Looking for group…
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function RoleSlot({
  current,
  max,
  icon,
  activeTint,
  dimTint,
  ringActive,
  ringDim,
  forceLit,
}: {
  current: number;
  max: number;
  icon: ReactNode;
  activeTint: string;
  dimTint: string;
  ringActive: string;
  ringDim: string;
  forceLit?: boolean;
}) {
  const lit = forceLit || current >= max;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`ui-state-frame flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-slate-950/80 p-1 transition-all duration-300 ${
          lit ? ringActive : ringDim
        } ${lit ? activeTint : dimTint}`}
      >
        {icon}
      </div>
      <span className="font-mono text-sm font-bold tabular-nums text-white">
        {current}/{max}
      </span>
    </div>
  );
}
