import React from "react";
import { motion } from "motion/react";

/**
 * Five toggles, deliberately. HealBot's own guidance is that a small readable
 * setup beats enabling every option, and a five-unit party removes most of the
 * reason to configure anything. Mirrors the Android SettingsDialog exactly.
 */
const TOGGLES = [
  ["healthTextPercent", "Health as percent", "Off shows current and maximum instead."],
  ["showCommitted", "Show committed healing", "The pale band for healing your HoTs will still deliver."],
  ["colourBlindBands", "Colour-blind health bands", "Swaps the green-to-red ramp for blue to magenta."],
  ["selfFirst", "Keep my frame first", "Puts you at the top of the party instead of the bottom."],
  ["largeFrames", "Larger frames", "Taller rows where there is room for them."]
];

function SettingsModal({ settings, onChange, onClose }) {
  return React.createElement(
    motion.div,
    {
      className: "fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      onClick: onClose
    },
    React.createElement(
      "div",
      {
        className: "ui-panel ui-state-frame w-full max-w-md rounded-md bg-slate-900/95 p-5",
        role: "dialog",
        "aria-label": "Display settings",
        onClick: (e) => e.stopPropagation()
      },
      React.createElement("h2", { className: "ui-heading text-lg tracking-[0.08em] text-amber-100" }, "DISPLAY"),
      React.createElement("div", { className: "mt-3 flex flex-col divide-y divide-slate-700/50" }, TOGGLES.map(([key, label, hint]) => {
        const on = !!settings[key];
        return React.createElement(
          "button",
          {
            key,
            type: "button",
            role: "switch",
            "aria-checked": on,
            className: "flex w-full items-center gap-3 py-3 text-left",
            onClick: () => onChange({ ...settings, [key]: !on })
          },
          React.createElement("span", { className: "flex-1" },
            React.createElement("span", { className: "block text-sm font-semibold text-slate-100" }, label),
            React.createElement("span", { className: "mt-0.5 block text-[11px] leading-snug text-slate-400" }, hint)
          ),
          React.createElement("span", {
            className: `relative h-6 w-11 shrink-0 rounded-full border transition-colors ${on ? "border-amber-400 bg-amber-700/70" : "border-slate-600 bg-slate-950"}`
          }, React.createElement("span", {
            className: `absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${on ? "left-[1.4rem] bg-amber-200" : "left-0.5 bg-slate-500"}`
          }))
        );
      })),
      React.createElement("button", {
        type: "button",
        className: "ui-cta mt-4 w-full rounded px-4 py-2 text-sm font-bold",
        onClick: onClose
      }, "Close")
    )
  );
}
export { SettingsModal };
