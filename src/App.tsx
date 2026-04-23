/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { useGameEngine } from './hooks/useGameEngine.ts';
import { HealGrid } from './components/HealGrid.tsx';
import { ActionBars } from './components/ActionBars.tsx';
import { ClassSelector } from './components/ClassSelector.tsx';
import { DungeonSelector } from './components/DungeonSelector.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { TalentTree } from './components/TalentTree.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Settings, RefreshCw, Star } from 'lucide-react';

export default function App() {
  const { state, selectClass, startDungeon, castSpell, unlockTalent, cooldowns } = useGameEngine();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [showTalents, setShowTalents] = useState(false);

  const handleCast = useCallback((spellId: string) => {
    if (!targetId && state.party.length > 0) {
      // Default to tank if no target
      const tank = state.party.find(u => u.role === 'TANK');
      if (tank) {
          castSpell(spellId, tank.id);
      }
    } else if (targetId) {
      castSpell(spellId, targetId);
    }
  }, [targetId, state.party, castSpell]);

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
      } else {
        // 1-5: Cast spell
        const spellId = state.activeActionBars[index];
        if (spellId) {
          handleCast(spellId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.party, state.activeActionBars, handleCast]);

  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-blue-500 selection:text-white">
      <AnimatePresence mode="wait">
        {showTalents && (
          <TalentTree 
            talents={state.talents}
            talentPoints={state.talentPoints}
            onUnlock={unlockTalent}
            onClose={() => setShowTalents(false)}
            playerLevel={state.level}
          />
        )}

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
            className="relative"
          >
            {/* Global Actions Overlay */}
            <div className="fixed top-3 right-3 flex gap-2 items-center z-[60]">
               <button 
                onClick={() => setShowTalents(true)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all border ${state.talentPoints > 0 ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
               >
                  <Star size={10} fill={state.talentPoints > 0 ? 'currentColor' : 'none'} className={state.talentPoints > 0 ? 'text-yellow-400' : ''} />
                  <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">TALENTS ({state.talentPoints})</span>
               </button>
               <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded px-2 py-1 flex items-center gap-1.5 shadow-sm">
                  <Trophy size={10} className="text-blue-500" />
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                    LVL <span className="text-white">{state.level}</span>
                  </span>
               </div>
            </div>
            
            <DungeonSelector onSelect={startDungeon} level={state.level} />

            <ActionBars 
              spellIds={state.activeActionBars}
              cooldowns={cooldowns}
              onCast={handleCast}
              mana={state.mana}
              isHub={true}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game-active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col h-screen"
          >
            <GameHUD 
              mana={state.mana} 
              maxMana={state.maxMana} 
              progress={state.dungeonProgress} 
              combatPhase={state.combatPhase}
              trashPullsRemaining={state.trashPullsRemaining}
              enemyHealth={state.enemyHealth}
              enemyMaxHealth={state.enemyMaxHealth}
              logs={state.logs}
              bossName={state.currentDungeon.bossName}
            />

            <main className="flex-1 flex flex-col items-center justify-center pt-24 pb-32 overflow-hidden">
               {/* Mobile Instructions */}
               <div className="mb-4 text-center px-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
                    Tap a member to target, then cast a spell
                  </p>
               </div>

               <HealGrid 
                party={state.party}
                selectedId={targetId}
                onTargetSelect={setTargetId}
               />

               {/* Mobile Logs Overlay (Visible/Toggleable) */}
                <div className="md:hidden mt-4 w-full max-w-xs h-12 overflow-hidden px-4">
                  <p className="text-[9px] font-mono text-slate-500 truncate text-center italic">
                    {state.logs[0]}
                  </p>
                </div>
            </main>

            <ActionBars 
              spellIds={state.activeActionBars}
              cooldowns={cooldowns}
              onCast={handleCast}
              mana={state.mana}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Error Boundary Simulation / Global Logging */}
      {process.env.NODE_ENV === 'development' && state.logs.length > 0 && (
         <div className="fixed bottom-2 left-2 pointer-events-none opacity-20 hidden">
            <RefreshCw size={12} className="animate-spin" />
            <span className="text-[8px] ml-1">LOGS ACTIVE</span>
         </div>
      )}
    </div>
  );
}

