import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { SPELLS, getManaRegenPerSecond, MANA_POTION_USES_PER_DUNGEON } from '../constants.ts';
import { PlayerCombatStats } from '../types.ts';
import { spellDisplayManaCost, spellEffectTooltipText, spellTooltipRankLabel } from '../spellTooltip.ts';
import { xpProgressWithinLevel } from '../gameStorage.ts';
import { motion } from 'motion/react';
import { getSpellGlow } from '../gameIcons.ts';
import { manaPotionDisplayName, manaPotionIconPath } from '../manaPotionIcon.ts';
import { GameIcon } from './GameIcon.tsx';

function spellSlotButtonClass(
  borderClass: string,
  state: {
    spellsEnabled: boolean;
    reordering: boolean;
    draggingHere: boolean;
    canCast: boolean;
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
    if (state.canCast) extra += ' hover:-translate-y-1 hover:bg-slate-700 shadow-lg';
    else extra += ' cursor-not-allowed';
  }
  return `ui-spell-slot-base ${borderClass}${extra}`;
}

function emptySpellSlotClass(reordering: boolean, draggingHere: boolean) {
  let extra = 'ui-spell-slot-base ui-spell-slot-empty';
  if (reordering) extra += ' ui-spell-slot-drop-target touch-none';
  if (draggingHere) extra += ' opacity-30';
  return extra;
}

function spellBarIconClass(highlighted: boolean, canInteract: boolean) {
  let c = 'shrink-0';
  if (highlighted) c += ' ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-slate-900 shadow-[0_0_12px_rgba(110,231,183,0.5)]';
  if (canInteract) c += ' transition-transform group-hover:scale-105';
  return c;
}

function spellTooltipVisibilityClass(previewOpen: boolean) {
  return previewOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
}

function isTouchLikePointer(pointerType: string) {
  return pointerType === 'touch' || pointerType === 'pen';
}

interface ActionBarsProps {
  playerCombatStats: PlayerCombatStats;
  spellIds: string[];
  cooldowns: Record<string, number>;
  onCast: (id: string) => void;
  allowReorder?: boolean;
  onReorderSlots?: (fromIndex: number, toIndex: number) => void;
  hideResourcePanels?: boolean;
  tutorialFirstEmptyDropDataId?: string | null;
}

export function ActionBars({
  playerCombatStats,
  spellIds,
  cooldowns,
  onCast,
  allowReorder = false,
  onReorderSlots,
  hideResourcePanels = false,
  tutorialFirstEmptyDropDataId = null,
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
    manaPotionDripPerSec,
    spellHealingMultiplier,
    unlockedSpells,
    actionBarHighlights,
    playerClass,
    level,
  } = playerCombatStats;
  const firstEmptyTutorialBarIndex = tutorialFirstEmptyDropDataId ? spellIds.indexOf('') : -1;
  const barRootRef = useRef<HTMLDivElement>(null);
  const spellTipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const suppressPreviewClickUntilRef = useRef(0);
  const [previewTooltipSpellId, setPreviewTooltipSpellId] = useState<string | null>(null);
  const [tooltipHoverSpellId, setTooltipHoverSpellId] = useState<string | null>(null);
  const [draggingBarIndex, setDraggingBarIndex] = useState<number | null>(null);
  const [reorderHoverIndex, setReorderHoverIndex] = useState<number | null>(null);
  const [castBlockShake, setCastBlockShake] = useState<Record<number, number>>({});
  const touchReorderFromRef = useRef<number | null>(null);
  const touchReorderPointerIdRef = useRef<number | null>(null);
  const reorderPointerCleanupRef = useRef<(() => void) | null>(null);
  const reorderPointerClientRef = useRef({ x: 0, y: 0 });

  const actionBarIndexAtPoint = useCallback((clientX: number, clientY: number) => {
    const root = barRootRef.current;
    if (!root) return null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !root.contains(el)) return null;
    const slot = el.closest('[data-action-bar-index]');
    if (!slot || !root.contains(slot)) return null;
    const v = slot.getAttribute('data-action-bar-index');
    if (v == null) return null;
    const i = parseInt(v, 10);
    return Number.isNaN(i) ? null : i;
  }, []);

  const clearReorderGestureListeners = useCallback(() => {
    reorderPointerCleanupRef.current?.();
    reorderPointerCleanupRef.current = null;
  }, []);

  useEffect(() => () => clearReorderGestureListeners(), [clearReorderGestureListeners]);

  const attachSpellSlotReorderHold = useCallback(
    (slotIndex: number, activate: () => void, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!allowReorder || !onReorderSlots) return;
      clearReorderGestureListeners();
      let dragStarted = false;
      const el = e.currentTarget;
      const pid = e.pointerId;
      const ptype = e.pointerType;
      const startX = e.clientX;
      const startY = e.clientY;
      reorderPointerClientRef.current = { x: startX, y: startY };

      const armDrag = () => {
        if (dragStarted) return;
        dragStarted = true;
        touchReorderFromRef.current = slotIndex;
        touchReorderPointerIdRef.current = pid;
        setDraggingBarIndex(slotIndex);
        setReorderHoverIndex(slotIndex);
        try {
          el.setPointerCapture(pid);
        } catch {
          /* ignore */
        }
      };

      const longMs = isTouchLikePointer(ptype) ? 200 : 220;
      const timer = window.setTimeout(armDrag, longMs);

      const teardown = () => {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        reorderPointerCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        reorderPointerClientRef.current = { x: ev.clientX, y: ev.clientY };
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy > 36) {
          window.clearTimeout(timer);
          armDrag();
        }
        if (dragStarted) {
          ev.preventDefault();
          const hi = actionBarIndexAtPoint(ev.clientX, ev.clientY);
          if (hi !== null) setReorderHoverIndex(hi);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        teardown();
        if (!dragStarted) {
          activate();
          return;
        }
        try {
          el.releasePointerCapture(pid);
        } catch {
          /* ignore */
        }
        const from = touchReorderFromRef.current ?? slotIndex;
        touchReorderFromRef.current = null;
        touchReorderPointerIdRef.current = null;
        setDraggingBarIndex(null);
        setReorderHoverIndex(null);
        const { x, y } = reorderPointerClientRef.current;
        const hi = actionBarIndexAtPoint(x, y);
        const to = hi !== null ? hi : from;
        if (from !== to) {
          suppressPreviewClickUntilRef.current = performance.now() + 450;
          onReorderSlots(from, to);
        } else {
          suppressPreviewClickUntilRef.current = performance.now() + 450;
        }
      };

      reorderPointerCleanupRef.current = teardown;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [actionBarIndexAtPoint, allowReorder, clearReorderGestureListeners, onReorderSlots],
  );

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
  const baseRegenPerSec = getManaRegenPerSecond(0, spirit);
  const regenPerSec = getManaRegenPerSecond(spiritRegenLockoutTicksRemaining, spirit);
  const regenBuffActive = manaRegenBuffTicksRemaining > 0;
  const totalRegenPerSec = regenPerSec + manaPotionDripPerSec;
  const fmtRegen = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <div ref={barRootRef} className="ui-action-bar-root">
      <div className="absolute inset-0 bg-slate-900" aria-hidden />
      <div className="ui-action-bar-stack">
      {!spellsEnabled && !hideResourcePanels ? (
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
        {!hideResourcePanels ? (
        <div className="ui-mana-pool-panel" data-tutorial-id="mana-pool">
        <motion.div
          className="ui-mana-pool-underlay"
          initial={false}
          animate={{ width: `${manaPercent}%` }}
          transition={{ type: 'tween', duration: 0.2 }}
          aria-hidden
        />
        <div className="ui-mana-pool-row">
        <div className="flex min-w-0 flex-col gap-1 leading-tight">
          <span className="text-sm font-black uppercase tracking-wide text-slate-400">Mana Pool</span>
          <div className="ui-numeric flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-sm font-bold tracking-tight">
            {regenBuffActive && spiritRegenLockoutTicksRemaining > 0 ? (
              <>
                <span className="text-sky-100">+{fmtRegen(totalRegenPerSec)}/s</span>
                <span className="text-xs font-semibold text-sky-300/95">(+{fmtRegen(manaPotionDripPerSec)} potion)</span>
                <span className="text-[11px] font-semibold text-slate-500">(5SR)</span>
              </>
            ) : regenBuffActive ? (
              <>
                <span className="text-sky-100">+{fmtRegen(totalRegenPerSec)}/s</span>
                <span className="text-xs font-semibold text-sky-300/95">
                  (+{fmtRegen(manaPotionDripPerSec)} potion)
                </span>
              </>
            ) : spiritRegenLockoutTicksRemaining > 0 ? (
              <span className="font-semibold text-slate-500">
                +{fmtRegen(totalRegenPerSec)}/s <span className="text-[11px]">(5SR)</span>
              </span>
            ) : (
              <span className="text-emerald-200/90">+{fmtRegen(baseRegenPerSec)}/s</span>
            )}
          </div>
        </div>
        <span className="ui-mana-pool-readout">
          {Math.floor(mana)}<span className="ui-mana-pool-readout-max">/ {maxMana}</span>
        </span>
        </div>
        </div>
        ) : null}
      <div className="ui-spell-bar-tray">
      <div className="ui-spell-bar-row">
        {spellIds.map((id, index) => {
          const reordering = allowReorder && onReorderSlots;
          const reorderDropHighlight =
            !!reordering &&
            reorderHoverIndex !== null &&
            draggingBarIndex !== null &&
            reorderHoverIndex === index &&
            reorderHoverIndex !== draggingBarIndex;
          const reorderDropRing = reorderDropHighlight ? ' ring-2 ring-amber-400/70 ring-inset' : '';
          if (id === '') {
            return (
              <div key={`bar-${index}`} data-action-bar-index={index} className="relative group">
                <div
                  role="presentation"
                  data-tutorial-id={
                    tutorialFirstEmptyDropDataId && index === firstEmptyTutorialBarIndex
                      ? tutorialFirstEmptyDropDataId
                      : undefined
                  }
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
                  className={`${emptySpellSlotClass(!!reordering, draggingBarIndex === index)}${reorderDropRing}`}
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

          const iconPath = id === 'mana_potion' ? manaPotionIconPath(level) : spell.icon;
          const displayName = id === 'mana_potion' ? manaPotionDisplayName(level) : spell.name;
          const tipCtx = {
            spellHealingMultiplier,
            spirit,
            playerLevel: level,
            playerClass,
            unlockedSpells,
          };
          const rankLbl = spellTooltipRankLabel(spell, tipCtx);
          const displayManaCost = spellDisplayManaCost(spell, tipCtx);

          const cooldown = cooldowns[id] || 0;
          const isLowMana = spell.manaCost > 0 && mana < displayManaCost;
          const noPotionCharges =
            Boolean(spell.limitedDungeonConsumable) && manaPotionChargesRemaining <= 0;
          const castBlocked = cooldown > 0 || isLowMana || noPotionCharges;
          const disabled = spellsEnabled && castBlocked;
          const canCast = spellsEnabled && !castBlocked;
          const showResourceBlockOverlay =
            spellsEnabled &&
            cooldown <= 0 &&
            (isLowMana || noPotionCharges) &&
            (spell.manaCost > 0 || Boolean(spell.limitedDungeonConsumable));
          const cdDenom = Math.max(spell.cooldown, 1);
          const cdCover = Math.min(1, cooldown / cdDenom);
          const shakeGen = castBlockShake[index] ?? 0;

          const activateSlot = () => {
            if (performance.now() < suppressPreviewClickUntilRef.current) return;
            if (!spellsEnabled) {
              setPreviewTooltipSpellId((prev) => (prev === id ? null : id));
              return;
            }
            const oomLike =
              cooldown <= 0 && spellsEnabled && (isLowMana || noPotionCharges);
            if (disabled) {
              if (oomLike) setCastBlockShake((m) => ({ ...m, [index]: (m[index] ?? 0) + 1 }));
              return;
            }
            onCast(id);
          };

          return (
            <div
              key={`bar-${index}`}
              data-action-bar-index={index}
              className={`relative group${reordering ? ' touch-none' : ''}`}
              onPointerEnter={() => setTooltipHoverSpellId(id)}
              onPointerLeave={() => {
                setTooltipHoverSpellId((cur) => (cur === id ? null : cur));
              }}
            >
              <motion.div
                key={`${index}-${shakeGen}`}
                id={`spell-${id}`}
                data-tutorial-id={`spell-${id}`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || undefined}
                onPointerDown={
                  reordering
                    ? (ev) => {
                        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
                        attachSpellSlotReorderHold(index, activateSlot, ev);
                      }
                    : undefined
                }
                onClick={reordering ? undefined : activateSlot}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  activateSlot();
                }}
                className={`${spellSlotButtonClass(spell.actionBarBorderClass, {
                  spellsEnabled,
                  reordering: !!reordering,
                  draggingHere: draggingBarIndex === index,
                  canCast,
                })}${reorderDropRing}${
                  canCast || (!spellsEnabled && !reordering) ? ' cursor-pointer' : ''
                }`}
                initial={{ x: 0 }}
                animate={{ x: shakeGen > 0 ? [0, -6, 6, -4, 4, 0] : 0 }}
                transition={{
                  duration: shakeGen > 0 ? 0.24 : 0.08,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <GameIcon
                  iconPath={iconPath}
                  glow={getSpellGlow(id)}
                  size="lg"
                  title={displayName}
                  dimmed={spellsEnabled && cooldown > 0}
                  className={spellBarIconClass(
                    Boolean(actionBarHighlights[id]),
                    canCast,
                  )}
                />
                
                {!spellsEnabled ? (
                  <span className="ui-spell-name-label group-hover:text-white">
                    {displayName.split(' ')[0]}
                  </span>
                ) : null}

                {spell.manaCost > 0 && !spellsEnabled && (
                  <div className="ui-spell-mana-cost">
                      {displayManaCost}
                  </div>
                )}
                {spell.manaCost > 0 && spellsEnabled && (
                  <div
                    className={`ui-spell-mana-cost ui-spell-mana-cost-combat${isLowMana ? ' ui-spell-mana-cost-blocked' : ''}`}
                  >
                    {displayManaCost}
                  </div>
                )}
                {spell.limitedDungeonConsumable && spellsEnabled && (
                  <div className="ui-spell-potion-badge">
                    {manaPotionChargesRemaining}/{MANA_POTION_USES_PER_DUNGEON}
                  </div>
                )}

                {showResourceBlockOverlay ? <div className="ui-spell-oom-overlay" aria-hidden /> : null}

                {cooldown > 0 ? (
                  <div className="ui-spell-cd-overlay">
                    <div
                      className="ui-spell-cd-radial"
                      style={{
                        background: `conic-gradient(from -90deg, rgb(2 6 23 / 0.92) ${cdCover * 360}deg, transparent 0deg)`,
                      }}
                    />
                    <span className="ui-spell-cd-text">
                      {cooldown > 10 ? Math.ceil(cooldown / 10) : (cooldown / 10).toFixed(1)}
                    </span>
                  </div>
                ) : null}

                <div className="ui-spell-slot-index ui-spell-slot-index-filled">
                   {index + 1}
                </div>
              </motion.div>

              <div
                ref={(el) => {
                  if (el) spellTipRefs.current[id] = el;
                  else delete spellTipRefs.current[id];
                }}
                className={`ui-spell-tooltip ${spellTooltipVisibilityClass(previewTooltipSpellId === id)}`}
                style={{ transform: 'translateX(-50%)' }}
              >
                <GameIcon
                  iconPath={iconPath}
                  glow={getSpellGlow(id)}
                  size="md"
                  className="ui-spell-tooltip-icon"
                />
                <div className="ui-spell-tooltip-body">
                  <div className="ui-spell-tooltip-title">
                    <span className="ui-spell-tooltip-title-text">{displayName}</span>
                    {rankLbl ? <span className="ui-spell-tooltip-rank">{rankLbl}</span> : null}
                  </div>
                  {spell.manaCost > 0 ? (
                    <div className="ui-spell-tooltip-mana">{displayManaCost} Mana</div>
                  ) : null}
                  <div className={`ui-spell-tooltip-desc${spell.manaCost > 0 ? ' mt-1.5' : ''}`}>
                    {spellEffectTooltipText(spell, tipCtx)}
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
    </div>
  );
}



