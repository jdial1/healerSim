/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
  SPELLS,
  getManaRegenPerSecond,
  MANA_POTION_USES_PER_DUNGEON,
  MANA_REGEN_BUFF_UI_MULTIPLIER,
} from '../constants.ts';
import { PlayerCombatStats } from '../types.ts';
import { spellEffectTooltipText } from '../spellTooltip.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { motion } from 'motion/react';
import { glowForSpellId } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';

function spellSlotButtonClass(
  borderClass: string,
  state: {
    spellsEnabled: boolean;
    reordering: boolean;
    draggingHere: boolean;
    cooldown: number;
    isLowMana: boolean;
    noPotionCharges: boolean;
  },
) {
  let extra = '';
  if (!state.spellsEnabled && !state.reordering) {
    extra += ' cursor-not-allowed opacity-50';
  } else if (!state.spellsEnabled && state.reordering) {
    extra += ' cursor-grab touch-none opacity-50 active:cursor-grabbing';
  }
  if (state.draggingHere) extra += ' opacity-30';
  if (state.spellsEnabled) {
    if (state.cooldown > 0) extra += ' opacity-60';
    else if (state.isLowMana || state.noPotionCharges) extra += ' opacity-45';
    else extra += ' hover:-translate-y-1 hover:bg-slate-700 shadow-lg';
  }
  return `ui-spell-slot-base ${borderClass}${extra}`;
}

function emptySpellSlotClass(reordering: boolean, draggingHere: boolean) {
  let extra = 'ui-spell-slot-base ui-spell-slot-empty';
  if (reordering) extra += ' ui-spell-slot-drop-target';
  if (draggingHere) extra += ' opacity-30';
  return extra;
}

function spellBarIconClass(highlighted: boolean, canInteract: boolean) {
  let c = 'shrink-0';
  if (highlighted) c += ' ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900';
  if (canInteract) c += ' transition-transform group-hover:scale-105';
  return c;
}

function spellTooltipVisibilityClass(previewOpen: boolean) {
  return previewOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
}

interface ActionBarsProps {
  playerCombatStats: PlayerCombatStats;
  spellIds: string[];
  cooldowns: Record<string, number>;
  onCast: (id: string) => void;
  allowReorder?: boolean;
  onReorderSlots?: (fromIndex: number, toIndex: number) => void;
}

export function ActionBars({
  playerCombatStats,
  spellIds,
  cooldowns,
  onCast,
  allowReorder = false,
  onReorderSlots,
}: ActionBarsProps) {
  const {
    xp,
    mana,
    maxMana,
    manaRegenBuffTicksRemaining,
    spiritRegenLockoutTicksRemaining,
    spirit,
    spellsEnabled,
    manaPotionChargesRemaining,
    spellHealingMultiplier,
    actionBarHighlights,
    playerClass,
  } = playerCombatStats;
  const barRootRef = useRef<HTMLDivElement>(null);
  const spellTipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const suppressPreviewClickUntilRef = useRef(0);
  const [previewTooltipSpellId, setPreviewTooltipSpellId] = useState<string | null>(null);
  const [tooltipHoverSpellId, setTooltipHoverSpellId] = useState<string | null>(null);
  const [draggingBarIndex, setDraggingBarIndex] = useState<number | null>(null);

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

  const repositionSpellTooltips = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const vw = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    if (!vw) return;
    const margin = 12;
    for (const key of Object.keys(spellTipRefs.current)) {
      const el = spellTipRefs.current[key];
      if (el) el.style.transform = 'translateX(-50%)';
    }
    const activeId = tooltipHoverSpellId ?? previewTooltipSpellId;
    if (!activeId) return;
    const tip = spellTipRefs.current[activeId];
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > vw - margin) dx += vw - margin - rect.right;
    if (rect.left + dx < margin) dx += margin - (rect.left + dx);
    if (dx !== 0) tip.style.transform = `translateX(calc(-50% + ${dx}px))`;
  }, [tooltipHoverSpellId, previewTooltipSpellId]);

  useLayoutEffect(() => {
    repositionSpellTooltips();
  }, [
    repositionSpellTooltips,
    spellIds,
    spellHealingMultiplier,
    manaPotionChargesRemaining,
    spirit,
    playerClass,
  ]);

  useEffect(() => {
    const ro = () => repositionSpellTooltips();
    window.addEventListener('resize', ro);
    window.visualViewport?.addEventListener('resize', ro);
    window.visualViewport?.addEventListener('scroll', ro);
    return () => {
      window.removeEventListener('resize', ro);
      window.visualViewport?.removeEventListener('resize', ro);
      window.visualViewport?.removeEventListener('scroll', ro);
    };
  }, [repositionSpellTooltips]);

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
  const baseRegenPerSec = getManaRegenPerSecond(0, 0, spirit);
  const regenPerSec = getManaRegenPerSecond(
    spiritRegenLockoutTicksRemaining,
    manaRegenBuffTicksRemaining,
    spirit,
  );
  const regenBuffActive = manaRegenBuffTicksRemaining > 0;
  const spiritRegenPaused =
    spiritRegenLockoutTicksRemaining > 0 && manaRegenBuffTicksRemaining <= 0;

  return (
    <div ref={barRootRef} className="ui-action-bar-root">
      <div className="absolute inset-0 bg-slate-900" aria-hidden />
      <div className="ui-action-bar-stack">
      {!spellsEnabled ? (
        <div className="ui-xp-bar-wrap">
          <div
            className="ui-xp-bar-track"
            role="progressbar"
            aria-valuenow={xpIntoLevel}
            aria-valuemin={0}
            aria-valuemax={xpForNextLevel}
          >
            <div className="ui-xp-bar-segments">
              {xpSegmentFillPercents.map((fillPct, i) => (
                <div key={i} className="ui-xp-bar-segment-shell">
                  <motion.div
                    className="ui-xp-bar-segment-fill"
                    initial={false}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ type: 'tween', duration: 0.2 }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
            <div className="ui-xp-bar-label-wrap">
              <span className="ui-xp-bar-label">
                {xpIntoLevel}
                <span className="ui-xp-bar-label-denom">
                  / {xpForNextLevel}
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="ui-action-bar-column">
        <div className="ui-mana-pool-panel">
        <motion.div
          className="ui-mana-pool-underlay"
          initial={false}
          animate={{ width: `${manaPercent}%` }}
          transition={{ type: 'tween', duration: 0.2 }}
          aria-hidden
        />
        <div className="ui-mana-pool-row">
        <div className="flex min-w-0 flex-col gap-0 leading-tight">
          <span className="text-sm font-black uppercase tracking-wide text-slate-400">Mana Pool</span>
          <span className="text-sm font-mono font-bold tracking-tight">
            {regenBuffActive ? (
              <>
                <span className="text-blue-300">
                  +{Number.isInteger(regenPerSec) ? regenPerSec : regenPerSec.toFixed(1)}/s
                </span>
                <span className="ml-1.5 text-xs font-black uppercase text-blue-400/90">
                  {MANA_REGEN_BUFF_UI_MULTIPLIER}× Potion
                </span>
                <span className="ml-1.5 text-xs text-slate-600 line-through decoration-slate-600">
                  +{baseRegenPerSec}/s
                </span>
              </>
            ) : spiritRegenPaused ? (
              <span className="text-amber-500/90">
                +0/s
                <span className="ml-1.5 text-xs font-black uppercase tracking-wide">5SR</span>
              </span>
            ) : (
              <span className="text-slate-500">
                +{Number.isInteger(baseRegenPerSec) ? baseRegenPerSec : baseRegenPerSec.toFixed(1)}/s
              </span>
            )}
          </span>
        </div>
        <span className="ui-mana-pool-readout">
          {Math.floor(mana)}<span className="ui-mana-pool-readout-max">/ {maxMana}</span>
        </span>
        </div>
        </div>
      <div className="ui-spell-bar-row">
        {spellIds.map((id, index) => {
          const reordering = allowReorder && onReorderSlots;
          if (id === '') {
            return (
              <div key={`bar-${index}`} className="relative group">
                <div
                  role="presentation"
                  draggable={false}
                  onDragOver={
                    reordering
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      : undefined
                  }
                  onDrop={
                    reordering
                      ? (e) => {
                          e.preventDefault();
                          const raw = e.dataTransfer.getData('text/plain');
                          const from = parseInt(raw, 10);
                          if (Number.isNaN(from)) return;
                          suppressPreviewClickUntilRef.current = performance.now() + 450;
                          onReorderSlots(from, index);
                          setDraggingBarIndex(null);
                        }
                      : undefined
                  }
                  className={emptySpellSlotClass(!!reordering, draggingBarIndex === index)}
                >
                  <div className="ui-spell-slot-index">
                    {index + 1}
                  </div>
                </div>
              </div>
            );
          }

          const spell = SPELLS[id];
          if (!spell) return null;

          const cooldown = cooldowns[id] || 0;
          const isLowMana = mana < spell.manaCost;
          const noPotionCharges =
            Boolean(spell.limitedDungeonConsumable) && manaPotionChargesRemaining <= 0;
          const castBlocked = cooldown > 0 || isLowMana || noPotionCharges;
          const disabled = spellsEnabled && castBlocked;

          return (
            <div
              key={`bar-${index}`}
              className="relative group"
              onPointerEnter={() => setTooltipHoverSpellId(id)}
              onPointerLeave={() => {
                setTooltipHoverSpellId((cur) => (cur === id ? null : cur));
              }}
            >
              <button
                id={`spell-${id}`}
                type="button"
                draggable={!!reordering}
                onDragStart={
                  reordering
                    ? (e) => {
                        e.dataTransfer.setData('text/plain', String(index));
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingBarIndex(index);
                      }
                    : undefined
                }
                onDragEnd={reordering ? () => setDraggingBarIndex(null) : undefined}
                onDragOver={
                  reordering
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    : undefined
                }
                onDrop={
                  reordering
                    ? (e) => {
                        e.preventDefault();
                        const raw = e.dataTransfer.getData('text/plain');
                        const from = parseInt(raw, 10);
                        if (Number.isNaN(from)) return;
                        suppressPreviewClickUntilRef.current = performance.now() + 450;
                        onReorderSlots(from, index);
                        setDraggingBarIndex(null);
                      }
                    : undefined
                }
                onClick={() => {
                  if (performance.now() < suppressPreviewClickUntilRef.current) return;
                  if (!spellsEnabled) {
                    setPreviewTooltipSpellId((prev) => (prev === id ? null : id));
                    return;
                  }
                  onCast(id);
                }}
                disabled={disabled}
                className={spellSlotButtonClass(spell.actionBarBorderClass, {
                  spellsEnabled,
                  reordering: !!reordering,
                  draggingHere: draggingBarIndex === index,
                  cooldown,
                  isLowMana,
                  noPotionCharges,
                })}
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
                  className={spellBarIconClass(
                    Boolean(actionBarHighlights[id]),
                    spellsEnabled && cooldown <= 0 && !isLowMana && !noPotionCharges,
                  )}
                />
                
                <span className="ui-spell-name-label group-hover:text-white">
                    {spell.name.split(' ')[0]}
                </span>

                {spell.manaCost > 0 && (
                  <div className="ui-spell-mana-cost">
                      {spell.manaCost}
                  </div>
                )}
                {spell.limitedDungeonConsumable && spellsEnabled && (
                  <div className="ui-spell-potion-badge">
                    {manaPotionChargesRemaining}/{MANA_POTION_USES_PER_DUNGEON}
                  </div>
                )}

                {cooldown > 0 && (
                  <div className="ui-spell-cd-overlay">
                    <motion.div 
                        className="ui-spell-cd-sweep"
                        initial={{ height: '100%' }}
                        animate={{ height: `${(cooldown / spell.cooldown) * 100}%` }}
                        transition={{ duration: 0.1 }}
                    />
                    <span className="ui-spell-cd-text">
                      {cooldown > 10 ? Math.ceil(cooldown / 10) : (cooldown / 10).toFixed(1)}
                    </span>
                  </div>
                )}

                <div className="ui-spell-slot-index ui-spell-slot-index-filled">
                   {index + 1}
                </div>
              </button>

              <div
                ref={(el) => {
                  if (el) spellTipRefs.current[id] = el;
                  else delete spellTipRefs.current[id];
                }}
                className={`ui-spell-tooltip ${spellTooltipVisibilityClass(previewTooltipSpellId === id)}`}
                style={{ transform: 'translateX(-50%)' }}
              >
                <GameIcon
                  iconPath={spell.icon}
                  glow={glowForSpellId(id)}
                  size="md"
                  className="ui-spell-tooltip-icon"
                />
                <div className="ui-spell-tooltip-body">
                  <div className="ui-spell-tooltip-title">
                    {spell.name}
                  </div>
                  {spell.manaCost > 0 ? (
                    <div className="ui-spell-tooltip-mana">{spell.manaCost} Mana</div>
                  ) : null}
                  <div
                    className={`ui-spell-tooltip-desc${spell.manaCost > 0 ? ' mt-1.5' : ''}`}
                  >
                    {spellEffectTooltipText(spell, { spellHealingMultiplier, spirit })}
                  </div>
                </div>
                <div className="ui-spell-tooltip-arrow" aria-hidden />
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



