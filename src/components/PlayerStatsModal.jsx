import React from "react";
import { motion } from "motion/react";
import { ChevronDown, X } from "lucide-react";
import { getStatBreakdown } from "../playerStats.js";
import { getManaRegenPerSecond } from "../constants.js";
import { classDisplayName } from "../classUiData.js";
import { xpProgressWithinLevel } from "../gameStorage.js";
import { sentenceCaseBlock, sentenceCaseLabel } from "../gameUiText.js";
import { getTransformClass, getIconUrl, getWrapperTransformClass } from "../classIcons.js";
import { GameIcon } from "./GameIcon.jsx";
function formatCritChance(pct) {
  const r = Math.round(pct * 100) / 100;
  if (r % 1 === 0) return `${r}%`;
  return `${r.toFixed(2)}%`;
}
function formatManaRegen(perSec) {
  if (Number.isInteger(perSec)) return String(perSec);
  return perSec.toFixed(1);
}
function StatPanel({ title, children }) {
  const showHeader = title.trim().length > 0;
  return React.createElement("div", { className: "ui-frame overflow-hidden rounded bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" }, showHeader ? React.createElement("div", { className: "ui-frame-divider-bottom flex items-center justify-between bg-slate-800/95 px-4 py-3" }, React.createElement("span", { className: "ui-heading text-xs tracking-[0.06em] text-slate-300 sm:text-sm" }, title), React.createElement(ChevronDown, { className: "h-4 w-4 shrink-0 text-slate-400", strokeWidth: 2.5, "aria-hidden": true })) : null, React.createElement("div", { className: "px-4 py-3" }, children));
}
function formatStatValue(value) {
  if (typeof value !== "number") return value;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(rounded)) return rounded;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}
function StatRow({ label, value, textColor = "text-slate-50" }) {
  return React.createElement("div", { className: "flex items-center justify-between gap-3 border-b border-slate-800/80 px-0.5 py-2.5 text-[15px] leading-tight last:border-b-0 sm:text-base" }, React.createElement("span", { className: "font-semibold text-slate-200" }, label), React.createElement("span", { className: `ml-3 shrink-0 text-right font-mono font-bold tabular-nums ${textColor}` }, value));
}
function PlayerStatsModal({
  playerClass,
  level,
  xp,
  talents,
  onClose
}) {
  const b = getStatBreakdown(playerClass, level, talents);
  const regenSec = getManaRegenPerSecond(0, b.spirit);
  const { into: xpIntoLevel, needed: xpForNextLevel } = xpProgressWithinLevel(xp);
  const pctLabel = xpForNextLevel > 0 ? Math.min(100, Math.max(0, xpIntoLevel / xpForNextLevel * 100)) : 100;
  return React.createElement(
    motion.div,
    {
      key: "player-stats",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    },
    React.createElement("div", { className: "ui-frame-divider-bottom ui-app-header bg-slate-900 px-4 py-3 sm:py-3.5" }, React.createElement("div", { className: "ui-app-header-slot", "aria-hidden": true }), React.createElement("div", { className: "ui-app-header-title" }, React.createElement("h2", { className: "ui-heading text-base tracking-[0.08em] text-white sm:text-lg" }, classDisplayName(playerClass))), React.createElement("div", { className: "ui-app-header-slot-end" }, React.createElement("button", { type: "button", onClick: onClose, className: "ui-close-button", "aria-label": "Close" }, React.createElement(X, { size: 20 })))),
    React.createElement("div", { className: "mx-auto w-full max-w-xl flex-1 overflow-y-auto sm:max-w-2xl" }, React.createElement("div", { className: "ui-frame-divider-bottom flex flex-col overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 px-6 pt-0 pb-3 sm:px-10 sm:pt-0 sm:pb-4" }, React.createElement(
      motion.div,
      {
        initial: { scale: 0.94, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { duration: 0.48, ease: [0.175, 0.885, 0.32, 1.275] },
        className: "mx-auto flex w-full max-w-xl flex-col items-center justify-start sm:max-w-2xl"
      },
      React.createElement("div", { className: "flex w-full max-w-xl flex-col items-stretch gap-3 sm:max-w-2xl sm:gap-4" }, React.createElement("div", { className: "flex w-full shrink-0 flex-col items-stretch gap-2 self-stretch sm:gap-2.5" }, React.createElement("div", { className: "flex w-full min-w-0 flex-col gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-6" }, React.createElement("div", { className: "flex w-full flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:justify-center sm:gap-10" }, React.createElement("div", { className: "flex shrink-0 flex-col items-center gap-3" }, React.createElement("div", { className: getWrapperTransformClass() }, React.createElement(
        "img",
        {
          src: getIconUrl(playerClass),
          alt: "",
          draggable: false,
          className: `h-[92px] w-[92px] select-none object-contain [filter:drop-shadow(0_4px_6px_rgba(0,0,0,0.7))] sm:h-[104px] sm:w-[104px] ${getTransformClass(playerClass)}`
        }
      ))), React.createElement("div", { className: "flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-center sm:items-stretch sm:text-left" }, React.createElement("div", null, React.createElement("p", { className: "text-[10px] font-black uppercase tracking-[0.2em] text-slate-500" }, "Level"), React.createElement("p", { className: "mt-1 text-5xl font-black tabular-nums leading-none tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-6xl" }, level)), React.createElement("div", { className: "w-full space-y-2 pt-1" }, React.createElement("div", { className: "flex items-end justify-between gap-3 border-b border-slate-700/70 pb-1.5" }, React.createElement("span", { className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, "Experience"), React.createElement("span", { className: "font-mono text-xs font-black tabular-nums text-slate-200" }, React.createElement("span", null, xpIntoLevel), React.createElement("span", { className: "text-slate-500" }, "/"), React.createElement("span", { className: "text-slate-400" }, xpForNextLevel))), React.createElement("div", { className: "relative h-4 w-full overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-slate-800/90" }, React.createElement(
        motion.div,
        {
          className: "h-full bg-gradient-to-r from-indigo-800 via-violet-500 to-amber-300",
          initial: false,
          animate: { width: `${pctLabel}%` },
          transition: { type: "spring", stiffness: 120, damping: 20 }
        }
      )), React.createElement("p", { className: "text-[11px] font-medium tabular-nums text-slate-500" }, pctLabel.toFixed(1), "% into next level")))))))
    )), React.createElement("div", { className: "grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5" }, React.createElement(StatPanel, { title: "Attributes" }, React.createElement(StatRow, { label: "Intellect", value: Math.round(b.intellect) }), React.createElement(StatRow, { label: "Spirit", value: Math.round(b.spirit) }), React.createElement(StatRow, { label: "Max Health", value: b.maxHealth }), React.createElement(StatRow, { label: "Max Mana", value: b.maxMana })), React.createElement(StatPanel, { title: "Affinities" }, React.createElement("div", { className: "border-b border-slate-800/80 px-0.5 py-2.5 last:border-b-0" }, React.createElement("div", { className: "flex items-center justify-between gap-3" }, React.createElement("span", { className: "font-semibold text-slate-200" }, "Bonus Healing"), React.createElement("span", { className: "ml-3 shrink-0 text-right font-mono font-bold tabular-nums text-emerald-200" }, "+", formatStatValue(b.totalHealingBonusPct), "%")), React.createElement("p", { className: "mt-1 text-[13px] text-slate-500" }, formatStatValue(b.healingBonusPctFromSpirit), "% from Spirit \xB7", " ", formatStatValue(b.healingBonusPctFromTalents), "% from talents")), React.createElement(StatRow, { label: "Mana Regen", value: `${formatManaRegen(regenSec)}/s`, textColor: "text-white" }), React.createElement(StatRow, { label: "Crit Chance", value: formatCritChance(b.critChancePct), textColor: "text-white" }), React.createElement(StatRow, { label: "Haste", value: formatCritChance(b.hastePct), textColor: "text-white" }))), React.createElement("div", { className: "space-y-3 px-4 pb-4 sm:px-5 sm:pb-5" }, React.createElement(StatPanel, { title: "" }, React.createElement("div", { className: "flex gap-3 px-0.5 py-2" }, React.createElement(GameIcon, { iconPath: b.passiveTraitIcon, glow: "spell", size: "md" }), React.createElement("div", { className: "min-w-0 flex-1" }, React.createElement("p", { className: "text-xs font-black uppercase tracking-[0.14em] text-amber-200/95" }, "Class mastery"), React.createElement("p", { className: "mt-2 text-base font-semibold tracking-tight text-slate-100" }, sentenceCaseLabel(b.passiveTraitName)), React.createElement("p", { className: "ui-body mt-2 text-sm leading-relaxed text-slate-300" }, sentenceCaseBlock(b.passiveTraitDescription))))), React.createElement(StatPanel, { title: "" }, React.createElement("div", { className: "border-b border-amber-500/15 px-0.5 pb-3" }, React.createElement("p", { className: "text-xs font-black uppercase tracking-[0.14em] text-sky-200/95" }, "Unique \xB7 ", sentenceCaseLabel(b.uniqueStatLabel)), React.createElement("div", { className: "mt-3 flex items-baseline justify-between gap-2" }, React.createElement("span", { className: "text-sm font-semibold text-slate-300" }, "Rating"), React.createElement("span", { className: "font-mono text-lg font-black tabular-nums text-white" }, formatStatValue(b.uniqueStatRating)))), React.createElement("p", { className: "ui-body px-0.5 pt-3 text-sm leading-relaxed text-slate-200" }, sentenceCaseBlock(b.uniqueStatDescription)))))
  );
}
export {
  PlayerStatsModal
};
