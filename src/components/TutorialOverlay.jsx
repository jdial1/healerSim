import React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import theme from "../data/theme.json" with { type: "json" };
const SCRIM_Z = 1e4;
const PAD = 10;
function viewportWidthCss() {
  const vv = window.visualViewport;
  if (vv && vv.width > 0) return vv.width;
  const d = document.documentElement;
  if (d?.clientWidth && d.clientWidth > 0) return d.clientWidth;
  return window.innerWidth;
}
function horizontalInset() {
  const base = 14;
  if (typeof CSS === "undefined" || !CSS.supports?.("padding-left", "env(safe-area-inset-left)")) {
    return { left: base, right: base };
  }
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)";
  document.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe);
  const l = base + (parseFloat(cs.paddingLeft) || 0);
  const r = base + (parseFloat(cs.paddingRight) || 0);
  probe.remove();
  return { left: l, right: r };
}
function tipShiftToKeepInView(anchorX, tipWidth, vw, inset) {
  if (!vw || tipWidth <= 0) return 0;
  const minCx = inset.left + tipWidth / 2;
  const maxCx = vw - inset.right - tipWidth / 2;
  if (minCx > maxCx) return vw / 2 - anchorX;
  const clamped = Math.min(maxCx, Math.max(minCx, anchorX));
  return clamped - anchorX;
}
function sameRect(a, b) {
  return a === b || a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function TutorialOverlay({
  open,
  targetDataId,
  message,
  showTapCatcher,
  showResumeButton = false,
  anchorMessageBelowTarget = false,
  tone = "benefit",
  resumeLabel = "Resume",
  ghostHand,
  onTapContinue
}) {
  const [rect, setRect] = useState(null);
  const [tooltipBelow, setTooltipBelow] = useState(true);
  const [tipShiftX, setTipShiftX] = useState(0);
  const tipRef = useRef(null);
  const [ghostFrom, setGhostFrom] = useState(null);
  const [ghostTo, setGhostTo] = useState(null);
  const frameRef = useRef(null);
  const rectRef = useRef(null);
  const tooltipBelowRef = useRef(true);
  const ghostFromRef = useRef(null);
  const ghostToRef = useRef(null);
  const updateRect = useCallback(() => {
    if (!open || !targetDataId) {
      rectRef.current = null;
      setRect(null);
      return;
    }
    const sel = `[data-tutorial-id="${CSS.escape(targetDataId)}"]`;
    const el = document.querySelector(sel);
    if (!el || !(el instanceof HTMLElement)) {
      rectRef.current = null;
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) {
      rectRef.current = null;
      setRect(null);
      return;
    }
    const nextRect = new DOMRect(r.x - PAD, r.y - PAD, r.width + PAD * 2, r.height + PAD * 2);
    const clearGhost = () => {
      if (ghostFromRef.current !== null) {
        ghostFromRef.current = null;
        setGhostFrom(null);
      }
      if (ghostToRef.current !== null) {
        ghostToRef.current = null;
        setGhostTo(null);
      }
    };
    if (!sameRect(rectRef.current, nextRect)) {
      rectRef.current = nextRect;
      setRect(nextRect);
    }
    const cy = r.top + r.height / 2;
    const mid = window.innerHeight * 0.42;
    const nextTooltipBelow = cy < mid;
    if (tooltipBelowRef.current !== nextTooltipBelow) {
      tooltipBelowRef.current = nextTooltipBelow;
      setTooltipBelow(nextTooltipBelow);
    }
    if (!ghostHand) {
      clearGhost();
      return;
    }
    const fromEl = document.querySelector(`[data-tutorial-id="${CSS.escape(ghostHand.fromDataId)}"]`);
    const toEl = document.querySelector(`[data-tutorial-id="${CSS.escape(ghostHand.toDataId)}"]`);
    if (fromEl instanceof HTMLElement && toEl instanceof HTMLElement) {
      const nextFrom = fromEl.getBoundingClientRect();
      const nextTo = toEl.getBoundingClientRect();
      if (!sameRect(ghostFromRef.current, nextFrom)) {
        ghostFromRef.current = nextFrom;
        setGhostFrom(nextFrom);
      }
      if (!sameRect(ghostToRef.current, nextTo)) {
        ghostToRef.current = nextTo;
        setGhostTo(nextTo);
      }
    } else {
      clearGhost();
    }
  }, [open, targetDataId, ghostHand]);
  const scheduleUpdateRect = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateRect();
    });
  }, [updateRect]);
  useLayoutEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    updateRect();
  }, [updateRect, message]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let targetRo = null;
    let observedTarget = null;
    const ro = new ResizeObserver(() => scheduleUpdateRect());
    ro.observe(document.documentElement);
    const root = document.getElementById("root");
    if (root) ro.observe(root);
    const syncTargetObserver = () => {
      const el = document.querySelector(`[data-tutorial-id="${CSS.escape(targetDataId)}"]`);
      if (el instanceof HTMLElement && el !== observedTarget) {
        targetRo?.disconnect();
        observedTarget = el;
        targetRo = new ResizeObserver(() => !cancelled && scheduleUpdateRect());
        targetRo.observe(el);
      }
    };
    const step = () => {
      if (cancelled) return;
      scheduleUpdateRect();
      syncTargetObserver();
      if (rectRef.current === null) window.requestAnimationFrame(step);
    };
    step();
    const evts = ["resize", "scroll"];
    evts.forEach((e) => {
      window.addEventListener(e, scheduleUpdateRect, true);
      window.visualViewport?.addEventListener(e, scheduleUpdateRect);
    });
    return () => {
      cancelled = true;
      ro.disconnect();
      targetRo?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      evts.forEach((e) => {
        window.removeEventListener(e, scheduleUpdateRect, true);
        window.visualViewport?.removeEventListener(e, scheduleUpdateRect);
      });
    };
  }, [open, targetDataId, scheduleUpdateRect]);
  useLayoutEffect(() => {
    if (!open) {
      setTipShiftX(0);
      return;
    }
    const tip = tipRef.current;
    if (!tip) {
      setTipShiftX(0);
      return;
    }
    const hole2 = rect;
    const vw2 = viewportWidthCss();
    const inset = horizontalInset();
    const anchorX = hole2 ? hole2.x + hole2.width / 2 : vw2 / 2;
    const w = tip.getBoundingClientRect().width;
    setTipShiftX(tipShiftToKeepInView(anchorX, w, vw2, inset));
  }, [open, message, rect, anchorMessageBelowTarget]);
  if (!open || typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const glow = tone === "threat" ? theme.iconGlow.boxShadow.debuff : theme.iconGlow.boxShadow.spell;
  const tint = tone === "threat" ? theme.iconGlow.tint.debuff : theme.iconGlow.tint.spell;
  const hole = rect;
  const tipPlacementBelow = hole && anchorMessageBelowTarget ? true : hole ? tooltipBelow : true;
  const tooltipPos = (() => {
    if (!hole) {
      return { left: vw / 2, top: vh * 0.36 };
    }
    const left = hole.x + hole.width / 2;
    if (tipPlacementBelow) {
      return {
        left,
        top: hole.y + hole.height + 14
      };
    }
    return {
      left,
      top: hole.y - 14
    };
  })();
  const tipTransform = tipPlacementBelow === true ? `translate(calc(-50% + ${tipShiftX}px), 0)` : `translate(calc(-50% + ${tipShiftX}px), -100%)`;
  return createPortal(
    React.createElement(React.Fragment, null, hole ? React.createElement(
      "div",
      {
        className: "pointer-events-none fixed rounded-xl",
        style: {
          zIndex: SCRIM_Z,
          left: hole.x,
          top: hole.y,
          width: hole.width,
          height: hole.height,
          border: `2px solid ${tint}`,
          boxShadow: `0 0 0 9999px rgba(2,6,23,0.82), 0 0 22px ${tint}, 0 0 42px ${tint}`
        },
        "aria-hidden": true
      }
    ) : React.createElement(
      "div",
      {
        className: "pointer-events-none fixed inset-0",
        style: { zIndex: SCRIM_Z, background: "rgba(2,6,23,0.82)" },
        "aria-hidden": true
      }
    ), React.createElement(
      "div",
      {
        ref: tipRef,
        className: "pointer-events-none fixed max-w-[min(20rem,calc(100vw-1.5rem))] break-words rounded-lg border bg-slate-950/95 px-[max(0.75rem,env(safe-area-inset-left,0px))] py-2 pe-[max(0.75rem,env(safe-area-inset-right,0px))] text-center text-sm font-semibold leading-snug text-sky-50 shadow-[0_0_20px_rgba(59,130,246,0.25)] backdrop-blur-sm",
        style: {
          overflowWrap: "anywhere",
          zIndex: anchorMessageBelowTarget ? SCRIM_Z + 1 : SCRIM_Z + 2,
          left: tooltipPos.left,
          top: tooltipPos.top,
          transform: tipTransform,
          boxShadow: glow,
          borderColor: tint
        }
      },
      message
    ), ghostFrom && ghostTo ? React.createElement(
      motion.div,
      {
        className: "pointer-events-none fixed h-8 w-8 rounded-full border border-white/55 bg-white/20",
        style: {
          zIndex: SCRIM_Z + 3,
          left: ghostFrom.left + ghostFrom.width / 2 - 16,
          top: ghostFrom.top + ghostFrom.height / 2 - 16
        },
        animate: {
          x: [
            0,
            ghostTo.left + ghostTo.width / 2 - (ghostFrom.left + ghostFrom.width / 2)
          ],
          y: [
            0,
            ghostTo.top + ghostTo.height / 2 - (ghostFrom.top + ghostFrom.height / 2)
          ]
        },
        transition: { duration: 1.05, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }
      }
    ) : null, showTapCatcher || showResumeButton ? React.createElement(React.Fragment, null, showTapCatcher ? React.createElement(
      "button",
      {
        type: "button",
        className: "fixed inset-0 cursor-default bg-transparent",
        style: { zIndex: SCRIM_Z + 1 },
        "aria-label": "Continue"
      }
    ) : null, onTapContinue && (showTapCatcher || showResumeButton) ? React.createElement(
      "button",
      {
        type: "button",
        className: "fixed left-1/2 rounded-md border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-50 backdrop-blur-sm",
        style: {
          zIndex: SCRIM_Z + 4,
          bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          transform: "translateX(-50%)",
          borderColor: tint,
          backgroundColor: "rgba(2, 6, 23, 0.9)",
          boxShadow: glow
        },
        onClick: () => onTapContinue()
      },
      resumeLabel
    ) : null) : null),
    document.body
  );
}
export {
  TutorialOverlay
};
