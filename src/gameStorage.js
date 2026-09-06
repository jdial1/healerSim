import { ClassRegistry } from "./classes/index.js";
import { dungeonBaseXp, dungeonXpTierMultiplier, TRASH_PACK_COUNT } from "./constants.js";
import { BALANCE as balanceData } from "./data/index.js";
import {
  getSpellOrder,
  getMaxMana,
  getPotionUpgradeAtLevel,
  getSpellUpgradeAtLevel,
  getStarterSpells
} from "./playerStats.js";
const PLAYER_MAX_LEVEL = 55;
function nominalClearXpForDifficulty(difficulty) {
  return Math.round(dungeonBaseXp(difficulty) * dungeonXpTierMultiplier(difficulty));
}
function needXpToReachNextLevel(currentLevel) {
  const tier = Math.floor((currentLevel - 1) / 3);
  const runsMultiplier =
    balanceData.xp.levelCurveRunsBase + tier + (currentLevel - 1) % 3 * balanceData.xp.levelCurveRunsPerStep;
  const perClear = nominalClearXpForDifficulty(tier + 1);
  return Math.max(1, Math.round(perClear * runsMultiplier));
}
function getXpToLevel(targetLevel) {
  const cap = Math.min(Math.max(targetLevel, 1), PLAYER_MAX_LEVEL);
  if (cap <= 1) return 0;
  let t = 0;
  for (let L = 1; L < cap; L += 1) {
    t += needXpToReachNextLevel(L);
  }
  return t;
}
function levelFromTotalXp(xp) {
  if (xp <= 0) return 1;
  let level = 1;
  let total = 0;
  for (; ; ) {
    if (level >= PLAYER_MAX_LEVEL) break;
    const need = needXpToReachNextLevel(level);
    if (total + need > xp) break;
    total += need;
    level += 1;
  }
  return level;
}
function xpProgressWithinLevel(xp) {
  const level = levelFromTotalXp(xp);
  const start = getXpToLevel(level);
  if (level >= PLAYER_MAX_LEVEL) {
    return { into: 1, needed: 1 };
  }
  const needed = needXpToReachNextLevel(level);
  return { into: Math.max(0, xp - start), needed };
}
function computeDungeonXpGain(dungeon, playerLevel) {
  const base = dungeonBaseXp(dungeon.difficulty);
  const tier = dungeonXpTierMultiplier(dungeon.difficulty);
  const levelsOver = Math.max(0, playerLevel - dungeon.levelMax);
  return Math.max(
    0,
    Math.round(base * tier * Math.pow(balanceData.xp.overlevelDiminishingBase, levelsOver))
  );
}
function dungeonFailureXpFraction(pullsCleared) {
  const x = balanceData.xp;
  if (pullsCleared >= TRASH_PACK_COUNT) return x.failureFractionWhenAllTrashCleared;
  if (pullsCleared === 2) return x.failureFractionWhenTwoPullsCleared;
  if (pullsCleared === 1) return x.failureFractionWhenOnePullCleared;
  return 0;
}
function computeDungeonFailureXpGain(dungeon, playerLevel, pullsCleared) {
  const full = computeDungeonXpGain(dungeon, playerLevel);
  return Math.round(full * dungeonFailureXpFraction(pullsCleared));
}
function levelsOverDungeonMax(dungeon, playerLevel) {
  return Math.max(0, playerLevel - dungeon.levelMax);
}
const ROSTER_KEY = "aegis.roster.v2";
const LEGACY_SAVE_KEY = "aegis.save.v1";
const SUSPEND_KEY = "aegis.suspend.v1";
const TUTORIAL_PROGRESS_KEY = "aegis.tutorial.v1";
// Display preferences live in their own key, never inside the roster or the
// game state — the latter is compared against the Kotlin engine by the parity
// suite, and a UI toggle has no business appearing in golden JSON.
const UI_SETTINGS_KEY = "aegis.settings.v1";
function emptyRoster() {
  return { v: 2, lastPlayedClass: null, byClass: {} };
}
function readRoster() {
  if (typeof localStorage === "undefined") return emptyRoster();
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r.v === 2 && r.byClass && typeof r.byClass === "object") {
        return {
          v: 2,
          lastPlayedClass: r.lastPlayedClass ?? null,
          byClass: { ...r.byClass }
        };
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacyRaw) {
      const p = JSON.parse(legacyRaw);
      if (p.v === 1 && p.playerClass) {
        const cls = p.playerClass;
        const migrated = {
          v: 2,
          lastPlayedClass: cls,
          byClass: {
            [cls]: {
              v: 1,
              xp: p.xp,
              talentRanks: p.talentRanks,
              completedDungeonIds: p.completedDungeonIds,
              playerClass: cls,
              actionBarSpellIds: p.actionBarSpellIds,
              introTutorialComplete: p.introTutorialComplete
            }
          }
        };
        writeRoster(migrated);
        localStorage.removeItem(LEGACY_SAVE_KEY);
        return migrated;
      }
    }
  } catch {
  }
  return emptyRoster();
}
function writeRoster(roster) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
}
function isSuspendedRun(x) {
  if (!x || typeof x !== "object") return false;
  const v = x.v;
  const playerClass = x.playerClass;
  const state = x.state;
  if (v !== 1) return false;
  if (playerClass !== "DRUID" && playerClass !== "PRIEST" && playerClass !== "PALADIN") return false;
  if (!state || typeof state !== "object") return false;
  return true;
}
function isSuspendableBossState(state) {
  return state.isCombatActive === true && state.combatPhase === "BOSS" && state.currentDungeon !== null && state.playerClass !== null;
}
function writeSuspendedRun(state) {
  if (typeof localStorage === "undefined") return;
  if (!state.playerClass) return;
  if (!isSuspendableBossState(state)) return;
  const run = { v: 1, playerClass: state.playerClass, state };
  localStorage.setItem(SUSPEND_KEY, JSON.stringify(run));
}
function readSuspendedRun() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUSPEND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isSuspendedRun(parsed)) return null;
    if (!isSuspendableBossState(parsed.state)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function clearSuspendedRun() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SUSPEND_KEY);
}
function readTutorialCompletedSteps() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TUTORIAL_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === "string");
  } catch {
    return [];
  }
}
function writeTutorialCompletedSteps(steps) {
  if (typeof localStorage === "undefined") return;
  const deduped = [...new Set(steps)];
  localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(deduped));
}
const DEFAULT_UI_SETTINGS = {
  v: 1,
  healthTextPercent: true,
  showCommitted: true,
  colourBlindBands: false,
  selfFirst: false,
  largeFrames: false
};
function readUiSettings() {
  if (typeof localStorage === "undefined") return { ...DEFAULT_UI_SETTINGS };
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_UI_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_UI_SETTINGS };
    return { ...DEFAULT_UI_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_UI_SETTINGS };
  }
}
function writeUiSettings(settings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_UI_SETTINGS, ...settings }));
  } catch {
  }
}
function getSuspendedRun(cls) {
  const suspended = readSuspendedRun();
  if (!suspended || suspended.playerClass !== cls) return null;
  clearSuspendedRun();
  return suspended.state;
}
function maxLevelAcrossRoster(roster) {
  let max = 1;
  for (const shape of Object.values(roster.byClass)) {
    if (!shape) continue;
    const L = levelFromTotalXp(shape.xp);
    if (L > max) max = L;
  }
  return max;
}
function spellIdMultisetEqual(a, b) {
  if (a.length !== b.length) return false;
  const tally = new Map();
  for (const id of a) tally.set(id, (tally.get(id) ?? 0) + 1);
  for (const id of b) {
    const n = (tally.get(id) ?? 0) - 1;
    if (n < 0) return false;
    tally.set(id, n);
  }
  return [...tally.values()].every((c) => c === 0);
}
function applySavedActionBarOrder(defaultBar, saved) {
  if (!saved || saved.length !== defaultBar.length) return defaultBar;
  if (!spellIdMultisetEqual(saved, defaultBar)) return defaultBar;
  return saved;
}
function reconcileActionBarOrder(prev, defaultBar) {
  if (prev.length === defaultBar.length && spellIdMultisetEqual(prev, defaultBar)) return prev;
  return defaultBar;
}
function talentTreeTemplate(cls) {
  return ClassRegistry.getTalents(cls) || [];
}
function buildSpellLoadout(cls, talents) {
  if (!cls) return { unlockedSpells: [], activeActionBars: [] };
  const starter = getStarterSpells(cls);
  const extra = [];
  for (const t of talents) {
    if (t.spellId && t.points > 0 && !extra.includes(t.spellId)) extra.push(t.spellId);
  }
  const merged = [...starter];
  for (const id of extra) {
    if (!merged.includes(id)) merged.push(id);
  }
  const order = getSpellOrder(cls);
  const healRow = [];
  for (const id of order) {
    if (merged.includes(id) && healRow.length < 3 && !healRow.includes(id)) healRow.push(id);
  }
  for (const id of merged) {
    if (healRow.length >= 3) break;
    if (!healRow.includes(id)) healRow.push(id);
  }
  while (healRow.length < 3) {
    healRow.push("");
  }
  const activeActionBars = [
    healRow[0],
    healRow[1],
    healRow[2],
    "mana_potion",
    ""
  ];
  const unlockedSpells = ["mana_potion", ...merged].filter((x, i, a) => a.indexOf(x) === i);
  return { unlockedSpells, activeActionBars };
}
function levelUpRewardSummary(cls, talents, previousLevel, newLevel) {
  if (!cls || newLevel <= previousLevel) {
    return { upgradedSpellIds: [], upgradedPotion: false };
  }
  const { unlockedSpells } = buildSpellLoadout(cls, talents);
  const unlockedSet = new Set(unlockedSpells);
  const spellAcc = new Set();
  let upgradedPotion = false;
  for (let l = previousLevel + 1; l <= newLevel; l += 1) {
    if (getPotionUpgradeAtLevel(l)) upgradedPotion = true;
    for (const id of getSpellUpgradeAtLevel(cls, l)) {
      if (unlockedSet.has(id)) spellAcc.add(id);
    }
  }
  return { upgradedSpellIds: [...spellAcc], upgradedPotion };
}
function mergeSavedTalentRanks(ranks, cls) {
  if (!cls) return [];
  return talentTreeTemplate(cls).map((t) => ({
    ...t,
    points: Math.min(t.maxPoints, Math.max(0, ranks?.[t.id] ?? 0))
  }));
}
function getMeta(xp, cls, talents) {
  const level = levelFromTotalXp(xp);
  const pool = level;
  const spent = talents.reduce((acc, t) => acc + t.points * t.cost, 0);
  const talentPoints = Math.max(0, pool - spent);
  const maxMana = getMaxMana(cls, level, talents);
  const { unlockedSpells, activeActionBars } = buildSpellLoadout(cls, talents);
  return {
    xp,
    level,
    talentPoints,
    talents,
    unlockedSpells,
    activeActionBars,
    maxMana,
    mana: maxMana
  };
}
function patchFromSavedShape(shape) {
  if (!shape.playerClass) return null;
  const cls = shape.playerClass;
  const talents = mergeSavedTalentRanks(shape.talentRanks, cls);
  const meta = getMeta(shape.xp, cls, talents);
  const activeActionBars = applySavedActionBarOrder(
    meta.activeActionBars,
    Array.isArray(shape.actionBarSpellIds) ? shape.actionBarSpellIds : void 0
  );
  return {
    ...meta,
    activeActionBars,
    playerClass: cls,
    completedDungeonIds: Array.isArray(shape.completedDungeonIds) ? shape.completedDungeonIds : [],
    introTutorialComplete: shape.introTutorialComplete === true
  };
}
function serializeCharacter(state) {
  if (!state.playerClass) return null;
  const talentRanks = {};
  for (const t of state.talents) {
    talentRanks[t.id] = t.points;
  }
  return {
    v: 1,
    xp: state.xp,
    talentRanks,
    completedDungeonIds: state.completedDungeonIds,
    playerClass: state.playerClass,
    actionBarSpellIds: state.activeActionBars,
    introTutorialComplete: state.introTutorialComplete
  };
}
function mergeRosterWithCharacter(roster, state) {
  const blob = serializeCharacter(state);
  if (!blob) return roster;
  const cls = blob.playerClass;
  return {
    ...roster,
    byClass: { ...roster.byClass, [cls]: blob },
    lastPlayedClass: cls
  };
}
export {
  PLAYER_MAX_LEVEL,
  buildSpellLoadout,
  clearSuspendedRun,
  computeDungeonFailureXpGain,
  computeDungeonXpGain,
  dungeonFailureXpFraction,
  getMeta,
  getSuspendedRun,
  getXpToLevel,
  isSuspendableBossState,
  levelFromTotalXp,
  levelUpRewardSummary,
  levelsOverDungeonMax,
  maxLevelAcrossRoster,
  mergeRosterWithCharacter,
  mergeSavedTalentRanks,
  patchFromSavedShape,
  readRoster,
  DEFAULT_UI_SETTINGS,
  readTutorialCompletedSteps,
  readUiSettings,
  writeUiSettings,
  reconcileActionBarOrder,
  serializeCharacter,
  writeRoster,
  writeSuspendedRun,
  writeTutorialCompletedSteps,
  xpProgressWithinLevel
};
