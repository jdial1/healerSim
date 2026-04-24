/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  SPELLS,
  getManaRegenPerSecond,
  MANA_REGEN_PER_TICK,
  MANA_POTION_USES_PER_DUNGEON,
  TICK_RATE,
} from '../constants.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { motion } from 'motion/react';
import { glowForSpellId } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';

interface ActionBarsProps {
  spellIds: string[];
  cooldowns: Record<string, number>;
  onCast: (id: string) => void;
  xp: number;
  mana: number;
  maxMana: number;
  manaRegenBuffTicksRemaining: number;
  spellsEnabled: boolean;
  manaPotionChargesRemaining: number;
  spellHealingMultiplier: number;
}

export function ActionBars({
  spellIds,
  cooldowns,
  onCast,
  xp,
  mana,
  maxMana,
  manaRegenBuffTicksRemaining,
  spellsEnabled,
  manaPotionChargesRemaining,
  spellHealingMultiplier,
}: ActionBarsProps) {
  const barRootRef = useRef<HTMLDivElement>(null);
  const [previewTooltipSpellId, setPreviewTooltipSpellId] = useState<string | null>(null);

  useEffect(() => {
    if (spellsEnabled) setPreviewTooltipSpellId(null);
  }, [spellsEnabled]);

  useEffect(() => {
    if (spellsEnabled || previewTooltipSpellId === null) return;
    const close = (e: PointerEvent) => {
      if (barRootRef.current?.contains(e.target as Node)) return;
      setPreviewTooltipSpellId(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [spellsEnabled, previewTooltipSpellId]);

  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const xpBarPercent = xpForNextLevel > 0 ? (xpIntoLevel / xpForNextLevel) * 100 : 0;
  const xpSegmentFillPercents = Array.from({ length: 10 }, (_, i) => {
    const start = i * 10;
    const end = start + 10;
    if (xpBarPercent >= end) return 100;
    if (xpBarPercent <= start) return 0;
    return ((xpBarPercent - start) / 10) * 100;
  });
  const manaPercent = (mana / maxMana) * 100;
  const baseRegenPerSec = MANA_REGEN_PER_TICK * (1000 / TICK_RATE);
  const regenPerSec = getManaRegenPerSecond(manaRegenBuffTicksRemaining);
  const regenBuffActive = manaRegenBuffTicksRemaining > 0;
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
    const multLabel = Math.round(spellHealingMultiplier * 1000) / 1000;
    const effDirect =
      spell.healing > 0 ? Math.round(spell.healing * spellHealingMultiplier) : 0;
    const effHotTick =
      spell.hotHealingPerTick !== undefined
        ? Math.round(spell.hotHealingPerTick * spellHealingMultiplier * 10) / 10
        : 0;
    const healing = spell.healing > 0 ? `Heals for ${effDirect} (×${multLabel}). ` : '';
    const hot = spell.hotDuration
      ? `Heals for ${effHotTick} per tick (×${multLabel}) for ${spell.hotDuration / 10}s. `
      : '';
    const restore = spell.manaRestore ? `Restores ${spell.manaRestore} Mana. ` : '';
    const regenBuff =
      spell.manaRegenBuffDurationTicks !== undefined && spell.manaRegenBuffMultiplier !== undefined
        ? `${spell.manaRegenBuffMultiplier}x regen (${MANA_REGEN_PER_TICK * spell.manaRegenBuffMultiplier * (1000 / TICK_RATE)}/s) for ${spell.manaRegenBuffDurationTicks / 10}s. `
        : '';
    const aoe = spell.type === 'AOE' ? 'Heals the entire party. ' : '';
    const potionUses =
      id === 'mana_potion'
        ? `${manaPotionChargesRemaining}/${MANA_POTION_USES_PER_DUNGEON} this dungeon. `
        : '';
    return `${healing}${hot}${restore}${regenBuff}${potionUses}${aoe}Cost: ${spell.manaCost} Mana.`;
  };

  return (
    <div
      ref={barRootRef}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute inset-0 bg-slate-900" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-4 sm:py-2.5">
      {!spellsEnabled ? (
        <div className="relative w-full max-w-2xl px-0.5">
          <div
            className="relative h-[14.4px] w-full sm:h-4"
            role="progressbar"
            aria-valuenow={xpIntoLevel}
            aria-valuemin={0}
            aria-valuemax={xpForNextLevel}
          >
            <div className="absolute inset-0 flex items-stretch gap-1">
              {xpSegmentFillPercents.map((fillPct, i) => (
                <div
                  key={i}
                  className="relative min-w-0 flex-1 overflow-hidden rounded-full border border-amber-700/40 bg-slate-950/80"
                >
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 to-yellow-500"
                    initial={false}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ type: 'tween', duration: 0.2 }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span
                className="font-mono text-base font-black italic tabular-nums text-white sm:text-lg"
                style={{
                  textShadow:
                    '0 1px 0 #000,0 -1px 0 #000,1px 0 0 #000,-1px 0 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 0 0 #000,-2px 0 0 #000,2px 1px 0 #000,-2px -1px 0 #000,-1px 2px 0 #000,1px -2px 0 #000',
                }}
              >
                {xpIntoLevel}
                <span className="ml-0.5 text-sm font-normal not-italic opacity-95 sm:text-base">
                  / {xpForNextLevel}
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative flex w-full flex-col items-center gap-1.5">
        <motion.div
          className="pointer-events-none absolute inset-y-0 left-0 bg-blue-600/25 border-r border-blue-500/20"
          initial={false}
          animate={{ width: `${manaPercent}%` }}
          transition={{ type: 'tween', duration: 0.2 }}
          aria-hidden
        />
        <div className="relative z-10 flex w-full max-w-2xl items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 flex-col gap-0 leading-tight">
          <span className="text-sm font-black uppercase tracking-wide text-slate-400">Mana Pool</span>
          <span className="text-sm font-mono font-bold tracking-tight">
            {regenBuffActive ? (
              <>
                <span className="text-blue-300">
                  +{Number.isInteger(regenPerSec) ? regenPerSec : regenPerSec.toFixed(1)}/s
                </span>
                <span className="ml-1.5 text-xs font-black uppercase text-blue-400/90">
                  {SPELLS.mana_potion.manaRegenBuffMultiplier}× Potion
                </span>
                <span className="ml-1.5 text-xs text-slate-600 line-through decoration-slate-600">
                  +{baseRegenPerSec}/s
                </span>
              </>
            ) : (
              <span className="text-slate-500">
                +{Number.isInteger(baseRegenPerSec) ? baseRegenPerSec : baseRegenPerSec.toFixed(1)}/s
              </span>
            )}
          </span>
        </div>
        <span className="shrink-0 font-mono text-lg font-black italic text-blue-400 tabular-nums sm:text-xl">
          {Math.floor(mana)}<span className="ml-0.5 text-base font-normal text-slate-400 opacity-90 sm:text-lg">/ {maxMana}</span>
        </span>
        </div>
      <div className="relative z-10 flex justify-center gap-2 sm:gap-2.5">
        {spellIds.map((id, index) => {
          const spell = SPELLS[id];
          if (!spell) return null;

          const cooldown = cooldowns[id] || 0;
          const isLowMana = mana < spell.manaCost;
          const noPotionCharges = id === 'mana_potion' && manaPotionChargesRemaining <= 0;
          const castBlocked = cooldown > 0 || isLowMana || noPotionCharges;
          const disabled = spellsEnabled && castBlocked;

          return (
            <div key={`${id}-${index}`} className="relative group">
              <button
                id={`spell-${id}`}
                type="button"
                onClick={() => {
                  if (!spellsEnabled) {
                    setPreviewTooltipSpellId((prev) => (prev === id ? null : id));
                    return;
                  }
                  onCast(id);
                }}
                disabled={disabled}
                className={`
                  relative flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center border-b-4 bg-slate-800 transition-all active:scale-95 sm:h-[4.75rem] sm:w-[4.75rem]
                  ${getSpellColor(id)}
                  ${!spellsEnabled ? 'cursor-not-allowed opacity-50 grayscale' : ''}
                  ${spellsEnabled && cooldown > 0 ? 'opacity-60' : ''}
                  ${spellsEnabled && cooldown <= 0 && (isLowMana || noPotionCharges) ? 'opacity-40 grayscale' : ''}
                  ${spellsEnabled && cooldown <= 0 && !isLowMana && !noPotionCharges ? 'hover:bg-slate-700 hover:-translate-y-1 shadow-lg' : ''}
                `}
              >
                <GameIcon
                  iconPath={spell.icon}
                  glow={glowForSpellId(id)}
                  size="lg"
                  title={spell.name}
                  dimmed={
                    spellsEnabled &&
                    (cooldown > 0 || isLowMana || noPotionCharges)
                  }
                  className={`mt-0.5 shrink-0 ${spellsEnabled && cooldown <= 0 && !isLowMana && !noPotionCharges ? 'transition-transform group-hover:scale-105' : ''}`}
                />
                
                <span className="mt-0.5 max-w-[4.25rem] truncate text-center text-sm font-black uppercase leading-none tracking-tight text-slate-100 group-hover:text-white">
                    {spell.name.split(' ')[0]}
                </span>

                {spell.manaCost > 0 && (
                  <div className="absolute right-1 top-1 font-mono text-xs font-bold text-slate-500">
                      {spell.manaCost}
                  </div>
                )}
                {id === 'mana_potion' && spellsEnabled && (
                  <div className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1 font-mono text-[10px] font-black tabular-nums text-blue-300">
                    {manaPotionChargesRemaining}/{MANA_POTION_USES_PER_DUNGEON}
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
                    <span className="relative z-10 text-2xl font-black italic text-white drop-shadow-[0_0_5px_rgba(0,0,0,1)]">
                      {cooldown > 10 ? Math.ceil(cooldown / 10) : (cooldown / 10).toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Keybind overlay */}
                <div className="absolute left-1 top-0.5 rounded bg-slate-900/50 px-1 font-mono text-xs font-black text-slate-500">
                   {index + 1}
                </div>
              </button>

              <div
                className={`pointer-events-none absolute bottom-full left-1/2 z-[200] mb-3 w-52 -translate-x-1/2 border border-slate-800 bg-slate-950 p-3 shadow-2xl transition-opacity ${
                  previewTooltipSpellId === id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                  <div className="mb-1 border-b border-slate-800 pb-1 text-sm font-black uppercase italic text-white">
                      {spell.name}
                  </div>
                  <div className="text-sm font-medium leading-snug text-slate-400">
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
      </div>
    </div>
  );
}



