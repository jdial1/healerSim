import React from "react";
import { motion } from "motion/react";
import { ScrollText, Star, Swords } from "lucide-react";
import { INTRO_TUTORIAL_DUNGEON_ID } from "../tutorialConfig.js";
import { DUNGEONS } from "../dungeons/index.js";
import { pacingData } from "../constants.js";
function NavPrimerModal({ onDismiss, talentPoints = 0 }) {
  const introDungeon = DUNGEONS.find((d) => d.id === INTRO_TUTORIAL_DUNGEON_ID);
  const introName = introDungeon?.name ?? "The Deadmines";
  const normalLabel = pacingData.paces.normal.label;
  return React.createElement(
    motion.div,
    {
      role: "presentation",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm",
      onClick: onDismiss
    },
    React.createElement(
      motion.div,
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "nav-primer-heading",
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 4 },
        transition: { duration: 0.35, ease: [0.175, 0.885, 0.32, 1.275] },
        className: "ui-panel relative max-h-[min(90dvh,34rem)] w-full max-w-md overflow-y-auto p-5 ring-1 ring-inset ring-slate-500/40 sm:p-6",
        onClick: (e) => e.stopPropagation()
      },
      React.createElement(
        "h2",
        {
          id: "nav-primer-heading",
          className: "ui-heading mb-3 text-center text-lg leading-tight tracking-[0.06em] text-white sm:text-xl"
        },
        "Welcome back"
      ),
      React.createElement("p", { className: "mb-4 text-center text-sm leading-relaxed text-slate-300" }, "Use the bar at the bottom to switch between roster prep, progression, and content."),
      React.createElement("ul", { className: "mb-5 space-y-3 text-sm leading-snug text-slate-200" }, React.createElement("li", { className: "flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5" }, React.createElement(ScrollText, { size: 18, strokeWidth: 2.25, className: "mt-0.5 shrink-0 text-amber-300", "aria-hidden": true }), React.createElement("span", null, React.createElement("span", { className: "font-bold text-amber-100" }, "Character"), React.createElement("span", { className: "text-slate-400" }, " \u2014 "), "level, XP, resource caps, stat breakdown.")), React.createElement("li", { className: "relative flex gap-3 rounded-lg border border-amber-800/45 bg-gradient-to-br from-amber-950/40 to-slate-950/80 px-3 py-2.5 pr-11 ring-1 ring-amber-500/15" }, React.createElement(Star, { size: 18, strokeWidth: 2.25, className: "mt-0.5 shrink-0 text-amber-300", "aria-hidden": true }), React.createElement("span", { className: "min-w-0" }, React.createElement("span", { className: "font-bold text-amber-100" }, "Talents"), React.createElement("span", { className: "text-slate-400" }, " \u2014 "), "you earn", " ", React.createElement("span", { className: "font-semibold text-sky-200/95" }, "talent points every level"), ". Spending them clears the next tier of the tree; keep investing to", " ", React.createElement("span", { className: "font-semibold text-amber-200/95" }, "unlock deeper rows.")), talentPoints > 0 ? React.createElement(
        "span",
        {
          className: "absolute right-2 top-1/2 inline-flex min-h-[1.35rem] min-w-[1.35rem] -translate-y-1/2 items-center justify-center rounded-full border border-red-200/85 bg-red-600 px-1 font-mono text-[11px] font-black leading-none text-white shadow-[0_0_12px_rgba(239,68,68,0.55)]",
          "aria-hidden": true
        },
        talentPoints
      ) : null), React.createElement("li", { className: "flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5" }, React.createElement(Swords, { size: 18, strokeWidth: 2.25, className: "mt-0.5 shrink-0 text-amber-300", "aria-hidden": true }), React.createElement("span", null, React.createElement("span", { className: "font-bold text-amber-100" }, "Dungeons"), React.createElement("span", { className: "text-slate-400" }, " \u2014 "), "queue a run on your chosen difficulty and pace when you're ready."))),
      React.createElement("div", { className: "mb-5 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-3 text-sm leading-relaxed text-slate-200" }, React.createElement("p", { className: "font-semibold text-sky-100" }, "Tutorial"), React.createElement("p", { className: "mt-2 text-slate-300" }, "Open ", React.createElement("span", { className: "font-bold text-amber-200" }, "Dungeons"), ", select", " ", React.createElement("span", { className: "font-bold text-amber-200" }, introName), ", tap", " ", React.createElement("span", { className: "font-bold text-amber-200" }, "Queue"), ", then pick the", " ", React.createElement("span", { className: "font-bold text-amber-200" }, normalLabel), " pace to start the guided combat flow.")),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: onDismiss,
          className: "ui-button-primary ui-state-frame ui-state-hover w-full py-3 text-center text-sm font-black uppercase tracking-widest text-amber-50"
        },
        "Got it"
      )
    )
  );
}
export {
  NavPrimerModal
};
