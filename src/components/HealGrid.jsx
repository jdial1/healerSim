import { committedHealing } from "../healMath.js";
import { DEFAULT_UI_SETTINGS } from "../gameStorage.js";
import React from "react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Shield, Zap, User } from "lucide-react";
import { getSpellGlow, getAbilityGlow } from "../gameIcons.js";
import { GameIcon } from "./GameIcon.jsx";
import {
  INTRO_TUTORIAL_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DEBUFF_DATA_ID,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID
} from "../tutorialConfig.js";
import { useGhostBarPercent } from "../useGhostBarPercent.js";
import { clampTooltipX } from "../layoutEnvironment.js";
function fmtDebuffNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function unitRoleLabel(role) {
  if (role === "DPS") return "DPS";
  if (role === "TANK") return "Tank";
  return "Healer";
}
function partyDebuffTooltipText(d) {
  const perSec = d.damagePerTick * 10;
  const total = d.damagePerTick * d.remainingTicks;
  const sec = d.remainingTicks / 10;
  const lines = [
    `Deals ${fmtDebuffNumber(perSec)} damage per second.`,
    `${fmtDebuffNumber(total)} damage over ${fmtDebuffNumber(sec)} sec remaining.`
  ];
  return lines.join("\n");
}
function hotMaxTicks(buff) {
  if (typeof buff.durationTicksMax === "number" && buff.durationTicksMax > 0) {
    return buff.durationTicksMax;
  }
  return Math.max(1, buff.remainingTicks);
}
function HoTBuffIcon({ buff }) {
  const maxT = Math.max(1, buff.durationTicksMax ?? hotMaxTicks(buff));
  const sweep = Math.max(0, Math.min(1, buff.remainingTicks / maxT));
  const deg = sweep * 360;
  const secondsLeft = Math.ceil(buff.remainingTicks / 10);
  const urgent = buff.remainingTicks <= 30;
  return React.createElement("div", { className: "relative h-8 w-8 shrink-0", title: buff.name }, React.createElement(
    "div",
    {
      className: "ui-hot-ring-outer",
      style: {
        background: `conic-gradient(from -90deg, rgba(52,211,153,0.92) ${deg}deg, rgba(15,23,42,0.96) 0deg)`
      }
    }
  ), React.createElement("div", { className: "ui-hot-inner" }, React.createElement(GameIcon, { iconPath: buff.icon, glow: getSpellGlow(buff.sourceSpellId), size: "xs", className: "scale-90" })), React.createElement("div", { className: `ui-hot-timer ${urgent ? "ui-hot-timer-urgent" : "ui-hot-timer-ok"}` }, secondsLeft));
}
function ManaRegenBuffIcon({ buff }) {
  const showCountdown = buff.remainingTicks < 50;
  return React.createElement("div", { className: "relative sm:p-0.5", title: buff.name }, React.createElement(GameIcon, { iconPath: buff.icon, glow: getSpellGlow(buff.sourceSpellId), size: "xs" }), showCountdown ? React.createElement("div", { className: "ui-mana-regen-overlay" }, Math.ceil(buff.remainingTicks / 10)) : null);
}
function HealGridFloatingLayer({ entries }) {
  if (entries.length === 0) return null;
  return React.createElement("div", { className: "ui-heal-grid-fct-root", "aria-hidden": true }, entries.map((f, i) => {
    const spread = (i - (entries.length - 1) / 2) * 14;
    const isCritHeal = f.kind === "heal" && f.crit;
    return React.createElement(
      motion.span,
      {
        key: f.id,
        className: f.kind === "heal" ? isCritHeal ? "ui-heal-grid-fct-heal ui-heal-grid-fct-crit" : "ui-heal-grid-fct-heal" : "ui-heal-grid-fct-absorb",
        initial: { y: 10, opacity: 0, x: spread },
        animate: { y: -56, opacity: [1, 1, 0], x: spread },
        transition: { duration: 1.12, ease: [0.22, 1, 0.36, 1] }
      },
      f.kind === "absorb" ? "+" : "",
      f.amount
    );
  }));
}
function healthTierClasses(percent) {
  const baseTexture = "bg-gradient-to-b shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.4)]";
  const tiers = [
    { p: 25, f: "from-red-400 via-red-600 to-red-800 animate-pulse", e: "border-r-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]", g: "from-red-300/65 via-red-600/55 to-red-900/55 opacity-[0.6] brightness-125 saturate-[0.85]" },
    { p: 50, f: "from-orange-300 via-orange-500 to-orange-700", e: "border-r-orange-200 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]", g: "from-orange-300/60 via-orange-500/55 to-orange-900/50 opacity-[0.58] brightness-125 saturate-75" },
    { p: 75, f: "from-yellow-200 via-yellow-400 to-yellow-600", e: "border-r-yellow-100", g: "from-yellow-200/60 via-yellow-400/55 to-yellow-700/55 opacity-[0.55] brightness-125 saturate-80" }
  ];
  const t = tiers.find((tier) => percent < tier.p) || { f: "from-green-300 via-green-500 to-green-700", e: "border-r-green-200", g: "from-green-400/65 via-green-500/55 to-green-700/50 opacity-[0.55] brightness-125 saturate-75" };
  return { fill: `${baseTexture} ${t.f}`, edge: t.e, ghost: `${baseTexture} ${t.g}` };
}
function healGridRowClass(isSelected, isDead, edgeClass) {
  const border = isSelected ? "z-10 scale-[1.02] border-l-[5px] brightness-110 ui-state-selected" : `ui-state-frame border-l-4 ${edgeClass}`;
  const dead = isDead ? "cursor-not-allowed ui-state-disabled shadow-inner" : "ui-state-hover";
  return `ui-heal-grid-row group ${border} ${dead}`;
}
function HealGrid({
  party,
  onTargetSelect,
  selectedId,
  floatingCombatTexts,
  syncIntroTutorialDebuffTip = false,
  debuffTipZIndex = 400,
  holdTutorialDebuffTip = false,
  uiSettings = DEFAULT_UI_SETTINGS,
  dropTargetId = null
}) {
  const [debuffTip, setDebuffTip] = useState(null);
  const [debuffTipShiftX, setDebuffTipShiftX] = useState(0);
  const debuffTipRef = useRef(null);
  const partyRef = useRef(party);
  partyRef.current = party;
  const floatsByUnit = useMemo(() => {
    const m = new Map();
    for (const e of floatingCombatTexts) {
      const arr = m.get(e.unitId);
      if (arr) arr.push(e);
      else m.set(e.unitId, [e]);
    }
    return m;
  }, [floatingCombatTexts]);
  useEffect(() => {
    if (!debuffTip || holdTutorialDebuffTip) return;
    const close = () => setDebuffTip(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [debuffTip, holdTutorialDebuffTip]);
  useLayoutEffect(() => {
    if (!syncIntroTutorialDebuffTip) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      const el = document.querySelector(`[data-tutorial-id="${CSS.escape(INTRO_TUTORIAL_DEBUFF_DATA_ID)}"]`);
      const debuff = partyRef.current.flatMap((u) => u.debuffs).find((d) => d.sourceAbilityId === INTRO_TUTORIAL_DEBUFF_ABILITY);
      if (el instanceof HTMLElement && debuff) {
        const r = el.getBoundingClientRect();
        setDebuffTip({ debuff, x: r.left + r.width / 2, y: r.top });
      }
    };
    run();
    const t = window.setTimeout(run, 80);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [syncIntroTutorialDebuffTip]);
  const prevSyncIntroDebuffRef = useRef(false);
  useEffect(() => {
    if (prevSyncIntroDebuffRef.current && !syncIntroTutorialDebuffTip) {
      setDebuffTip(null);
    }
    prevSyncIntroDebuffRef.current = syncIntroTutorialDebuffTip;
  }, [syncIntroTutorialDebuffTip]);
  useLayoutEffect(() => {
    if (!debuffTip) {
      setDebuffTipShiftX(0);
      return;
    }
    const tip = debuffTipRef.current;
    if (!tip) return;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    if (!vw) return;
    setDebuffTipShiftX(clampTooltipX(tip.getBoundingClientRect(), vw));
  }, [debuffTip]);
  return React.createElement("div", { className: "ui-heal-grid-root" }, party.map((unit) => {
    const healthPercent = unit.health / unit.maxHealth * 100;
    const hpCur = Math.round(Math.max(0, unit.health));
    const hpMax = Math.round(unit.maxHealth);
    const isDead = unit.health <= 0;
    const isSelected = selectedId === unit.id;
    const tier = healthTierClasses(isDead ? 0 : healthPercent);
    const shieldWedge = unit.shield > 0 ? Math.min(100, unit.shield / Math.max(1, unit.maxHealth) * 100) : 0;
    const hpBarTop = unit.shield > 0 ? "top-1.5" : "top-0";
    const rowFloats = floatsByUnit.get(unit.id) ?? [];
    return React.createElement(Fragment, { key: unit.id }, React.createElement(
      HealGridUnitRow,
      {
        unit,
        isDead,
        isSelected,
        tierEdge: tier.edge,
        healthPercent,
        shieldWedge,
        hpBarTop,
        tierFill: tier.fill,
        tierGhostFill: tier.ghost,
        hpCur,
        hpMax,
        rowFloats,
        uiSettings,
        isDropTarget: dropTargetId === unit.id,
        onTargetSelect,
        setDebuffTip
      }
    ));
  }), debuffTip ? createPortal(
    React.createElement(
      "div",
      {
        ref: debuffTipRef,
        className: "ui-debuff-tooltip-wrap relative",
        style: {
          position: "fixed",
          left: debuffTip.x,
          top: debuffTip.y,
          transform: `translate(calc(-50% + ${debuffTipShiftX}px), calc(-100% - 10px))`,
          zIndex: debuffTipZIndex
        }
      },
      React.createElement(
        GameIcon,
        {
          iconPath: debuffTip.debuff.icon,
          glow: getAbilityGlow(debuffTip.debuff.sourceAbilityId),
          size: "md",
          className: "ui-spell-tooltip-icon"
        }
      ),
      React.createElement("div", { className: "ui-spell-tooltip-body" }, React.createElement("div", { className: "ui-spell-tooltip-title" }, React.createElement("span", { className: "ui-spell-tooltip-title-text" }, debuffTip.debuff.name)), React.createElement("div", { className: "ui-spell-tooltip-desc mt-1.5 text-red-100/95" }, partyDebuffTooltipText(debuffTip.debuff))),
      React.createElement("div", { className: "ui-spell-tooltip-arrow", "aria-hidden": true })
    ),
    document.body
  ) : null);
}
function HealGridUnitRow(props) {
  const {
    unit,
    isDead,
    isSelected,
    tierEdge,
    healthPercent,
    shieldWedge,
    hpBarTop,
    tierFill,
    tierGhostFill,
    hpCur,
    hpMax,
    rowFloats,
    uiSettings,
    isDropTarget,
    onTargetSelect,
    setDebuffTip
  } = props;
  // Percent for urgency, deficit for which heal covers the gap — the pair
  // every healing addon puts on the frame. "1240 / 1450" makes the player do
  // arithmetic under pressure to get either one.
  const hpPct = Math.round(Math.max(0, healthPercent));
  // The app is named Overheal: show the healing already on the way, and where
  // it would spill past the top of the bar. committedHealing() in healMath.js
  // is the same estimate the Android app makes.
  const committedRaw = uiSettings.showCommitted ? committedHealing(unit) : 0;
  const committedPct = unit.maxHealth > 0 ? committedRaw / unit.maxHealth * 100 : 0;
  const committedWidth = Math.max(0, Math.min(100 - healthPercent, committedPct));
  const isOverhealing = !isDead && healthPercent + committedPct > 100;
  const hpDeficit = Math.max(0, Math.round(unit.maxHealth - unit.health));
  // Debuffs first: the alarm outranks the reassurance. HoTs by time left, so
  // the one about to fall off is never the one that gets truncated.
  const AURA_CAP = 6;
  const shownDebuffs = unit.debuffs.slice(0, AURA_CAP);
  const shownBuffs = [...unit.buffs]
    .sort((a, b) => a.remainingTicks - b.remainingTicks)
    .slice(0, Math.max(0, AURA_CAP - shownDebuffs.length));
  const aurasHidden =
    unit.buffs.length + unit.debuffs.length - shownBuffs.length - shownDebuffs.length;
  const [shakePulse, setShakePulse] = useState(0);
  const lastCritFloatId = useRef(null);
  const { ghostPercent, ghostEaseDuration } = useGhostBarPercent(healthPercent);
  useEffect(() => {
    const newestCrit = [...rowFloats].reverse().find((e) => e.kind === "heal" && e.crit);
    if (!newestCrit || newestCrit.id === lastCritFloatId.current) return;
    lastCritFloatId.current = newestCrit.id;
    setShakePulse((n) => n + 1);
  }, [rowFloats]);
  return React.createElement("div", { className: "ui-heal-grid-row-wrap" }, React.createElement(
    "div",
    {
      className: "w-full",
      "data-tutorial-id": unit.role === "TANK" ? TUTORIAL_SPOTLIGHT_TANK_DATA_ID : `unit-${unit.id}`
    },
    React.createElement(
      motion.button,
      {
        type: "button",
        key: shakePulse > 0 ? `${unit.id}-crit-${shakePulse}` : unit.id,
        id: `unit-${unit.id}`,
        // How a spell dragged out of the action bar finds this frame.
        "data-unit-id": unit.id,
        disabled: isDead,
        onClick: () => {
          if (!isDead) onTargetSelect(unit.id);
        },
        // The frame under the finger takes the existing selection treatment
        // rather than inventing a second visual vocabulary for "about to drop".
        className: healGridRowClass(isSelected || isDropTarget, isDead, tierEdge),
        initial: { x: 0 },
        animate: shakePulse > 0 ? { x: [0, -5, 5, -4, 4, -2, 2, 0] } : { x: 0 },
        transition: { duration: 0.34, ease: "easeOut" },
        whileTap: isDead ? void 0 : { scale: 0.98 }
      },
      React.createElement("div", { className: "relative w-full h-6 bg-zinc-900 border-2 border-zinc-950 rounded-sm overflow-hidden shadow-lg" }, unit.shield > 0 ? React.createElement("div", { className: "ui-heal-grid-shield-track absolute inset-0" }, React.createElement(
        motion.div,
        {
          className: "ui-heal-grid-shield-fill h-full",
          initial: false,
          animate: { width: `${shieldWedge}%` },
          transition: { type: "tween", duration: 0.2 },
          style: { originX: 0 }
        }
      )) : null, React.createElement("div", { className: "pointer-events-none absolute inset-0 z-0 bg-red-950/20" }), React.createElement(
        motion.div,
        {
          className: `pointer-events-none absolute top-0 left-0 z-[1] h-full border-r-[1px] ${tierGhostFill}`,
          initial: false,
          animate: { width: `${ghostPercent}%` },
          transition: {
            duration: ghostEaseDuration,
            ease: ghostEaseDuration > 0 ? [0.33, 1, 0.68, 1] : "linear"
          },
          style: { originX: 0 }
        }
      ), React.createElement(
        motion.div,
        {
          className: `pointer-events-none absolute top-0 left-0 z-[2] h-full border-r-[1px] shadow-sm ${tierFill} ${tierEdge}`,
          initial: false,
          animate: { width: `${healthPercent}%` },
          transition: { duration: 0 },
          style: { originX: 0 }
        }
      ), committedWidth > 0 ? React.createElement(
        motion.div,
        {
          className: "ui-heal-grid-committed-fill pointer-events-none absolute top-0 z-[2] h-full",
          initial: false,
          animate: { width: `${committedWidth}%` },
          transition: { type: "tween", duration: 0.14 },
          style: { left: `${Math.min(100, healthPercent)}%` }
        }
      ) : null, isOverhealing ? React.createElement("div", { className: "ui-heal-grid-overheal-cap pointer-events-none z-[3]" }) : null, React.createElement("div", { className: "absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.65%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.08%27/%3E%3C/svg%3E')] mix-blend-overlay pointer-events-none" }), React.createElement("div", { className: "absolute inset-0 flex items-center justify-center gap-1.5 font-bold text-white text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,1)]" }, uiSettings.healthTextPercent ? React.createElement(React.Fragment, null, hpDeficit > 0 ? React.createElement("span", { className: "text-orange-300 font-mono" }, "-", hpDeficit) : null, React.createElement("span", null, hpPct, "%")) : React.createElement("span", null, hpCur, "/", hpMax))),
      React.createElement("div", { className: "ui-heal-grid-content" }, React.createElement("div", { className: "ui-heal-grid-name" }, unit.name), React.createElement("div", { className: "ui-heal-grid-meta" }, React.createElement("span", null, unitRoleLabel(unit.role)), React.createElement("span", { className: "ui-heal-grid-level-pill" }, "Lv ", unit.level), unit.shield > 0 ? React.createElement("span", { className: "ui-numeric font-mono text-sky-200" }, "+", Math.round(unit.shield), " absorb") : null), React.createElement("div", { className: "ui-heal-grid-buff-row" }, shownBuffs.map((buff) => {
        if (buff.isManaRegenBuff) {
          return React.createElement(
            "div",
            {
              key: buff.id,
              "data-tutorial-id": buff.sourceSpellId === "echo_of_light" ? "tutorial-passive-priest-echo" : void 0
            },
            React.createElement(ManaRegenBuffIcon, { buff })
          );
        }
        const useHoTRing = buff.rendersAsHoTRing === true || buff.healingPerTick > 0;
        if (useHoTRing) {
          return React.createElement(
            "div",
            {
              key: buff.id,
              "data-tutorial-id": buff.sourceSpellId === "echo_of_light" ? "tutorial-passive-priest-echo" : void 0
            },
            React.createElement(HoTBuffIcon, { buff })
          );
        }
        return React.createElement(
          "div",
          {
            key: buff.id,
            className: "relative sm:p-0.5",
            title: buff.name,
            "data-tutorial-id": buff.sourceSpellId === "echo_of_light" ? "tutorial-passive-priest-echo" : void 0
          },
          React.createElement(
            GameIcon,
            {
              iconPath: buff.icon,
              glow: getSpellGlow(buff.sourceSpellId),
              size: "xs"
            }
          )
        );
      }), shownDebuffs.map((debuff) => {
        const secondsLeft = Math.ceil(debuff.remainingTicks / 10);
        const showCountdown = debuff.remainingTicks < 50;
        return React.createElement(
          "div",
          {
            key: debuff.id,
            className: "ui-debuff-frame pointer-events-auto cursor-pointer touch-manipulation",
            "data-tutorial-id": debuff.sourceAbilityId === INTRO_TUTORIAL_DEBUFF_ABILITY ? INTRO_TUTORIAL_DEBUFF_DATA_ID : void 0,
            onPointerEnter: (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setDebuffTip({
                debuff,
                x: r.left + r.width / 2,
                y: r.top
              });
            },
            onPointerLeave: (e) => {
              if (e.pointerType === "mouse") setDebuffTip(null);
            },
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setDebuffTip(
                (prev) => prev?.debuff.id === debuff.id ? null : { debuff, x: r.left + r.width / 2, y: r.top }
              );
            }
          },
          React.createElement(
            GameIcon,
            {
              iconPath: debuff.icon,
              glow: getAbilityGlow(debuff.sourceAbilityId),
              size: "xs"
            }
          ),
          showCountdown && React.createElement("div", { className: "ui-debuff-countdown" }, secondsLeft)
        );
      }), aurasHidden > 0 ? React.createElement("span", { className: "ui-heal-grid-aura-overflow" }, "+", aurasHidden) : null, isDead && React.createElement("span", { className: "ui-heal-grid-fallen" }, "FALLEN"))),
      React.createElement("div", { className: "ui-heal-grid-role-icons" }, unit.role === "TANK" && React.createElement(Shield, { className: "text-sky-400", size: 32, strokeWidth: 1.5 }), unit.role === "DPS" && React.createElement(Zap, { className: "text-amber-400", size: 32, strokeWidth: 1.5 }), unit.role === "HEALER" && React.createElement(User, { className: "text-emerald-400", size: 32, strokeWidth: 1.5 }))
    )
  ), React.createElement(HealGridFloatingLayer, { entries: rowFloats }));
}
export {
  HealGrid
};
