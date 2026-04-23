/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Unit } from '../types.ts';
import * as Icons from 'lucide-react';
import { 
  Shield, 
  Zap, 
  User, 
} from 'lucide-react';

interface HealGridProps {
  party: Unit[];
  onTargetSelect: (id: string) => void;
  selectedId: string | null;
}

export function HealGrid({ party, onTargetSelect, selectedId }: HealGridProps) {
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'TANK': return 'border-amber-600';
      case 'DPS': return 'border-sky-400';
      case 'HEALER': return 'border-yellow-400';
      default: return 'border-slate-700';
    }
  };

  const getRoleBg = (role: string) => {
    switch (role) {
      case 'TANK': return 'bg-amber-600/20';
      case 'DPS': return 'bg-sky-400/20';
      case 'HEALER': return 'bg-yellow-400/20';
      default: return 'bg-slate-800';
    }
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 w-full max-w-xl mx-auto overflow-y-auto">
      {party.map((unit) => {
        const healthPercent = (unit.health / unit.maxHealth) * 100;
        const isDead = unit.health <= 0;
        const isSelected = selectedId === unit.id;

        return (
          <button
            key={unit.id}
            id={`unit-${unit.id}`}
            onClick={() => onTargetSelect(unit.id)}
            className={`
              relative flex h-16 sm:h-20 w-full border-l-4 bg-slate-900 overflow-hidden transition-all
              ${getRoleColor(unit.role)}
              ${isSelected ? 'ring-1 ring-blue-500 scale-[1.01] z-10' : 'border-slate-800'}
              ${isDead ? 'opacity-40 grayscale shadow-inner' : ''}
              group text-left
            `}
          >
            {/* Background progress bar */}
            <motion.div
              className={`absolute inset-0 ${getRoleBg(unit.role)} opacity-30`}
              initial={{ width: '100%' }}
              animate={{ width: `${healthPercent}%` }}
              style={{ originX: 0 }}
            />

            {/* Content Container */}
            <div className="relative z-10 flex w-full p-2 sm:p-3 items-center justify-between pointer-events-none">
              <div className="flex flex-col">
                <div className="text-sm sm:text-lg font-black uppercase tracking-tight text-white italic leading-none truncate max-w-[120px]">
                  {unit.name}
                </div>
                <div className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{unit.role}</div>
                
                {/* Buffs as small icons */}
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {unit.buffs.map((buff) => {
                    const BuffIcon = (Icons as any)[buff.icon] || Icons.HelpCircle;
                    const secondsLeft = Math.ceil(buff.remainingTicks / 10);
                    const showCountdown = buff.remainingTicks < 50;

                    return (
                      <div 
                        key={buff.id}
                        className="p-0.5 bg-slate-950/80 rounded border border-white/10 relative shadow-sm"
                        title={buff.name}
                      >
                         <BuffIcon size={12} className="text-white opacity-60" />
                         
                         {/* Pulse countdown */}
                         {showCountdown && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-[7px] font-black text-red-500 px-0.5">
                                {secondsLeft}
                            </div>
                         )}
                      </div>
                    );
                  })}
                  {isDead && (
                    <span className="bg-red-600/20 text-[8px] px-1 font-black uppercase tracking-widest text-red-400 border border-red-500/30">
                      FALLEN
                    </span>
                  )}
                </div>
              </div>

              <div className={`text-xl sm:text-3xl font-black italic tracking-tighter ${healthPercent < 30 && !isDead ? 'text-red-500 animate-pulse' : 'text-slate-100'}`}>
                {isDead ? '0%' : `${Math.ceil(healthPercent)}%`}
              </div>
            </div>

            {/* Subtle Role Overlay */}
            <div className="absolute top-1 right-1 opacity-[0.03] text-white">
               {unit.role === 'TANK' && <Shield size={32} />}
               {unit.role === 'DPS' && <Zap size={32} />}
               {unit.role === 'HEALER' && <User size={32} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

