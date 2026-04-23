/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Talent, Spell } from '../types.ts';
import { SPELLS } from '../constants.ts';
import { motion } from 'motion/react';
import { Check, Lock, Star } from 'lucide-react';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onClose: () => void;
}

import * as Icons from 'lucide-react';
import { Talent, Spell } from '../types.ts';
import { SPELLS } from '../constants.ts';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Star, ChevronRight, X } from 'lucide-react';
import { useState, useMemo } from 'react';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onClose: () => void;
  playerLevel: number;
}

export function TalentTree({ talents, talentPoints, onUnlock, onClose, playerLevel }: TalentTreeProps) {
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const constraintsRef = useRef(null);

  const selectedTalent = useMemo(() => 
    talents.find(t => t.id === selectedTalentId), 
    [talents, selectedTalentId]
  );

  const nodeWidth = 44;
  const nodeHeight = 44;
  const gapX = 24;
  const gapY = 40;

  const isTalentAccessible = (talent: Talent) => {
    if (talent.levelReq > playerLevel) return false;
    if (!talent.prerequisites) return true;
    return talent.prerequisites.every(pid => {
      const p = talents.find(t => t.id === pid);
      return p && p.points > 0;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl flex flex-col overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="w-full bg-slate-900/80 backdrop-blur border-b border-slate-800 p-3 sm:px-6 flex justify-between items-center z-[120]">
        <div className="flex flex-col">
          <h2 className="text-base sm:text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
              TRAINING <span className="text-blue-500">SPEC</span>
          </h2>
          <div className="text-[6px] font-black uppercase tracking-[0.2em] text-slate-500 mt-0.5">
              LVL {playerLevel} MATRIX • {talentPoints} PTS
          </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="hidden sm:flex flex-col items-end mr-4">
             <div className="text-[7px] font-black uppercase tracking-widest text-slate-500">AVAILABLE</div>
             <div className="text-xl font-black italic tracking-tighter text-blue-500 leading-none">
                {talentPoints}
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-800/50 hover:bg-slate-800 text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)]" ref={constraintsRef}>
        {/* Draggable Area - Much larger than the screen to allow panning */}
        <motion.div 
          drag
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
          className="absolute w-[2000px] h-[2000px] left-[-750px] top-[-750px] cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto"
        >
          <div className="relative pointer-events-none" style={{ width: '600px', height: '600px' }}>
            {/* SVG Connections */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible">
              {talents.map(t => (t.prerequisites || []).map(pid => {
                const parent = talents.find(p => p.id === pid);
                if (!parent) return null;
                
                const startX = parent.gridX * (nodeWidth + gapX) + nodeWidth / 2;
                const startY = parent.gridY * (nodeHeight + gapY) + nodeHeight / 2;
                const endX = t.gridX * (nodeWidth + gapX) + nodeWidth / 2;
                const endY = t.gridY * (nodeHeight + gapY) + nodeHeight / 2;
                
                const isLineActive = parent.points > 0;

                return (
                  <line 
                    key={`${parent.id}-${t.id}`}
                    x1={startX} y1={startY} x2={endX} y2={endY}
                    stroke={isLineActive ? '#3b82f6' : '#1e293b'}
                    strokeWidth="1"
                    strokeDasharray={isLineActive ? "0" : "2,2"}
                    className="transition-all duration-500"
                  />
                );
              }))}
            </svg>

            {/* Talent Nodes */}
            {talents.map((talent) => {
              const accessible = isTalentAccessible(talent);
              const isMaxed = talent.points >= talent.maxPoints;
              const hasPoints = talent.points > 0;
              const Icon = (Icons as any)[talent.icon] || Icons.Circle;

              return (
                <div
                  key={talent.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                  style={{ 
                    left: talent.gridX * (nodeWidth + gapX) + nodeWidth / 2,
                    top: talent.gridY * (nodeHeight + gapY) + nodeHeight / 2,
                  }}
                >
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTalentId(talent.id);
                    }}
                    className={`
                      w-10 h-10 sm:w-11 sm:h-11 rounded-md border flex items-center justify-center transition-all relative z-10 pointer-events-auto
                      ${hasPoints ? 'bg-blue-600 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 
                        accessible ? 'bg-slate-900 border-slate-700 hover:border-slate-400' : 
                        'bg-slate-950 border-slate-900 opacity-20 grayscale cursor-not-allowed'}
                      ${selectedTalentId === talent.id ? 'ring-1 ring-white shadow-[0_0_15px_rgba(59,130,246,0.5)] z-20' : ''}
                    `}
                  >
                    <Icon size={14} className={hasPoints ? 'text-white' : 'text-slate-500'} />
                    
                    {/* Rank Indicator */}
                    <div className="absolute -bottom-1 -right-1 bg-slate-950 border border-slate-800 text-[6px] px-1 rounded font-black text-white italic min-w-[12px] text-center z-30">
                       {talent.points}/{talent.maxPoints}
                    </div>

                    {!accessible && <Lock size={6} className="absolute top-0.5 left-0.5 text-slate-800" />}
                  </button>
                  <span className={`text-[6px] font-black uppercase mt-1 tracking-tighter text-center max-w-[48px] truncate transition-colors ${hasPoints ? 'text-blue-400' : 'text-slate-600'}`}>
                    {talent.name}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Info Tip - Shows briefly then disappears or stay when nothing selected */}
        {!selectedTalent && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[150%] bg-slate-900/60 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-full pointer-events-none flex items-center gap-2">
             <Move size={10} className="text-blue-400 animate-pulse" />
             <p className="text-[7px] font-black uppercase tracking-widest text-slate-300">
                DRAG TO NAVIGATE • TAP TO SELECT
             </p>
          </div>
        )}

        {/* Talent Details Card - Compact for mobile */}
        <AnimatePresence>
          {selectedTalent && (
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="fixed bottom-3 left-3 right-3 sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl p-3 sm:p-5 bg-slate-900/95 backdrop-blur-xl border border-slate-800 shadow-[0_10px_50px_rgba(0,0,0,0.8)] z-[130] rounded-lg"
            >
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-start">
                   <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                         <h3 className="text-sm sm:text-base font-black text-white uppercase italic tracking-tight">
                            {selectedTalent.name}
                         </h3>
                         <div className="px-1 py-0.5 bg-slate-800 rounded text-blue-400 text-[8px] font-black italic">
                            RANK {selectedTalent.points}/{selectedTalent.maxPoints}
                         </div>
                      </div>
                      <p className="text-slate-400 text-[9px] sm:text-xs font-medium leading-tight mt-1 max-w-[80%]">
                        {selectedTalent.description}
                      </p>
                   </div>
                   <button 
                    onClick={() => setSelectedTalentId(null)}
                    className="p-1 text-slate-500 hover:text-white"
                   >
                      <X size={14} />
                   </button>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/50 pt-3">
                   <div className="flex flex-col">
                      {selectedTalent.levelReq > playerLevel ? (
                        <div className="text-red-500 text-[7px] font-black uppercase tracking-widest">
                            LEVEL {selectedTalent.levelReq} REQUIRED
                        </div>
                      ) : (
                        <div className="text-slate-500 text-[7px] font-black uppercase tracking-widest">
                           COST: {selectedTalent.cost} PT
                        </div>
                      )}
                   </div>

                   <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlock(selectedTalent.id);
                    }}
                    disabled={talentPoints < selectedTalent.cost || selectedTalent.points >= selectedTalent.maxPoints || !isTalentAccessible(selectedTalent)}
                    className={`px-4 py-2 font-black uppercase italic tracking-widest transition-all text-[10px] rounded
                      ${talentPoints >= selectedTalent.cost && selectedTalent.points < selectedTalent.maxPoints && isTalentAccessible(selectedTalent)
                        ? 'bg-blue-600 text-white hover:brightness-110 shadow-lg active:scale-95' 
                        : 'bg-slate-800 text-slate-600 cursor-not-allowed'}
                    `}
                   >
                     {selectedTalent.points >= selectedTalent.maxPoints ? 'MAXED' : `INVEST POINT`}
                   </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}



