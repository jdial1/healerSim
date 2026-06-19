import React from "react";
function renderDiffText(text, options = {}) {
  const lines = text.split("\n");
  const tokenRe = /\[\[(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\]\]/g;
  return lines.map((line, lineIdx) => {
    const parts = [];
    let cursor = 0;
    let m = tokenRe.exec(line);
    let key = 0;
    const isMana = /\bmana\b/i.test(line) || /cost/i.test(line);
    while (m) {
      if (m.index > cursor) parts.push(React.createElement("span", { key: `t-${lineIdx}-${key++}` }, line.slice(cursor, m.index)));
      const oldValue = Number(m[1]);
      const newValue = Number(m[2]);
      const oldCls = options.oldColor ?? "text-slate-300";
      const arrCls = options.arrowColor ?? "text-amber-300";
      const newCls = options.getNewColor ? options.getNewColor(oldValue, newValue, isMana) : newValue > oldValue ? isMana ? "text-rose-300" : "text-emerald-300" : isMana ? "text-emerald-300" : "text-rose-300";
      parts.push(
        React.createElement("span", { key: `d-${lineIdx}-${key++}`, className: "inline-flex items-baseline gap-1" }, React.createElement("span", { className: oldCls }, m[1]), React.createElement("span", { className: `${arrCls} font-semibold`, "aria-hidden": true }, "\u2192"), React.createElement("span", { className: `${newCls} font-semibold` }, m[2]))
      );
      cursor = m.index + m[0].length;
      m = tokenRe.exec(line);
    }
    if (cursor < line.length) parts.push(React.createElement("span", { key: `t-${lineIdx}-${key++}` }, line.slice(cursor)));
    return React.createElement("span", { key: `line-${lineIdx}`, className: "block" }, parts);
  });
}
export {
  renderDiffText
};
