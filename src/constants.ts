/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spell, SpellType, ClassType, Dungeon, Talent, Unit } from './types.ts';

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;
export const MANA_POTION_USES_PER_DUNGEON = 2;
export const XP_PER_LEVEL = 200;

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
    manaRegenBuffMultiplier: 2,
    manaRegenBuffDurationTicks: 100,
    cooldown: 300, // 30 seconds
    icon: 'FlaskConical',
    color: 'bg-blue-500',
  }
};

export function getManaRegenPerSecond(manaRegenBuffTicksRemaining: number): number {
  const mult =
    manaRegenBuffTicksRemaining > 0 && SPELLS.mana_potion.manaRegenBuffMultiplier !== undefined
      ? SPELLS.mana_potion.manaRegenBuffMultiplier
      : 1;
  return MANA_REGEN_PER_TICK * mult * (1000 / TICK_RATE);
}

export const DUNGEONS: Dungeon[] = [
  {
    id: 'deadmines',
    name: 'The Deadmines',
    difficulty: 1,
    bossName: 'Edwin VanCleef',
    bossHealth: 1000,
    enemies: ['Defias Pirate', 'Defias Miner', 'Smite'],
    lootRewards: [
      "Cruel Barb",
      "Cookie's Tenderizer",
      "Parrot Cage (Green Wing Macaw)",
      "Defias Leather",
    ],
  },
  {
    id: 'wailing_caverns',
    name: 'Wailing Caverns',
    difficulty: 2,
    bossName: 'Verdan the Everliving',
    bossHealth: 2500,
    enemies: ['Raptor', 'Ooze', 'Druid of the Fang'],
    lootRewards: [
      "Slime-Encrusted Pads",
      "Snakebite Rod",
      "Wing of the Whelpling",
      "Deviate Hide Pack",
    ],
  },
  {
    id: 'scarlet_monastery',
    name: 'Scarlet Monastery',
    difficulty: 3,
    bossName: 'High Inspector Whitemane',
    bossHealth: 5000,
    enemies: ['Scarlet Knight', 'Scarlet Monk', 'Mograine'],
    lootRewards: [
      "Whitemane's Chapeau",
      "Hand of Righteousness",
      "Aegis of the Scarlet Commander",
      "Mograine's Might",
    ],
  },
  {
    id: 'zul_farrak',
    name: 'Zul\'Farrak',
    difficulty: 4,
    bossName: 'Chief Ukorz Sandscalp',
    bossHealth: 12000,
    enemies: ['Sandfury Troll', 'Sandfury Shadowcaster', 'Basilisk'],
    lootRewards: [
      "Sul'thraze the Lasher",
      "Bad Mojo Mask",
      "Jang'thraze the Protector",
      "Embrace of the Lycan",
    ],
  },
  {
    id: 'sunken_temple',
    name: 'The Sunken Temple',
    difficulty: 5,
    bossName: 'Shade of Eranikus',
    bossHealth: 25000,
    enemies: ['Atal\'ai Exile', 'Nightmare Wyrm', 'Dragonkin'],
    lootRewards: [
      "Dragon's Call",
      "Blade of the Unworthy",
      "Crest of Atal'ai",
      "Warrior's Embrace",
    ],
  },
  {
    id: 'blackrock_depths',
    name: 'Blackrock Depths',
    difficulty: 6,
    bossName: 'Emperor Thaurissan',
    bossHealth: 55000,
    enemies: ['Dark Iron Dwarf', 'Fire Elemental', 'Houndmaster'],
    lootRewards: [
      "Ironfoe",
      "Hand of Justice",
      "Emperor's Seal",
      "Robes of the Royal Crown",
    ],
  },
  {
    id: 'stratholme',
    name: 'Stratholme',
    difficulty: 7,
    bossName: 'Baron Rivendare',
    bossHealth: 110000,
    enemies: ['Plague Ghoul', 'Patchwork Horror', 'Banshee'],
    lootRewards: [
      "Deathcharger's Reins",
      "Runeblade of Rivendare",
      "Gauntlets of the Deceased",
      "Baron's Scepter",
    ],
  },
  {
    id: 'scholomance',
    name: 'Scholomance',
    difficulty: 8,
    bossName: 'Darkmaster Gandling',
    bossHealth: 250000,
    enemies: ['Risen Guard', 'Necromancer', 'Voidwalker'],
    lootRewards: [
      "Headmaster's Charge",
      "Alanna's Embrace",
      "Icebane Robe",
      "Staff of Metanoia",
    ],
  },
];

export const PRIEST_TALENTS: Talent[] = [
  { id: 'p_1_1', name: 'Divine Intellect', description: 'Increases total mana by 40 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'Brain', gridX: 0, gridY: 0, statBonus: { manaPool: 40 } },
  { id: 'p_1_2', name: 'Improved Renew', description: 'Increases healing of Renew by 5% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'HeartPulse', gridX: 2, gridY: 0, statBonus: { healingBoost: 5 } },
  { id: 'p_2_1', name: 'Holy Specialization', description: 'Increases crit chance by 2% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'Target', gridX: 0, gridY: 1, prerequisites: ['p_1_1'], statBonus: { critChance: 2 } },
  { id: 'p_2_2', name: 'Divine Fury', description: 'Reduces mana cost of direct heals by 3%.', points: 0, maxPoints: 3, levelReq: 5, cost: 1, icon: 'Flame', gridX: 1, gridY: 1, statBonus: { healingBoost: 2 } },
  { id: 'p_2_3', name: 'Divine Light', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 10, cost: 1, icon: 'Sun', gridX: 2, gridY: 1, prerequisites: ['p_1_2'], spellId: 'greater_heal' },
  { id: 'p_3_1', name: 'Inspiration', description: 'Direct heals restore 4 mana per point.', points: 0, maxPoints: 3, levelReq: 15, cost: 1, icon: 'Zap', gridX: 0, gridY: 2, prerequisites: ['p_2_1'], statBonus: { manaReturnOnDirectHeal: 4 } },
  { id: 'p_3_2', name: 'Holy Reach', description: 'Increases haste by 3% per point.', points: 0, maxPoints: 2, levelReq: 15, cost: 1, icon: 'MoveUp', gridX: 3, gridY: 2, statBonus: { haste: 3 } },
  { id: 'p_4_1', name: 'Circle of Healing', description: 'Unlocks Wild Growth (AOE).', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'Tornado', gridX: 1, gridY: 3, prerequisites: ['p_2_2'], spellId: 'wild_growth' },
  { id: 'p_4_2', name: 'Spiritual Guidance', description: 'Healing power increased by 8%.', points: 0, maxPoints: 5, levelReq: 20, cost: 1, icon: 'Compass', gridX: 2, gridY: 3, prerequisites: ['p_2_3'], statBonus: { healingBoost: 8 } },
  { id: 'p_5_1', name: 'Serendipity', description: 'Haste increased by 5% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'Clock', gridX: 0, gridY: 4, prerequisites: ['p_3_1'], statBonus: { haste: 5 } },
  { id: 'p_5_2', name: 'Surge of Light', description: 'Crits grant 10% extra healing.', points: 0, maxPoints: 2, levelReq: 25, cost: 1, icon: 'Zap', gridX: 3, gridY: 4, prerequisites: ['p_3_2'], statBonus: { healingBoost: 10 } },
  { id: 'p_6_1', name: 'Test of Faith', description: 'Mana pool increased by 150.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'BatteryCharging', gridX: 1, gridY: 5, prerequisites: ['p_4_1'], statBonus: { manaPool: 150 } },
  { id: 'p_6_2', name: 'Pure of Heart', description: 'All healing increased by 15%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'Heart', gridX: 2, gridY: 5, prerequisites: ['p_4_2'], statBonus: { healingBoost: 15 } },
  { id: 'p_cap', name: 'Guardian Spirit', description: 'Ultimate power: 25% heal boost and 10% haste.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'Crown', gridX: 1, gridY: 6, prerequisites: ['p_6_1', 'p_6_2'], statBonus: { healingBoost: 25, haste: 10 } },
];

export const DRUID_TALENTS: Talent[] = [
  { id: 'd_1_1', name: "Nature's Focus", description: 'Reduces mana cost of all spells by 2% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'Leaf', gridX: 1, gridY: 0, statBonus: { healingBoost: 2 } },
  { id: 'd_1_2', name: 'Furor', description: 'Increases total mana by 50 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'Zap', gridX: 3, gridY: 0, statBonus: { manaPool: 50 } },
  { id: 'd_2_1', name: 'Naturalist', description: 'Increases all healing by 4% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'Trees', gridX: 1, gridY: 1, prerequisites: ['d_1_1'], statBonus: { healingBoost: 4 } },
  { id: 'd_2_2', name: 'Intensity', description: 'Increases haste by 3% per point.', points: 0, maxPoints: 3, levelReq: 5, cost: 1, icon: 'Wind', gridX: 2, gridY: 1, statBonus: { haste: 3 } },
  { id: 'd_3_1', name: 'Gift of Nature', description: 'Increases crit chance by 4% per point.', points: 0, maxPoints: 5, levelReq: 10, cost: 1, icon: 'Sparkles', gridX: 0, gridY: 2, statBonus: { critChance: 4 } },
  { id: 'd_3_2', name: 'Tranquil Spirit', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 12, cost: 1, icon: 'CloudRain', gridX: 1, gridY: 2, prerequisites: ['d_2_1'], spellId: 'greater_heal' },
  { id: 'd_4_1', name: 'Living Seed', description: 'Direct heals restore 5 mana per point.', points: 0, maxPoints: 3, levelReq: 18, cost: 1, icon: 'Sprout', gridX: 2, gridY: 3, prerequisites: ['d_2_2'], statBonus: { manaReturnOnDirectHeal: 5 } },
  { id: 'd_4_2', name: "Nature's Bounty", description: 'Unlocks Wild Growth.', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'Tornado', gridX: 3, gridY: 3, prerequisites: ['d_1_2'], spellId: 'wild_growth' },
  { id: 'd_5_1', name: 'Empowered Rejuv', description: 'HoT healing increased by 10% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'Zap', gridX: 0, gridY: 4, prerequisites: ['d_3_1'], statBonus: { healingBoost: 10 } },
  { id: 'd_5_2', name: 'Gift of Earthmother', description: 'Haste increased by 5% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'Wind', gridX: 1, gridY: 4, prerequisites: ['d_3_2'], statBonus: { haste: 5 } },
  { id: 'd_6_1', name: 'Wild Growth Opt', description: 'Mana pool increased by 200.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'Battery', gridX: 2, gridY: 5, prerequisites: ['d_4_1'], statBonus: { manaPool: 200 } },
  { id: 'd_6_2', name: 'Tree of Life', description: 'Healing increased by 20%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'Trees', gridX: 3, gridY: 5, prerequisites: ['d_4_2'], statBonus: { healingBoost: 20 } },
  { id: 'd_cap', name: 'Genesis', description: 'Nature Mastery: 15% Crit, 15% Haste, 15% Healing.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'Crown', gridX: 2, gridY: 6, prerequisites: ['d_6_1', 'd_6_2'], statBonus: { healingBoost: 15, critChance: 15, haste: 15 } },
];

export const PALADIN_TALENTS: Talent[] = [
  { id: 'h_1_1', name: 'Divine Intellect', description: 'Increases mana by 60 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'Brain', gridX: 0, gridY: 0, statBonus: { manaPool: 60 } },
  { id: 'h_1_2', name: 'Spiritual Focus', description: 'Increases haste by 2% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'Wind', gridX: 2, gridY: 0, statBonus: { haste: 2 } },
  { id: 'h_2_1', name: 'Healing Light', description: 'Increases healing by 5% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'Sun', gridX: 0, gridY: 1, prerequisites: ['h_1_1'], statBonus: { healingBoost: 5 } },
  { id: 'h_2_2', name: 'Illumination', description: 'Crits restore 10 mana per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'Lightbulb', gridX: 1, gridY: 1, statBonus: { manaReturnOnDirectHeal: 10 } },
  { id: 'h_3_1', name: 'Divine Favor', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 10, cost: 1, icon: 'ShieldPlus', gridX: 2, gridY: 2, prerequisites: ['h_1_2'], spellId: 'greater_heal' },
  { id: 'h_3_2', name: 'Sanctified Light', description: 'Increases crit by 3% per point.', points: 0, maxPoints: 3, levelReq: 12, cost: 1, icon: 'Target', gridX: 3, gridY: 2, statBonus: { critChance: 3 } },
  { id: 'h_4_1', name: 'Holy Power', description: 'Unlocks Wild Growth.', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'Tornado', gridX: 1, gridY: 3, prerequisites: ['h_2_2'], spellId: 'wild_growth' },
  { id: 'h_4_2', name: 'Pure of Heart', description: 'Haste increased by 4% per point.', points: 0, maxPoints: 5, levelReq: 20, cost: 1, icon: 'Wind', gridX: 0, gridY: 3, prerequisites: ['h_2_1'], statBonus: { haste: 4 } },
  { id: 'h_5_1', name: "Light's Grace", description: 'Healing increased by 10% per point.', points: 0, maxPoints: 2, levelReq: 25, cost: 1, icon: 'Sparkles', gridX: 2, gridY: 4, prerequisites: ['h_3_1'], statBonus: { healingBoost: 10 } },
  { id: 'h_5_2', name: 'Blessed Hands', description: 'Mana pool increased by 100 per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'Battery', gridX: 3, gridY: 4, prerequisites: ['h_3_2'], statBonus: { manaPool: 100 } },
  { id: 'h_6_1', name: 'Aura Mastery', description: 'Crit chance increased by 10%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'Target', gridX: 1, gridY: 5, prerequisites: ['h_4_1'], statBonus: { critChance: 10 } },
  { id: 'h_6_2', name: 'Infusion of Light', description: 'Mana pool increased by 300.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'Zap', gridX: 0, gridY: 5, prerequisites: ['h_4_2'], statBonus: { manaPool: 300 } },
  { id: 'h_cap', name: 'Beacon of Light', description: 'Holy Perfection: 30% Healing, 10% Haste, 500 Mana.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'Crown', gridX: 1, gridY: 6, prerequisites: ['h_6_1', 'h_6_2'], statBonus: { healingBoost: 30, haste: 10, manaPool: 500 } },
];

export function cloneTalentsForClass(cls: ClassType): Talent[] {
  const src =
    cls === ClassType.PRIEST ? PRIEST_TALENTS : cls === ClassType.DRUID ? DRUID_TALENTS : PALADIN_TALENTS;
  return src.map((t) => ({ ...t }));
}

export const TANK_POOL: Omit<Unit, 'id' | 'buffs'>[] = [
  { name: 'Tanky McShield', role: 'TANK', maxHealth: 200, health: 200 },
  { name: 'Ironheart Bear', role: 'TANK', maxHealth: 240, health: 240 },
  { name: 'Sunbreaker', role: 'TANK', maxHealth: 180, health: 180 },
  { name: 'Stonekin', role: 'TANK', maxHealth: 210, health: 210 },
];

export const DPS_POOL: Omit<Unit, 'id' | 'buffs'>[] = [
  { name: 'Zappy Mage', role: 'DPS', maxHealth: 80, health: 80 },
  { name: 'Sneaky Rogue', role: 'DPS', maxHealth: 95, health: 95 },
  { name: 'Shadow Warlock', role: 'DPS', maxHealth: 90, health: 90 },
  { name: 'Wildfire Mage', role: 'DPS', maxHealth: 80, health: 80 },
  { name: 'Frostweaver', role: 'DPS', maxHealth: 85, health: 85 },
  { name: 'Blade Dancer', role: 'DPS', maxHealth: 100, health: 100 },
  { name: 'Hunter Mark', role: 'DPS', maxHealth: 90, health: 90 },
  { name: 'Demon Hunter', role: 'DPS', maxHealth: 105, health: 105 },
  { name: 'Retri Pally', role: 'DPS', maxHealth: 110, health: 110 },
  { name: 'Shadow Priest', role: 'DPS', maxHealth: 85, health: 85 },
  { name: 'Windwalker', role: 'DPS', maxHealth: 95, health: 95 },
  { name: 'Feral Kitty', role: 'DPS', maxHealth: 90, health: 90 },
];

export function generateRandomParty(): Unit[] {
  const randomTank = TANK_POOL[Math.floor(Math.random() * TANK_POOL.length)];
  const dpsCopy = [...DPS_POOL];
  for (let i = dpsCopy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = dpsCopy[i];
    dpsCopy[i] = dpsCopy[j];
    dpsCopy[j] = t;
  }
  const selectedDps = dpsCopy.slice(0, 3);
  return [
    { ...randomTank, id: '1', buffs: [] },
    { ...selectedDps[0], id: '2', buffs: [] },
    { ...selectedDps[1], id: '3', buffs: [] },
    { ...selectedDps[2], id: '4', buffs: [] },
    { id: '5', name: 'Player (You)', role: 'HEALER', maxHealth: 75, health: 75, buffs: [] },
  ];
}
