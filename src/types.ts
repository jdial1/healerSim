/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ClassType {
  DRUID = 'DRUID',
  PRIEST = 'PRIEST',
  PALADIN = 'PALADIN',
}

export enum SpellType {
  DIRECT = 'DIRECT',
  HOT = 'HOT',
  SHIELD = 'SHIELD',
  AOE = 'AOE',
}

export interface Spell {
  id: string;
  name: string;
  type: SpellType;
  manaCost: number;
  healing: number;
  hotDuration?: number; // in ticks
  hotHealingPerTick?: number;
  manaRestore?: number;
  manaRegenBuffMultiplier?: number;
  manaRegenBuffDurationTicks?: number;
  cooldown: number; // in ticks
  icon: string;
  color: string;
}

export interface Buff {
  id: string;
  name: string;
  remainingTicks: number;
  healingPerTick: number;
  icon: string;
}

export interface Unit {
  id: string;
  name: string;
  role: 'TANK' | 'HEALER' | 'DPS';
  maxHealth: number;
  health: number;
  buffs: Buff[];
  isTarget?: boolean;
}

export interface Talent {
  id: string;
  name: string;
  description: string;
  points: number;
  maxPoints: number;
  levelReq: number;
  cost: number;
  icon: string;
  gridX: number; // 0-10 horizontal position
  gridY: number; // 0-10 vertical position
  prerequisites?: string[]; // IDs of talents that must be at least 1 point
  spellId?: string; // If it unlocks a spell on first point
  statBonus?: {
    healingBoost?: number; // percent per point
    manaPool?: number; // flat per point
    haste?: number; // percent per point
    critChance?: number; // percent per point
    manaReturnOnDirectHeal?: number; // flat mana back 
  };
}

export interface Dungeon {
  id: string;
  name: string;
  difficulty: number;
  bossHealth: number;
  bossName: string;
  enemies: string[];
  lootRewards: string[];
}

export type DungeonFailureReason = 'PARTY_WIPE' | 'HEALER_DOWN';

export type DungeonRunOutcome =
  | {
      kind: 'success';
      dungeonName: string;
      bossName: string;
      xpGained: number;
      levelUp: boolean;
      loot: string[];
    }
  | {
      kind: 'failure';
      dungeonName: string;
      reason: DungeonFailureReason;
    };

export type CombatPhase = 'TRASH' | 'BOSS';

export interface GameState {
  playerClass: ClassType | null;
  party: Unit[];
  mana: number;
  maxMana: number;
  manaRegenBuffTicksRemaining: number;
  manaPotionsUsedThisDungeon: number;
  xp: number;
  level: number;
  talentPoints: number;
  talents: Talent[];
  unlockedSpells: string[];
  activeActionBars: string[]; // spell ids
  currentDungeon: Dungeon | null;
  dungeonProgress: number; // 0 to 100
  combatPhase: CombatPhase;
  trashPullsRemaining: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  isCombatActive: boolean;
  completedDungeonIds: string[];
}
