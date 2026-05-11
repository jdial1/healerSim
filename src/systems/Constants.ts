import type { Spell, ClassType, Talent } from './Types';
import { SPELLS as spellsData, NPC_POOLS as npcPoolsData } from '../data/index';
import aurasData from '../data/world/auras.json' with { type: 'json' };

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;
export const MANA_SPIRIT_REGEN_LOCKOUT_TICKS = 5000 / TICK_RATE;
export const MANA_POTION_USES_PER_DUNGEON = 2;

export const TICKS_PER_SECOND = Math.round(1000 / TICK_RATE);

export const ICD_SPIRIT_REDEMPTION = 120 * TICKS_PER_SECOND;

export const SPELLS = spellsData as Record<string, Spell>;
export const NPC_POOLS = npcPoolsData;
export const TANK_POOL = npcPoolsData.tankPool as Array<{ name: string; role: 'TANK'; healthScaling?: { base: number; perLevel: number } }>;
export const DPS_POOL = npcPoolsData.dpsPool as Array<{ name: string; role: 'DPS'; healthScaling?: { base: number; perLevel: number } }>;

export const SPELL_TAG_DRUID_HOT = 'druid-hot';
export const SPELL_TAG_DRUID_CULTIVATION_HOT = 'druid-cultivation-hot';
export const SPELL_TAG_SWIFTMEND_CONSUMABLE = 'swiftmend-consumable';
export const SPELL_TAG_SWIFTMEND_PREFER = 'swiftmend-prefer';

// Constants from class logic that need to be accessible from core systems
export const PLAYER_BUFF_OMEN_CLEARCASTING = 'omen_clearcasting';

export const INTRO_TUTORIAL_DUNGEON_ID = 'deadmines';

export function tutorialAoeSpellId(cls: ClassType): string | null {
  // Dummy implementation
  return 'circle_of_healing';
}

const PASSIVE_TRIGGER_BY_CLASS: Record<ClassType, { kind: 'buff' | 'highlight'; key: string } | null> = {
  PRIEST: { kind: 'buff', key: 'echo_of_light' },
  DRUID: { kind: 'highlight', key: 'regrowth' },
  PALADIN: null,
};


export function tutorialPassiveTrigger(cls: ClassType): { kind: 'buff' | 'highlight'; key: string } | null {
  return PASSIVE_TRIGGER_BY_CLASS[cls];
}

export const INTRO_DEBUFF_ABILITY = 'debuff_ability';
export const INTRO_DEBUFF_DATA_ID = 'debuff_data';
export const INTRO_SUCCESS_DUNGEON = 'success_dungeon';
export const TUTORIAL_SPOTLIGHT_TANK_DATA_ID = 'tank_data';
export const TUTORIAL_STEP_AOE = 'aoe';
export const TUTORIAL_STEP_MANA_POTION = 'mana_potion';
export const TUTORIAL_STEP_PASSIVE = 'passive';
export const TUTORIAL_STEP_REORDER = 'reorder';
export const TUTORIAL_STEP_NAV_PRIMER = 'nav_primer';

type PartyUnitBuffAura = {
  sourceSpellId: string;
  displayName: string;
  icon: string;
  maxStacks: number;
  defaultDurationTicks: number;
  dispellable: boolean;
  healPerStackBonus: number;
};

type PlayerCombatAuraEntry = {
  defaultDurationTicks: number;
};

const AURAS = aurasData;

const raw = AURAS as {
  partyUnitBuffs: Record<string, PartyUnitBuffAura>;
  playerCombatAuras: Record<string, PlayerCombatAuraEntry>;
};

export const GRACE_PARTY_AURA = raw.partyUnitBuffs.priest_grace;
export const GRACE_SOURCE_ID = GRACE_PARTY_AURA.sourceSpellId;

export function getAuraTicks(buffId: string): number {
  const n = raw.playerCombatAuras[buffId]?.defaultDurationTicks;
  if (typeof n !== 'number' || n <= 0) {
    throw new Error(`Unknown player combat aura: ${buffId}`);
  }
  return n;
}


export function totalSpentTalentPoints(talents: Talent[]): number {
  return talents.reduce((acc, t) => acc + t.points * t.cost, 0);
}

const HEAL_SPELL_BY_CLASS: Record<ClassType, string> = {
  PRIEST: 'flash_heal',
  DRUID: 'regrowth',
  PALADIN: 'flash_heal',
};

export function introPrimaryHealId(cls: ClassType): string {
  return HEAL_SPELL_BY_CLASS[cls];
}