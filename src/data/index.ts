import aurasData from './auras.json';
import balanceData from './balance.json';
import consumablesData from './consumables.json';
import dungeonsData from './dungeons.json';
import mechanicsData from './mechanics.json';
import npcPoolsData from './npc_pools.json';
import pacingData from './pacing.json';
import themeData from './theme.json';
import sharedSpellsData from './shared_spells.json';
import { ClassRegistry } from '../classes/index.ts';
import type { Spell } from '../types.ts';

export const AURAS = aurasData;
export const BALANCE = balanceData;
export const CONSUMABLES = consumablesData;
export const DUNGEONS = dungeonsData;
export const MECHANICS = mechanicsData;
export const NPC_POOLS = npcPoolsData;
export const PACING = pacingData;
export const THEME = themeData;

/**
 * Aggragate Metadata for UI
 */
export const CLASSES = ClassRegistry.getAll().map((m) => m.metadata);

/**
 * DRY: Aggregate all spells from all class modules plus shared spells
 */
const classSpells = ClassRegistry.getAll().reduce(
  (acc, m) => ({ ...acc, ...m.spells }),
  {} as Record<string, Spell>,
);

export const SPELLS = { ...classSpells, ...sharedSpellsData };

export type MechanicId = keyof typeof mechanicsData;