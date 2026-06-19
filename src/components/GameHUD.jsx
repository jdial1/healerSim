import React from "react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { GameIcon } from "./GameIcon.jsx";
import { BOSS_BUFF_ICON_TINT, getSelfBuffGlow } from "../gameIcons.js";
import { TRASH_PACK_COUNT, getEndlessMultiplier } from "../constants.js";
import { useGhostBarPercent } from "../useGhostBarPercent.js";
import { clampTooltipX } from "../layoutEnvironment.js";
const TRASH_PACKS = TRASH_PACK_COUNT;
function fmtBossBuffNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function bossSelfBuffTooltipText(b) {
  const pct = Math.round((b.partyDamageMultiplier - 1) * 100);
  const sec = b.remainingTicks / 10;
  return [`+${pct}% damage taken by the party.`, `${fmtBossBuffNumber(sec)} sec remaining.`].join("\n");
}
function EncounterIcon({ type, active, defeated }) {
  const isBoss = type === "boss";
  const dimmed = isBoss ? !active : defeated;
  return React.createElement("div", { className: "relative flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10" }, React.createElement(
    GameIcon,
    {
      iconPath: isBoss ? "lorc/grim-reaper" : "lorc/skull-crack",
      glow: "debuff",
      size: "xs",
      dimmed,
      className: dimmed ? "opacity-45 grayscale" : ""
    }
  ), !isBoss && defeated ? React.createElement(
    "svg",
    {
      className: "pointer-events-none absolute inset-0 z-10 text-red-500/90",
      viewBox: "0 0 40 40",
      fill: "none",
      "aria-hidden": true
    },
    React.createElement(
      "path",
      {
        d: "M9 9 L31 31 M31 9 L9 31",
        stroke: "currentColor",
        strokeWidth: "2.5",
        strokeLinecap: "round"
      }
    )
  ) : null);
}
function GameHUD({
  combatPhase,
  trashPullsRemaining,
  enemyHealth,
  enemyMaxHealth,
  bossName,
  trashEnemyName,
  bossSelfBuffs = [],
  endlessStacks
}) {
  const [bossBuffTip, setBossBuffTip] = useState(null);
  const [bossBuffTipShiftX, setBossBuffTipShiftX] = useState(0);
  const bossBuffTipRef = useRef(null);
  const enemyPercent = enemyMaxHealth > 0 ? enemyHealth / enemyMaxHealth * 100 : 0;
  const { ghostPercent, ghostEaseDuration } = useGhostBarPercent(enemyPercent);
  const pullsCleared = TRASH_PACKS - trashPullsRemaining;
  const bossActive = combatPhase === "BOSS";
  const enemyBarHeightClass = bossActive ? "h-[3.6rem] sm:h-[4.75rem]" : "h-[4.5rem] sm:h-[4.75rem]";
  const enemyBarFill = bossActive ? "bg-gradient-to-r from-[#2b0f0f] via-[#4a1d1a] to-[#6a2c1e]" : "bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#334155]";
  const displayBossName = bossName || "FINAL BOSS";
  const bossBarRowClass = bossActive && bossSelfBuffs.length > 0 ? "justify-between gap-2" : bossActive ? "justify-end" : "justify-between gap-3";
  useEffect(() => {
    if (!bossBuffTip) return;
    const closeEv = () => setBossBuffTip(null);
    const closeClick = (e) => {
      if (e.target instanceof Element && !e.target.closest("[data-boss-buff-hit]")) setBossBuffTip(null);
    };
    window.addEventListener("scroll", closeEv, true);
    window.addEventListener("resize", closeEv);
    document.addEventListener("pointerdown", closeClick, true);
    return () => {
      window.removeEventListener("scroll", closeEv, true);
      window.removeEventListener("resize", closeEv);
      document.removeEventListener("pointerdown", closeClick, true);
    };
  }, [bossBuffTip]);
  useLayoutEffect(() => {
    if (!bossBuffTip) {
      setBossBuffTipShiftX(0);
      return;
    }
    const tip = bossBuffTipRef.current;
    if (!tip) return;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    if (!vw) return;
    setBossBuffTipShiftX(clampTooltipX(tip.getBoundingClientRect(), vw));
  }, [bossBuffTip]);
  return React.createElement(React.Fragment, null, React.createElement("div", { className: "ui-frame-divider-bottom fixed top-0 left-0 right-0 z-40 bg-slate-950/90 shadow-xl backdrop-blur-md" }, React.createElement("div", { className: "flex flex-col gap-2 px-3 pb-3 pt-3 sm:gap-2.5 sm:px-4 sm:pb-3.5 sm:pt-4" }, React.createElement("div", { className: "mx-auto w-full max-w-6xl" }, bossActive ? React.createElement("div", { className: "flex w-full flex-col items-center gap-2 sm:gap-2.5" }, React.createElement("div", { className: "flex flex-wrap items-center justify-center gap-2" }, endlessStacks !== void 0 ? React.createElement("span", { className: "ui-frame rounded bg-fuchsia-950/45 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-200 sm:text-[9px]" }, "Endless x", getEndlessMultiplier(endlessStacks).toFixed(2)) : null), React.createElement("h1", { className: "ui-heading w-full max-w-full text-balance text-center text-2xl leading-[1.05] tracking-[0.06em] text-white sm:text-3xl md:text-4xl lg:text-5xl" }, displayBossName)) : React.createElement("div", { className: "flex flex-wrap items-center gap-2" }, React.createElement("span", { className: "text-xs font-black uppercase tracking-tight text-slate-300 tabular-nums sm:text-[10px]" }, !bossActive ? React.createElement("div", { className: "mx-auto flex w-full items-center justify-evenly" }, Array.from({ length: TRASH_PACKS }, (_, i) => React.createElement(Fragment, { key: i }, React.createElement(EncounterIcon, { type: "trash", defeated: pullsCleared > i }))), React.createElement(EncounterIcon, { type: "boss", active: bossActive })) : null)), endlessStacks !== void 0 && !bossActive ? React.createElement("div", { className: "mt-1.5 flex justify-center sm:mt-2" }, React.createElement("span", { className: "ui-frame rounded bg-fuchsia-950/45 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-200 tabular-nums sm:text-[9px]" }, "Endless \xD7", getEndlessMultiplier(endlessStacks).toFixed(2))) : null), React.createElement("div", { className: "mx-auto w-full max-w-6xl" }, React.createElement("div", { className: `ui-enemy-target-frame ${enemyBarHeightClass} w-full` }, React.createElement(
    motion.div,
    {
      className: "ui-enemy-hp-ghost",
      initial: false,
      animate: { width: `${ghostPercent}%` },
      transition: {
        duration: ghostEaseDuration,
        ease: ghostEaseDuration > 0 ? [0.4, 0, 0.2, 1] : "linear"
      }
    }
  ), React.createElement(
    motion.div,
    {
      className: `ui-enemy-hp-fill ${enemyBarFill}`,
      initial: false,
      animate: { width: `${enemyPercent}%` },
      transition: { duration: 0 }
    }
  ), React.createElement("div", { className: "ui-enemy-hp-sheen", "aria-hidden": true }), React.createElement(
    "div",
    {
      className: `relative z-10 flex h-full items-center px-4 sm:px-4 ${bossBarRowClass}`
    },
    bossActive && bossSelfBuffs.length > 0 ? React.createElement("div", { className: "flex min-w-0 shrink items-center gap-1 sm:gap-1.5" }, bossSelfBuffs.map((b) => {
      const secondsLeft = Math.ceil(b.remainingTicks / 10);
      const showCountdown = b.remainingTicks < 50;
      return React.createElement(
        "button",
        {
          key: b.id,
          type: "button",
          "data-boss-buff-hit": true,
          className: "ui-state-frame ui-state-hover relative inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md active:scale-95 sm:p-0.5",
          "aria-label": `${b.name}, show details`,
          onClick: (e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setBossBuffTip(
              (prev) => prev?.buff.id === b.id ? null : { buff: b, x: r.left + r.width / 2, y: r.bottom }
            );
          }
        },
        React.createElement(
          GameIcon,
          {
            iconPath: b.icon,
            glow: getSelfBuffGlow(b.sourceAbilityId),
            size: "xs",
            accentTint: BOSS_BUFF_ICON_TINT
          }
        ),
        showCountdown ? React.createElement("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/90 px-0.5 text-[10px] font-black text-amber-300 sm:text-[7px]" }, secondsLeft) : null
      );
    })) : null,
    !bossActive ? React.createElement("span", { className: "ui-state-frame min-w-0 max-w-[min(100%,14rem)] truncate rounded-md bg-slate-950/80 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-100 ring-1 ring-red-950/50 sm:max-w-[min(100%,18rem)] sm:text-sm" }, React.createElement("span", { className: "font-black text-red-300/95" }, "Target"), React.createElement("span", { className: "mx-1.5 font-light text-slate-500", "aria-hidden": true }, "\xB7"), React.createElement("span", { className: "normal-case tracking-normal text-slate-50" }, trashEnemyName)) : null,
    React.createElement("span", { className: "shrink-0 font-mono text-lg font-black tabular-nums text-white sm:text-xl" }, Math.max(0, Math.floor(enemyHealth)), React.createElement("span", { className: "ml-0.5 text-base font-normal text-slate-400 opacity-90 sm:text-lg" }, "/ ", Math.floor(enemyMaxHealth)))
  ))))), bossBuffTip ? createPortal(
    React.createElement(
      "div",
      {
        ref: bossBuffTipRef,
        className: "ui-debuff-tooltip-wrap pointer-events-none relative",
        style: {
          position: "fixed",
          left: bossBuffTip.x,
          top: bossBuffTip.y,
          transform: `translate(calc(-50% + ${bossBuffTipShiftX}px), 10px)`,
          zIndex: 400
        }
      },
      React.createElement("div", { className: "ui-spell-tooltip-arrow-up", "aria-hidden": true }),
      React.createElement(
        GameIcon,
        {
          iconPath: bossBuffTip.buff.icon,
          glow: getSelfBuffGlow(bossBuffTip.buff.sourceAbilityId),
          size: "md",
          className: "ui-spell-tooltip-icon",
          accentTint: BOSS_BUFF_ICON_TINT
        }
      ),
      React.createElement("div", { className: "ui-spell-tooltip-body" }, React.createElement("div", { className: "ui-spell-tooltip-title" }, React.createElement("span", { className: "ui-spell-tooltip-title-text" }, bossBuffTip.buff.name)), React.createElement("div", { className: "ui-spell-tooltip-desc mt-1.5 text-amber-100/95" }, bossSelfBuffTooltipText(bossBuffTip.buff)))
    ),
    document.body
  ) : null);
}
export {
  GameHUD
};
