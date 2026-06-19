import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, RotateCcw, X } from "lucide-react";
import {
  getTalentWeight,
  getTalentGlow,
  getPrerequisiteIds,
  getUnmetPrerequisites,
  arePrereqsSatisfied,
  UNIQUE_STAT_LABELS
} from "../playerStats.js";
import { GameIcon } from "./GameIcon.jsx";
import { sentenceCaseBlock } from "../gameUiText.js";
import {
  buildTalentTreeUiGraph,
  prereqConnectionStroke,
  TALENT_GRID_COLS,
  TALENT_GRID_ROWS,
  talentInExclusiveSplit
} from "../talentTreeUiGraph.js";
import { injectNumericLevelUpMarkers } from "../spellTooltip.js";
import { renderDiffText } from "./DiffText.jsx";
const TALENT_DETAIL_STEPPER_BASE = "ui-state-frame ui-state-hover flex items-center justify-center rounded-md border border-slate-500/70 bg-slate-800 font-black leading-none text-slate-100 disabled:ui-state-disabled disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600";
const TALENT_DETAIL_STEPPER_TOOLTIP = `${TALENT_DETAIL_STEPPER_BASE} h-8 w-8 text-base`;
const STAT_ORDER = [
  "healingBoost",
  "manaPool",
  "haste",
  "critChance",
  "manaReturnOnDirectHeal",
  "uniqueStat"
];
const STAT_LABELS = {
  healingBoost: "Healing",
  manaPool: "Mana",
  haste: "Haste",
  critChance: "Crit",
  manaReturnOnDirectHeal: "Regen",
  uniqueStat: ""
};
const STAT_SUFFIX = {
  healingBoost: "%",
  manaPool: "",
  haste: "%",
  critChance: "%",
  manaReturnOnDirectHeal: "",
  uniqueStat: ""
};
function statKeysFromBonus(t) {
  const b = t.statBonus;
  if (!b) return [];
  const out = [];
  if (b.healingBoost) out.push("healingBoost");
  if (b.manaPool) out.push("manaPool");
  if (b.haste) out.push("haste");
  if (b.critChance) out.push("critChance");
  if (b.manaReturnOnDirectHeal) out.push("manaReturnOnDirectHeal");
  if (b.uniqueStat) out.push("uniqueStat");
  return out;
}
function uniqueStatsPresent(all) {
  const seen = new Set();
  for (const t of all) {
    for (const k of statKeysFromBonus(t)) seen.add(k);
  }
  return STAT_ORDER.filter((k) => seen.has(k));
}
function totalStatFromTalents(all, key) {
  return all.reduce((sum, t) => {
    if (t.points <= 0 || !t.statBonus?.[key]) return sum;
    const weightedPoints = getTalentWeight(t.points, t.maxPoints);
    return sum + (t.statBonus[key] ?? 0) * weightedPoints;
  }, 0);
}
function splitPairMatchesStat(pair, key) {
  return statKeysFromBonus(pair.top).includes(key) || statKeysFromBonus(pair.bottom).includes(key);
}
function detailDescription(talent, pairIndexByTalentId) {
  if (talentInExclusiveSplit(talent.id, pairIndexByTalentId)) {
    return talent.description.replace(/\s*Exclusive with [^.]+\.?/gi, "").trim();
  }
  return talent.description;
}
function rankDescriptionBase(talent, pairIndexByTalentId) {
  return detailDescription(talent, pairIndexByTalentId).trim();
}
function formatRankValue(value) {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
}
function scalePerPointValues(description, rank) {
  if (rank <= 1) return description;
  return description.replace(/(-?\d+(?:\.\d+)?)(%?)(?=[^.\n]*\bper point\b)/gi, (match, raw, suffix) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return match;
    return `${formatRankValue(numeric * rank)}${suffix}`;
  });
}
function rankDescriptionFromStatBonus(talent, rank) {
  const bonus = talent.statBonus;
  if (!bonus) return null;
  const parts = [];
  if (bonus.healingBoost) parts.push(`+${formatRankValue(bonus.healingBoost * rank)}% healing`);
  if (bonus.manaPool) parts.push(`+${formatRankValue(bonus.manaPool * rank)} mana`);
  if (bonus.haste) parts.push(`+${formatRankValue(bonus.haste * rank)}% haste`);
  if (bonus.critChance) parts.push(`+${formatRankValue(bonus.critChance * rank)}% crit`);
  if (bonus.manaReturnOnDirectHeal)
    parts.push(`+${formatRankValue(bonus.manaReturnOnDirectHeal * rank)} mana return`);
  if (bonus.uniqueStat) parts.push(`+${formatRankValue(bonus.uniqueStat * rank)} class stat`);
  return parts.length > 0 ? parts.join(", ") : null;
}
function rankCoreDescription(talent, rank, pairIndexByTalentId) {
  const statLine = rankDescriptionFromStatBonus(talent, rank);
  return statLine ?? scalePerPointValues(rankDescriptionBase(talent, pairIndexByTalentId), rank);
}
function rankMaxBonusLine(talent, rank) {
  if (rank !== talent.maxPoints || !talent.maxRankBonusDescription) return null;
  return scalePerPointValues(
    talent.maxRankBonusDescription.replace(/^If maxed,\s*/i, "").trim(),
    rank
  );
}
function rankDescriptionForTalent(talent, rank, pairIndexByTalentId) {
  const core = rankCoreDescription(talent, rank, pairIndexByTalentId);
  const extra = rankMaxBonusLine(talent, rank);
  if (extra) return `${core}
${extra}`.trim();
  return core;
}
function talentLevelUpMarkedText(talent, currentRank, nextRank, pairIndexByTalentId) {
  const prevCore = sentenceCaseBlock(rankCoreDescription(talent, currentRank, pairIndexByTalentId));
  const nextCore = sentenceCaseBlock(rankCoreDescription(talent, nextRank, pairIndexByTalentId));
  let out = injectNumericLevelUpMarkers(prevCore, nextCore);
  const nextMax = rankMaxBonusLine(talent, nextRank);
  if (nextMax) {
    out = `${out}
${sentenceCaseBlock(nextMax)}`;
  }
  return out;
}
function learnBlockedReason(talent, allTalents, talentPoints, playerLevel) {
  if (talent.levelReq > playerLevel) {
    return `Requires level ${talent.levelReq} (you are level ${playerLevel})`;
  }
  const unmet = getUnmetPrerequisites(allTalents, talent);
  if (unmet.length > 0) {
    return `Spend at least 1 point in ${unmet.map((p) => p.name).join(" \xB7 ")}`;
  }
  if (talentPoints < talent.cost) {
    return `Not enough talent points (need ${talent.cost}, have ${talentPoints})`;
  }
  return null;
}
function canLearnTalent(talent, allTalents, talentPoints, playerLevel) {
  return learnBlockedReason(talent, allTalents, talentPoints, playerLevel) === null;
}
function canRemoveTalentPoint(talent, allTalents) {
  if (talent.points <= 0) return false;
  return !allTalents.some(
    (candidate) => candidate.points > 0 && candidate.id !== talent.id && getPrerequisiteIds(allTalents, candidate).includes(talent.id)
  );
}
function TalentTree({
  talents,
  talentPoints,
  onUnlock,
  onDecrement,
  onRespec,
  onClose,
  playerLevel,
  playerClass,
  tutorialHighlightTalentId
}) {
  const [selectedTalentId, setSelectedTalentId] = useState(null);
  const [statHighlightKey, setStatHighlightKey] = useState(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const [treePan, setTreePan] = useState({ x: 0, y: 0 });
  const panGestureRef = useRef(null);
  const suppressNextTalentClickRef = useRef(false);
  suppressNextTalentClickRef.current = false;
  const talentGlow = getTalentGlow(playerClass);
  const uiGraph = useMemo(() => buildTalentTreeUiGraph(talents), [talents]);
  const { pairs: exclusiveSplitPairs, pairIndexByTalentId, connections } = uiGraph;
  const talentById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const hasSpentTalents = talents.some((t) => t.points > 0);
  useEffect(() => {
    if (!hasSpentTalents) setConfirmRespec(false);
  }, [hasSpentTalents]);
  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === selectedTalentId),
    [talents, selectedTalentId]
  );
  const selectedLearnReason = useMemo(() => {
    if (!selectedTalent || selectedTalent.points >= selectedTalent.maxPoints) return null;
    return learnBlockedReason(selectedTalent, talents, talentPoints, playerLevel);
  }, [selectedTalent, talents, talentPoints, playerLevel]);
  const statPills = useMemo(() => uniqueStatsPresent(talents), [talents]);
  const statTotals = useMemo(
    () => STAT_ORDER.reduce(
      (acc, key) => {
        acc[key] = totalStatFromTalents(talents, key);
        return acc;
      },
      {}
    ),
    [talents]
  );
  function isTalentAccessible(talent) {
    if (talent.levelReq > playerLevel) return false;
    return arePrereqsSatisfied(talents, talent);
  }
  const effectiveStatHighlight = statHighlightKey !== null && statPills.includes(statHighlightKey) ? statHighlightKey : null;
  const availableTalentIds = useMemo(
    () => new Set(talents.filter((talent) => isTalentAccessible(talent)).map((talent) => talent.id)),
    [talents, playerLevel]
  );
  const toggleStatHighlight = (key) => {
    setSelectedTalentId(null);
    setStatHighlightKey((prev) => prev === key ? null : key);
  };
  const onTalentNodePress = (talent) => {
    setSelectedTalentId(talent.id);
  };
  const canSelectedTalentLearn = !!selectedTalent && canLearnTalent(selectedTalent, talents, talentPoints, playerLevel);
  const canSelectedTalentRemove = !!selectedTalent && canRemoveTalentPoint(selectedTalent, talents);
  const PAN_DRAG_THRESHOLD = 10;
  const startTreePan = (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    const target = event.target;
    const startedOnTalentNode = target.closest('[data-talent-node="true"]') !== null;
    if (!startedOnTalentNode) return;
    event.preventDefault();
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: treePan.x,
      originY: treePan.y,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTreePan = (event) => {
    const panGesture = panGestureRef.current;
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - panGesture.startX;
    const deltaY = event.clientY - panGesture.startY;
    if (!panGesture.moved && Math.hypot(deltaX, deltaY) >= PAN_DRAG_THRESHOLD) {
      panGesture.moved = true;
    }
    if (!panGesture.moved) return;
    setTreePan({
      x: panGesture.originX + deltaX,
      y: panGesture.originY + deltaY
    });
  };
  const endTreePan = (event) => {
    const panGesture = panGestureRef.current;
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    if (panGesture.moved) suppressNextTalentClickRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panGestureRef.current = null;
  };
  const onTreeClickCapture = (event) => {
    if (!suppressNextTalentClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextTalentClickRef.current = false;
  };
  const talentCornerSteppers = (talent, visible, placement) => {
    if (!visible) return null;
    const canRm = canRemoveTalentPoint(talent, talents);
    const canAdd = canLearnTalent(talent, talents, talentPoints, playerLevel);
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const stepperClass = placement === "split" ? `${TALENT_DETAIL_STEPPER_BASE} h-5 w-5 text-[10px] sm:h-6 sm:w-6 sm:text-xs` : `${TALENT_DETAIL_STEPPER_BASE} h-6 w-6 text-xs sm:h-8 sm:w-8 sm:text-base`;
    return React.createElement(React.Fragment, null, React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Remove talent point",
        disabled: !canRm,
        onClick: (e) => {
          stop(e);
          if (canRm) onDecrement(talent.id);
        },
        className: `absolute left-0 top-0 z-[3] -translate-x-1/2 -translate-y-1/2 ${stepperClass}`
      },
      "-"
    ), React.createElement(
      "button",
      {
        type: "button",
        "aria-label": "Add talent point",
        disabled: !canAdd,
        onClick: (e) => {
          stop(e);
          if (canAdd) onUnlock(talent.id);
        },
        className: `absolute right-0 top-0 z-[3] translate-x-1/2 -translate-y-1/2 ${stepperClass}`
      },
      "+"
    ));
  };
  return React.createElement("div", { className: "fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-950" }, React.createElement("div", { className: "ui-frame-divider-bottom ui-app-header bg-slate-900 px-3 py-3 sm:px-4 sm:py-3.5" }, React.createElement("div", { className: "ui-app-header-slot", "aria-hidden": true }), React.createElement("div", { className: "ui-app-header-title" }, React.createElement("h2", { className: "ui-heading text-lg tracking-[0.08em] text-white sm:text-xl" }, "Talents"), React.createElement("div", { className: "mt-1 text-xs font-semibold tabular-nums tracking-[0.06em] text-slate-400 sm:text-sm" }, "Points: ", React.createElement("span", { className: "font-black text-amber-200" }, talentPoints))), React.createElement("div", { className: "ui-app-header-slot-end flex items-center gap-2" }, React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        if (confirmRespec) {
          onRespec();
          setConfirmRespec(false);
          return;
        }
        setConfirmRespec(true);
      },
      disabled: !hasSpentTalents,
      className: `flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-black uppercase tracking-widest transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600 disabled:hover:border-slate-800 sm:px-3 ${confirmRespec ? "ui-state-frame ui-state-selected bg-red-600 text-white hover:bg-red-500" : "ui-state-frame ui-state-hover border-slate-500/55 bg-slate-800 text-slate-100 hover:border-amber-400/45 hover:bg-slate-700 hover:text-amber-50"}`
    },
    React.createElement(RotateCcw, { size: 16, className: "shrink-0" }),
    confirmRespec ? "Confirm" : "Respec"
  ), React.createElement("button", { type: "button", onClick: onClose, className: "ui-close-button", "aria-label": "Close" }, React.createElement(X, { size: 20 })))), React.createElement("div", { className: "flex-1 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-fixed p-4" }, React.createElement("div", { className: "mx-auto w-full max-w-2xl" }, React.createElement("div", { className: "mb-3 flex min-h-[2rem] flex-wrap items-center justify-center gap-2" }, React.createElement("span", { className: "w-full text-center text-xs font-black tracking-[0.08em] text-slate-200 sm:text-sm" }, "Core Masteries"), statPills.map((key) => {
    const sel = effectiveStatHighlight === key;
    const suffix = STAT_SUFFIX[key];
    const total = formatRankValue(statTotals[key]);
    const pillLabel = key === "uniqueStat" ? UNIQUE_STAT_LABELS[playerClass] : STAT_LABELS[key];
    return React.createElement(
      "button",
      {
        key,
        type: "button",
        onClick: () => toggleStatHighlight(key),
        className: `flex min-h-[3.35rem] min-w-[5.75rem] flex-col items-center justify-center gap-1 rounded-full border px-3.5 py-2.5 text-xs font-black tracking-[0.03em] transition-colors sm:min-h-[3.6rem] sm:min-w-[6.25rem] sm:px-4 sm:py-3 sm:text-sm ${sel ? "ui-state-frame ui-state-selected bg-amber-900/35 text-amber-50" : "ui-state-frame ui-state-hover bg-slate-800 text-slate-200 hover:bg-slate-700"}`
      },
      React.createElement("span", { className: "leading-tight" }, pillLabel),
      React.createElement(
        "span",
        {
          className: `text-xs font-mono leading-none tabular-nums sm:text-sm ${sel ? "text-amber-100" : "text-slate-400"}`
        },
        "+",
        total,
        suffix
      )
    );
  })), React.createElement(
    "div",
    {
      className: "relative overflow-visible rounded-md",
      onPointerDown: startTreePan,
      onPointerMove: moveTreePan,
      onPointerUp: endTreePan,
      onPointerCancel: endTreePan,
      onClickCapture: onTreeClickCapture,
      style: { touchAction: "pan-y" }
    },
    React.createElement(
      "div",
      {
        className: "relative grid aspect-[5/7] w-full gap-2 sm:gap-3",
        style: {
          gridTemplateColumns: `repeat(${TALENT_GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${TALENT_GRID_ROWS}, 1fr)`,
          transform: `translate3d(${treePan.x}px, ${treePan.y}px, 0)`
        }
      },
      React.createElement("svg", { className: "pointer-events-none absolute inset-0 h-full w-full" }, connections.map((conn) => {
        const strokeProps = prereqConnectionStroke(
          conn,
          talentById,
          exclusiveSplitPairs,
          pairIndexByTalentId,
          availableTalentIds
        );
        return React.createElement(
          "line",
          {
            key: conn.key,
            x1: conn.x1,
            y1: conn.y1,
            x2: conn.x2,
            y2: conn.y2,
            stroke: strokeProps.stroke,
            strokeWidth: strokeProps.strokeWidth,
            strokeDasharray: strokeProps.strokeDasharray,
            className: strokeProps.className
          }
        );
      })),
      exclusiveSplitPairs.map((pair) => {
        const posTop = { gridX: pair.top.gridX, gridY: pair.top.gridY };
        const posBot = { gridX: pair.bottom.gridX, gridY: pair.bottom.gridY };
        const pairStatMatch = effectiveStatHighlight !== null && splitPairMatchesStat(pair, effectiveStatHighlight);
        const pairStatDim = effectiveStatHighlight !== null && !pairStatMatch;
        const accTop = isTalentAccessible(pair.top);
        const accBot = isTalentAccessible(pair.bottom);
        const ptTop = pair.top.points > 0;
        const ptBot = pair.bottom.points > 0;
        const isSelected = selectedTalentId === pair.top.id || selectedTalentId === pair.bottom.id;
        const sideButton = (side, acc, pts) => {
          const sel = selectedTalentId === side.id;
          const base = pts ? "ui-state-frame ui-state-selected bg-slate-800" : acc ? "ui-state-frame ui-state-hover bg-slate-800 hover:bg-slate-700" : "ui-state-frame ui-state-disabled border-slate-500/50 bg-slate-800/90 grayscale";
          return React.createElement(
            "div",
            {
              key: side.id,
              className: `relative min-h-0 min-w-0 flex-1 ${sel ? "z-[20]" : ""}`
            },
            React.createElement(
              "button",
              {
                "data-talent-node": "true",
                "data-tutorial-id": tutorialHighlightTalentId === side.id ? "tutorial-first-talent" : void 0,
                type: "button",
                onClick: () => onTalentNodePress(side),
                className: `relative flex h-full min-h-11 w-full min-w-0 flex-col items-center justify-center py-0.5 transition-all active:scale-[0.96] ${base} ${sel ? "z-[1] ui-state-selected" : ""}`
              },
              React.createElement(
                GameIcon,
                {
                  iconPath: side.icon,
                  glow: talentGlow,
                  size: "sm",
                  title: side.name,
                  dimmed: !pts,
                  imageFit: "cover",
                  className: `h-full w-full min-h-0 min-w-0 rounded-sm p-0 ${!acc ? "grayscale opacity-[0.68]" : ""}`
                }
              ),
              React.createElement("div", { className: "ui-frame absolute bottom-0.5 right-0.5 rounded border border-slate-600/80 bg-slate-950/95 px-1 py-0.5 text-[11px] font-bold leading-none text-white sm:text-xs" }, side.points, "/", side.maxPoints),
              !acc ? React.createElement(Lock, { size: 14, strokeWidth: 2.5, className: "absolute left-0.5 top-0.5 text-slate-300 drop-shadow sm:left-1 sm:top-1" }) : null
            ),
            talentCornerSteppers(side, sel, "split")
          );
        };
        return React.createElement(
          "div",
          {
            key: `split-${pair.top.id}-${pair.bottom.id}`,
            className: `relative z-10 flex flex-col items-center justify-center ${pairStatDim ? "opacity-[0.38]" : ""}`,
            style: {
              gridColumnStart: posTop.gridX + 1,
              gridRowStart: posTop.gridY + 1,
              gridRowEnd: posBot.gridY + 2
            }
          },
          React.createElement(
            "div",
            {
              className: `flex h-12 w-full max-w-[6.75rem] flex-row overflow-visible rounded-md border border-slate-600 bg-slate-950 shadow-sm transition-transform sm:h-16 sm:max-w-[8.75rem] ${isSelected ? "scale-110 ui-state-selected ring-offset-2 ring-offset-slate-950" : ""} ${pairStatMatch ? "ui-state-selected ring-offset-2 ring-offset-slate-950" : ""}`
            },
            sideButton(pair.top, accTop, ptTop),
            React.createElement("div", { className: "w-px shrink-0 self-stretch bg-slate-400", "aria-hidden": true }),
            sideButton(pair.bottom, accBot, ptBot)
          )
        );
      }),
      talents.map((talent) => {
        if (talentInExclusiveSplit(talent.id, pairIndexByTalentId)) return null;
        const accessible = isTalentAccessible(talent);
        const hasPoints = talent.points > 0;
        const isSelected = selectedTalentId === talent.id;
        const { gridX, gridY } = talent;
        const statMatch = effectiveStatHighlight !== null && statKeysFromBonus(talent).includes(effectiveStatHighlight);
        const statDim = effectiveStatHighlight !== null && !statMatch;
        return React.createElement(
          "div",
          {
            key: talent.id,
            className: `relative z-10 flex flex-col items-center justify-center ${statDim ? "opacity-[0.38]" : ""}`,
            style: { gridColumnStart: gridX + 1, gridRowStart: gridY + 1 }
          },
          React.createElement(
            "div",
            {
              className: `relative w-fit ${isSelected ? "z-[20] scale-110" : ""}`
            },
            React.createElement(
              "button",
              {
                "data-talent-node": "true",
                "data-tutorial-id": tutorialHighlightTalentId === talent.id ? "tutorial-first-talent" : void 0,
                type: "button",
                onClick: () => onTalentNodePress(talent),
                className: `
                    relative flex h-12 min-h-11 w-12 min-w-11 items-center justify-center rounded-md border transition-all active:scale-[0.96] sm:h-16 sm:w-16
                    ${hasPoints ? "ui-state-frame ui-state-selected bg-slate-800" : accessible ? "ui-state-frame ui-state-hover bg-slate-800" : "ui-state-frame ui-state-disabled border-slate-500/50 bg-slate-800/90 grayscale"}
                    ${isSelected ? "ui-state-selected ring-offset-2 ring-offset-slate-950" : ""}
                    ${statMatch ? "ui-state-selected ring-offset-2 ring-offset-slate-950" : ""}
                  `
              },
              React.createElement(
                GameIcon,
                {
                  iconPath: talent.icon,
                  glow: talentGlow,
                  size: "sm",
                  title: talent.name,
                  dimmed: !hasPoints,
                  imageFit: "cover",
                  className: `h-full w-full min-h-0 min-w-0 rounded-sm p-0 ${!accessible ? "grayscale opacity-[0.68]" : ""}`
                }
              ),
              React.createElement("div", { className: "ui-frame absolute -bottom-2 -right-2 rounded-md border border-slate-600/80 bg-slate-950/95 px-1.5 py-0.5 text-xs font-bold text-white sm:text-sm" }, talent.points, "/", talent.maxPoints),
              !accessible ? React.createElement(Lock, { size: 16, strokeWidth: 2.5, className: "absolute left-1 top-1 text-slate-200 drop-shadow" }) : null
            ),
            talentCornerSteppers(talent, isSelected, "grid")
          )
        );
      })
    )
  ))), React.createElement("div", { className: "relative z-[5] shrink-0" }, React.createElement(AnimatePresence, null, selectedLearnReason && selectedTalent && selectedTalent.points < selectedTalent.maxPoints ? React.createElement(
    motion.div,
    {
      key: `${selectedTalent.id}-learn-block`,
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 4 },
      transition: { duration: 0.18, ease: "easeOut" },
      role: "status",
      className: "absolute inset-x-3 bottom-full z-[6] mb-2 rounded-lg border border-red-500/70 bg-slate-950 px-3 py-2.5 text-center text-xs font-semibold leading-snug text-amber-50 shadow-[0_4px_24px_rgba(0,0,0,0.5)] sm:inset-x-4 sm:text-sm"
    },
    selectedLearnReason
  ) : null), React.createElement("div", { className: "ui-frame-divider-top h-[10.725rem] overflow-y-auto bg-slate-900 px-3 py-2.5 sm:px-4 sm:py-3" }, React.createElement(AnimatePresence, { mode: "wait" }, selectedTalent ? React.createElement(motion.div, { key: selectedTalent.id, initial: { opacity: 0 }, animate: { opacity: 1 } }, React.createElement("div", { className: "flex items-center gap-2.5" }, React.createElement(
    GameIcon,
    {
      iconPath: selectedTalent.icon,
      glow: talentGlow,
      size: "md",
      title: selectedTalent.name,
      dimmed: selectedTalent.points === 0
    }
  ), React.createElement("div", { className: "min-w-0 flex-1" }, React.createElement("div", { className: "mb-0.5 flex min-w-0 items-baseline justify-between gap-2 border-b border-slate-800 pb-0.5" }, React.createElement("h3", { className: "ui-heading min-w-0 flex-1 text-sm font-black uppercase italic leading-tight tracking-tight text-white" }, selectedTalent.name), selectedTalent.maxPoints > 1 ? React.createElement("span", { className: "shrink-0 text-right text-[10px] font-black uppercase tracking-widest text-sky-400" }, "Rank", " ", selectedTalent.points >= selectedTalent.maxPoints ? selectedTalent.maxPoints : selectedTalent.points > 0 ? selectedTalent.points + 1 : 1) : null)), React.createElement("div", { className: "flex shrink-0 items-center gap-1.5 self-start pt-0.5" }, React.createElement(
    "button",
    {
      type: "button",
      onClick: () => onDecrement(selectedTalent.id),
      disabled: !canSelectedTalentRemove,
      className: TALENT_DETAIL_STEPPER_TOOLTIP,
      "aria-label": "Remove talent point"
    },
    "-"
  ), React.createElement(
    "button",
    {
      type: "button",
      onClick: () => onUnlock(selectedTalent.id),
      disabled: !canSelectedTalentLearn,
      className: TALENT_DETAIL_STEPPER_TOOLTIP,
      "aria-label": "Add talent point"
    },
    "+"
  ))), React.createElement("div", { className: "ui-body mt-0.5 text-base font-semibold leading-normal tracking-tight text-slate-100 sm:text-lg" }, selectedTalent.maxPoints > 1 ? selectedTalent.points >= selectedTalent.maxPoints ? React.createElement("div", { className: "whitespace-pre-line" }, sentenceCaseBlock(
    rankDescriptionForTalent(
      selectedTalent,
      selectedTalent.maxPoints,
      pairIndexByTalentId
    )
  )) : selectedTalent.points === 0 ? React.createElement("div", { className: "whitespace-pre-line" }, sentenceCaseBlock(
    rankDescriptionForTalent(selectedTalent, 1, pairIndexByTalentId)
  )) : React.createElement("div", { className: "normal-case tabular-nums" }, renderDiffText(
    talentLevelUpMarkedText(
      selectedTalent,
      selectedTalent.points,
      selectedTalent.points + 1,
      pairIndexByTalentId
    ),
    {
      oldColor: "text-slate-100",
      getNewColor: (o, n) => n > o ? "text-emerald-300" : n < o ? "text-rose-300" : "text-slate-200"
    }
  )) : sentenceCaseBlock(detailDescription(selectedTalent, pairIndexByTalentId)))) : React.createElement(
    "div",
    {
      key: "talent-detail-empty",
      className: "flex h-full items-center justify-center px-4 text-center text-xs font-medium text-slate-500"
    },
    "Select a talent to view details"
  )))));
}
export {
  TalentTree
};
