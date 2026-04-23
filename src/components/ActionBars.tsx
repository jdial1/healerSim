/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Icons from 'lucide-react';
import { SPELLS } from '../constants.ts';
import { motion } from 'motion/react';

interface ActionBarsProps {
  spellIds: string[];
  cooldowns: Record<string, number>;
  onCast: (id: string) => void;
  mana: number;
  isHub?: boolean;
}

export function ActionBars({ spellIds, cooldowns, onCast, mana, isHub }: ActionBarsProps) {
  const getSpellColor = (id: string) => {
    switch (id) {
        case 'flash_heal': return 'border-sky-400';
        case 'renew': return 'border-green-500';
        case 'greater_heal': return 'border-yellow-400';
        case 'rejuvenation': return 'border-emerald-500';
        case 'regrowth': return 'border-lime-500';
        case 'wild_growth': return 'border-purple-500';
        case 'mana_potion': return 'border-blue-500';
        default: return 'border-slate-700';
    }
  }

  const getSpellDesc = (id: string) => {
    const spell = SPELLS[id];
    if (!spell) return '';
    const healing = spell.healing > 0 ? `Heals for ${spell.healing}. ` : '';
    const hot = spell.hotDuration ? `Heals for ${spell.hotHealingPerTick} every second for ${spell.hotDuration/10}s. ` : '';
    const mana = spell.manaRestore ? `Restores ${spell.manaRestore} Mana. ` : '';
    const aoe = spell.type === 'AOE' ? 'Heals the entire party. ' : '';
    return `${healing}${hot}${mana}${aoe}Cost: ${spell.manaCost} Mana.`;
  };

  return (
    <div className={`p-6 bg-slate-900 border-t border-slate-800 fixed bottom-0 left-0 right-0 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 items-center`}>
      {isHub && (
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 border-b border-slate-800 pb-2 w-full text-center">
             LOADOUT PREVIEW • ABILITY INTEL
          </div>
      )}
      
      <div className="flex gap-2 justify-center">
        {spellIds.map((id, index) => {
          const spell = SPELLS[id];
          if (!spell) return null;

          const IconComponent = (Icons as any)[spell.icon] || Icons.HelpCircle;
          const cooldown = cooldowns[id] || 0;
          const isLowMana = mana < spell.manaCost;

          return (
            <div key={`${id}-${index}`} className="relative group">
              <button
                id={`spell-${id}`}
                onClick={() => onCast(id)}
                disabled={cooldown > 0 || isLowMana}
                className={`
                  relative w-16 h-16 sm:w-20 sm:h-20 bg-slate-800 flex flex-col items-center justify-center border-b-4 transition-all active:scale-95
                  ${getSpellColor(id)}
                  ${cooldown > 0 ? 'opacity-60' : isLowMana ? 'opacity-40 grayscale' : 'hover:bg-slate-700 hover:-translate-y-1 shadow-lg'}
                `}
              >
                <IconComponent size={24} className={`mt-1 transition-transform group-hover:scale-110 ${cooldown > 0 ? 'text-slate-500' : 'text-white'}`} />
                
                <span className="text-[9px] sm:text-[10px] font-black uppercase mt-1 tracking-tighter text-slate-100 group-hover:text-white">
                    {spell.name.split(' ')[0]}
                </span>

                {/* Mana Cost / Indicator */}
                {spell.manaCost > 0 && (
                  <div className="absolute top-1 right-1 text-[8px] font-bold text-slate-500 font-mono">
                      {spell.manaCost}
                  </div>
                )}

                {/* Cooldown Overlay */}
                {cooldown > 0 && (
                  <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center overflow-hidden">
                    <motion.div 
                        className="absolute inset-x-0 bottom-0 bg-blue-500/20"
                        initial={{ height: '100%' }}
                        animate={{ height: `${(cooldown / spell.cooldown) * 100}%` }}
                        transition={{ duration: 0.1 }}
                    />
                    <span className="relative z-10 text-xl font-black text-white italic drop-shadow-[0_0_5px_rgba(0,0,0,1)]">
                      {cooldown > 10 ? Math.ceil(cooldown / 10) : (cooldown / 10).toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Keybind overlay */}
                <div className="absolute top-0.5 left-1 text-[8px] font-mono font-black text-slate-600 bg-slate-900/50 px-0.5 rounded">
                   {index + 1}
                </div>
              </button>

              {/* Tooltip on Hub or Hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 p-3 bg-slate-950 border border-slate-800 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100]">
                  <div className="text-xs font-black text-white uppercase italic mb-1 border-b border-slate-800 pb-1">
                      {spell.name}
                  </div>
                  <div className="text-[10px] font-medium text-slate-400 leading-snug">
                     {getSpellDesc(id)}
                  </div>
                  
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-950" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



