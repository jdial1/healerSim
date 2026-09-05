import React from "react";
import { motion } from "motion/react";
import { classUiRows } from "../classUiData.js";
import { PALADIN_UNLOCK_LEVEL } from "../constants.js";
import { getTransformClass, getIconUrl, getWrapperTransformClass } from "../classIcons.js";
function ClassPickList({
  title,
  subtitle,
  isRowLocked,
  onRowActivate,
  subline,
  showDescription = false
}) {
  const rows = classUiRows();
  return React.createElement("div", { className: "flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6" }, React.createElement(
    motion.div,
    {
      className: "mb-8 text-center sm:mb-9",
      initial: { scale: 0.9, opacity: 0 },
      animate: { scale: 1, opacity: 1 }
    },
    React.createElement("div", { className: "ui-heading text-4xl leading-none tracking-[0.07em] text-white sm:text-6xl" }, title),
    subtitle ? React.createElement("p", { className: "mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs" }, subtitle) : null
  ), React.createElement("div", { className: "grid w-full max-w-xl gap-6" }, rows.map((row) => {
    const locked = isRowLocked(row);
    const extra = subline?.(row);
    return React.createElement(
      motion.button,
      {
        key: row.id,
        type: "button",
        disabled: locked,
        onClick: () => {
          if (!locked) onRowActivate(row.id);
        },
        whileHover: !locked ? { x: 10, backgroundColor: "#1e293b" } : {},
        whileTap: !locked ? { scale: 1.02, boxShadow: row.theme.tapShadow } : {},
        className: `relative flex items-center gap-6 rounded-md border border-slate-600/45 p-6 text-left transition-colors sm:gap-6 sm:p-8 ${locked ? "ui-panel ui-state-frame ui-state-disabled cursor-not-allowed border-slate-700/50 bg-slate-900/50" : `ui-panel ui-state-frame ui-state-hover hover:border-slate-500/60 ${row.theme.ribbon}`}`
      },
      React.createElement("div", { className: "flex shrink-0 items-center gap-2.5 sm:gap-3" }, row.portraitUrl ? React.createElement(
        "img",
        {
          src: row.portraitUrl,
          alt: "",
          className: "h-20 w-20 rounded-sm object-cover"
        }
      ) : null, React.createElement("div", { className: getWrapperTransformClass() }, React.createElement(
        "img",
        {
          src: getIconUrl(row.id),
          alt: "",
          draggable: false,
          className: `h-[5.5rem] w-[5.5rem] select-none object-contain [filter:drop-shadow(0_2px_2px_rgba(0,0,0,0.6))] sm:h-[6rem] sm:w-[6rem] ${getTransformClass(row.id)}`
        }
      ))),
      React.createElement("div", { className: "min-w-0 flex-1 self-center" }, React.createElement("h3", { className: "ui-heading text-xl leading-tight tracking-[0.05em] text-slate-100 sm:text-2xl" }, row.name), showDescription ? React.createElement("div", { className: "mt-2 max-w-md space-y-2" }, React.createElement("p", { className: "max-w-xs text-base font-medium leading-tight text-slate-400 sm:text-sm" }, row.description), extra ? React.createElement("div", { className: "text-slate-400" }, extra) : null) : extra ? React.createElement("div", { className: "mt-2 font-mono text-sm font-bold text-slate-400" }, extra) : null),
      locked ? React.createElement("div", { className: "absolute right-4 top-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 sm:text-[9px]" }, React.createElement("span", { "aria-hidden": true }, "\u{1F512}"), React.createElement("span", null, `Reach lvl ${PALADIN_UNLOCK_LEVEL} to unlock`)) : null
    );
  })));
}
export {
  ClassPickList
};
