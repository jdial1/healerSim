import React from "react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { DUNGEON_PACES, dungeonPaceXpMultiplier, pacingData, shuffleArray } from "../constants.js";
import { GameIcon } from "./GameIcon.jsx";
const PACE_ICON_PATHS = {
  Zap: "lorc/crossed-swords",
  Gauge: "lorc/winged-shield",
  Snail: "wow/spell_nature_tranquility"
};
const PACE_THEME_CLASSES = {
  emerald: {
    ring: "ui-state-frame ui-state-hover bg-slate-900/90",
    labelClass: "text-emerald-100",
    subClass: "text-emerald-300/90",
    selected: "ui-state-frame ui-state-selected bg-emerald-950/70"
  },
  amber: {
    ring: "ui-state-frame ui-state-hover bg-slate-900/90",
    labelClass: "text-amber-100",
    subClass: "text-amber-300/90",
    selected: "ui-state-frame ui-state-selected bg-amber-950/70"
  },
  sky: {
    ring: "ui-state-frame ui-state-hover bg-slate-900/90",
    labelClass: "text-cyan-100",
    subClass: "text-cyan-300/90",
    selected: "ui-state-frame ui-state-selected bg-cyan-950/70"
  }
};
const PACE_OPTIONS = DUNGEON_PACES.map((pace) => {
  const def = pacingData.paces[pace];
  const theme = PACE_THEME_CLASSES[def.theme];
  return {
    pace,
    label: def.label,
    trashSec: def.trashSec,
    bossSec: def.bossSec,
    iconPath: PACE_ICON_PATHS[def.icon] ?? "lorc/holy-grail",
    ring: theme.ring,
    labelClass: theme.labelClass,
    subClass: theme.subClass,
    selected: theme.selected
  };
});
function DungeonQueueModal({ dungeon, onClose, onConfirmEnter }) {
  const [{ tank, dps, ready, flash }, setQueueState] = useState({ tank: 0, dps: 0, ready: false, flash: false });
  useEffect(() => {
    setQueueState({ tank: 0, dps: 0, ready: false, flash: false });
    let cancelled = false;
    const ids = [];
    let completed = 0;
    shuffleArray(["tank", "dps", "dps", "dps"]).forEach((role) => {
      ids.push(window.setTimeout(() => {
        if (cancelled) return;
        completed++;
        setQueueState((s) => {
          const next = { ...s, [role]: s[role] + 1 };
          if (completed === 4) {
            next.ready = true;
            next.flash = true;
            window.setTimeout(() => !cancelled && setQueueState((ns) => ({ ...ns, flash: false })), 1600);
          }
          return next;
        });
      }, Math.random() * (1e3 + 3e3 * Math.random())));
    });
    return () => {
      cancelled = true;
      ids.forEach(clearTimeout);
    };
  }, [dungeon.id]);
  return React.createElement(
    motion.div,
    {
      role: "presentation",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[108] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm",
      onClick: onClose
    },
    React.createElement(
      motion.div,
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "dungeon-queue-heading",
        initial: { opacity: 0, scale: 0.96, y: 6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 4 },
        transition: { duration: 0.48, ease: [0.175, 0.885, 0.32, 1.275] },
        className: "ui-panel relative w-full max-w-sm p-5 ring-1 ring-inset ring-slate-500/40",
        style: flash ? { animation: "lfg-border-flash 0.42s ease-in-out 4" } : void 0,
        onClick: (e) => e.stopPropagation()
      },
      React.createElement("button", { type: "button", onClick: onClose, className: "ui-close-button absolute right-2 top-2 z-10", "aria-label": "Close" }, React.createElement(X, { size: 14, strokeWidth: 2.5, "aria-hidden": true })),
      React.createElement(
        "h2",
        {
          id: "dungeon-queue-heading",
          className: "ui-heading mb-5 pr-9 pt-0.5 text-center text-xl leading-tight tracking-[0.06em] text-white sm:text-2xl"
        },
        dungeon.name
      ),
      React.createElement("div", { className: "flex items-end justify-center gap-4 sm:gap-6" }, React.createElement(
        RoleSlot,
        {
          current: tank,
          max: 1,
          icon: React.createElement(GameIcon, { iconPath: "lorc/winged-shield", glow: "spell", size: "sm", imageFit: "cover" }),
          activeTint: "text-slate-200",
          dimTint: "text-slate-600",
          ringActive: "border-slate-400/80 shadow-[0_0_14px_rgba(148,163,184,0.2)]",
          ringDim: "border-slate-700/90"
        }
      ), React.createElement(
        RoleSlot,
        {
          current: 1,
          max: 1,
          icon: React.createElement(GameIcon, { iconPath: "wow/spell_holy_renew", glow: "spell", size: "sm", imageFit: "cover" }),
          activeTint: "text-emerald-400",
          dimTint: "text-emerald-700",
          ringActive: "border-emerald-500/70 shadow-[0_0_16px_rgba(52,211,153,0.35)]",
          ringDim: "border-emerald-900/50",
          forceLit: true
        }
      ), React.createElement(
        RoleSlot,
        {
          current: dps,
          max: 3,
          icon: React.createElement(GameIcon, { iconPath: "lorc/crossed-swords", glow: "debuff", size: "sm", imageFit: "cover" }),
          activeTint: "text-red-400",
          dimTint: "text-red-900/80",
          ringActive: "border-red-500/60 shadow-[0_0_14px_rgba(248,113,113,0.25)]",
          ringDim: "border-red-950/80"
        }
      )),
      React.createElement(AnimatePresence, { mode: "wait" }, ready ? React.createElement(
        motion.div,
        {
          key: "enter",
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -4 },
          transition: { duration: 0.2 },
          className: "mt-5 space-y-2"
        },
        React.createElement("p", { className: "text-center text-xs font-bold uppercase tracking-widest text-slate-400" }, "Dungeon pace"),
        React.createElement("div", { className: "grid grid-cols-3 gap-2" }, PACE_OPTIONS.map(({ pace, label, trashSec, bossSec, iconPath, ring, labelClass, subClass, selected }) => React.createElement(
          "button",
          {
            key: pace,
            type: "button",
            onClick: () => onConfirmEnter(dungeon, pace),
            className: `flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-2.5 text-center transition-colors ${pace === "normal" ? selected : ring}`
          },
          React.createElement(
            GameIcon,
            {
              iconPath,
              glow: "spell",
              size: "sm",
              imageFit: "cover",
              className: "[filter:drop-shadow(0_2px_4px_rgb(0_0_0_/_0.5))]"
            }
          ),
          React.createElement("span", { className: `text-xs font-black uppercase leading-tight tracking-tight sm:text-sm ${labelClass}` }, label),
          React.createElement("span", { className: `font-mono text-[11px] font-bold tabular-nums leading-none sm:text-xs ${subClass}` }, trashSec, "s / ", bossSec, "s"),
          React.createElement("span", { className: `font-mono text-[11px] font-bold tabular-nums leading-none sm:text-xs ${subClass}` }, "\xD7", dungeonPaceXpMultiplier(pace), " XP")
        )))
      ) : React.createElement(
        motion.p,
        {
          key: "waiting",
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          className: "mt-5 text-center text-sm font-bold uppercase tracking-widest text-slate-400"
        },
        "Looking for group\u2026"
      )),
      React.createElement("div", { className: "mt-6 border-t border-slate-600/40 pt-4" }, React.createElement("button", { type: "button", onClick: onClose, className: "ui-button-tertiary w-full text-center text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200" }, "Back to dungeons"))
    )
  );
}
function RoleSlot({
  current,
  max,
  icon,
  activeTint,
  dimTint,
  ringActive,
  ringDim,
  forceLit
}) {
  const lit = forceLit || current >= max;
  return React.createElement("div", { className: "flex flex-col items-center gap-2" }, React.createElement(
    "div",
    {
      className: `ui-state-frame flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-slate-950/80 p-1 transition-all duration-300 ${lit ? ringActive : ringDim} ${lit ? activeTint : dimTint}`
    },
    icon
  ), React.createElement("span", { className: "font-mono text-sm font-bold tabular-nums text-white" }, current, "/", max));
}
export {
  DungeonQueueModal
};
