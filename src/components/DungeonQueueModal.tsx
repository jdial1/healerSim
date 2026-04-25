import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Swords, Plus, X } from 'lucide-react';
import { type Dungeon } from '../types.ts';

interface DungeonQueueModalProps {
  dungeon: Dungeon;
  onClose: () => void;
  onConfirmEnter: (dungeon: Dungeon) => void;
  enterButtonClassName: string;
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

export function DungeonQueueModal({
  dungeon,
  onClose,
  onConfirmEnter,
  enterButtonClassName,
}: DungeonQueueModalProps) {
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
        className="relative w-full max-w-sm rounded-lg border-2 border-slate-400/70 bg-slate-950/92 p-5 shadow-[0_0_40px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-slate-500/40"
        style={
          borderFlash
            ? {
                animation: 'lfg-border-flash 0.42s ease-in-out 4',
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 z-10 rounded-full border border-slate-600 bg-slate-900/90 p-1 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
          aria-label="Close"
        >
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>

        <h2
          id="dungeon-queue-heading"
          className="mb-5 truncate pr-9 pt-0.5 text-center text-xl font-black uppercase italic leading-tight tracking-tighter text-white sm:text-2xl"
        >
          {dungeon.name}
        </h2>

        <div className="flex items-end justify-center gap-4 sm:gap-6">
          <RoleSlot
            current={tank}
            max={1}
            icon={<Shield className="h-7 w-7" strokeWidth={2.2} />}
            activeTint="text-slate-200"
            dimTint="text-slate-600"
            ringActive="border-slate-400/80 shadow-[0_0_14px_rgba(148,163,184,0.2)]"
            ringDim="border-slate-700/90"
          />
          <RoleSlot
            current={1}
            max={1}
            icon={<Plus className="h-7 w-7" strokeWidth={2.8} />}
            activeTint="text-emerald-400"
            dimTint="text-emerald-700"
            ringActive="border-emerald-500/70 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
            ringDim="border-emerald-900/50"
            forceLit
          />
          <RoleSlot
            current={dps}
            max={3}
            icon={<Swords className="h-7 w-7" strokeWidth={2.2} />}
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
              className="mt-5"
            >
              <button
                type="button"
                onClick={() => onConfirmEnter(dungeon)}
                className={`w-full rounded-lg py-3.5 text-center text-base font-black uppercase tracking-wider ${enterButtonClassName}`}
              >
                Enter Dungeon
              </button>
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
        className={`flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-2 bg-slate-950/80 transition-all duration-300 ${
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
