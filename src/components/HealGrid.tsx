/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Unit } from '../types.ts';
import { Shield, Zap, User } from 'lucide-react';
import { SPELLS } from '../constants.ts';
import { glowForSpellId, glowForBossAbilityId } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';

interface HealGridProps {
  party: Unit[];
  onTargetSelect: (id: string) => void;
  selectedId: string | null;
  manaRegenBuffTicksRemaining?: number;
}

function healthTierClasses(percent: number) {
  if (percent < 25) {
    return {
      fill: 'bg-gradient-to-r from-red-950 via-red-900 to-red-800',
      edge: 'border-l-red-900',
    };
  }
  if (percent < 50) {
    return {
      fill: 'bg-gradient-to-r from-amber-950 via-amber-900 to-amber-800',
      edge: 'border-l-amber-900',
    };
  }
  if (percent < 75) {
    return {
      fill: 'bg-gradient-to-r from-lime-950 via-emerald-900 to-emerald-800',
      edge: 'border-l-emerald-900',
    };
  }
  return {
    fill: 'bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-700',
    edge: 'border-l-emerald-800',
  };
}

export function HealGrid({ party, onTargetSelect, selectedId, manaRegenBuffTicksRemaining = 0 }: HealGridProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-2 overflow-y-auto p-1 sm:gap-1.5 sm:p-2">
      {party.map((unit) => {
        const healthPercent = (unit.health / unit.maxHealth) * 100;
        const isDead = unit.health <= 0;
        const isSelected = selectedId === unit.id;
        const tier = healthTierClasses(isDead ? 0 : healthPercent);

        return (
          <button
            key={unit.id}
            id={`unit-${unit.id}`}
            onClick={() => onTargetSelect(unit.id)}
            className={`
              relative flex h-20 w-full ${isSelected ? 'border-l-[6px]' : 'border-l-4'} bg-slate-900 overflow-hidden transition-all duration-150
              ${
                isSelected
                  ? 'z-10 scale-[1.02] border-blue-300 ring-[3px] ring-inset ring-blue-400 brightness-110'
                  : `border-y border-r border-slate-800 ${tier.edge}`
              }
              ${isDead ? 'opacity-45 shadow-inner' : ''}
              group text-left
            `}
          >
            <motion.div
              className={`pointer-events-none absolute inset-y-0 left-0 z-[1] ${tier.fill} opacity-90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.35),inset_-3px_0_10px_rgba(0,0,0,0.25)]`}
              initial={false}
              animate={{ width: `${healthPercent}%` }}
              transition={{ type: 'tween', duration: 0.2 }}
              style={{ originX: 0 }}
            />

            {/* Content Container */}
            <div className="pointer-events-none relative z-10 flex w-full items-center justify-between p-2.5 sm:p-3">
              <div className="flex min-w-0 flex-1 flex-col pr-2">
                <div className="truncate text-base font-black uppercase italic leading-none tracking-tight text-white sm:text-lg">
                  {unit.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 sm:text-[7px]">
                  <span>{unit.role}</span>
                  <span className="rounded border border-slate-700/80 bg-slate-950/60 px-1 font-mono text-slate-300">
                    Lv {unit.level}
                  </span>
                  {unit.shield > 0 ? (
                    <span className="font-mono text-sky-400">+{Math.round(unit.shield)} absorb</span>
                  ) : null}
                </div>
                
                {/* Buffs as small icons */}
                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:gap-1">
                  {unit.buffs.map((buff) => {
                    const secondsLeft = Math.ceil(buff.remainingTicks / 10);
                    const showCountdown = buff.remainingTicks < 50;

                    return (
                      <div 
                        key={buff.id}
                        className="relative sm:p-0.5"
                        title={buff.name}
                      >
                         <GameIcon
                           iconPath={buff.icon}
                           glow={glowForSpellId(buff.sourceSpellId)}
                           size="xs"
                         />
                         {showCountdown && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/90 px-0.5 text-[10px] font-black text-red-500 sm:text-[7px]">
                                {secondsLeft}
                            </div>
                         )}
                      </div>
                    );
                  })}
                  {unit.debuffs.map((debuff) => {
                    const secondsLeft = Math.ceil(debuff.remainingTicks / 10);
                    const showCountdown = debuff.remainingTicks < 50;
                    return (
                      <div
                        key={debuff.id}
                        className="relative rounded-md ring-1 ring-red-500/55 sm:p-0.5"
                        title={debuff.name}
                      >
                        <GameIcon
                          iconPath={debuff.icon}
                          glow={glowForBossAbilityId(debuff.sourceAbilityId)}
                          size="xs"
                        />
                        {showCountdown && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/90 px-0.5 text-[10px] font-black text-orange-400 sm:text-[7px]">
                            {secondsLeft}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unit.role === 'HEALER' && manaRegenBuffTicksRemaining > 0 && (
                    <div
                      className="relative sm:p-0.5"
                      title="Mana Potion — bonus regen"
                    >
                      <GameIcon iconPath={SPELLS.mana_potion.icon} glow="spell" size="xs" />
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

              <div className={`shrink-0 text-2xl font-black italic tracking-tighter sm:text-3xl ${healthPercent < 25 && !isDead ? 'animate-pulse text-red-400' : 'text-slate-100'}`}>
                {isDead ? '0%' : `${Math.ceil(healthPercent)}%`}
              </div>
            </div>

            {/* Subtle Role Overlay */}
            <div className="pointer-events-none absolute top-1 right-1 opacity-[0.14]">
               {unit.role === 'TANK' && <Shield className="text-sky-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'DPS' && <Zap className="text-amber-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'HEALER' && <User className="text-emerald-400" size={32} strokeWidth={1.5} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

