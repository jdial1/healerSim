const THEMES = {
  PRIEST: {
    ribbon: "border-l-4 border-l-amber-400/80",
    iconFrame: "border-amber-400/55",
    tapShadow: "0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(251, 191, 36, 0.22)"
  },
  DRUID: {
    ribbon: "border-l-emerald-400/75",
    iconFrame: "border-emerald-400/50",
    tapShadow: "0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(52, 211, 153, 0.2)"
  },
  PALADIN: {
    ribbon: "border-l-4 border-l-fuchsia-400/75",
    iconFrame: "border-fuchsia-400/50",
    tapShadow: "0 10px 28px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(232, 121, 249, 0.2)"
  }
};
function getTheme(cls) {
  return THEMES[cls];
}
export {
  getTheme
};
