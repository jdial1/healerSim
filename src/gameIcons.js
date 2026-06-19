import { SPELLS } from "./constants.js";
import theme from "./data/theme.json" with { type: "json" };
const WOW_ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large";
const GAME_ICONS_BASE = "https://game-icons.net/icons";
const LOCAL_ICON_BASE = `${import.meta.env.BASE_URL}icons`;
const WOW_ICON_EXTS = ["jpg", "png"];
const GAME_ICON_CANDIDATE_PATHS = ["ffffff/transparent", "ffffff/000000"];
const FALLBACK_WOW_ICON = "inv_misc_questionmark";
const LOCKED_DUNGEON_ICON = "lorc/padlock";
function parseIconSource(iconPath) {
  const normalized = iconPath.trim().toLowerCase();
  if (!normalized) return { kind: "fallback" };
  if (normalized.startsWith("wow/")) {
    const icon2 = normalized.slice("wow/".length).replace(/\s+/g, "");
    return icon2 ? { kind: "wow", icon: icon2 } : { kind: "fallback" };
  }
  if (!normalized.includes("/")) return { kind: "wow", icon: normalized.replace(/\s+/g, "") };
  const [author, icon] = normalized.split("/", 2);
  if (!author || !icon) return { kind: "fallback" };
  return { kind: "game-icons", author, icon };
}
function getIconUrl(iconPath) {
  return getIconUrlCandidates(iconPath)[0];
}
function getIconUrlCandidates(iconPath) {
  const source = parseIconSource(iconPath);
  if (source.kind === "wow") {
    const local2 = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${source.icon}.${ext}`);
    const remote2 = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${source.icon}.${ext}`);
    return [...local2, ...remote2];
  }
  if (source.kind === "game-icons") {
    const local2 = [`${LOCAL_ICON_BASE}/game-icons/${source.author}/${source.icon}.png`];
    const remote2 = GAME_ICON_CANDIDATE_PATHS.map(
      (palette) => `${GAME_ICONS_BASE}/${palette}/1x1/${source.author}/${source.icon}.png`
    );
    return [...local2, ...remote2];
  }
  const local = WOW_ICON_EXTS.map((ext) => `${LOCAL_ICON_BASE}/wow/${FALLBACK_WOW_ICON}.${ext}`);
  const remote = WOW_ICON_EXTS.map((ext) => `${WOW_ICON_BASE}/${FALLBACK_WOW_ICON}.${ext}`);
  return [...local, ...remote];
}
function getSpellGlow(spellId) {
  if (!spellId) return "nature";
  const g = SPELLS[spellId]?.glowType;
  if (g === "nature" || g === "debuff" || g === "spell") return g;
  return "spell";
}
function getAbilityGlow(_abilityId) {
  return "debuff";
}
function getSelfBuffGlow(_abilityId) {
  return "spell";
}
const glowCfg = theme.iconGlow;
const GLOW_BOX = {
  spell: glowCfg.boxShadow.spell,
  nature: glowCfg.boxShadow.nature,
  debuff: glowCfg.boxShadow.debuff
};
const ICON_TINT = {
  spell: glowCfg.tint.spell,
  nature: glowCfg.tint.nature,
  debuff: glowCfg.tint.debuff
};
const BOSS_BUFF_ICON_TINT = glowCfg.bossBuffTint;
export {
  BOSS_BUFF_ICON_TINT,
  GLOW_BOX,
  ICON_TINT,
  LOCKED_DUNGEON_ICON,
  getAbilityGlow,
  getIconUrl,
  getIconUrlCandidates,
  getSelfBuffGlow,
  getSpellGlow
};
