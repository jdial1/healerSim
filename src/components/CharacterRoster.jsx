import React from "react";
import { levelFromTotalXp } from "../gameStorage.js";
import { ClassPickList } from "./ClassPickList.jsx";
import { GameIcon } from "./GameIcon.jsx";
import { sentenceCaseLabel } from "../gameUiText.js";
function CharacterRoster({ roster, paladinUnlocked, onContinue, onCreate }) {
  return React.createElement(
    ClassPickList,
    {
      title: React.createElement(React.Fragment, null, React.createElement("span", { className: "inline-block tracking-[0.11em] [font-kerning:normal]" }, "THE ORDER")),
      subtitle: "Select your path",
      isRowLocked: (row) => row.id === "PALADIN" && !paladinUnlocked,
      onRowActivate: (cls) => {
        const saved = roster.byClass[cls];
        if (saved) onContinue(cls);
        else onCreate(cls);
      },
      subline: (row) => {
        const saved = roster.byClass[row.id];
        const level = saved ? levelFromTotalXp(saved.xp) : null;
        const locked = row.id === "PALADIN" && !paladinUnlocked;
        const hasSave = !!saved;
        const passive = React.createElement("span", { className: "flex items-center gap-2" }, React.createElement(GameIcon, { iconPath: row.passiveTraitIcon, glow: "spell", size: "xs" }), React.createElement("span", { className: "text-[11px] font-semibold leading-tight text-slate-300" }, sentenceCaseLabel(row.passiveTraitName)));
        if (hasSave) {
          return React.createElement("div", { className: "space-y-1.5" }, React.createElement("div", { className: "font-semibold tracking-[0.04em] text-slate-400" }, React.createElement("span", { className: "tabular-nums" }, "Lvl\xA0"), React.createElement("span", { className: "font-bold tabular-nums text-slate-100" }, level)), passive);
        }
        if (locked) return "\u2014";
        return React.createElement("div", { className: "space-y-1.5" }, React.createElement("span", { className: "text-slate-500" }, "Initiate"), passive);
      }
    }
  );
}
export {
  CharacterRoster
};
