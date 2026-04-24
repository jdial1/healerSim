/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useGameEngine } from './hooks/useGameEngine.ts';
import { HealGrid } from './components/HealGrid.tsx';
import { ActionBars } from './components/ActionBars.tsx';
import { ClassSelector } from './components/ClassSelector.tsx';
import { DungeonSelector } from './components/DungeonSelector.tsx';
import { GameHUD, TRASH_PACK_COUNT } from './components/GameHUD.tsx';
import { TalentTree } from './components/TalentTree.tsx';
import { DungeonOutcomeModal } from './components/DungeonOutcomeModal.tsx';
import { MANA_POTION_USES_PER_DUNGEON } from './constants.ts';
import { spellHealingMultiplierFromProgress, effectivePrimaryStats } from './playerStats.ts';
import { PlayerStatsModal } from './components/PlayerStatsModal.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, LogOut } from 'lucide-react';

export default function App() {
  const {
    state,
    selectClass,
    startDungeon,
    abandonDungeon,
    castSpell,
    unlockTalent,
    reorderActionBar,
    cooldowns,
    dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
  } = useGameEngine();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [showTalents, setShowTalents] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [pwaNeedsRefresh, setPwaNeedsRefresh] = useState(false);
  const swUpdate = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    swUpdate.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setPwaNeedsRefresh(true);
      },
    });
  }, []);

  const handleCast = useCallback((spellId: string) => {
    if (!state.currentDungeon) return;
    if (!targetId && state.party.length > 0) {
      // Default to tank if no target
      const tank = state.party.find(u => u.role === 'TANK');
      if (tank) {
          castSpell(spellId, tank.id);
      }
    } else if (targetId) {
      castSpell(spellId, targetId);
    }
  }, [state.currentDungeon, targetId, state.party, castSpell]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      // Handle numbers 1-5
      const num = parseInt(key);
      if (isNaN(num) || num < 1 || num > 5) return;
      
      const index = num - 1;

      if (e.shiftKey) {
        // Shift+1-5: Target party member
        const member = state.party[index];
        if (member) {
          setTargetId(member.id);
        }
      } else if (state.currentDungeon) {
        const spellId = state.activeActionBars[index];
        if (spellId) {
          handleCast(spellId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.party, state.currentDungeon, state.activeActionBars, handleCast]);

  return (
    <div
      className={`bg-slate-950 font-sans selection:bg-blue-500 selection:text-white ${
        state.playerClass ? 'min-h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      <AnimatePresence mode="wait">
        {showTalents && state.playerClass ? (
          <TalentTree 
            talents={state.talents}
            talentPoints={state.talentPoints}
            onUnlock={unlockTalent}
            onClose={() => setShowTalents(false)}
            playerLevel={state.level}
            playerClass={state.playerClass}
          />
        ) : null}

        {!state.playerClass ? (
          <motion.div
            key="class-select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -100 }}
          >
            <ClassSelector onSelect={selectClass} />
          </motion.div>
        ) : !state.currentDungeon ? (
          <motion.div
            key="dungeon-select"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="relative flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden"
          >
            {/* Global Actions Overlay */}
            <div className="fixed top-3 right-3 flex gap-2 items-center z-[60]">
               <button 
                onClick={() => setShowTalents(true)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all border ${state.talentPoints > 0 ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
               >
                  <Star size={10} fill={state.talentPoints > 0 ? 'currentColor' : 'none'} className={state.talentPoints > 0 ? 'text-yellow-400' : ''} />
                  <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap sm:text-[9px]">TALENTS ({state.talentPoints})</span>
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
            />

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-48 pb-36 sm:pt-52 sm:pb-40">
               <div className="mt-auto flex w-full max-w-xl shrink-0 flex-col items-center gap-1 self-center overflow-y-auto px-2 pb-2">
                 <HealGrid 
                  party={state.party}
                  selectedId={targetId}
                  onTargetSelect={setTargetId}
                  manaRegenBuffTicksRemaining={state.manaRegenBuffTicksRemaining}
                 />
               </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPlayerStats && state.playerClass ? (
          <PlayerStatsModal
            playerClass={state.playerClass}
            level={state.level}
            talents={state.talents}
            onClose={() => setShowPlayerStats(false)}
          />
        ) : null}
      </AnimatePresence>

      {state.playerClass && (
        <ActionBars
          playerClass={state.playerClass}
          spellIds={state.activeActionBars}
          cooldowns={cooldowns}
          onCast={handleCast}
          xp={state.xp}
          mana={state.currentDungeon ? state.mana : state.maxMana}
          maxMana={state.maxMana}
          manaRegenBuffTicksRemaining={state.currentDungeon ? state.manaRegenBuffTicksRemaining : 0}
          spiritRegenLockoutTicksRemaining={
            state.currentDungeon ? state.spiritRegenLockoutTicksRemaining : 0
          }
          spirit={effectivePrimaryStats(state.playerClass, state.level).spirit}
          spellsEnabled={!!state.currentDungeon}
          allowReorder={!!state.playerClass && !state.currentDungeon}
          onReorderSlots={reorderActionBar}
          manaPotionChargesRemaining={Math.max(
            0,
            MANA_POTION_USES_PER_DUNGEON - state.manaPotionsUsedThisDungeon,
          )}
          spellHealingMultiplier={spellHealingMultiplierFromProgress(
            state.playerClass,
            state.level,
            state.talents,
          )}
          actionBarHighlights={actionBarHighlights}
        />
      )}

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
        <p
          className={`fixed left-0 right-0 z-[25] text-center font-mono text-[10px] tracking-wide text-slate-600 ${
            state.playerClass
              ? 'hidden bottom-40 sm:bottom-44 sm:block'
              : 'bottom-[max(1rem,env(safe-area-inset-bottom,0px))]'
          }`}
        >
          v{__APP_VERSION__}
        </p>
      ) : null}
    </div>
  );
}

