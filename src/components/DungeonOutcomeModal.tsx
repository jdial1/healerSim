import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Skull, Trophy, X } from 'lucide-react';
import { DungeonRunOutcome, DungeonFailureReason } from '../types.ts';
import { SPELLS } from '../constants.ts';
import {
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
  spellEffectTooltipTextWithPreviousValues,
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

  const postStats = outcome.postStats;

  const previousRewardSpellTipCtx =
    cls && spellRewardIds.length > 0 && outcome.levelAfter > 1
      ? {
          spellHealingMultiplier: spellHealingMultiplierFromProgress(cls, outcome.levelAfter - 1, []),
          spirit: effectivePrimaryStats(cls, outcome.levelAfter - 1).spirit,
          playerLevel: outcome.levelAfter - 1,
          playerClass: cls,
          unlockedSpells: spellRewardIds,
        }
      : null;

  const renderTooltipDiffText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const parts: ReactNode[] = [];
      const tokenRe = /\[\[(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\]\]/g;
      let cursor = 0;
      let m = tokenRe.exec(line);
      let key = 0;
      while (m) {
        if (m.index > cursor) {
          parts.push(<span key={`t-${lineIdx}-${key++}`}>{line.slice(cursor, m.index)}</span>);
        }
        const oldValue = Number(m[1]);
        const newValue = Number(m[2]);
        const manaLine = /mana/i.test(line);
        const newValueClass = manaLine
          ? newValue > oldValue
            ? 'text-rose-300'
            : 'text-emerald-300'
          : 'text-emerald-300';
        parts.push(
          <span key={`d-${lineIdx}-${key++}`} className="inline-flex items-center gap-1">
            <span className="text-slate-300">{m[1]}</span>
            <span className="text-amber-300">→</span>
            <span className={newValueClass}>{m[2]}</span>
          </span>,
        );
        cursor = m.index + m[0].length;
        m = tokenRe.exec(line);
      }
      if (cursor < line.length) {
        parts.push(<span key={`t-${lineIdx}-${key++}`}>{line.slice(cursor)}</span>);
      }
      return (
        <span key={`line-${lineIdx}`} className="block">
          {parts}
        </span>
      );
    });
  };

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
        className="ui-frame relative max-h-[90vh] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-lg bg-[#070d1a] shadow-[0_0_60px_rgba(0,0,0,0.65)]"
      >
        <button type="button" onClick={onDismiss} className="ui-close-button absolute right-2 top-2 z-10 p-1.5" aria-label="Close">
          <X size={14} />
        </button>

        <div
          className={`ui-frame-divider-bottom px-4 pb-4 pt-5 sm:px-5 sm:pt-6 ${
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
                className="ui-heading mt-0.5 text-lg leading-tight tracking-[0.06em] text-white sm:text-xl"
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

        <div className="px-4 py-5 sm:px-5 sm:py-5">
          {isSuccess ? (
            <div className="flex flex-col items-center gap-4">
              <span className="ui-frame rounded-lg bg-slate-950/90 px-5 py-3 text-xl font-black uppercase tracking-[0.16em] text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.14)] sm:px-7 sm:py-3.5 sm:text-2xl">
                +{outcome.xpGained} XP
              </span>
              {outcome.levelUp ? (
                <span className="ui-frame rounded bg-amber-950/40 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-amber-300 sm:text-sm">
                  Level up
                </span>
              ) : null}
            </div>
          ) : outcome.xpGained > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <span className="ui-frame rounded-lg bg-slate-950/90 px-5 py-3 text-xl font-black uppercase tracking-[0.16em] text-slate-300 shadow-[0_0_18px_rgba(148,163,184,0.12)] sm:px-7 sm:py-3.5 sm:text-2xl">
                +{outcome.xpGained} XP
              </span>
              {outcome.levelUp ? (
                <span className="ui-frame rounded bg-amber-950/40 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-amber-300 sm:text-sm">
                  Level up
                </span>
              ) : null}
            </div>
          ) : null}

          {showRewards ? (
            <div className="ui-frame mt-5 w-full rounded-md bg-amber-950/20 px-3 py-3.5 sm:mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500/90">
                Rewards unlocked
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {outcome.upgradedPotion ? (
                  <li className="ui-frame flex items-center gap-2 rounded bg-slate-950/60 px-2 py-2 text-left">
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
                      const rankLbl = spellTooltipRankLabel(sp, rewardSpellTipCtx);
                      const displayMana = spellDisplayManaCost(sp, rewardSpellTipCtx);
                      const previousMana = previousRewardSpellTipCtx
                        ? spellDisplayManaCost(sp, previousRewardSpellTipCtx)
                        : displayMana;
                      const effectText = previousRewardSpellTipCtx
                        ? spellEffectTooltipTextWithPreviousValues(
                            sp,
                            previousRewardSpellTipCtx,
                            rewardSpellTipCtx,
                          )
                        : spellEffectTooltipText(sp, rewardSpellTipCtx);
                      return (
                        <li key={sid} className="flex flex-col gap-2">
                          <div className="flex w-full min-w-0 items-start gap-1.5 shadow-2xl sm:gap-2">
                            <GameIcon
                              iconPath={sp.icon}
                              glow={glowForSpellId(sid)}
                              size="md"
                              className="ui-spell-tooltip-icon shrink-0"
                            />
                            <div className="ui-spell-tooltip-body min-w-0">
                              <div className="ui-spell-tooltip-title">
                                <span className="ui-heading min-w-0 flex-1 text-sm tracking-[0.06em] text-slate-100">
                                  {sp.name}
                                </span>
                                {rankLbl ? (
                                  <span className="ui-spell-tooltip-rank">{rankLbl}</span>
                                ) : null}
                              </div>
                              {sp.manaCost > 0 ? (
                                <div className="ui-spell-tooltip-mana">
                                  {previousMana !== displayMana ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="text-slate-300">{previousMana}</span>
                                      <span className="text-amber-300">→</span>
                                      <span className={displayMana > previousMana ? 'text-rose-300' : 'text-emerald-300'}>
                                        {displayMana}
                                      </span>
                                    </span>
                                  ) : (
                                    displayMana
                                  )}{' '}
                                  Mana
                                </div>
                              ) : null}
                              <div
                                className={`ui-spell-tooltip-desc${sp.manaCost > 0 ? ' mt-1.5' : ''}`}
                              >
                                {renderTooltipDiffText(effectText)}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  : null}
              </ul>
            </div>
          ) : null}

          {postStats ? (
            <div className="ui-frame mt-5 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:mt-5 sm:px-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Run statistics
              </p>
              <dl className="mt-2.5 space-y-2.5 text-left">
                <div className="ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2">
                  <dt className="text-[11px] font-semibold text-slate-400">Total healing</dt>
                  <dd className="text-sm font-black tabular-nums text-emerald-300">
                    {formatHealCompact(postStats.totalHealing, 0, true)}
                  </dd>
                </div>
                <div className="ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2">
                  <dt className="text-[11px] font-semibold text-slate-400">HPS</dt>
                  <dd className="text-sm font-black tabular-nums text-sky-300">
                    {formatHealCompact(postStats.hps, 1, false)}
                  </dd>
                </div>
                <div className="ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2">
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
            className="ui-state-frame ui-state-hover mt-6 w-full rounded-md bg-slate-800 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-slate-700 active:scale-[0.99] sm:mt-6"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
