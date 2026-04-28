import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import theme from '../data/theme.json';

type TutorialOverlayProps = {
  open: boolean;
  targetDataId: string | null;
  message: string;
  showTapCatcher: boolean;
  showResumeButton?: boolean;
  anchorMessageBelowTarget?: boolean;
  tone?: 'benefit' | 'threat';
  resumeLabel?: string;
  ghostHand?: { fromDataId: string; toDataId: string };
  onTapContinue?: () => void;
};

const SCRIM_Z = 10000;
const PAD = 10;

function viewportWidthCss(): number {
  const vv = window.visualViewport;
  if (vv && vv.width > 0) return vv.width;
  const d = document.documentElement;
  if (d?.clientWidth && d.clientWidth > 0) return d.clientWidth;
  return window.innerWidth;
}

function horizontalInset(): { left: number; right: number } {
  const base = 14;
  if (typeof CSS === 'undefined' || !CSS.supports?.('padding-left', 'env(safe-area-inset-left)')) {
    return { left: base, right: base };
  }
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
  document.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe);
  const l = base + (parseFloat(cs.paddingLeft) || 0);
  const r = base + (parseFloat(cs.paddingRight) || 0);
  probe.remove();
  return { left: l, right: r };
}

function tipShiftToKeepInView(anchorX: number, tipWidth: number, vw: number, inset: { left: number; right: number }): number {
  if (!vw || tipWidth <= 0) return 0;
  const minCx = inset.left + tipWidth / 2;
  const maxCx = vw - inset.right - tipWidth / 2;
  if (minCx > maxCx) return vw / 2 - anchorX;
  const clamped = Math.min(maxCx, Math.max(minCx, anchorX));
  return clamped - anchorX;
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height)
  );
}

export function TutorialOverlay({
  open,
  targetDataId,
  message,
  showTapCatcher,
  showResumeButton = false,
  anchorMessageBelowTarget = false,
  tone = 'benefit',
  resumeLabel = 'Resume',
  ghostHand,
  onTapContinue,
}: TutorialOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipBelow, setTooltipBelow] = useState(true);
  const [tipShiftX, setTipShiftX] = useState(0);
  const tipRef = useRef<HTMLDivElement>(null);
  const [ghostFrom, setGhostFrom] = useState<DOMRect | null>(null);
  const [ghostTo, setGhostTo] = useState<DOMRect | null>(null);
  const frameRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const tooltipBelowRef = useRef(true);
  const ghostFromRef = useRef<DOMRect | null>(null);
  const ghostToRef = useRef<DOMRect | null>(null);

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
      if (ghostFromRef.current !== null) {
        ghostFromRef.current = null;
        setGhostFrom(null);
      }
      if (ghostToRef.current !== null) {
        ghostToRef.current = null;
        setGhostTo(null);
      }
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
      if (ghostFromRef.current !== null) {
        ghostFromRef.current = null;
        setGhostFrom(null);
      }
      if (ghostToRef.current !== null) {
        ghostToRef.current = null;
        setGhostTo(null);
      }
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

  useLayoutEffect(() => {
    if (!open || !targetDataId) return;
    let cancelled = false;
    let frames = 0;
    let targetRo: ResizeObserver | null = null;
    let observedTarget: Element | null = null;
    const sel = `[data-tutorial-id="${CSS.escape(targetDataId)}"]`;
    const syncTargetObserver = () => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) return;
      if (el === observedTarget) return;
      targetRo?.disconnect();
      observedTarget = el;
      targetRo = new ResizeObserver(() => {
        if (!cancelled) updateRect();
      });
      targetRo.observe(el);
    };
    const step = () => {
      if (cancelled) return;
      updateRect();
      syncTargetObserver();
      frames++;
      if (rectRef.current !== null && frames >= 2) return;
      if (frames >= 120) return;
      window.requestAnimationFrame(step);
    };
    step();
    const root = document.getElementById('root');
    const rootRo =
      root &&
      new ResizeObserver(() => {
        if (!cancelled) {
          syncTargetObserver();
          updateRect();
        }
      });
    if (root && rootRo) rootRo.observe(root);
    return () => {
      cancelled = true;
      targetRo?.disconnect();
      rootRo?.disconnect();
    };
  }, [open, targetDataId, updateRect]);

  useEffect(() => {
    if (!open) return;
    scheduleUpdateRect();
    const ro = new ResizeObserver(() => scheduleUpdateRect());
    ro.observe(document.documentElement);
    window.addEventListener('scroll', scheduleUpdateRect, true);
    window.addEventListener('resize', scheduleUpdateRect);
    window.visualViewport?.addEventListener('resize', scheduleUpdateRect);
    window.visualViewport?.addEventListener('scroll', scheduleUpdateRect);
    return () => {
      ro.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      window.removeEventListener('scroll', scheduleUpdateRect, true);
      window.removeEventListener('resize', scheduleUpdateRect);
      window.visualViewport?.removeEventListener('resize', scheduleUpdateRect);
      window.visualViewport?.removeEventListener('scroll', scheduleUpdateRect);
    };
  }, [open, scheduleUpdateRect]);

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
    const hole = rect;
    const vw = viewportWidthCss();
    const inset = horizontalInset();
    const anchorX = hole ? hole.x + hole.width / 2 : vw / 2;
    const w = tip.getBoundingClientRect().width;
    setTipShiftX(tipShiftToKeepInView(anchorX, w, vw, inset));
  }, [open, message, rect, anchorMessageBelowTarget]);

  if (!open || typeof document === 'undefined') return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const glow = tone === 'threat' ? theme.iconGlow.boxShadow.debuff : theme.iconGlow.boxShadow.spell;
  const tint = tone === 'threat' ? theme.iconGlow.tint.debuff : theme.iconGlow.tint.spell;
  const hole = rect;
  const tipPlacementBelow =
    hole && anchorMessageBelowTarget ? true : hole ? tooltipBelow : true;

  const tooltipPos = (() => {
    if (!hole) {
      return { left: vw / 2, top: vh * 0.36 };
    }
    const left = hole.x + hole.width / 2;
    if (tipPlacementBelow) {
      return {
        left,
        top: hole.y + hole.height + 14,
      };
    }
    return {
      left,
      top: hole.y - 14,
    };
  })();

  const tipTransform =
    tipPlacementBelow === true
      ? `translate(calc(-50% + ${tipShiftX}px), 0)`
      : `translate(calc(-50% + ${tipShiftX}px), -100%)`;

  return createPortal(
    <>
      {hole ? (
        <div
          className="pointer-events-none fixed rounded-xl"
          style={{
            zIndex: SCRIM_Z,
            left: hole.x,
            top: hole.y,
            width: hole.width,
            height: hole.height,
            border: `2px solid ${tint}`,
            boxShadow: `0 0 0 9999px rgba(2,6,23,0.82), 0 0 22px ${tint}, 0 0 42px ${tint}`,
          }}
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: SCRIM_Z, background: 'rgba(2,6,23,0.82)' }}
          aria-hidden
        />
      )}
      <div
        ref={tipRef}
        className="pointer-events-none fixed max-w-[min(20rem,calc(100vw-1.5rem))] break-words rounded-lg border bg-slate-950/95 px-[max(0.75rem,env(safe-area-inset-left,0px))] py-2 pe-[max(0.75rem,env(safe-area-inset-right,0px))] text-center text-sm font-semibold leading-snug text-sky-50 shadow-[0_0_20px_rgba(59,130,246,0.25)] backdrop-blur-sm"
        style={{
          overflowWrap: 'anywhere',
          zIndex: anchorMessageBelowTarget ? SCRIM_Z + 1 : SCRIM_Z + 2,
          left: tooltipPos.left,
          top: tooltipPos.top,
          transform: tipTransform,
          boxShadow: glow,
          borderColor: tint,
        }}
      >
        {message}
      </div>
      {ghostFrom && ghostTo ? (
        <motion.div
          className="pointer-events-none fixed h-8 w-8 rounded-full border border-white/55 bg-white/20"
          style={{
            zIndex: SCRIM_Z + 3,
            left: ghostFrom.left + ghostFrom.width / 2 - 16,
            top: ghostFrom.top + ghostFrom.height / 2 - 16,
          }}
          animate={{
            x: [
              0,
              ghostTo.left + ghostTo.width / 2 - (ghostFrom.left + ghostFrom.width / 2),
            ],
            y: [
              0,
              ghostTo.top + ghostTo.height / 2 - (ghostFrom.top + ghostFrom.height / 2),
            ],
          }}
          transition={{ duration: 1.05, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }}
        />
      ) : null}
      {showTapCatcher || showResumeButton ? (
        <>
          {showTapCatcher ? (
            <button
              type="button"
              className="fixed inset-0 cursor-default bg-transparent"
              style={{ zIndex: SCRIM_Z + 1 }}
              aria-label="Continue"
            />
          ) : null}
          {onTapContinue && (showTapCatcher || showResumeButton) ? (
            <button
              type="button"
              className="fixed left-1/2 rounded-md border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-50 backdrop-blur-sm"
              style={{
                zIndex: SCRIM_Z + 4,
                bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
                transform: 'translateX(-50%)',
                borderColor: tint,
                backgroundColor: 'rgba(2, 6, 23, 0.9)',
                boxShadow: glow,
              }}
              onClick={() => onTapContinue()}
            >
              {resumeLabel}
            </button>
          ) : null}
        </>
      ) : null}
    </>,
    document.body,
  );
}
