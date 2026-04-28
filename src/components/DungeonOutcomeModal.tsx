import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Skull, Trophy, X } from 'lucide-react';
import { DungeonRunOutcome, DungeonFailureReason } from '../types.ts';
import { SPELLS } from '../constants.ts';
import {
  calculateSpellRank,
  classSpellOrder,
  effectivePrimaryStats,
  spellHealingMultiplierFromProgress,
} from '../playerStats.ts';
import { GameIcon } from './GameIcon.tsx';
import { glowForSpellId } from '../gameIcons.ts';
import { manaPotionDisplayName, manaPotionIconPath } from '../manaPotionIcon.ts';
import {
  spellDisplayManaCost,
  spellEffectTooltipText,
  spellTooltipRankLabel,
} from '../spellTooltip.ts';

function failureMessage(reason: DungeonFailureReason): string {
  if (reason === 'PARTY_WIPE') return 'The entire party was defeated.';
  return 'The healer was defeated before the encounter could be stabilized.';
}

function compactScaled(value: number, scale: number, frac: number): string {
  return String(+(value / scale).toFixed(frac));
}

function formatHealCompact(n: number, maxFracBelowK: number, roundAbs: boolean): string {
  const v = roundAbs ? Math.round(Math.abs(n)) : Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (v >= 1_000_000_000) {
    return `${sign}${compactScaled(v, 1_000_000_000, 2)}B`;
  }
  if (v >= 1_000_000) {
    return `${sign}${compactScaled(v, 1_000_000, 2)}M`;
  }
  if (v >= 1000) {
    return `${sign}${compactScaled(v, 1000, 1)}k`;
  }
  const x = roundAbs ? Math.round(v) : v;
  return `${sign}${x.toLocaleString('en-US', { maximumFractionDigits: maxFracBelowK, minimumFractionDigits: 0 })}`;
}

interface DungeonOutcomeModalProps {
  outcome: DungeonRunOutcome;
  onDismiss: () => void;
}

export function DungeonOutcomeModal({ outcome, onDismiss }: DungeonOutcomeModalProps) {
  const isSuccess = outcome.kind === 'success';
  const levelUpOnly = isSuccess && outcome.successFlavor === 'level_up';
  const cls = outcome.playerClass;
  const order = cls ? classSpellOrder(cls) : [];
  const spellRewardIds = [...outcome.upgradedSpellIds].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const showRewards =
    outcome.levelUp && (spellRewardIds.length > 0 || outcome.upgradedPotion);

  const [rewardTipSpellId, setRewardTipSpellId] = useState<string | null>(null);
  const postStats = outcome.postStats;

  useEffect(() => {
    setRewardTipSpellId(null);
  }, [outcome.dungeonName, outcome.kind, outcome.levelAfter, spellRewardIds.join(',')]);

  const rewardSpellTipCtx =
    cls && spellRewardIds.length > 0
      ? {
          spellHealingMultiplier: spellHealingMultiplierFromProgress(cls, outcome.levelAfter, []),
          spirit: effectivePrimaryStats(cls, outcome.levelAfter).spirit,
          playerLevel: outcome.levelAfter,
          playerClass: cls,
          unlockedSpells: spellRewardIds,
        }
      : null;

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
        className="relative max-h-[90vh] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-lg border border-slate-800 bg-[#070d1a] shadow-[0_0_60px_rgba(0,0,0,0.65)]"
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
                {levelUpOnly ? 'Level up' : isSuccess ? 'Dungeon complete' : 'Run failed'}
              </p>
              <h2
                id="dungeon-outcome-title"
                className="mt-0.5 text-lg font-black uppercase italic leading-tight tracking-tight text-white sm:text-xl"
              >
                {outcome.dungeonName}
              </h2>
              {isSuccess ? (
                <p className="mt-1 text-[11px] font-bold text-slate-400 sm:text-xs">
                  {levelUpOnly ? 'Experience threshold reached.' : `${outcome.bossName} has fallen.`}
                </p>
              ) : (
                <p className="mt-1 text-[11px] font-bold leading-snug text-slate-400 sm:text-xs">
                  {failureMessage(outcome.reason)}
                  {outcome.endlessWavesCleared !== undefined ? (
                    <span className="mt-1 block text-fuchsia-300/90">
                      Bosses defeated: {outcome.endlessWavesCleared}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {isSuccess ? (
            <div className="flex flex-col items-center gap-3">
              <span className="rounded-lg border border-blue-800/60 bg-slate-950/90 px-6 py-4 text-2xl font-black uppercase tracking-widest text-blue-300 shadow-[0_0_24px_rgba(59,130,246,0.15)] sm:px-8 sm:py-5 sm:text-3xl">
                +{outcome.xpGained} XP
              </span>
              {outcome.levelUp ? (
                <span className="rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-amber-300 sm:text-sm">
                  Level up
                </span>
              ) : null}
            </div>
          ) : outcome.xpGained > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <span className="rounded-lg border border-slate-700/80 bg-slate-950/90 px-6 py-4 text-2xl font-black uppercase tracking-widest text-slate-300 shadow-[0_0_24px_rgba(148,163,184,0.12)] sm:px-8 sm:py-5 sm:text-3xl">
                +{outcome.xpGained} XP
              </span>
              {outcome.levelUp ? (
                <span className="rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-amber-300 sm:text-sm">
                  Level up
                </span>
              ) : null}
            </div>
          ) : null}

          {showRewards ? (
            <div className="mt-4 w-full rounded-md border border-amber-900/35 bg-amber-950/20 px-3 py-3 sm:mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500/90">
                Rewards unlocked
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {outcome.upgradedPotion ? (
                  <li className="flex items-center gap-2 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-2 text-left">
                    <GameIcon
                      iconPath={manaPotionIconPath(outcome.levelAfter)}
                      glow={glowForSpellId('mana_potion')}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-200 sm:text-xs">
                        {manaPotionDisplayName(outcome.levelAfter)}
                      </p>
                    </div>
                  </li>
                ) : null}
                {cls && rewardSpellTipCtx
                  ? spellRewardIds.map((sid) => {
                      const sp = SPELLS[sid];
                      if (!sp) return null;
                      const rk = calculateSpellRank(sid, cls, outcome.levelAfter);
                      const tipOpen = rewardTipSpellId === sid;
                      const rankLbl = spellTooltipRankLabel(sp, rewardSpellTipCtx);
                      const displayMana = spellDisplayManaCost(sp, rewardSpellTipCtx);
                      return (
                        <li key={sid} className="flex flex-col gap-2">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded border border-slate-800/80 bg-slate-950/60 px-2 py-2 text-left transition-colors hover:border-slate-600/80 hover:bg-slate-900/70"
                            aria-expanded={tipOpen}
                            onClick={() =>
                              setRewardTipSpellId((cur) => (cur === sid ? null : sid))
                            }
                          >
                            <GameIcon
                              iconPath={sp.icon}
                              glow={glowForSpellId(sid)}
                              size="sm"
                              className="shrink-0 pointer-events-none"
                            />
                            <div className="min-w-0 flex-1 pointer-events-none">
                              <p className="text-[11px] font-bold text-slate-200 sm:text-xs">{sp.name}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
                                Rank {rk}
                              </p>
                            </div>
                          </button>
                          {tipOpen ? (
                            <div className="flex w-full min-w-0 items-start gap-1.5 shadow-2xl sm:gap-2">
                              <GameIcon
                                iconPath={sp.icon}
                                glow={glowForSpellId(sid)}
                                size="md"
                                className="ui-spell-tooltip-icon shrink-0"
                              />
                              <div className="ui-spell-tooltip-body min-w-0">
                                <div className="ui-spell-tooltip-title">
                                  <span className="ui-spell-tooltip-title-text">{sp.name}</span>
                                  {rankLbl ? (
                                    <span className="ui-spell-tooltip-rank">{rankLbl}</span>
                                  ) : null}
                                </div>
                                {sp.manaCost > 0 ? (
                                  <div className="ui-spell-tooltip-mana">{displayMana} Mana</div>
                                ) : null}
                                <div
                                  className={`ui-spell-tooltip-desc${sp.manaCost > 0 ? ' mt-1.5' : ''}`}
                                >
                                  {spellEffectTooltipText(sp, rewardSpellTipCtx)}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })
                  : null}
              </ul>
            </div>
          ) : null}

          {postStats ? (
            <div className="mt-4 w-full rounded-md border border-slate-800/90 bg-slate-950/70 px-3 py-3 sm:mt-5 sm:px-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Run statistics
              </p>
              <dl className="mt-2.5 space-y-2.5 text-left">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <dt className="text-[11px] font-semibold text-slate-400">Total healing</dt>
                  <dd className="text-sm font-black tabular-nums text-emerald-300">
                    {formatHealCompact(postStats.totalHealing, 0, true)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <dt className="text-[11px] font-semibold text-slate-400">HPS</dt>
                  <dd className="text-sm font-black tabular-nums text-sky-300">
                    {formatHealCompact(postStats.hps, 1, false)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2">
                  <dt className="text-[11px] font-semibold text-slate-400">Overhealing</dt>
                  <dd className="text-sm font-black tabular-nums text-amber-300/95">
                    {postStats.overhealPct.toFixed(1)}%
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11px] font-semibold text-slate-400">HPM</dt>
                  <dd className="text-sm font-black tabular-nums text-violet-300">
                    {formatHealCompact(postStats.hpm, 2, false)}
                  </dd>
                </div>
              </dl>
            </div>
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
