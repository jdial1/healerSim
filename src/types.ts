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
  sourceSpellId: string;
}

export interface PartyDebuff {
  id: string;
  name: string;
  remainingTicks: number;
  damagePerTick: number;
  icon: string;
  sourceAbilityId: string;
}

export interface BossSelfBuff {
  id: string;
  name: string;
  remainingTicks: number;
  partyDamageMultiplier: number;
  icon: string;
  sourceAbilityId: string;
}

export type BossDebuffTargeting = 'single_random' | 'all_living' | 'two_random';

export interface BossDebuffTemplate {
  abilityId: string;
  name: string;
  icon: string;
  durationTicks: number;
  damagePerTick: number;
  targeting: BossDebuffTargeting;
}

export interface BossSelfBuffTemplate {
  abilityId: string;
  name: string;
  icon: string;
  durationTicks: number;
  partyDamageMultiplier: number;
}

export interface BossCombatProfile {
  debuffTemplates: BossDebuffTemplate[];
  selfBuffTemplates: BossSelfBuffTemplate[];
  debuffIntervalTicksMin: number;
  debuffIntervalTicksMax: number;
  selfBuffIntervalTicksMin: number;
  selfBuffIntervalTicksMax: number;
}

export type BossCombatOverrides = Pick<BossCombatProfile, 'debuffTemplates' | 'selfBuffTemplates'> &
  Partial<
    Pick<
      BossCombatProfile,
      | 'debuffIntervalTicksMin'
      | 'debuffIntervalTicksMax'
      | 'selfBuffIntervalTicksMin'
      | 'selfBuffIntervalTicksMax'
    >
  >;

export interface Unit {
  id: string;
  name: string;
  role: 'TANK' | 'HEALER' | 'DPS';
  level: number;
  maxHealth: number;
  health: number;
  buffs: Buff[];
  debuffs: PartyDebuff[];
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

export interface DungeonEnemy {
  name: string;
  icon: string;
}

export interface Dungeon {
  id: string;
  name: string;
  difficulty: number;
  levelMin: number;
  levelMax: number;
  bossHealth: number;
  bossName: string;
  bossIcon: string;
  cardIcon: string;
  enemies: DungeonEnemy[];
  lootRewards: string[];
  bossCombat?: BossCombatOverrides;
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
  bossSelfBuffs: BossSelfBuff[];
  isCombatActive: boolean;
  completedDungeonIds: string[];
}
