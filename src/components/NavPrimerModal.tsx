import { motion } from 'motion/react';
import { ScrollText, Star, Swords } from 'lucide-react';
import { DUNGEONS } from '../dungeons/index.ts';
import { INTRO_TUTORIAL_DUNGEON_ID } from '../tutorialConfig.ts';
import { pacingData } from '../constants.ts';

interface NavPrimerModalProps {
  onDismiss: () => void;
}

export function NavPrimerModal({ onDismiss }: NavPrimerModalProps) {
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
        className="ui-panel relative max-h-[min(90dvh,32rem)] w-full max-w-md overflow-y-auto p-5 ring-1 ring-inset ring-slate-500/40 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="nav-primer-heading"
          className="ui-heading mb-4 text-center text-lg leading-tight tracking-[0.06em] text-white sm:text-xl"
        >
          Getting around
        </h2>
        <p className="mb-4 text-center text-sm leading-relaxed text-slate-300">
          Use the bar at the bottom of the screen to move between main areas.
        </p>
        <ul className="mb-5 space-y-3 text-sm leading-snug text-slate-200">
          <li className="flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5">
            <ScrollText size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-bold text-amber-100">Character</span>
              <span className="text-slate-400"> — </span>
              your level, XP, and stats sheet.
            </span>
          </li>
          <li className="flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5">
            <Star size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-bold text-amber-100">Talents</span>
              <span className="text-slate-400"> — </span>
              spend talent points after you level up.
            </span>
          </li>
          <li className="flex gap-3 rounded-lg border border-amber-900/35 bg-amber-950/25 px-3 py-2.5">
            <Swords size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <span>
              <span className="font-bold text-amber-100">Dungeons</span>
              <span className="text-slate-400"> — </span>
              pick a dungeon and queue
            </span>
          </li>
        </ul>
        <div className="mb-5 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-3 text-sm leading-relaxed text-slate-200">
          <p className="font-semibold text-sky-100">Start the tutorial</p>
          <p className="mt-2 text-slate-300">
            Tap{' '}
            <span className="font-bold text-amber-200">Queue</span>, wait until the group is ready, then choose the{' '}
            <span className="font-bold text-amber-200">{normalLabel}</span> pace to enter and begin the guided combat
            tutorial.
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
