import type { MechanicId } from '../data/index';
export type { MechanicId };

// --- Simple Shared Types ---
export type ClassType = 'DRUID' | 'PRIEST' | 'PALADIN';

export const ALL_CLASSES: ClassType[] = ['PRIEST', 'DRUID', 'PALADIN'];

export function isValidClassType(v: unknown): v is ClassType {
  return typeof v === 'string' && (ALL_CLASSES as readonly string[]).includes(v);
}
export type Role = 'TANK' | 'HEALER' | 'DPS';
export type CombatPhase = 'TRASH' | 'BOSS';
export type DungeonPace = 'fast' | 'normal' | 'slow';
export type IconGlow = 'spell' | 'nature' | 'debuff';
export type SpellType = 'DIRECT' | 'HOT' | 'SHIELD' | 'AOE';
export type BossMechanicTargeting = 'single_random' | 'all_living' | 'two_random';
export type CapstoneFormId = 'priest_archangel' | 'druid_natures_grace' | 'paladin_avenging_wrath';

// --- Common Status Effects ---
export type EffectCategory = 'helpful' | 'harmful' | 'boss_aura';

export interface BaseEffect {
  id: string;
  name: string;
  icon: string;
  remainingTicks: number;
}

/** Unified status effect replacing Buff, Debuff, BossBuff, and PlayerCombatBuff */
export interface StatusEffect extends BaseEffect {
  category: EffectCategory;
  sourceId: string; // Replaces sourceSpellId (for player spells) and sourceAbilityId (for boss abilities)
  stacks: number;

  // Optional behaviors
  valuePerTick?: number;    // Healing (HoTs) or Damage (DoTs) per tick
  multiplier?: number;      // e.g., boss damage multiplier
  potionDrip?: number;      // Specific to player mana potions
  potionDripPerTick?: number; // Mana regen per tick from potions
  isManaRegen?: boolean;
  isDispellable?: boolean;
  isStasis?: boolean;       // If true, ticks don't decrement (for Power Infusion)
  durationTicksMax?: number;
  tickIntervalScale?: number;
  tickAccumulator?: number;
  bloomBurstHeal?: number; // For Druid Lifebloom
  rendersAsHoTRing?: boolean;
}

// --- Player Resources & Abilities ---
export interface Spell {
  id: string;
  name: string;
  type: SpellType;
  manaCost: number;
  healing: number;
  cooldown: number;
  icon: string;
  actionBarBorderClass: string;
  color?: string;
  hotDuration?: number;
  hotHealingPerTick?: number;
  manaRestore?: number;
  manaRegenTicks?: number;
  glowType?: IconGlow;
  limitedDungeonConsumable?: boolean;
  staticEffectDescription?: string;
  tags?: string[];
  balance?: {
    directHealSynergyMultiplier?: number;
    hotPandemicDurationCapMult?: number;
  };
}

export interface Talent {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  maxPoints: number;
  levelReq: number;
  cost: number;
  gridX: number;
  gridY: number;
  mechanicId?: MechanicId;
  prerequisites?: string[];
  exclusiveWith?: string[];
  synergyWith?: string[];
  spellId?: string;
  maxRankBonusDescription?: string;
  statBonus?: Partial<{
    healingBoost: number;
    manaPool: number;
    haste: number;
    critChance: number;
    manaReturnOnDirectHeal: number;
    uniqueStat: number;
  }>;
}

// --- Combat Entities ---
export interface Unit {
  id: string;
  name: string;
  role: Role;
  level: number;
  health: number;
  maxHealth: number;
  shield: number;
  shieldTicks: number;
  effects: StatusEffect[]; // Combines helpful (buffs/HoTs) and harmful (debuffs/DoTs) effects
  livingSeedPool: number;
  isTarget?: boolean;
}

export interface FloatingCombatTextEntry {
  id: string;
  unitId: string;
  amount: number;
  kind: 'heal' | 'absorb';
  crit: boolean;
  expiresAtCombatTick: number;
}

// --- Dungeon & Boss Mechanics ---
export interface BossMechanicTemplate {
  abilityId: string;
  name: string;
  icon: string;
  targeting: BossMechanicTargeting;
  damage?: number; // For direct attacks
  damagePerTick?: number; // For debuffs
  durationTicks?: number; // For buffs/debuffs
  partyDamageMultiplier?: number; // For boss buffs
  dispellable?: boolean; // For debuffs
}

export interface BossCombatProfile {
  debuffTemplates: BossMechanicTemplate[];
  selfBuffTemplates: BossMechanicTemplate[];
  attackTemplates: BossMechanicTemplate[];
  mechanicIntervalTicksMin: number;
  mechanicIntervalTicksMax: number;
}

export interface Dungeon {
  id: string;
  name: string;
  difficulty: number;
  levelMin: number;
  levelMax: number;
  bossName: string;
  bossHealth: number;
  bossIcon: string;
  cardIcon: string;
  cardTheme: Record<string, string>;
  enemies: Array<{ name: string; icon: string }>;
  bossCombat?: Partial<BossCombatProfile>;
  endless?: boolean;
  baseXp?: number;
}

// --- Outcomes & Diagnostics ---
export interface DungeonRunPostStats {
  totalHealing: number;
  hps: number;
  overhealPct: number;
  hpm: number;
}

export interface DungeonDiagnostics {
  runStartTimeMs: number;
  lastPhaseStartTimeMs: number;
  lastPhaseStartTick: number;
  events: Array<{
    phase: string;
    name: string;
    ticksElapsed: number;
    realMsElapsed: number;
    expectedMs: number;
  }>;
  totalRealMs?: number;
  totalExpectedMs?: number;
  userAgent?: string;
}

export type DungeonRunOutcome = {
  dungeonName: string;
  xpGained: number;
  levelUp: boolean;
  levelAfter: number;
  playerClass: ClassType | null;
  upgradedSpellIds: string[];
  upgradedPotion: boolean;
  postStats?: DungeonRunPostStats;
  diagnostics?: DungeonDiagnostics;
} & (
  | { 
      kind: 'success'; 
      successFlavor: 'dungeon' | 'level_up'; 
      bossName: string;
      endlessWavesCleared?: number;
    }
  | { 
      kind: 'failure'; 
      reason: 'PARTY_WIPE' | 'HEALER_DOWN';
      endlessWavesCleared?: number;
    }
);


export type HotTickModifierContext = {
  state: GameState;
  unit: Unit;
  effect: StatusEffect;
  healPerTick: number;
  appliedTickHeal?: number;
  vitalityBloomMana?: number;
};

export type HotTickPlayerEffectsCtx = {
  state: GameState;
  tickAmt: number;
  sourceSpellId: string;
  playerEffects: StatusEffect[];
  random: () => number;
};

type SwiftmendReady = {
  kind: 'swiftmend';
  spell: Spell;
  spellId: string;
  targetId: string;
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
  critRoll: number;
};


export type CastRuntime = {
  scheduleCooldown: (p: {
    spellId: string;
    rawCooldownTicks: number;
    hastePct: number;
    powerInfusionStacks: number;
  }) => number;
};


type ManaPotionReady = {
  kind: 'mana_potion';
  spell: Spell;
  spellId: string;
  targetId: string;
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
};

export type StandardReady = {
  kind: 'standard';
  spell: Spell;
  spellId: string;
  targetId: string;
  effectiveStats: EffectivePlayerCombatStats;
  needMana: number;
  surgeFree: boolean;
  healMultB: number;
  isCrit: boolean;
  critH: number;
  tower2: boolean;
  tMod: number;
  arch: boolean;
  bonusCastHasteFraction: number;
  playerEffectsBaseline: StatusEffect[];
  rankHealMult: number;
};

export type ReadyCast = SwiftmendReady | ManaPotionReady | StandardReady;



// --- Global Game State ---
export interface GameState {
  // Persistence & Progression
  playerClass: ClassType | null;
  level: number;
  xp: number;
  talentPoints: number;
  talents: Talent[];
  unlockedSpells: string[];
  completedDungeonIds: string[];
  activeActionBars: string[];
  introComplete: boolean;

  // Dungeon Context
  currentDungeon: Dungeon | null;
  dungeonPace: DungeonPace | null;
  combatPhase: CombatPhase;
  isCombatActive: boolean;
  dungeonProgress: number;
  trashPulls: number;
  endlessStacks: number;
  dungeonOutcome: DungeonRunOutcome | null;

  // Combat State
  party: Unit[];
  mana: number;
  maxMana: number;
  potionsUsed: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  combatElapsedTicks: number;
  combatFloats: FloatingCombatTextEntry[];
  
  // Buffs & AI
  playerEffects: StatusEffect[]; // Was playerEffects: PlayerCombatBuff[]
  bossEffects: StatusEffect[];
  mechanicCooldown: number;
  mechanicOrdinal: number;
  
  // Resources & Projections
  internalCooldowns: Record<string, number>;
  spellCooldowns: Record<string, number>;
  capstoneForm: CapstoneFormId | null;
  holyPower: number;
  beaconTargetId: string;
  
  // Run Tracking
  runHealEff: number;
  runHealOh: number;
  runManaSpent: number;
  diagnostics: DungeonDiagnostics | null;

  // UI/Tutorial
  isTutorialPaused: boolean;
  tutorialCompletedSteps: string[];
}

export interface HealLandContext {
  state: GameState;
  spell: Spell;
  spellId: string;
  targetId: string;
  partyBeforeCast: Unit[];
  healMultB: number;
  critH: number;
  tMod: number;
  isCrit: boolean;
  rankHealMult: number;
}

export interface HealAccumulator {
  party: Unit[];
  playerEffects: StatusEffect[];
  healEff: number;
  healOh: number;
}

export type HolyPowerAfterHealCtx = {
  spell: Spell;
  spellId: string;
  targetId: string;
  holyPower: number;
  playerEffects: StatusEffect[];
  preHealParty: Unit[];
};

export type ResourceTickHealDelta = {
  eff: number;
  oh: number;
  drafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
};

export type ResourceTickOutcome = Partial<GameState> & {
  resourceHealDelta?: ResourceTickHealDelta;
};

export interface ClassStrategy {
  calculateManaCost: (spell: Spell, state: GameState) => number;
  calculateUniqueStat: (level: number, talents: Talent[]) => number;
  onHealLand: (context: HealLandContext, accumulator: HealAccumulator) => HealAccumulator;
  onCrit: (context: HealLandContext, state: GameState) => GameState;
  onResourceTick: (state: GameState, deltaTicks: number) => ResourceTickOutcome;
  onDamageTaken: (state: GameState, damage: number, target: Unit) => number;
  passiveCombatHasteBonusPct: (state: GameState) => number;
  rollHotTickPlayerEffects: (ctx: HotTickPlayerEffectsCtx) => StatusEffect[];
  directHealTargetMultiplier: (
    state: GameState,
    spell: Spell,
    spellId: string,
    unit: Unit,
  ) => number;
  castHasteBonusFraction: (state: GameState, targetId: string) => number;
  resolveHealCastCooldownTicks: (
    state: GameState,
    spellId: string,
    spell: Spell,
    baseCooldownTicks: number,
  ) => number;
  applyHolyPowerStepsAfterHeal: (state: GameState, ctx: HolyPowerAfterHealCtx) => number;
}

export type EffectivePlayerCombatStats = {
  hastePercent: number;
  hasteTickScale: number;
  baseHealingMultiplier: number;
  spiritRedemptionMult: number;
  critChancePercent: (natPerfStacks: number, extraCritPct?: number) => number;
};
  

/** Flat projection for Action Bar components */
export interface PlayerCombatStats extends Pick<GameState, 'playerClass' | 'level' | 'xp' | 'mana' | 'maxMana' | 'unlockedSpells'> {
  manaRegenTicks: number;
  manaPotionDripPerSec: number;
  spiritLockTicks: number;
  spirit: number;
  spellsEnabled: boolean;
  potionCharges: number;
  spellHealMult: number;
  actionBarHighlights: Record<string, boolean>;
}

// --- Roster & Persistence ---
export type SavedShape = {
  v: 1;
  xp: number;
  talentRanks: Record<string, number>;
  completedDungeonIds: string[];
  playerClass: ClassType | null;
  actionBarSpellIds?: string[];
  introComplete?: boolean;
};

export type RosterV2 = {
  v: 2;
  lastPlayedClass: ClassType | null;
  byClass: Partial<Record<ClassType, SavedShape>>;
};

export type ManaCostLogicKey = 'druidManaCost' | 'priestManaCost' | 'paladinManaCost';

export type PassiveCombatHasteBonusKey = 'druidOmenTolHaste';

export type HotTickPlayerEffectsKey = 'druidOmenHotTickSpend';

export type OnHealLandMechanicKey = 'divineAegis' | 'echoOfLight' | 'livingSeed' | 'beaconOfLight';

export type OnCritMechanicKey =
  | 'powerInfusionOnCrit'
  | 'photosynthesisOnCrit'
  | 'infusionOfLightCritHolyPower';

export type DirectHealTargetAmpKey = 'radiance';

export type CastHasteBonusKey = 'emergencyHaste';

export type HealCastCooldownKey = 'lightOfDawnHolyPowerBypass';

export type HolyPowerStepAfterHealKey = 'towerOfRadianceHolyPowerGain';

export type OnResourceTickMechanicKey = 'spiritOfRedemptionAmp' | 'druidNaturesGraceCapstone';

export type TickRandom = () => number;

export type GameAction =
  | { type: 'TICK'; random: TickRandom; now: number; dpsMultiplier?: number; ticksToProcess?: number }
  | { type: 'SET'; state: GameState }
  | { type: 'REORDER_ACTION_BAR'; from: number; to: number }
  | { type: 'DISMISS_DUNGEON_OUTCOME' }
  | { type: 'ABANDON_DUNGEON' }
  | { type: 'START_DUNGEON'; dungeon: Dungeon; pace: DungeonPace; random?: () => number }
  | { type: 'UNLOCK_TALENT'; talentId: string }
  | { type: 'DECREMENT_TALENT'; talentId: string }
  | { type: 'RESPEC_TALENTS' }
  | { type: 'CAST_SPELL'; spellId: string; targetId: string; critRoll: number }
  | { type: 'ADD_XP_NEXT_LEVEL' }
  | { type: 'SET_TUTORIAL_PAUSED'; value: boolean }
  | { type: 'COMPLETE_INTRO_TUTORIAL' }
  | { type: 'MARK_TUTORIAL_STEP_COMPLETED'; stepId: string };

