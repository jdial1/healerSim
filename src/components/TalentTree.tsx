/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Star, X, Move } from 'lucide-react';
import * as Icons from 'lucide-react';
import { Talent } from '../types.ts';

interface TalentTreeProps {
  talents: Talent[];
  talentPoints: number;
  onUnlock: (talentId: string) => void;
  onClose: () => void;
  playerLevel: number;
}

export function TalentTree({ talents, talentPoints, onUnlock, onClose, playerLevel }: TalentTreeProps) {
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

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

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.4), 2));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      pinchStartRef.current = { dist, zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const ratio = dist / pinchStartRef.current.dist;
      setZoom(Math.min(Math.max(pinchStartRef.current.zoom * ratio, 0.4), 2));
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
  };

  const getRankDescription = (talent: Talent, rank: number) => {
    if (rank === 0) return null;
    const bonus = talent.statBonus;
    if (!bonus) return talent.description;

    const parts = [];
    if (bonus.healingBoost) parts.push(`Increases healing by ${bonus.healingBoost * rank}%`);
    if (bonus.manaPool) parts.push(`Increases mana pool by ${bonus.manaPool * rank}`);
    if (bonus.haste) parts.push(`Increases haste by ${bonus.haste * rank}%`);
    if (bonus.critChance) parts.push(`Increases crit chance by ${bonus.critChance * rank}%`);
    if (bonus.manaReturnOnDirectHeal) parts.push(`Restores ${bonus.manaReturnOnDirectHeal * rank} mana on direct heals`);
    
    if (parts.length === 0) return talent.description;
    return parts.join(', ');
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
           {/* Zoom Indicator */}
           <button 
            onClick={() => setZoom(1)}
            className="flex flex-col items-center justify-center bg-slate-800/80 border border-slate-700 rounded px-2 py-1 min-w-[48px] hover:bg-slate-700 transition-colors"
           >
              <div className="text-[6px] font-black text-slate-500 uppercase tracking-widest">ZOOM</div>
              <div className="text-[10px] font-black text-blue-400 italic">
                 {Math.round(zoom * 100)}%
              </div>
           </button>

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

      <div 
        className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)]" 
        ref={constraintsRef}
        onWheel={handleWheel}
        onPointerDown={() => setSelectedTalentId(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Draggable Area */}
        <motion.div 
          drag
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
          animate={{ scale: zoom }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute w-[2000px] h-[2000px] left-[-750px] top-[-750px] cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto origin-center"
        >
          <div className="relative pointer-events-none" style={{ width: '600px', height: '600px' }}>
            {/* SVG Connections - unchanged */}
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
                    strokeWidth={1 / zoom}
                    strokeDasharray={isLineActive ? "0" : `${2/zoom},${2/zoom}`}
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
              const isSelected = selectedTalentId === talent.id;
              const Icon = (Icons as any)[talent.icon] || Icons.Circle;

              return (
                <div
                  key={talent.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                  style={{ 
                    left: talent.gridX * (nodeWidth + gapX) + nodeWidth / 2,
                    top: talent.gridY * (nodeHeight + gapY) + nodeHeight / 2,
                    zIndex: isSelected ? 100 : 10
                  }}
                >
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTalentId(talent.id);
                    }}
                    className={`
                      rounded-md border flex items-center justify-center transition-all relative z-10 pointer-events-auto
                      ${hasPoints ? 'bg-blue-600 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 
                        accessible ? 'bg-slate-900 border-slate-700 hover:border-slate-400' : 
                        'bg-slate-950 border-slate-900 opacity-20 grayscale cursor-not-allowed'}
                      ${isSelected ? 'ring-2 ring-white shadow-[0_0_20px_rgba(59,130,246,0.6)]' : ''}
                    `}
                    style={{
                      width: nodeWidth,
                      height: nodeHeight
                    }}
                  >
                    <Icon size={14} className={hasPoints ? 'text-white' : 'text-slate-500'} />
                    <div className="absolute -bottom-1 -right-1 bg-slate-950 border border-slate-800 text-[6px] px-1 rounded font-black text-white italic min-w-[12px] text-center z-30">
                       {talent.points}/{talent.maxPoints}
                    </div>
                    {!accessible && <Lock size={6} className="absolute top-0.5 left-0.5 text-slate-800" />}
                  </button>
                  <span className={`text-[6px] font-black uppercase mt-1 tracking-tighter text-center max-w-[48px] truncate transition-colors ${hasPoints ? 'text-blue-400' : 'text-slate-600'}`}>
                    {talent.name}
                  </span>

                  {/* Contextual Tooltip */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, x: 10, y: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute bottom-full left-full ml-4 mb-4 w-[300px] sm:w-[350px] bg-[#070d1a]/95 border border-[#4a4a4a] shadow-[inset_0_0_10px_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.9)] p-5 pointer-events-auto z-[200] rounded-sm"
                      >
                         <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter mb-1">
                           {talent.name}
                         </h3>
                         <div className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em] mb-4 flex justify-between border-b border-white/5 pb-2">
                            <span>Talent</span>
                            <span className="text-blue-400 italic">Rank {talent.points}/{talent.maxPoints}</span>
                         </div>

                         {/* Current Rank */}
                         <div className="space-y-4">
                           <div className="space-y-1">
                             <p className="text-[#ffd100] text-sm sm:text-base font-medium leading-relaxed italic">
                               {talent.points > 0 ? getRankDescription(talent, talent.points) : talent.description}
                             </p>
                           </div>

                           {/* Next Rank */}
                           {talent.points < talent.maxPoints && talent.points > 0 && (
                             <div className="pt-4 border-t border-white/10">
                                <div className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Next Rank:</div>
                                <p className="text-[#ffd100]/80 text-sm sm:text-base font-medium leading-relaxed italic">
                                  {getRankDescription(talent, talent.points + 1)}
                                </p>
                             </div>
                           )}
                         </div>

                         <div className="mt-8 flex flex-col gap-3">
                           {talent.levelReq > playerLevel && (
                             <div className="text-red-500 text-[9px] font-black uppercase tracking-widest border border-red-500/20 bg-red-500/5 p-2 text-center">
                                LEVEL {talent.levelReq} REQUIRED
                             </div>
                           )}
                           
                           <button 
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnlock(talent.id);
                            }}
                            disabled={talentPoints < talent.cost || talent.points >= talent.maxPoints || !accessible}
                            className={`w-full py-3 font-black uppercase italic tracking-widest transition-all text-sm rounded-sm
                              ${talentPoints >= talent.cost && talent.points < talent.maxPoints && accessible
                                ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95' 
                                : 'bg-slate-900 text-slate-700 cursor-not-allowed'}
                            `}
                           >
                             {talent.points >= talent.maxPoints ? 'MAXED' : (
                               <span className={talentPoints >= talent.cost && accessible ? 'text-[#1eff00]' : ''}>
                                  {talent.points === 0 ? 'Click to Learn' : 'Click to Invest'}
                               </span>
                             )}
                           </button>
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}



