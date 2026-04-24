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
  hotDuration?: number;
  hotHealingPerTick?: number;
  manaRestore?: number;
  manaRegenBuffMultiplier?: number;
  manaRegenBuffDurationTicks?: number;
  cooldown: number;
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
  durationTicksMax?: number;
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

export interface BossAttackTemplate {
  abilityId: string;
  name: string;
  icon: string;
  damage: number;
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
  attackTemplates: BossAttackTemplate[];
  mechanicIntervalTicksMin: number;
  mechanicIntervalTicksMax: number;
}

export type BossCombatOverrides = Pick<
  BossCombatProfile,
  'debuffTemplates' | 'selfBuffTemplates' | 'attackTemplates'
> &
  Partial<Pick<BossCombatProfile, 'mechanicIntervalTicksMin' | 'mechanicIntervalTicksMax'>>;

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
  shield: number;
  shieldTicksRemaining: number;
  livingSeedPool: number;
}

export type CapstoneFormId = 'priest_archangel' | 'druid_natures_grace' | 'paladin_avenging_wrath';

export interface PlayerCombatBuff {
  id: string;
  remainingTicks: number;
  stacks: number;
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
  gridX: number;
  gridY: number;
  prerequisites?: string[];
  spellId?: string;
  statBonus?: {
    healingBoost?: number;
    manaPool?: number;
    haste?: number;
    critChance?: number;
    manaReturnOnDirectHeal?: number;
  };
  exclusiveWith?: string[];
  mechanicId?: string;
  maxRankBonusDescription?: string;
  synergyWith?: string[];
  descriptionTones?: Array<{
    start: number;
    end: number;
    tone: 'healing' | 'mana' | 'haste' | 'crit';
  }>;
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
  spiritRegenLockoutTicksRemaining: number;
  manaPotionsUsedThisDungeon: number;
  xp: number;
  level: number;
  talentPoints: number;
  talents: Talent[];
  unlockedSpells: string[];
  activeActionBars: string[];
  currentDungeon: Dungeon | null;
  dungeonProgress: number;
  combatPhase: CombatPhase;
  trashPullsRemaining: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  bossSelfBuffs: BossSelfBuff[];
  isCombatActive: boolean;
  completedDungeonIds: string[];
  playerCombatBuffs: PlayerCombatBuff[];
  internalCooldowns: Record<string, number>;
  capstoneForm: CapstoneFormId | null;
  capstoneFormTicksRemaining: number;
  holyPower: number;
  beaconTargetId: string;
  powerInfusionCastsRemaining: number;
  naturalPerfectionStacks: number;
}
