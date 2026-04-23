/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType } from '../types.ts';
import { Leaf, Sun, Shield } from 'lucide-react';
import { motion } from 'motion/react';

interface ClassSelectorProps {
  onSelect: (cls: ClassType) => void;
}

export function ClassSelector({ onSelect }: ClassSelectorProps) {
  const classes = [
    {
      id: ClassType.PRIEST,
      name: 'Holy Priest',
      description: 'Master of direct healing and divine protection. High burst, high cost.',
      icon: Sun,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-400'
    },
    {
      id: ClassType.DRUID,
      name: 'Resto Druid',
      description: 'Nature-based healing over time (HoTs). Keep the party blooming.',
      icon: Leaf,
      color: 'bg-green-600',
      textColor: 'text-green-400'
    },
    {
      id: ClassType.PALADIN,
      name: 'Holy Paladin',
      description: 'Frontline healer using light to infuse allies. (Unlock at Level 5)',
      icon: Shield,
      color: 'bg-pink-600',
      textColor: 'text-pink-400',
      locked: true
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6">
      <motion.h1 
        className="text-6xl sm:text-8xl font-black text-white mb-12 tracking-tighter uppercase italic leading-none text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        SELECT <br/> <span className="text-blue-500">YOUR CLASS</span>
      </motion.h1>

      <div className="grid gap-4 w-full max-w-xl">
        {classes.map((cls) => (
          <motion.button
            key={cls.id}
            onClick={() => !cls.locked && onSelect(cls.id)}
            whileHover={!cls.locked ? { x: 10, backgroundColor: '#1e293b' } : {}}
            whileTap={!cls.locked ? { scale: 0.98 } : {}}
            disabled={cls.locked}
            className={`
              relative p-8 border-l-8 flex items-center gap-8 text-left transition-all
              ${cls.locked ? 'border-slate-800 bg-slate-900/50 opacity-40 grayscale' : 'border-slate-700 bg-slate-900 shadow-2xl'}
              ${!cls.locked && cls.id === ClassType.PRIEST ? 'hover:border-yellow-400' : ''}
              ${!cls.locked && cls.id === ClassType.DRUID ? 'hover:border-green-500' : ''}
            `}
          >
            <div className={`p-5 rounded-sm ${cls.color} text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] transform -rotate-3`}>
              <cls.icon size={40} strokeWidth={3} />
            </div>
            <div>
              <h3 className={`text-3xl font-black uppercase tracking-tighter italic ${cls.textColor}`}>
                {cls.name}
              </h3>
              <p className="mt-2 max-w-xs text-base font-medium leading-tight text-slate-400 sm:text-sm">
                {cls.description}
              </p>
            </div>
            {cls.locked && (
                <div className="absolute right-4 top-2 text-xs font-black uppercase tracking-[0.3em] text-red-500 sm:text-[10px]">
                    Restricted
                </div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

