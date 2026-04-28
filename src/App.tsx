/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useGameEngine } from './hooks/useGameEngine.ts';
import {
  useKeyboardCombatKeys,
  type KeyboardCombatSnapshot,
} from './hooks/useKeyboardCombatKeys.ts';
import { HealGrid } from './components/HealGrid.tsx';
import { ActionBars } from './components/ActionBars.tsx';
import { CharacterRoster } from './components/CharacterRoster.tsx';
import { SplashScreen } from './components/SplashScreen.tsx';
import { DungeonSelector } from './components/DungeonSelector.tsx';
import { maxLevelAcrossRoster } from './gameStorage.ts';
import { GameHUD } from './components/GameHUD.tsx';
import { TRASH_PACK_COUNT, TICKS_PER_SECOND, MANA_POTION_USES_PER_DUNGEON } from './constants.ts';
import {
  PLAYER_BUFF_MANA_REGEN_POTION,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  getPlayerBuffRemainingTicks,
  getManaPotionDripPerTick,
} from './talentMechanics.ts';
import { partyWithHealerManaRegenDisplayBuff } from './buffDisplay.ts';
import { TalentTree } from './components/TalentTree.tsx';
import { DungeonOutcomeModal } from './components/DungeonOutcomeModal.tsx';
import { spellHealingMultiplierFromProgress, effectivePrimaryStats } from './playerStats.ts';
import type { PlayerCombatStats } from './types.ts';
import { PlayerStatsModal } from './components/PlayerStatsModal.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, LogOut, Home } from 'lucide-react';

const REPO_URL = 'https://github.com/jdial1/healerSim';

export default function App() {
  const {
    state,
    roster,
    loadCharacter,
    startNewClass,
    returnToRoster,
    startDungeon,
    abandonDungeon,
    castSpell,
    addXpNextLevel,
    unlockTalent,
    respecTalents,
    reorderActionBar,
    cooldowns,
    dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
  } = useGameEngine();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(true);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [showTalents, setShowTalents] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const paladinUnlocked = maxLevelAcrossRoster(roster) >= 5;
  const [pwaNeedsRefresh, setPwaNeedsRefresh] = useState(false);
  const swUpdate = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);
  const keyboardRef = useRef<KeyboardCombatSnapshot>({
    party: [],
    currentDungeon: null,
    activeActionBars: [],
    targetId: null,
    castSpell: () => {},
  });

  useEffect(() => {
    swUpdate.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setPwaNeedsRefresh(true);
      },
    });
  }, []);

  const handleCast = useCallback(
    (spellId: string) => {
      if (!state.currentDungeon) return;
      if (!targetId && state.party.length > 0) {
        const tank = state.party.find((u) => u.role === 'TANK');
        if (tank) castSpell(spellId, tank.id);
      } else if (targetId) {
        castSpell(spellId, targetId);
      }
    },
    [state.currentDungeon, targetId, state.party, castSpell],
  );

  useEffect(() => {
    if (!targetId) return;
    const alive = state.party.some((m) => m.id === targetId && m.health > 0);
    if (!alive) setTargetId(null);
  }, [state.party, targetId]);

  const manaRegenTicksForUi = useMemo(
    () =>
      state.currentDungeon
        ? getPlayerBuffRemainingTicks(state.playerCombatBuffs, PLAYER_BUFF_MANA_REGEN_POTION)
        : 0,
    [state.currentDungeon, state.playerCombatBuffs],
  );

  const spiritLockTicksForUi = useMemo(
    () =>
      state.currentDungeon
        ? getPlayerBuffRemainingTicks(state.playerCombatBuffs, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT)
        : 0,
    [state.currentDungeon, state.playerCombatBuffs],
  );

  const partyForHealGrid = useMemo(
    () =>
      partyWithHealerManaRegenDisplayBuff(state.party, manaRegenTicksForUi, state.level),
    [state.party, manaRegenTicksForUi, state.level],
  );

  const playerCombatStats = useMemo((): PlayerCombatStats | null => {
    if (!state.playerClass) return null;
    return {
      playerClass: state.playerClass,
      level: state.level,
      xp: state.xp,
      mana: state.currentDungeon ? state.mana : state.maxMana,
      maxMana: state.maxMana,
      manaRegenBuffTicksRemaining: manaRegenTicksForUi,
      manaPotionDripPerSec: getManaPotionDripPerTick(state.playerCombatBuffs) * TICKS_PER_SECOND,
      spiritRegenLockoutTicksRemaining: spiritLockTicksForUi,
      spirit: effectivePrimaryStats(state.playerClass, state.level).spirit,
      spellsEnabled: !!state.currentDungeon,
      manaPotionChargesRemaining: Math.max(
        0,
        MANA_POTION_USES_PER_DUNGEON - state.manaPotionsUsedThisDungeon,
      ),
      spellHealingMultiplier: spellHealingMultiplierFromProgress(
        state.playerClass,
        state.level,
        state.talents,
      ),
      unlockedSpells: state.unlockedSpells,
      actionBarHighlights,
    };
  }, [
    state.playerClass,
    state.xp,
    state.mana,
    state.maxMana,
    state.currentDungeon,
    state.level,
    state.unlockedSpells,
    state.manaPotionsUsedThisDungeon,
    state.talents,
    manaRegenTicksForUi,
    spiritLockTicksForUi,
    state.playerCombatBuffs,
    actionBarHighlights,
  ]);

  keyboardRef.current = {
    party: state.party,
    currentDungeon: state.currentDungeon,
    activeActionBars: state.activeActionBars,
    targetId,
    castSpell,
  };
  useKeyboardCombatKeys(keyboardRef, setTargetId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'l') return;
      if (e.repeat) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest('[contenteditable="true"]'))) {
        return;
      }
      if (!state.playerClass) return;
      e.preventDefault();
      addXpNextLevel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.playerClass, addXpNextLevel]);

  return (
    <div
      className={`bg-slate-950 font-sans selection:bg-blue-500 selection:text-white ${
        state.playerClass && !showRoster ? 'min-h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      <AnimatePresence mode="wait">
        {showTalents && state.playerClass && !showRoster ? (
          <TalentTree 
            talents={state.talents}
            talentPoints={state.talentPoints}
            onUnlock={unlockTalent}
            onRespec={respecTalents}
            onClose={() => setShowTalents(false)}
            playerLevel={state.level}
            playerClass={state.playerClass}
          />
        ) : null}

        {showRoster || !state.playerClass ? (
          <AnimatePresence mode="wait">
            {!splashDismissed ? (
              <Fragment key="splash">
                <SplashScreen onEnter={() => setSplashDismissed(true)} />
              </Fragment>
            ) : (
              <motion.div
                key="character-roster"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -100 }}
              >
                <CharacterRoster
                  roster={roster}
                  paladinUnlocked={paladinUnlocked}
                  onContinue={(cls) => {
                    loadCharacter(cls);
                    setShowRoster(false);
                  }}
                  onCreate={(cls) => {
                    startNewClass(cls);
                    setShowRoster(false);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : !state.currentDungeon ? (
          <motion.div
            key="dungeon-select"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="relative flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden"
          >
            <div className="fixed top-3 right-3 z-[60] flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  returnToRoster();
                  setShowRoster(true);
                }}
                className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/80 px-2 py-1 shadow-sm backdrop-blur-md transition-colors hover:border-slate-500 hover:bg-slate-800"
                aria-label="Main menu"
              >
                <Home size={12} strokeWidth={2.5} className="shrink-0 text-slate-300" aria-hidden />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-300 sm:text-[9px]">
                  Menu
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowTalents(true)}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-all ${
                  state.talentPoints > 0
                    ? 'animate-pulse border-blue-400 bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                    : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-white'
                }`}
              >
                <Star
                  size={10}
                  fill={state.talentPoints > 0 ? 'currentColor' : 'none'}
                  className={state.talentPoints > 0 ? 'text-yellow-400' : ''}
                />
                <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-widest sm:text-[9px]">
                  TALENTS ({state.talentPoints})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowPlayerStats(true)}
                className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900/80 px-2 py-1 shadow-sm backdrop-blur-md transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                <Trophy size={10} className="text-blue-500" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-300 sm:text-[9px]">
                  LVL <span className="text-white">{state.level}</span>
                </span>
              </button>
            </div>

            <DungeonSelector
              onSelect={startDungeon}
              level={state.level}
              completedDungeonIds={state.completedDungeonIds}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game-active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex h-dvh max-h-dvh min-h-0 flex-col"
          >
            <div className="fixed top-3 right-3 z-[60]">
              <button
                type="button"
                onClick={abandonDungeon}
                className="flex items-center gap-1.5 rounded border border-red-500 bg-red-600 px-2.5 py-1.5 text-white shadow-[0_0_12px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500 sm:px-3 sm:py-2"
                aria-label="Leave dungeon"
              >
                <LogOut size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
                <span className="text-[10px] font-black uppercase tracking-widest sm:text-[9px]">Leave</span>
              </button>
            </div>
            <GameHUD 
              combatPhase={state.combatPhase}
              trashPullsRemaining={state.trashPullsRemaining}
              enemyHealth={state.enemyHealth}
              enemyMaxHealth={state.enemyMaxHealth}
              bossName={state.currentDungeon.bossName}
              trashEnemyName={
                state.currentDungeon.enemies[TRASH_PACK_COUNT - state.trashPullsRemaining]?.name ?? ''
              }
              bossSelfBuffs={state.combatPhase === 'BOSS' ? state.bossSelfBuffs : []}
              endlessStacks={state.currentDungeon.endless ? state.endlessStacks : undefined}
            />

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-48 pb-36 sm:pt-52 sm:pb-40">
               <div className="mt-auto flex w-full max-w-xl shrink-0 flex-col items-center gap-1 self-center overflow-y-auto px-2 pb-2">
                 <HealGrid
                  party={partyForHealGrid}
                  selectedId={targetId}
                  onTargetSelect={setTargetId}
                  floatingCombatTexts={state.floatingCombatTexts}
                />
               </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPlayerStats && state.playerClass && !showRoster ? (
          <PlayerStatsModal
            playerClass={state.playerClass}
            level={state.level}
            talents={state.talents}
            onClose={() => setShowPlayerStats(false)}
          />
        ) : null}
      </AnimatePresence>

      {state.playerClass && !showRoster && playerCombatStats ? (
        <ActionBars
          playerCombatStats={playerCombatStats}
          spellIds={state.activeActionBars}
          cooldowns={cooldowns}
          onCast={handleCast}
          allowReorder={!state.currentDungeon}
          onReorderSlots={reorderActionBar}
        />
      ) : null}

      <AnimatePresence>
        {dungeonOutcome ? (
          <Fragment key={`${dungeonOutcome.kind}-${dungeonOutcome.dungeonName}`}>
            <DungeonOutcomeModal outcome={dungeonOutcome} onDismiss={dismissDungeonOutcome} />
          </Fragment>
        ) : null}
      </AnimatePresence>

      {pwaNeedsRefresh ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-t border-slate-800 bg-slate-950/95 px-4 py-3 text-center backdrop-blur-md"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
            Update ready · v{__APP_VERSION__}
          </span>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white"
            onClick={() => void swUpdate.current?.(true)}
          >
            Reload
          </button>
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400"
            onClick={() => setPwaNeedsRefresh(false)}
          >
            Later
          </button>
        </div>
      ) : null}

      {!state.currentDungeon ? (
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`fixed left-0 right-0 z-[25] block text-center font-mono text-[10px] tracking-wide text-slate-600 underline-offset-2 transition-colors hover:text-slate-400 hover:underline ${
            state.playerClass && !showRoster
              ? 'hidden bottom-40 sm:bottom-44 sm:block'
              : 'bottom-[max(1rem,env(safe-area-inset-bottom,0px))]'
          }`}
        >
          v{__APP_VERSION__}
        </a>
      ) : null}
    </div>
  );
}

