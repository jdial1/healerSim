import type { Spell, Talent, Unit, GameState, PlayerCombatBuff } from '../types.ts';
import type { 
  HealCastContext, 
  HealLandContext, 
  PostHealAccumulator, 
  HotTickModifierContext,
  SpecialHealCastContext 
} from '../combatHookRegistry.ts';

export interface ClassMetadata {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  color: string;
  textColor: string;
  hoverBorderClass: string;
  locked: boolean;
  portraitUrl: string;
  portraitIcon: string;
  portraitGlow: string;
  passiveTraitName: string;
  passiveTraitDescription: string;
  passiveTraitIcon: string;
  uiTransform?: string;
  tutorial: {
    passiveDescription: string;
  };
  statCurves: {
    baseIntellect: number;
    baseSpirit: number;
    intellectPerLevel: number;
    spiritPerLevel: number;
    baseUniqueStat: number;
    uniqueStatPerLevel: number;
  };
  progression: {
    starterSpells: string[];
    spellOrder: string[];
    capstoneForm: string;
    capstoneMechanicId: string;
    capstonePlayerBuffId: string;
  };
}

export interface CombatHooks {
  // Initialization & Mana
  onHealCast?: (s: GameState, ctx: HealCastContext) => void;
  onHealManaCost?: (s: GameState, spell: Spell, spellId: string, surgeFree: boolean) => number | undefined;
  manaReturnOnTick?: (s: GameState, spiritRegenLockoutTicksRemaining: number) => number;
  
  // Throughput & Scaling
  castDirectHealMultiplier?: (s: GameState, spell: Spell, spellId: string) => number;
  critBonusForHealRoll?: (s: GameState, spellId: string, targetId: string) => number;
  hasteBonusSum?: (s: GameState, healer: Unit | undefined) => number;
  emergencyHasteBonus?: (s: GameState, targetId: string) => number;
  
  // Post-Heal Logic
  onHealLand?: (s: GameState, ctx: HealLandContext, party: Unit[], buffs: PlayerCombatBuff[]) => PostHealAccumulator;
  onCrit?: (s: GameState, ctx: HealLandContext) => void;
  trySpecialHealCast?: (s: GameState, ctx: SpecialHealCastContext) => GameState | null;
  manaAfterHeal?: (s: GameState, spellId: string, needMana: number, surgeFree: boolean, isCritH: boolean, healTargetId: string, initialMana: number) => number;

  // Damage & Mitigation
  damageTakenMultiplier?: (s: GameState, ctx: { source: 'boss_attack' | 'trash_tick' }) => number;
  onShieldTransition?: (s: GameState, before: Unit[], after: Unit[]) => { party: Unit[]; eff: number; oh: number };
  selfHealOnDamage?: (s: GameState, damageTaken: number) => number;

  // HoT Logic
  hotTickAmount?: (ctx: HotTickModifierContext) => number;
  hotTickRateMultiplier?: (s: GameState, sourceSpellId: string) => number;
  hotTickManaReturn?: (s: GameState, sourceSpellId: string) => number;
  rollOmenOfClarityOnHotTick?: (s: GameState, tickAmt: number, sourceSpellId: string, buffs: PlayerCombatBuff[], random: () => number) => PlayerCombatBuff[];
}

export interface ClassModule {
  metadata: ClassMetadata;
  spells: Record<string, Spell>;
  talents: Talent[];
  hooks: CombatHooks;
}

import * as druid from './druid/hooks.ts';
import druidClassJson from './druid/class.json';
import druidSpellsJson from './druid/spells.json';
import druidTalentsJson from './druid/talents.json';

import * as priest from './priest/hooks.ts';
import priestClassJson from './priest/class.json';
import priestSpellsJson from './priest/spells.json';
import priestTalentsJson from './priest/talents.json';

import * as paladin from './paladin/hooks.ts';
import paladinClassJson from './paladin/class.json';
import paladinSpellsJson from './paladin/spells.json';
import paladinTalentsJson from './paladin/talents.json';

const classRegistry: Record<string, ClassModule> = {
  DRUID: {
    metadata: druidClassJson as ClassMetadata,
    spells: druidSpellsJson as Record<string, Spell>,
    talents: druidTalentsJson as Talent[],
    hooks: druid as unknown as CombatHooks,
  },
  PRIEST: {
    metadata: priestClassJson as ClassMetadata,
    spells: priestSpellsJson as Record<string, Spell>,
    talents: priestTalentsJson as Talent[],
    hooks: priest as unknown as CombatHooks,
  },
  PALADIN: {
    metadata: paladinClassJson as ClassMetadata,
    spells: paladinSpellsJson as Record<string, Spell>,
    talents: paladinTalentsJson as Talent[],
    hooks: paladin as unknown as CombatHooks,
  },
};

export const ClassRegistry = {
  get(classId: string): ClassModule | undefined {
    return classRegistry[classId.toUpperCase()];
  },
  getAll(): ClassModule[] {
    return Object.values(classRegistry);
  },
  getSpells(classId: string): Record<string, Spell> {
    return classRegistry[classId.toUpperCase()]?.spells ?? {};
  },
  getTalents(classId: string): Talent[] {
    return classRegistry[classId.toUpperCase()]?.talents ?? [];
  },
  getMetadata(classId: string): ClassMetadata | undefined {
    return classRegistry[classId.toUpperCase()]?.metadata;
  },
  getHooks(classId: string): CombatHooks | undefined {
    return classRegistry[classId.toUpperCase()]?.hooks;
  },
};

export default ClassRegistry;