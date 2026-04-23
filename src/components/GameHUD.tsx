/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';

interface GameHUDProps {
  mana: number;
  maxMana: number;
  progress: number;
  combatPhase: 'TRASH' | 'BOSS';
  trashPullsRemaining: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  logs: string[];
  bossName?: string;
}

export function GameHUD({ 
  mana, maxMana, progress, combatPhase, trashPullsRemaining, 
  enemyHealth, enemyMaxHealth, logs, bossName 
}: GameHUDProps) {
  const manaPercent = (mana / maxMana) * 100;
  const enemyPercent = (enemyHealth / enemyMaxHealth) * 100;

  return (
    <div className="fixed top-0 left-0 right-0 p-3 sm:p-4 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 shadow-xl">
      <div className="max-w-6xl mx-auto flex flex-col gap-3">
        
        {/* Top Row: Phase and Mana Bar Integrated */}
        <div className="flex justify-between items-end gap-4 w-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-1.5 py-0.5 rounded-sm ${combatPhase === 'BOSS' ? 'bg-red-600' : 'bg-slate-800'} text-[8px] font-black uppercase tracking-wider text-white`}>
                 {combatPhase === 'BOSS' ? 'BOSS' : 'TRASH'}
              </span>
              <span className="text-[10px] font-black uppercase tracking-tighter text-white truncate max-w-[120px]">
                {combatPhase === 'TRASH' ? `CLEARED: ${3 - trashPullsRemaining}/3` : bossName || 'FINAL BOSS'}
              </span>
            </div>
            
            {/* Enemy Health Bar */}
            <div className="w-32 h-1.5 bg-slate-900 overflow-hidden rounded-full border border-slate-800">
               <motion.div 
                    className={`h-full ${combatPhase === 'BOSS' ? 'bg-red-600' : 'bg-orange-500'}`}
                    animate={{ width: `${enemyPercent}%` }}
                />
            </div>
          </div>

          {/* Single Row Mana Bar */}
          <div className="flex-1 max-w-[200px] flex flex-col items-end">
             <div className="flex justify-between items-baseline w-full mb-1">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Mana Pool</span>
                <span className="text-[11px] font-black text-blue-400 font-mono italic">
                  {Math.floor(mana)}<span className="text-[9px] opacity-40 text-slate-500 font-normal ml-0.5">/ {maxMana}</span>
                </span>
             </div>
             <div className="w-full h-2 bg-slate-900 overflow-hidden rounded-full border border-slate-800 p-[1px]">
                <motion.div 
                    className="h-full bg-blue-500 rounded-full"
                    animate={{ width: `${manaPercent}%` }}
                />
             </div>
          </div>
        </div>

        {/* Minified Dungeon Progress Line */}
        <div className="flex gap-1 w-full h-1 opacity-50">
           {[0, 25, 50, 75].map((stop) => (
               <div key={stop} className={`h-full flex-1 transition-colors ${progress > stop ? 'bg-blue-500' : 'bg-slate-800'}`} />
           ))}
        </div>
      </div>

      {/* Extreme Min Combat Log (Mobile) / Side log (Desktop) */}
      <div className="absolute top-full left-0 right-0 px-3 py-1 bg-slate-950/40 backdrop-blur-sm pointer-events-none">
          <p className="text-[8px] font-mono text-slate-600 uppercase tracking-tighter truncate text-center">
             Combat Stream: {logs[0] || 'Awaiting engagement...'}
          </p>
      </div>

      {/* Combat Log Overlay (Desktop) */}
      <div className="hidden lg:block absolute top-[100%] right-6 mt-12 p-4 w-60 bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Intel</span>
        </div>
        <div className="text-[10px] font-mono text-cyan-400/60 leading-tight h-20 overflow-y-auto custom-scrollbar">
            {logs.slice(0, 5).map((log, i) => (
                <div key={i} className="mb-0.5 truncate">
                    {log}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}

