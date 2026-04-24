import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { ClassType, Talent } from '../types.ts';
import { buildPlayerStatBreakdown } from '../playerStats.ts';

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

export function PlayerStatsModal({
  playerClass,
  level,
  talents,
  onClose,
}: PlayerStatsModalProps) {
  const b = buildPlayerStatBreakdown(playerClass, level, talents);

  return (
    <motion.div
      key="player-stats"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="flex w-full items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div>
          <h2 className="text-lg font-black uppercase italic tracking-tighter text-white sm:text-xl">
            Character
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {CLASS_LABEL[playerClass]} · Level {level}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-800 p-2 text-white transition-colors hover:bg-red-600"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 py-5">
        <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
            Primary stats
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Intellect</div>
              <div className="font-mono text-xl font-black text-amber-200">{b.intellect}</div>
              <div className="mt-1 text-[10px] leading-snug text-slate-500">
                Base + growth per level for your spec.
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Spirit</div>
              <div className="font-mono text-xl font-black text-emerald-300">{b.spirit}</div>
              <div className="mt-1 text-[10px] leading-snug text-slate-500">
                Adds healing strength (see below).
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
            Mana pool
          </h3>
          <ul className="space-y-2 font-mono text-xs text-slate-300 sm:text-sm">
            <li className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
              <span className="text-slate-500">
                Intellect × {b.manaPerIntellect}
              </span>
              <span className="shrink-0 text-amber-200/90">
                {b.intellect} × {b.manaPerIntellect} = {b.manaFromIntellect}
              </span>
            </li>
            <li className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
              <span className="text-slate-500">Talents (flat)</span>
              <span className="shrink-0 text-slate-200">+{b.manaFromTalents}</span>
            </li>
            <li className="flex justify-between gap-2 pt-1 font-black text-white">
              <span>Max mana</span>
              <span>{b.maxMana}</span>
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
            Healing strength
          </h3>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Direct heals and HoT tick sizes multiply your spell's base numbers. Bonuses from Spirit
            and talent healing% add together before the multiplier.
          </p>
          <ul className="space-y-2 font-mono text-xs text-slate-300 sm:text-sm">
            <li className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
              <span className="text-slate-500">
                Spirit × {b.healingPctPerSpirit}% per point
              </span>
              <span className="shrink-0 text-emerald-300/90">
                +{b.healingBonusPctFromSpirit}%
              </span>
            </li>
            <li className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
              <span className="text-slate-500">Talents (healing %)</span>
              <span className="shrink-0 text-slate-200">+{b.healingBonusPctFromTalents}%</span>
            </li>
            <li className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
              <span className="text-slate-500">Total bonus</span>
              <span className="shrink-0 text-white">+{b.totalHealingBonusPct}%</span>
            </li>
            <li className="flex justify-between gap-2 pt-1 font-black text-white">
              <span>Multiplier on spell base</span>
              <span>×{b.healingEffectMultiplier}</span>
            </li>
          </ul>
          <p className="mt-3 text-[10px] text-slate-600">
            Crits apply separately (×1.5) after this multiplier.
          </p>
        </section>
      </div>
    </motion.div>
  );
}
