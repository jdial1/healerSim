import { motion } from 'motion/react';
import { ScrollText, Star, Swords } from 'lucide-react';
import { INTRO_TUTORIAL_DUNGEON_ID } from '../tutorialConfig.ts';
import { DUNGEONS } from '../dungeons/index.ts';
import { pacingData } from '../constants.ts';

interface NavPrimerModalProps {
  onDismiss: () => void;
  talentPoints?: number;
}

export function NavPrimerModal({ onDismiss, talentPoints = 0 }: NavPrimerModalProps) {
  const introDungeon = DUNGEONS.find((d) => d.id === INTRO_TUTORIAL_DUNGEON_ID);
  const introName = introDungeon?.name ?? 'The Deadmines';
  const normalLabel = pacingData.paces.normal.label;

  return (
    <motion.div
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-primer-heading"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.35, ease: [0.175, 0.885, 0.32, 1.275] }}
        className="ui-panel relative max-h-[min(90dvh,34rem)] w-full max-w-md overflow-y-auto p-5 ring-1 ring-inset ring-slate-500/40 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="nav-primer-heading"
          className="ui-heading mb-3 text-center text-lg leading-tight tracking-[0.06em] text-white sm:text-xl"
        >
          Welcome back
        </h2>
        <p className="mb-4 text-center text-sm leading-relaxed text-slate-300">
          Use the bar at the bottom to switch between roster prep, progression, and content.
        </p>
        <ul className="mb-5 space-y-3 text-sm leading-snug text-slate-200">
          <li className="flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5">
            <ScrollText size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-bold text-amber-100">Character</span>
              <span className="text-slate-400"> — </span>
              level, XP, resource caps, stat breakdown.
            </span>
          </li>
          <li className="relative flex gap-3 rounded-lg border border-amber-800/45 bg-gradient-to-br from-amber-950/40 to-slate-950/80 px-3 py-2.5 pr-11 ring-1 ring-amber-500/15">
            <Star size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span className="min-w-0">
              <span className="font-bold text-amber-100">Talents</span>
              <span className="text-slate-400"> — </span>
              you earn{' '}
              <span className="font-semibold text-sky-200/95">talent points every level</span>. Spending them
              clears the next tier of the tree; keep investing to{' '}
              <span className="font-semibold text-amber-200/95">unlock deeper rows.</span>
            </span>
            {talentPoints > 0 ? (
              <span
                className="absolute right-2 top-1/2 inline-flex min-h-[1.35rem] min-w-[1.35rem] -translate-y-1/2 items-center justify-center rounded-full border border-red-200/85 bg-red-600 px-1 font-mono text-[11px] font-black leading-none text-white shadow-[0_0_12px_rgba(239,68,68,0.55)]"
                aria-hidden
              >
                {talentPoints}
              </span>
            ) : null}
          </li>
          <li className="flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5">
            <Swords size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-bold text-amber-100">Dungeons</span>
              <span className="text-slate-400"> — </span>
              queue a run on your chosen difficulty and pace when you're ready.
            </span>
          </li>
        </ul>
        <div className="mb-5 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-3 text-sm leading-relaxed text-slate-200">
          <p className="font-semibold text-sky-100">Tutorial</p>
          <p className="mt-2 text-slate-300">
            Open <span className="font-bold text-amber-200">Dungeons</span>, select{' '}
            <span className="font-bold text-amber-200">{introName}</span>, tap{' '}
            <span className="font-bold text-amber-200">Queue</span>, then pick the{' '}
            <span className="font-bold text-amber-200">{normalLabel}</span> pace to start the guided combat flow.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="ui-button-primary ui-state-frame ui-state-hover w-full py-3 text-center text-sm font-black uppercase tracking-widest text-amber-50"
        >
          Got it
        </button>
      </motion.div>
    </motion.div>
  );
}
