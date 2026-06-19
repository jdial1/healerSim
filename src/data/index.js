import aurasData from "./auras.json" with { type: "json" };
import balanceData from "./balance.json" with { type: "json" };
import consumablesData from "./consumables.json" with { type: "json" };
import dungeonsData from "./dungeons.json" with { type: "json" };
import mechanicsData from "./mechanics.json" with { type: "json" };
import npcPoolsData from "./npc_pools.json" with { type: "json" };
import pacingData from "./pacing.json" with { type: "json" };
import themeData from "./theme.json" with { type: "json" };
import sharedSpellsData from "./shared_spells.json" with { type: "json" };
import { ClassRegistry } from "../classes/index.js";
const AURAS = aurasData;
const BALANCE = balanceData;
const CONSUMABLES = consumablesData;
const DUNGEONS = dungeonsData;
const MECHANICS = mechanicsData;
const NPC_POOLS = npcPoolsData;
const PACING = pacingData;
const THEME = themeData;
const CLASSES = ClassRegistry.getAll().map((m) => m.metadata);
const classSpells = ClassRegistry.getAll().reduce(
  (acc, m) => ({ ...acc, ...m.spells }),
  {}
);
const SPELLS = { ...classSpells, ...sharedSpellsData };
export {
  AURAS,
  BALANCE,
  CLASSES,
  CONSUMABLES,
  DUNGEONS,
  MECHANICS,
  NPC_POOLS,
  PACING,
  SPELLS,
  THEME
};
