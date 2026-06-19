import React from "react";
import { useState } from "react";
import { motion } from "motion/react";
import { Skull, Trophy, X, Copy, Check } from "lucide-react";
import { SPELLS } from "../constants.js";
import {
  getSpellOrder,
  getPrimaryStats,
  getHealingMultiplier
} from "../playerStats.js";
import { GameIcon } from "./GameIcon.jsx";
import { getSpellGlow } from "../gameIcons.js";
import { manaPotionDisplayName, manaPotionIconPath } from "../manaPotionIcon.js";
import {
  spellDisplayManaCost,
  spellEffectTooltipText,
  spellEffectTooltipTextWithPreviousValues,
  spellTooltipRankLabel
} from "../spellTooltip.js";
import { renderDiffText } from "./DiffText.jsx";
function failureMessage(reason) {
  if (reason === "PARTY_WIPE") return "The entire party was defeated.";
  return "The healer was defeated before the encounter could be stabilized.";
}
function formatHealCompact(n, maxFracBelowK, roundAbs) {
  const v = roundAbs ? Math.round(Math.abs(n)) : Math.abs(n);
  return (n < 0 ? "-" : "") + Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: v >= 1000 ? 2 : maxFracBelowK
  }).format(v);
}
function DungeonOutcomeModal({ outcome, onDismiss }) {
  const isSuccess = outcome.kind === "success";
  const levelUpOnly = isSuccess && outcome.successFlavor === "level_up";
  const [copied, setCopied] = useState(false);
  const handleCopyLogs = () => {
    if (!outcome.diagnostics) return;
    const text = JSON.stringify(outcome.diagnostics, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }).catch((e) => {
      console.error("Clipboard write failed", e);
    });
  };
  const cls = outcome.playerClass;
  const order = cls ? getSpellOrder(cls) : [];
  const spellRewardIds = [...outcome.upgradedSpellIds].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const showRewards = outcome.levelUp && (spellRewardIds.length > 0 || outcome.upgradedPotion);
  const postStats = outcome.postStats;
  const previousRewardSpellTipCtx = cls && spellRewardIds.length > 0 && outcome.levelAfter > 1 ? {
    spellHealingMultiplier: getHealingMultiplier(cls, outcome.levelAfter - 1, []),
    spirit: getPrimaryStats(cls, outcome.levelAfter - 1).spirit,
    playerLevel: outcome.levelAfter - 1,
    playerClass: cls,
    unlockedSpells: spellRewardIds
  } : null;
  const rewardSpellTipCtx = cls && spellRewardIds.length > 0 ? {
    spellHealingMultiplier: getHealingMultiplier(cls, outcome.levelAfter, []),
    spirit: getPrimaryStats(cls, outcome.levelAfter).spirit,
    playerLevel: outcome.levelAfter,
    playerClass: cls,
    unlockedSpells: spellRewardIds
  } : null;
  return React.createElement(
    motion.div,
    {
      role: "presentation",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
    },
    React.createElement(
      motion.div,
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "dungeon-outcome-title",
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { duration: 0.48, ease: [0.175, 0.885, 0.32, 1.275] },
        className: "ui-frame relative max-h-[90vh] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-lg bg-[#070d1a] shadow-[0_0_60px_rgba(0,0,0,0.65)]"
      },
      React.createElement("button", { type: "button", onClick: onDismiss, className: "ui-close-button absolute right-2 top-2 z-10", "aria-label": "Close" }, React.createElement(X, { size: 14 })),
      React.createElement(
        "div",
        {
          className: `ui-frame-divider-bottom px-4 pb-4 pt-5 sm:px-5 sm:pt-6 ${isSuccess ? "border-amber-900/40 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.12),transparent_55%)]" : "border-red-950/50 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.1),transparent_55%)]"}`
        },
        React.createElement("div", { className: "flex items-start gap-3 pr-8" }, React.createElement(
          "div",
          {
            className: `flex h-11 w-11 shrink-0 items-center justify-center rounded-md border ${isSuccess ? "border-amber-700/50 bg-amber-950/60 text-amber-400" : "border-red-900/50 bg-red-950/50 text-red-400"}`
          },
          isSuccess ? React.createElement(Trophy, { size: 22, strokeWidth: 2 }) : React.createElement(Skull, { size: 22, strokeWidth: 2 })
        ), React.createElement("div", { className: "min-w-0 flex-1" }, React.createElement("p", { className: "text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 sm:text-[8px]" }, levelUpOnly ? "Level up" : isSuccess ? "Dungeon complete" : "Run failed"), React.createElement(
          "h2",
          {
            id: "dungeon-outcome-title",
            className: "ui-heading mt-0.5 text-lg leading-tight tracking-[0.06em] text-white sm:text-xl"
          },
          outcome.levelUp ? "LEVEL UP" : outcome.dungeonName
        ), isSuccess ? React.createElement("p", { className: "mt-1 text-[11px] font-bold text-slate-400 sm:text-xs" }, outcome.levelUp ? `${outcome.dungeonName} complete.` : `${outcome.bossName} has fallen.`) : React.createElement("p", { className: "mt-1 text-[11px] font-bold leading-snug text-slate-400 sm:text-xs" }, failureMessage(outcome.reason), outcome.endlessWavesCleared !== void 0 ? React.createElement("span", { className: "mt-1 block text-fuchsia-300/90" }, "Bosses defeated: ", outcome.endlessWavesCleared) : null)))
      ),
      React.createElement("div", { className: "px-4 py-5 sm:px-5 sm:py-5" }, isSuccess ? React.createElement("div", { className: "flex flex-col items-center gap-4" }, React.createElement("span", { className: `ui-frame rounded-lg bg-slate-950/90 px-5 py-3 font-black tracking-[0.1em] shadow-[0_0_16px_rgba(56,189,248,0.14)] sm:px-7 sm:py-3.5 ${outcome.levelUp ? "text-lg text-sky-100 sm:text-xl" : "text-xl text-sky-200 sm:text-2xl"}` }, "+", outcome.xpGained, " XP"), outcome.levelUp ? React.createElement(
        "span",
        {
          role: "status",
          className: "inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/25 sm:text-sm"
        },
        "Level up"
      ) : null) : outcome.xpGained > 0 ? React.createElement("div", { className: "flex flex-col items-center gap-4" }, React.createElement("span", { className: "ui-frame rounded-lg bg-slate-950/90 px-5 py-3 text-xl font-black uppercase tracking-[0.16em] text-slate-300 shadow-[0_0_18px_rgba(148,163,184,0.12)] sm:px-7 sm:py-3.5 sm:text-2xl" }, "+", outcome.xpGained, " XP"), outcome.levelUp ? React.createElement(
        "span",
        {
          role: "status",
          className: "inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/25 sm:text-sm"
        },
        "Level up"
      ) : null) : null, showRewards ? React.createElement("div", { className: "ui-frame mt-5 w-full rounded-md bg-amber-950/20 px-3 py-3.5 sm:mt-5" }, React.createElement("p", { className: "text-[10px] font-semibold tracking-[0.08em] text-slate-400" }, "Rewards unlocked"), React.createElement("ul", { className: "mt-2 flex flex-col gap-2" }, outcome.upgradedPotion ? React.createElement("li", { className: "ui-frame flex items-center gap-2 rounded bg-slate-950/60 px-2 py-2 text-left" }, React.createElement(
        GameIcon,
        {
          iconPath: manaPotionIconPath(outcome.levelAfter),
          glow: getSpellGlow("mana_potion"),
          size: "sm",
          className: "shrink-0"
        }
      ), React.createElement("div", { className: "min-w-0" }, React.createElement("p", { className: "text-[11px] font-bold text-slate-200 sm:text-xs" }, manaPotionDisplayName(outcome.levelAfter)))) : null, cls && rewardSpellTipCtx ? spellRewardIds.map((sid) => {
        const sp = SPELLS[sid];
        if (!sp) return null;
        const rankLbl = spellTooltipRankLabel(sp, rewardSpellTipCtx);
        const displayMana = spellDisplayManaCost(sp, rewardSpellTipCtx);
        const previousMana = previousRewardSpellTipCtx ? spellDisplayManaCost(sp, previousRewardSpellTipCtx) : displayMana;
        const effectText = previousRewardSpellTipCtx ? spellEffectTooltipTextWithPreviousValues(
          sp,
          previousRewardSpellTipCtx,
          rewardSpellTipCtx
        ) : spellEffectTooltipText(sp, rewardSpellTipCtx);
        return React.createElement("li", { key: sid, className: "flex flex-col gap-2" }, React.createElement("div", { className: "flex w-full min-w-0 items-start gap-1.5 shadow-2xl sm:gap-2" }, React.createElement(
          GameIcon,
          {
            iconPath: sp.icon,
            glow: getSpellGlow(sid),
            size: "md",
            className: "ui-spell-tooltip-icon shrink-0"
          }
        ), React.createElement("div", { className: "ui-spell-tooltip-body min-w-0" }, React.createElement("div", { className: "ui-spell-tooltip-title" }, React.createElement("span", { className: "ui-heading min-w-0 flex-1 text-sm tracking-[0.06em] text-slate-100" }, sp.name), rankLbl ? React.createElement("span", { className: "ui-spell-tooltip-rank" }, rankLbl) : null), sp.manaCost > 0 ? React.createElement("div", { className: "ui-spell-tooltip-mana" }, previousMana !== displayMana ? React.createElement("span", { className: "inline-flex items-center gap-1" }, React.createElement("span", { className: "text-slate-300" }, previousMana), React.createElement("span", { className: "text-amber-300" }, "\u2192"), React.createElement("span", { className: displayMana > previousMana ? "text-rose-300" : "text-emerald-300" }, displayMana)) : displayMana, " ", "Mana") : null, React.createElement(
          "div",
          {
            className: `ui-spell-tooltip-desc${sp.manaCost > 0 ? " mt-1.5" : ""}`
          },
          renderDiffText(effectText, { oldColor: "text-slate-400" })
        ))));
      }) : null)) : null, postStats ? React.createElement("div", { className: "ui-frame mt-5 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:mt-5 sm:px-4" }, React.createElement("div", { className: "flex items-center justify-between" }, React.createElement("p", { className: "text-[10px] font-black uppercase tracking-[0.18em] text-slate-500" }, "Run statistics"), outcome.diagnostics ? React.createElement(
        "button",
        {
          type: "button",
          onClick: handleCopyLogs,
          className: "flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
        },
        copied ? React.createElement(Check, { size: 12, className: "text-emerald-400" }) : React.createElement(Copy, { size: 12 }),
        copied ? React.createElement("span", { className: "text-emerald-400" }, "Copied") : "Copy Logs"
      ) : null), React.createElement("dl", { className: "mt-2.5 space-y-2.5 text-left" }, React.createElement("div", { className: "ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2" }, React.createElement("dt", { className: "text-[11px] font-semibold text-slate-400" }, "Total healing"), React.createElement("dd", { className: "text-sm font-black tabular-nums text-emerald-300" }, formatHealCompact(postStats.totalHealing, 0, true))), React.createElement("div", { className: "ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2" }, React.createElement("dt", { className: "text-[11px] font-semibold text-slate-400" }, "HPS"), React.createElement("dd", { className: "text-sm font-black tabular-nums text-sky-300" }, formatHealCompact(postStats.hps, 1, false))), React.createElement("div", { className: "ui-frame-divider-bottom flex items-baseline justify-between gap-3 pb-2" }, React.createElement("dt", { className: "text-[11px] font-semibold text-slate-400" }, "Overhealing"), React.createElement("dd", { className: "text-sm font-black tabular-nums text-amber-300/95" }, postStats.overhealPct.toFixed(1), "%")), React.createElement("div", { className: "flex items-baseline justify-between gap-3" }, React.createElement("dt", { className: "text-[11px] font-semibold text-slate-400" }, "HPM"), React.createElement("dd", { className: "text-sm font-black tabular-nums text-violet-300" }, formatHealCompact(postStats.hpm, 2, false))))) : null, React.createElement("button", { type: "button", onClick: onDismiss, className: "ui-button-primary ui-state-frame ui-state-hover mt-6 w-full py-3 text-sm font-semibold uppercase tracking-[0.1em] active:scale-[0.99] sm:mt-6" }, "Continue"))
    )
  );
}
export {
  DungeonOutcomeModal
};
