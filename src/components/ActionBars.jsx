import React from "react";
import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback
} from "react";
import { SPELLS, getManaRegenPerSecond, MANA_POTION_USES_PER_DUNGEON } from "../constants.js";
import { clampTooltipX } from "../layoutEnvironment.js";
import { spellDisplayManaCost, spellEffectTooltipText, spellTooltipRankLabel } from "../spellTooltip.js";
import { xpProgressWithinLevel } from "../gameStorage.js";
import { motion } from "motion/react";
import { getSpellGlow } from "../gameIcons.js";
import { manaPotionDisplayName, manaPotionIconPath } from "../manaPotionIcon.js";
import { GameIcon } from "./GameIcon.jsx";
function spellSlotButtonClass(borderClass, state) {
  let extra = "";
  if (!state.spellsEnabled && !state.reordering) {
    extra += " cursor-not-allowed opacity-50";
  } else if (!state.spellsEnabled && state.reordering) {
    extra += " cursor-grab touch-none opacity-50 active:cursor-grabbing";
  }
  if (state.draggingHere) extra += " opacity-30";
  if (state.spellsEnabled) {
    if (state.canCast) extra += " hover:-translate-y-1 hover:bg-slate-700 shadow-lg";
    else extra += " cursor-not-allowed";
  }
  return `ui-spell-slot-base ${borderClass}${extra}`;
}
function emptySpellSlotClass(reordering, draggingHere) {
  let extra = "ui-spell-slot-base ui-spell-slot-empty";
  if (reordering) extra += " ui-spell-slot-drop-target touch-none";
  if (draggingHere) extra += " opacity-30";
  return extra;
}
function spellBarIconClass(highlighted, canInteract) {
  let c = "shrink-0";
  if (highlighted) c += " ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-slate-900 shadow-[0_0_12px_rgba(110,231,183,0.5)]";
  if (canInteract) c += " transition-transform group-hover:scale-105";
  return c;
}
function spellTooltipVisibilityClass(previewOpen) {
  return previewOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100";
}
function isTouchLikePointer(pointerType) {
  return pointerType === "touch" || pointerType === "pen";
}
function ActionBars({
  playerCombatStats,
  spellIds,
  cooldowns,
  onCast,
  allowReorder = false,
  onReorderSlots,
  hideResourcePanels = false,
  tutorialFirstEmptyDropDataId = null
}) {
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
    level
  } = playerCombatStats;
  const firstEmptyTutorialBarIndex = tutorialFirstEmptyDropDataId ? spellIds.indexOf("") : -1;
  const barRootRef = useRef(null);
  const spellTipRefs = useRef({});
  const suppressPreviewClickUntilRef = useRef(0);
  const [previewTooltipSpellId, setPreviewTooltipSpellId] = useState(null);
  const [tooltipHoverSpellId, setTooltipHoverSpellId] = useState(null);
  const [draggingBarIndex, setDraggingBarIndex] = useState(null);
  const [reorderHoverIndex, setReorderHoverIndex] = useState(null);
  const [castBlockShake, setCastBlockShake] = useState({});
  const touchReorderFromRef = useRef(null);
  const touchReorderPointerIdRef = useRef(null);
  const reorderPointerCleanupRef = useRef(null);
  const reorderPointerClientRef = useRef({ x: 0, y: 0 });
  const actionBarIndexAtPoint = useCallback((clientX, clientY) => {
    const root = barRootRef.current;
    if (!root) return null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !root.contains(el)) return null;
    const slot = el.closest("[data-action-bar-index]");
    if (!slot || !root.contains(slot)) return null;
    const v = slot.getAttribute("data-action-bar-index");
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
    (slotIndex, activate, e) => {
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
        }
      };
      const longMs = isTouchLikePointer(ptype) ? 200 : 220;
      const timer = window.setTimeout(armDrag, longMs);
      const teardown = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        reorderPointerCleanupRef.current = null;
      };
      const onMove = (ev) => {
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
      const onUp = (ev) => {
        if (ev.pointerId !== pid) return;
        teardown();
        if (!dragStarted) {
          activate();
          return;
        }
        try {
          el.releasePointerCapture(pid);
        } catch {
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
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [actionBarIndexAtPoint, allowReorder, clearReorderGestureListeners, onReorderSlots]
  );
  useEffect(() => {
    if (spellsEnabled) setPreviewTooltipSpellId(null);
  }, [spellsEnabled]);
  useEffect(() => {
    if (spellsEnabled || previewTooltipSpellId === null) return;
    const close = (e) => {
      if (barRootRef.current?.contains(e.target)) return;
      setPreviewTooltipSpellId(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [spellsEnabled, previewTooltipSpellId]);
  const repositionSpellTooltips = useCallback(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const vw = vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 0);
    if (!vw) return;
    const margin = 12;
    for (const key of Object.keys(spellTipRefs.current)) {
      const el = spellTipRefs.current[key];
      if (el) el.style.transform = "translateX(-50%)";
    }
    const activeId = tooltipHoverSpellId ?? previewTooltipSpellId;
    if (!activeId) return;
    const tip = spellTipRefs.current[activeId];
    if (!tip) return;
    const dx = clampTooltipX(tip.getBoundingClientRect(), vw, margin);
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
    playerClass
  ]);
  useEffect(() => {
    const ro = () => repositionSpellTooltips();
    window.addEventListener("resize", ro);
    window.visualViewport?.addEventListener("resize", ro);
    window.visualViewport?.addEventListener("scroll", ro);
    return () => {
      window.removeEventListener("resize", ro);
      window.visualViewport?.removeEventListener("resize", ro);
      window.visualViewport?.removeEventListener("scroll", ro);
    };
  }, [repositionSpellTooltips]);
  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const xpBarPercent = xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel * 100 : 0;
  const xpSegmentFillPercents = Array.from({ length: 10 }, (_, i) => {
    const start = i * 10;
    const end = start + 10;
    if (xpBarPercent >= end) return 100;
    if (xpBarPercent <= start) return 0;
    return (xpBarPercent - start) / 10 * 100;
  });
  const manaPercent = mana / maxMana * 100;
  const baseRegenPerSec = getManaRegenPerSecond(0, spirit);
  const regenPerSec = getManaRegenPerSecond(spiritRegenLockoutTicksRemaining, spirit);
  const regenBuffActive = manaRegenBuffTicksRemaining > 0;
  const totalRegenPerSec = regenPerSec + manaPotionDripPerSec;
  const fmtRegen = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
  return React.createElement("div", { ref: barRootRef, className: "ui-action-bar-root" }, React.createElement("div", { className: "absolute inset-0 bg-slate-900", "aria-hidden": true }), React.createElement("div", { className: "ui-action-bar-stack" }, !spellsEnabled && !hideResourcePanels ? React.createElement("div", { className: "ui-xp-bar-wrap" }, React.createElement(
    "div",
    {
      className: "ui-xp-bar-track",
      role: "progressbar",
      "aria-valuenow": xpIntoLevel,
      "aria-valuemin": 0,
      "aria-valuemax": xpForNextLevel
    },
    React.createElement("div", { className: "ui-xp-bar-segments" }, xpSegmentFillPercents.map((fillPct, i) => React.createElement("div", { key: i, className: "ui-xp-bar-segment-shell" }, React.createElement(
      motion.div,
      {
        className: "ui-xp-bar-segment-fill",
        initial: false,
        animate: { width: `${fillPct}%` },
        transition: { type: "tween", duration: 0.2 },
        "aria-hidden": true
      }
    )))),
    React.createElement("div", { className: "ui-xp-bar-label-wrap" }, React.createElement("span", { className: "ui-xp-bar-label" }, xpIntoLevel, React.createElement("span", { className: "ui-xp-bar-label-denom" }, "/ ", xpForNextLevel)))
  )) : null, React.createElement("div", { className: "ui-action-bar-column" }, !hideResourcePanels ? React.createElement("div", { className: "ui-mana-pool-panel", "data-tutorial-id": "mana-pool" }, React.createElement(
    motion.div,
    {
      className: "ui-mana-pool-underlay",
      initial: false,
      animate: { width: `${manaPercent}%` },
      transition: { type: "tween", duration: 0.2 },
      "aria-hidden": true
    }
  ), React.createElement("div", { className: "ui-mana-pool-row" }, React.createElement("div", { className: "flex min-w-0 flex-col gap-1 leading-tight" }, React.createElement("span", { className: "text-sm font-black uppercase tracking-wide text-slate-400" }, "Mana Pool"), React.createElement("div", { className: "ui-numeric flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-sm font-bold tracking-tight" }, regenBuffActive && spiritRegenLockoutTicksRemaining > 0 ? React.createElement(React.Fragment, null, React.createElement("span", { className: "text-sky-100" }, "+", fmtRegen(totalRegenPerSec), "/s"), React.createElement("span", { className: "text-xs font-semibold text-sky-300/95" }, "(+", fmtRegen(manaPotionDripPerSec), " potion)"), React.createElement("span", { className: "text-[11px] font-semibold text-slate-500" }, "(5SR)")) : regenBuffActive ? React.createElement(React.Fragment, null, React.createElement("span", { className: "text-sky-100" }, "+", fmtRegen(totalRegenPerSec), "/s"), React.createElement("span", { className: "text-xs font-semibold text-sky-300/95" }, "(+", fmtRegen(manaPotionDripPerSec), " potion)")) : spiritRegenLockoutTicksRemaining > 0 ? React.createElement("span", { className: "font-semibold text-slate-500" }, "+", fmtRegen(totalRegenPerSec), "/s ", React.createElement("span", { className: "text-[11px]" }, "(5SR)")) : React.createElement("span", { className: "text-emerald-200/90" }, "+", fmtRegen(baseRegenPerSec), "/s"))), React.createElement("span", { className: "ui-mana-pool-readout" }, Math.floor(mana), React.createElement("span", { className: "ui-mana-pool-readout-max" }, "/ ", maxMana)))) : null, React.createElement("div", { className: "ui-spell-bar-tray" }, React.createElement("div", { className: "ui-spell-bar-row" }, spellIds.map((id, index) => {
    const reordering = allowReorder && onReorderSlots;
    const reorderDropHighlight = !!reordering && reorderHoverIndex !== null && draggingBarIndex !== null && reorderHoverIndex === index && reorderHoverIndex !== draggingBarIndex;
    const reorderDropRing = reorderDropHighlight ? " ring-2 ring-amber-400/70 ring-inset" : "";
    if (id === "") {
      return React.createElement("div", { key: `bar-${index}`, "data-action-bar-index": index, className: "relative group" }, React.createElement(
        "div",
        {
          role: "presentation",
          "data-tutorial-id": tutorialFirstEmptyDropDataId && index === firstEmptyTutorialBarIndex ? tutorialFirstEmptyDropDataId : void 0,
          draggable: false,
          onDragOver: reordering ? (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          } : void 0,
          onDrop: reordering ? (e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData("text/plain");
            const from = parseInt(raw, 10);
            if (Number.isNaN(from)) return;
            suppressPreviewClickUntilRef.current = performance.now() + 450;
            onReorderSlots(from, index);
            setDraggingBarIndex(null);
          } : void 0,
          className: `${emptySpellSlotClass(!!reordering, draggingBarIndex === index)}${reorderDropRing}`
        },
        React.createElement("div", { className: "ui-spell-slot-index" }, index + 1)
      ));
    }
    const spell = SPELLS[id];
    if (!spell) return null;
    const iconPath = id === "mana_potion" ? manaPotionIconPath(level) : spell.icon;
    const displayName = id === "mana_potion" ? manaPotionDisplayName(level) : spell.name;
    const tipCtx = {
      spellHealingMultiplier,
      spirit,
      playerLevel: level,
      playerClass,
      unlockedSpells
    };
    const rankLbl = spellTooltipRankLabel(spell, tipCtx);
    const displayManaCost = spellDisplayManaCost(spell, tipCtx);
    const cooldown = cooldowns[id] || 0;
    const isLowMana = spell.manaCost > 0 && mana < displayManaCost;
    const noPotionCharges = Boolean(spell.limitedDungeonConsumable) && manaPotionChargesRemaining <= 0;
    const castBlocked = cooldown > 0 || isLowMana || noPotionCharges;
    const disabled = spellsEnabled && castBlocked;
    const canCast = spellsEnabled && !castBlocked;
    const showResourceBlockOverlay = spellsEnabled && cooldown <= 0 && (isLowMana || noPotionCharges) && (spell.manaCost > 0 || Boolean(spell.limitedDungeonConsumable));
    const cdDenom = Math.max(spell.cooldown, 1);
    const cdCover = Math.min(1, cooldown / cdDenom);
    const shakeGen = castBlockShake[index] ?? 0;
    const activateSlot = () => {
      if (performance.now() < suppressPreviewClickUntilRef.current) return;
      if (!spellsEnabled) {
        setPreviewTooltipSpellId((prev) => prev === id ? null : id);
        return;
      }
      const oomLike = cooldown <= 0 && spellsEnabled && (isLowMana || noPotionCharges);
      if (disabled) {
        if (oomLike) setCastBlockShake((m) => ({ ...m, [index]: (m[index] ?? 0) + 1 }));
        return;
      }
      onCast(id);
    };
    return React.createElement(
      "div",
      {
        key: `bar-${index}`,
        "data-action-bar-index": index,
        className: `relative group${reordering ? " touch-none" : ""}`,
        onPointerEnter: () => setTooltipHoverSpellId(id),
        onPointerLeave: () => {
          setTooltipHoverSpellId((cur) => cur === id ? null : cur);
        }
      },
      React.createElement(
        motion.div,
        {
          key: `${index}-${shakeGen}`,
          id: `spell-${id}`,
          "data-tutorial-id": `spell-${id}`,
          role: "button",
          tabIndex: disabled ? -1 : 0,
          "aria-disabled": disabled || void 0,
          onPointerDown: reordering ? (ev) => {
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            attachSpellSlotReorderHold(index, activateSlot, ev);
          } : void 0,
          onClick: reordering ? void 0 : activateSlot,
          onKeyDown: (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            activateSlot();
          },
          className: `${spellSlotButtonClass(spell.actionBarBorderClass, {
            spellsEnabled,
            reordering: !!reordering,
            draggingHere: draggingBarIndex === index,
            canCast
          })}${reorderDropRing}${canCast || !spellsEnabled && !reordering ? " cursor-pointer" : ""}`,
          initial: { x: 0 },
          animate: { x: shakeGen > 0 ? [0, -6, 6, -4, 4, 0] : 0 },
          transition: {
            duration: shakeGen > 0 ? 0.24 : 0.08,
            ease: [0.4, 0, 0.2, 1]
          }
        },
        React.createElement(
          GameIcon,
          {
            iconPath,
            glow: getSpellGlow(id),
            size: "lg",
            title: displayName,
            dimmed: spellsEnabled && cooldown > 0,
            className: spellBarIconClass(
              Boolean(actionBarHighlights[id]),
              canCast
            )
          }
        ),
        !spellsEnabled ? React.createElement("span", { className: "ui-spell-name-label group-hover:text-white" }, displayName.split(" ")[0]) : null,
        spell.manaCost > 0 && !spellsEnabled && React.createElement("div", { className: "ui-spell-mana-cost" }, displayManaCost),
        spell.manaCost > 0 && spellsEnabled && React.createElement(
          "div",
          {
            className: `ui-spell-mana-cost ui-spell-mana-cost-combat${isLowMana ? " ui-spell-mana-cost-blocked" : ""}`
          },
          displayManaCost
        ),
        spell.limitedDungeonConsumable && spellsEnabled && React.createElement("div", { className: "ui-spell-potion-badge" }, manaPotionChargesRemaining, "/", MANA_POTION_USES_PER_DUNGEON),
        showResourceBlockOverlay ? React.createElement("div", { className: "ui-spell-oom-overlay", "aria-hidden": true }) : null,
        cooldown > 0 ? React.createElement("div", { className: "ui-spell-cd-overlay" }, React.createElement(
          "div",
          {
            className: "ui-spell-cd-radial",
            style: {
              background: `conic-gradient(from -90deg, rgb(2 6 23 / 0.92) ${cdCover * 360}deg, transparent 0deg)`
            }
          }
        ), React.createElement("span", { className: "ui-spell-cd-text" }, cooldown > 10 ? Math.ceil(cooldown / 10) : (cooldown / 10).toFixed(1))) : null,
        React.createElement("div", { className: "ui-spell-slot-index ui-spell-slot-index-filled" }, index + 1)
      ),
      React.createElement(
        "div",
        {
          ref: (el) => {
            if (el) spellTipRefs.current[id] = el;
            else delete spellTipRefs.current[id];
          },
          className: `ui-spell-tooltip ${spellTooltipVisibilityClass(previewTooltipSpellId === id)}`,
          style: { transform: "translateX(-50%)" }
        },
        React.createElement(
          GameIcon,
          {
            iconPath,
            glow: getSpellGlow(id),
            size: "md",
            className: "ui-spell-tooltip-icon"
          }
        ),
        React.createElement("div", { className: "ui-spell-tooltip-body" }, React.createElement("div", { className: "ui-spell-tooltip-title" }, React.createElement("span", { className: "ui-spell-tooltip-title-text" }, displayName), rankLbl ? React.createElement("span", { className: "ui-spell-tooltip-rank" }, rankLbl) : null), spell.manaCost > 0 ? React.createElement("div", { className: "ui-spell-tooltip-mana" }, displayManaCost, " Mana") : null, React.createElement("div", { className: `ui-spell-tooltip-desc${spell.manaCost > 0 ? " mt-1.5" : ""}` }, spellEffectTooltipText(spell, tipCtx))),
        React.createElement("div", { className: "ui-spell-tooltip-arrow", "aria-hidden": true })
      )
    );
  }))))));
}
export {
  ActionBars
};
