import { motion } from 'motion/react';
import { Skull, Trophy, X } from 'lucide-react';
import { DungeonRunOutcome, DungeonFailureReason } from '../types.ts';

function failureMessage(reason: DungeonFailureReason): string {
  if (reason === 'PARTY_WIPE') return 'The entire party was defeated.';
  return 'The healer was defeated before the encounter could be stabilized.';
}

interface DungeonOutcomeModalProps {
  outcome: DungeonRunOutcome;
  onDismiss: () => void;
}

export function DungeonOutcomeModal({ outcome, onDismiss }: DungeonOutcomeModalProps) {
  const isSuccess = outcome.kind === 'success';

  return (
    <motion.div
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
    >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dungeon-outcome-title"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="relative w-full max-w-md overflow-hidden rounded-lg border border-slate-800 bg-[#070d1a] shadow-[0_0_60px_rgba(0,0,0,0.65)]"
        >
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2 top-2 z-10 rounded border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
            aria-label="Close"
          >
            <X size={14} />
          </button>

          <div
            className={`border-b px-4 pb-4 pt-5 sm:px-5 sm:pt-6 ${
              isSuccess
                ? 'border-amber-900/40 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.12),transparent_55%)]'
                : 'border-red-950/50 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.1),transparent_55%)]'
            }`}
          >
            <div className="flex items-start gap-3 pr-8">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border ${
                  isSuccess
                    ? 'border-amber-700/50 bg-amber-950/60 text-amber-400'
                    : 'border-red-900/50 bg-red-950/50 text-red-400'
                }`}
              >
                {isSuccess ? <Trophy size={22} strokeWidth={2} /> : <Skull size={22} strokeWidth={2} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 sm:text-[8px]">
                  {isSuccess ? 'Dungeon complete' : 'Run failed'}
                </p>
                <h2
                  id="dungeon-outcome-title"
                  className="mt-0.5 text-lg font-black uppercase italic leading-tight tracking-tight text-white sm:text-xl"
                >
                  {outcome.dungeonName}
                </h2>
                {isSuccess ? (
                  <p className="mt-1 text-[11px] font-bold text-slate-400 sm:text-xs">
                    {outcome.bossName} has fallen.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] font-bold leading-snug text-slate-400 sm:text-xs">
                    {failureMessage(outcome.reason)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {isSuccess ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400">
                    +{outcome.xpGained} XP
                  </span>
                  {outcome.levelUp ? (
                    <span className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                      Level up
                    </span>
                  ) : null}
                </div>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Loot</p>
                <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
                  {outcome.loot.map((item) => (
                    <li
                      key={item}
                      className="rounded border border-slate-800/90 bg-slate-900/50 px-3 py-2 text-[12px] font-bold text-slate-200 sm:text-sm"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <button
              type="button"
              onClick={onDismiss}
              className="mt-5 w-full rounded-sm border border-slate-700 bg-slate-800 py-2.5 text-[11px] font-black uppercase italic tracking-widest text-white transition-colors hover:border-slate-500 hover:bg-slate-700 active:scale-[0.99] sm:mt-6"
            >
              Continue
            </button>
          </div>
        </motion.div>
    </motion.div>
  );
}
