import dungeonsData from "../data/dungeons.json" with { type: "json" };
import { getEndlessMultiplier } from "../constants.js";
const DUNGEONS = dungeonsData;
const ENDLESS_DUNGEON_ID = "endless";
function getEndlessTemplate() {
  const d = DUNGEONS.find((x) => x.id === ENDLESS_DUNGEON_ID);
  if (!d) throw new Error("endless dungeon missing");
  return d;
}
function endlessBossPool(playerLevel) {
  const core = DUNGEONS.filter((d) => !d.endless);
  const eligible = core.filter((d) => playerLevel >= d.levelMin);
  return eligible.length > 0 ? eligible : core;
}
function buildEndlessWaveDungeon(endlessTemplate, bossSource, stacks) {
  const m = getEndlessMultiplier(stacks);
  return {
    ...endlessTemplate,
    bossName: bossSource.bossName,
    bossHealth: Math.max(1, Math.round(bossSource.bossHealth * m)),
    bossIcon: bossSource.bossIcon,
    bossCombat: bossSource.bossCombat,
    levelMin: bossSource.levelMin,
    levelMax: bossSource.levelMax,
    difficulty: 1,
    endless: true
  };
}
export {
  DUNGEONS,
  ENDLESS_DUNGEON_ID,
  buildEndlessWaveDungeon,
  endlessBossPool,
  getEndlessTemplate
};
