import aurasData from './world/auras.json' with { type: 'json' };
import balanceData from './world/balance.json' with { type: 'json' };
import consumablesData from './world/consumables.json' with { type: 'json' };
import dungeonsData from './world/dungeons.json' with { type: 'json' };
import mechanicsData from './world/mechanics.json' with { type: 'json' };
import npcPoolsData from './world/npc_pools.json' with { type: 'json' };
import pacingData from './world/pacing.json' with { type: 'json' };
import themeData from '../assets/theme.json' with { type: 'json' };
import sharedSpellsData from './world/shared_spells.json' with { type: 'json' };

import druidConfig from './classes/druid_config.json' with { type: 'json' };
import druidSpells from './classes/druid_spells.json' with { type: 'json' };
import druidTalents from './classes/druid_talents.json' with { type: 'json' };

import priestConfig from './classes/priest_config.json' with { type: 'json' };
import priestSpells from './classes/priest_spells.json' with { type: 'json' };
import priestTalents from './classes/priest_talents.json' with { type: 'json' };

import paladinConfig from './classes/paladin_config.json' with { type: 'json' };
import paladinSpells from './classes/paladin_spells.json' with { type: 'json' };
import paladinTalents from './classes/paladin_talents.json' with { type: 'json' };

export const AURAS = aurasData;
export const BALANCE = balanceData;
export const CONSUMABLES = consumablesData;
export const DUNGEONS = dungeonsData;
export const MECHANICS = mechanicsData;
export const NPC_POOLS = npcPoolsData;
export const PACING = pacingData;
export const THEME = themeData;

export const DRUID_CONFIG = druidConfig;
export const DRUID_SPELLS = druidSpells;
export const DRUID_TALENTS = druidTalents;

export const PRIEST_CONFIG = priestConfig;
export const PRIEST_SPELLS = priestSpells;
export const PRIEST_TALENTS = priestTalents;

export const PALADIN_CONFIG = paladinConfig;
export const PALADIN_SPELLS = paladinSpells;
export const PALADIN_TALENTS = paladinTalents;

export const CLASS_DATA = {
  DRUID: { config: druidConfig, spells: druidSpells, talents: druidTalents },
  PRIEST: { config: priestConfig, spells: priestSpells, talents: priestTalents },
  PALADIN: { config: paladinConfig, spells: paladinSpells, talents: paladinTalents },
} as const;

export function getClassDataset<T extends keyof typeof CLASS_DATA>(cls: T) {
  return CLASS_DATA[cls];
}

export const SPELLS = {
  ...druidSpells,
  ...priestSpells,
  ...paladinSpells,
  ...sharedSpellsData,
};

export type MechanicId = keyof typeof mechanicsData;
