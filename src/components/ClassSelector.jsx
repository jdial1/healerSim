import React from "react";
import { ClassPickList } from "./ClassPickList.jsx";
import { GameIcon } from "./GameIcon.jsx";
import { sentenceCaseLabel } from "../gameUiText.js";
function ClassSelector({ onSelect }) {
  return React.createElement(
    ClassPickList,
    {
      title: React.createElement(React.Fragment, null, "SELECT ", React.createElement("br", null), " ", React.createElement("span", { className: "text-blue-500" }, "YOUR CLASS")),
      isRowLocked: (row) => row.jsonLocked,
      onRowActivate: onSelect,
      showDescription: true,
      subline: (row) => React.createElement("span", { className: "flex items-center gap-2 text-left" }, React.createElement(GameIcon, { iconPath: row.passiveTraitIcon, glow: "spell", size: "sm" }), React.createElement("span", null, React.createElement("span", { className: "block text-[10px] font-black uppercase tracking-widest text-slate-500" }, "Class trait"), React.createElement("span", { className: "text-xs font-semibold text-slate-200" }, sentenceCaseLabel(row.passiveTraitName))))
    }
  );
}
export {
  ClassSelector
};
