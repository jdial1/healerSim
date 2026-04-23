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
  FlaskConical,
} from 'lucide-react';

interface HealGridProps {
  party: Unit[];
  onTargetSelect: (id: string) => void;
  selectedId: string | null;
  manaRegenBuffTicksRemaining?: number;
}

export function HealGrid({ party, onTargetSelect, selectedId, manaRegenBuffTicksRemaining = 0 }: HealGridProps) {
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-2 overflow-y-auto p-1 sm:gap-1.5 sm:p-2">
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
              relative flex h-20 w-full border-l-4 bg-slate-900 overflow-hidden transition-all
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
            <div className="pointer-events-none relative z-10 flex w-full items-center justify-between p-2.5 sm:p-3">
              <div className="flex min-w-0 flex-1 flex-col pr-2">
                <div className="truncate text-base font-black uppercase italic leading-none tracking-tight text-white sm:text-lg">
                  {unit.name}
                </div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 sm:text-[7px]">{unit.role}</div>
                
                {/* Buffs as small icons */}
                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:gap-1">
                  {unit.buffs.map((buff) => {
                    const BuffIcon = (Icons as any)[buff.icon] || Icons.HelpCircle;
                    const secondsLeft = Math.ceil(buff.remainingTicks / 10);
                    const showCountdown = buff.remainingTicks < 50;

                    return (
                      <div 
                        key={buff.id}
                        className="relative rounded border border-white/10 bg-slate-950/80 p-1 shadow-sm sm:p-0.5"
                        title={buff.name}
                      >
                         <BuffIcon className="size-5 text-white opacity-60 sm:size-3.5" />
                         
                         {showCountdown && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-0.5 text-[10px] font-black text-red-500 sm:text-[7px]">
                                {secondsLeft}
                            </div>
                         )}
                      </div>
                    );
                  })}
                  {unit.role === 'HEALER' && manaRegenBuffTicksRemaining > 0 && (
                    <div
                      className="relative rounded border border-blue-500/40 bg-blue-950/80 p-1 shadow-sm sm:p-0.5"
                      title="Mana Potion — bonus regen"
                    >
                      <FlaskConical className="size-5 text-blue-400 sm:size-3.5" />
                      {manaRegenBuffTicksRemaining < 50 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-0.5 text-[10px] font-black text-blue-300 sm:text-[7px]">
                          {Math.ceil(manaRegenBuffTicksRemaining / 10)}
                        </div>
                      )}
                    </div>
                  )}
                  {isDead && (
                    <span className="border border-red-500/30 bg-red-600/20 px-1 text-[10px] font-black uppercase tracking-widest text-red-400 sm:text-[8px]">
                      FALLEN
                    </span>
                  )}
                </div>
              </div>

              <div className={`shrink-0 text-2xl font-black italic tracking-tighter sm:text-3xl ${healthPercent < 30 && !isDead ? 'animate-pulse text-red-500' : 'text-slate-100'}`}>
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

