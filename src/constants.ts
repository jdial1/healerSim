/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spell, SpellType, ClassType, Dungeon, Talent } from './types.ts';

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;

export const SPELLS: Record<string, Spell> = {
  // Priest Spells
  flash_heal: {
    id: 'flash_heal',
    name: 'Flash Heal',
    type: SpellType.DIRECT,
    manaCost: 15,
    healing: 20,
    cooldown: 0,
    icon: 'Zap',
    color: 'bg-yellow-400',
  },
  greater_heal: {
    id: 'greater_heal',
    name: 'Greater Heal',
    type: SpellType.DIRECT,
    manaCost: 30,
    healing: 60,
    cooldown: 50, // 5 seconds if 100ms tick and logic is ticks
    icon: 'Sun',
    color: 'bg-yellow-100',
  },
  renew: {
    id: 'renew',
    name: 'Renew',
    type: SpellType.HOT,
    manaCost: 10,
    healing: 5,
    hotDuration: 150, // 15 seconds
    hotHealingPerTick: 0.5,
    cooldown: 0,
    icon: 'HeartPulse',
    color: 'bg-green-300',
  },
  
  // Druid Spells
  rejuvenation: {
    id: 'rejuvenation',
    name: 'Rejuvenation',
    type: SpellType.HOT,
    manaCost: 12,
    healing: 2,
    hotDuration: 120, // 12 seconds
    hotHealingPerTick: 0.8,
    cooldown: 0,
    icon: 'Leaf',
    color: 'bg-green-500',
  },
  regrowth: {
    id: 'regrowth',
    name: 'Regrowth',
    type: SpellType.DIRECT,
    manaCost: 20,
    healing: 15,
    hotDuration: 60, // 6 seconds
    hotHealingPerTick: 0.4,
    cooldown: 0,
    icon: 'Sprout',
    color: 'bg-emerald-400',
  },
  wild_growth: {
    id: 'wild_growth',
    name: 'Wild Growth',
    type: SpellType.AOE,
    manaCost: 40,
    healing: 10,
    hotDuration: 70,
    hotHealingPerTick: 0.6,
    cooldown: 100, // 10 seconds
    icon: 'Trees',
    color: 'bg-lime-400',
  },
  mana_potion: {
    id: 'mana_potion',
    name: 'Mana Potion',
    type: SpellType.DIRECT,
    manaCost: 0,
    healing: 0,
    manaRestore: 40,
    cooldown: 300, // 30 seconds
    icon: 'FlaskConical',
    color: 'bg-blue-500',
  }
};

export const DUNGEONS: Dungeon[] = [
  {
    id: 'deadmines',
    name: 'The Deadmines',
    difficulty: 1,
    bossName: 'Edwin VanCleef',
    bossHealth: 1000,
    enemies: ['Defias Pirate', 'Defias Miner', 'Smite'],
  },
  {
    id: 'wailing_caverns',
    name: 'Wailing Caverns',
    difficulty: 2,
    bossName: 'Verdan the Everliving',
    bossHealth: 2500,
    enemies: ['Raptor', 'Ooze', 'Druid of the Fang'],
  },
  {
    id: 'scarlet_monastery',
    name: 'Scarlet Monastery',
    difficulty: 3,
    bossName: 'High Inspector Whitemane',
    bossHealth: 5000,
    enemies: ['Scarlet Knight', 'Scarlet Monk', 'Mograine'],
  }
];

export const INITIAL_TALENTS: Talent[] = [
  // ROW 0: Foundation
  {
    id: 'empowered_healing',
    name: 'Empowered Healing',
    description: 'Increases all healing by 5% per point.',
    points: 0,
    maxPoints: 5,
    levelReq: 1,
    cost: 1,
    icon: 'Sparkles',
    gridX: 3,
    gridY: 0,
    statBonus: { healingBoost: 5 }
  },

  // ROW 1: Early Specialization
  {
    id: 'mental_clarity',
    name: 'Mental Clarity',
    description: 'Increases total mana by 30 per point.',
    points: 0,
    maxPoints: 3,
    levelReq: 5,
    cost: 1,
    icon: 'Brain',
    gridX: 2,
    gridY: 1,
    prerequisites: ['empowered_healing'],
    statBonus: { manaPool: 30 }
  },
  {
    id: 'divine_precision',
    name: 'Divine Precision',
    description: 'Increases chance to critically heal for 150% power by 4% per point.',
    points: 0,
    maxPoints: 3,
    levelReq: 5,
    cost: 1,
    icon: 'Target',
    gridX: 4,
    gridY: 1,
    prerequisites: ['empowered_healing'],
    statBonus: { critChance: 4 }
  },

  // ROW 2: Major Unlocks
  {
    id: 'greater_heal_unlock',
    name: 'Divine Light',
    description: 'Unlocks Greater Heal. Further points increase its rejuvenation.',
    points: 0,
    maxPoints: 3,
    levelReq: 10,
    cost: 1,
    icon: 'Sun',
    gridX: 3,
    gridY: 2,
    prerequisites: ['mental_clarity', 'divine_precision'],
    spellId: 'greater_heal',
    statBonus: { healingBoost: 10 }
  },

  // ROW 3: Advanced Utility
  {
    id: 'mana_surge',
    name: 'Mana Surge',
    description: 'Direct heals restore 2 mana per point spent.',
    points: 0,
    maxPoints: 3,
    levelReq: 12,
    cost: 1,
    icon: 'Zap',
    gridX: 1,
    gridY: 3,
    prerequisites: ['mental_clarity'],
    statBonus: { manaReturnOnDirectHeal: 2 }
  },
  {
    id: 'swiftness',
    name: 'Swiftness',
    description: 'Increases casting speed by 3% per point.',
    points: 0,
    maxPoints: 5,
    levelReq: 12,
    cost: 1,
    icon: 'Wind',
    gridX: 5,
    gridY: 3,
    prerequisites: ['divine_precision'],
    statBonus: { haste: 3 }
  },

  // ROW 4: Capstones
  {
    id: 'wild_growth_unlock',
    name: 'Nature Bounty',
    description: 'Unlocks Wild Growth. Massive AOE healing over time.',
    points: 0,
    maxPoints: 5,
    levelReq: 15,
    cost: 1,
    icon: 'Trees',
    gridX: 3,
    gridY: 4,
    prerequisites: ['greater_heal_unlock'],
    spellId: 'wild_growth',
    statBonus: { healingBoost: 10 }
  }
];
