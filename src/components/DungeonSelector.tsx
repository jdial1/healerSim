/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DUNGEONS } from '../constants.ts';
import { Dungeon } from '../types.ts';
import { Skull, Swords, Lock, Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface DungeonSelectorProps {
  onSelect: (dungeon: Dungeon) => void;
  level: number;
}

export function DungeonSelector({ onSelect, level }: DungeonSelectorProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Top Header Bar (Menu Style) */}
      <div className="fixed top-0 left-0 right-0 bg-slate-900/50 border-b border-slate-800 p-4 sm:px-8 flex justify-between items-center z-50">
        <div className="flex flex-col">
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
              DUNGEON <span className="text-blue-500">FINDER</span>
          </h1>
          <div className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500 mt-1">
              SELECT COMBAT ZONE • LVL {level}
          </div>
        </div>
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 mt-20 pb-32">
        {DUNGEONS.map((dungeon) => {
          const isLocked = level < dungeon.difficulty;
          
          return (
            <motion.button
              key={dungeon.id}
              onClick={() => !isLocked && onSelect(dungeon)}
              whileHover={!isLocked ? { y: -5, backgroundColor: '#1e293b' } : {}}
              className={`
                group relative flex flex-col items-start p-6 border-l-4 transition-all text-left
                ${isLocked ? 'border-slate-800 bg-slate-950 opacity-40 grayscale' : 'border-slate-700 bg-slate-900 shadow-2xl hover:border-blue-500'}
              `}
            >
              <div className="flex justify-between items-start w-full mb-6">
                <div className="flex flex-col items-start">
                   <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tighter leading-none group-hover:text-blue-400 transition-colors">
                      {dungeon.name}
                   </h3>
                   <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">LEVEL {dungeon.difficulty} INSTANCE</div>
                </div>
                {isLocked ? <Lock className="text-slate-700" size={18} /> : <Swords className="text-slate-700" size={18} />}
              </div>

              <div className="flex flex-col gap-4 w-full mt-auto">
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Target Objective</span>
                    <div className="flex items-center gap-2">
                       <Skull size={14} className="text-red-500" />
                       <span className="text-sm font-black text-white italic uppercase">{dungeon.bossName}</span>
                    </div>
                 </div>

                 <div className="flex justify-between items-center bg-slate-950/50 p-3 border border-slate-800">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Risk Level</span>
                    <div className="flex gap-1">
                       {[...Array(5)].map((_, i) => (
                         <div key={i} className={`w-1 h-3 ${i < dungeon.difficulty ? 'bg-blue-500' : 'bg-slate-800'}`} />
                       ))}
                    </div>
                 </div>
              </div>

              {!isLocked ? (
                 <div className="mt-8 w-full py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-[0.2em] text-center group-hover:bg-white group-hover:text-blue-600 transition-all">
                    DEPLOY HERO
                 </div>
              ) : (
                <div className="mt-8 w-full py-3 bg-slate-950/50 text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] text-center border border-slate-800">
                    INSUFFICIENT LEVEL
                 </div>
              )}

              {isLocked && (
                <div className="absolute inset-0 bg-slate-950/20 pointer-events-none" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}



// Minimal icons for HUD
import { Activity } from 'lucide-react';
