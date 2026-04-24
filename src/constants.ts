/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Spell,
  SpellType,
  ClassType,
  Dungeon,
  Talent,
  Unit,
  BossCombatProfile,
  BossCombatOverrides,
} from './types.ts';
import {
  allyMaxHealthForRoleAndLevel,
  healerMaxHealthFromStats,
  randomAllyLevel,
} from './playerStats.ts';

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;
export const MANA_POTION_USES_PER_DUNGEON = 2;

export function bossDamageMultiplierForDifficulty(difficulty: number): number {
  return Math.pow(1.12, Math.max(0, difficulty - 1));
}

const TRASH_HEALTH_PER_PULL_BOSS_FRACTION = 0.1;

export function trashMaxHealthForDungeon(dungeon: Dungeon): number {
  return Math.max(1, Math.round(dungeon.bossHealth * TRASH_HEALTH_PER_PULL_BOSS_FRACTION));
}

export function dungeonXpTierMultiplier(difficulty: number): number {
  return 1 + 0.2 * Math.max(0, difficulty - 1);
}

export function dungeonBaseXp(difficulty: number): number {
  return Math.round(80 * Math.pow(1.35, difficulty - 1));
}

export const TICKS_PER_SECOND = Math.round(1000 / TICK_RATE);

const DEFAULT_BOSS_COMBAT_INTERVALS: Pick<
  BossCombatProfile,
  | 'debuffIntervalTicksMin'
  | 'debuffIntervalTicksMax'
  | 'selfBuffIntervalTicksMin'
  | 'selfBuffIntervalTicksMax'
> = {
  debuffIntervalTicksMin: 10 * TICKS_PER_SECOND,
  debuffIntervalTicksMax: 30 * TICKS_PER_SECOND,
  selfBuffIntervalTicksMin: 15 * TICKS_PER_SECOND,
  selfBuffIntervalTicksMax: 30 * TICKS_PER_SECOND,
};

export function bossCombatProfileForDungeon(dungeon: Dungeon): BossCombatProfile {
  const c: BossCombatOverrides | undefined = dungeon.bossCombat;
  return {
    ...DEFAULT_BOSS_COMBAT_INTERVALS,
    debuffTemplates: c?.debuffTemplates ?? [],
    selfBuffTemplates: c?.selfBuffTemplates ?? [],
    debuffIntervalTicksMin: c?.debuffIntervalTicksMin ?? DEFAULT_BOSS_COMBAT_INTERVALS.debuffIntervalTicksMin,
    debuffIntervalTicksMax: c?.debuffIntervalTicksMax ?? DEFAULT_BOSS_COMBAT_INTERVALS.debuffIntervalTicksMax,
    selfBuffIntervalTicksMin: c?.selfBuffIntervalTicksMin ?? DEFAULT_BOSS_COMBAT_INTERVALS.selfBuffIntervalTicksMin,
    selfBuffIntervalTicksMax: c?.selfBuffIntervalTicksMax ?? DEFAULT_BOSS_COMBAT_INTERVALS.selfBuffIntervalTicksMax,
  };
}

export const SPELLS: Record<string, Spell> = {
  // Priest Spells
  flash_heal: {
    id: 'flash_heal',
    name: 'Flash Heal',
    type: SpellType.DIRECT,
    manaCost: 15,
    healing: 20,
    cooldown: 0,
    icon: 'lorc/lightning-storm',
    color: 'bg-yellow-400',
  },
  greater_heal: {
    id: 'greater_heal',
    name: 'Greater Heal',
    type: SpellType.DIRECT,
    manaCost: 30,
    healing: 60,
    cooldown: 50, // 5 seconds if 100ms tick and logic is ticks
    icon: 'delapouite/holy-water',
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
    icon: 'lorc/heart-organ',
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
    icon: 'delapouite/monstera-leaf',
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
    icon: 'delapouite/plant-seed',
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
    icon: 'delapouite/circle-forest',
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
    icon: 'delapouite/magic-potion',
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
    levelMin: 1,
    levelMax: 3,
    bossName: 'Edwin VanCleef',
    bossHealth: 1000,
    bossIcon: 'delapouite/pirate-captain',
    cardIcon: 'delapouite/gold-mine',
    enemies: [
      { name: 'Defias Pirate', icon: 'lorc/pirate-skull' },
      { name: 'Defias Miner', icon: 'delapouite/miner' },
      { name: 'Smite', icon: 'lorc/spiked-mace' },
    ],
    lootRewards: ['Cruel Barb', "Cookie's Tenderizer", 'Parrot Cage', 'Defias Leather'],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'vc_gut_slash',
          name: 'Gut Slash',
          icon: 'lorc/bleeding-wound',
          durationTicks: 120,
          damagePerTick: 0.7,
          targeting: 'single_random',
        },
        {
          abilityId: 'vc_boarding_party',
          name: 'Boarding Party',
          icon: 'lorc/crossed-swords',
          durationTicks: 60,
          damagePerTick: 1.2,
          targeting: 'two_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'vc_blade_flurry',
          name: 'Blade Flurry',
          icon: 'lorc/sword-clash',
          durationTicks: 100,
          partyDamageMultiplier: 1.3,
        },
      ],
    },
  },
  {
    id: 'wailing_caverns',
    name: 'Wailing Caverns',
    difficulty: 2,
    levelMin: 4,
    levelMax: 6,
    bossName: 'Verdan the Everliving',
    bossHealth: 2500,
    bossIcon: 'cathelineau/tree-face',
    cardIcon: 'delapouite/cave-entrance',
    enemies: [
      { name: 'Raptor', icon: 'delapouite/velociraptor' },
      { name: 'Ooze', icon: 'delapouite/slime' },
      { name: 'Druid of the Fang', icon: 'lorc/snake-totem' },
    ],
    lootRewards: ['Slime-Encrusted Pads', 'Snakebite Rod', 'Wing of the Whelpling', 'Deviate Hide Pack'],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'verdan_strangle',
          name: 'Strangling Roots',
          icon: 'delapouite/vines',
          durationTicks: 180,
          damagePerTick: 0.6,
          targeting: 'single_random',
        },
        {
          abilityId: 'verdan_spores',
          name: 'Noxious Spores',
          icon: 'lorc/poison-gas',
          durationTicks: 50,
          damagePerTick: 1.4,
          targeting: 'all_living',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'verdan_thrive',
          name: 'Thrive',
          icon: 'lorc/lotus',
          durationTicks: 150,
          partyDamageMultiplier: 1.4,
        },
      ],
    },
  },
  {
    id: 'scarlet_monastery',
    name: 'Scarlet Monastery',
    difficulty: 3,
    levelMin: 7,
    levelMax: 9,
    bossName: 'High Inspector Whitemane',
    bossHealth: 5000,
    bossIcon: 'lorc/crowned-heart',
    cardIcon: 'delapouite/church',
    enemies: [
      { name: 'Scarlet Knight', icon: 'delapouite/knight-banner' },
      { name: 'Scarlet Monk', icon: 'delapouite/monk-face' },
      { name: 'Mograine', icon: 'lorc/crowned-skull' },
    ],
    lootRewards: ["Whitemane's Chapeau", 'Hand of Righteousness', 'Aegis', "Mograine's Might"],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'smite_sear',
          name: 'Holy Fire',
          icon: 'lorc/sunbeams',
          durationTicks: 40,
          damagePerTick: 2.4,
          targeting: 'two_random',
        },
        {
          abilityId: 'smite_crusader',
          name: "Crusader's Judgment",
          icon: 'lorc/crossed-swords',
          durationTicks: 100,
          damagePerTick: 0.9,
          targeting: 'single_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'smite_fury',
          name: 'Resurrection Fury',
          icon: 'lorc/crowned-skull',
          durationTicks: 80,
          partyDamageMultiplier: 1.8,
        },
      ],
    },
  },
  {
    id: 'zul_farrak',
    name: "Zul'Farrak",
    difficulty: 4,
    levelMin: 10,
    levelMax: 12,
    bossName: 'Chief Ukorz Sandscalp',
    bossHealth: 12000,
    bossIcon: 'lorc/tribal-mask',
    cardIcon: 'delapouite/egyptian-pyramids',
    enemies: [
      { name: 'Sandfury Troll', icon: 'skoll/troll' },
      { name: 'Shadowcaster', icon: 'lorc/crystal-ball' },
      { name: 'Basilisk', icon: 'lorc/lizardman' },
    ],
    lootRewards: ["Sul'thraze", 'Bad Mojo Mask', "Jang'thraze", 'Embrace of the Lycan'],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'ukorz_sand',
          name: 'Sandstorm',
          icon: 'delapouite/sandstorm',
          durationTicks: 110,
          damagePerTick: 1.0,
          targeting: 'all_living',
        },
        {
          abilityId: 'ukorz_impale',
          name: 'Mortal Wound',
          icon: 'lorc/barbute',
          durationTicks: 70,
          damagePerTick: 2.8,
          targeting: 'single_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'ukorz_bloodlust',
          name: 'Berserker Rage',
          icon: 'skoll/troll',
          durationTicks: 140,
          partyDamageMultiplier: 1.5,
        },
      ],
    },
  },
  {
    id: 'sunken_temple',
    name: 'The Sunken Temple',
    difficulty: 5,
    levelMin: 13,
    levelMax: 15,
    bossName: 'Shade of Eranikus',
    bossHealth: 25000,
    bossIcon: 'lorc/dragon-breath',
    cardIcon: 'delapouite/temple-gate',
    enemies: [
      { name: "Atal'ai Exile", icon: 'lorc/alien-stare' },
      { name: 'Nightmare Wyrm', icon: 'lorc/dragon-head' },
      { name: 'Dragonkin', icon: 'lorc/double-dragon' },
    ],
    lootRewards: ["Dragon's Call", 'Blade of the Unworthy', 'Crest', "Warrior's Embrace"],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'eranikus_corruption',
          name: 'Deep Slumber',
          icon: 'lorc/evil-bud',
          durationTicks: 250,
          damagePerTick: 0.5,
          targeting: 'two_random',
        },
        {
          abilityId: 'eranikus_tail',
          name: 'Acid Breath',
          icon: 'lorc/dragon-head',
          durationTicks: 80,
          damagePerTick: 1.6,
          targeting: 'two_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'eranikus_frenzy',
          name: 'Nightmare Haze',
          icon: 'lorc/dragon-breath',
          durationTicks: 200,
          partyDamageMultiplier: 1.36,
        },
      ],
    },
  },
  {
    id: 'blackrock_depths',
    name: 'Blackrock Depths',
    difficulty: 6,
    levelMin: 16,
    levelMax: 18,
    bossName: 'Emperor Thaurissan',
    bossHealth: 55000,
    bossIcon: 'delapouite/imperial-crown',
    cardIcon: 'lorc/anvil',
    enemies: [
      { name: 'Dark Iron Dwarf', icon: 'delapouite/dwarf-face' },
      { name: 'Fire Elemental', icon: 'lorc/campfire' },
      { name: 'Houndmaster', icon: 'lorc/hound' },
    ],
    lootRewards: ['Ironfoe', 'Hand of Justice', "Emperor's Seal", 'Royal Robes'],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'thaurissan_inferno',
          name: 'Magma Splash',
          icon: 'lorc/fire-ray',
          durationTicks: 60,
          damagePerTick: 1.8,
          targeting: 'all_living',
        },
        {
          abilityId: 'thaurissan_dominate',
          name: 'Hand of Thaurissan',
          icon: 'lorc/crown-of-thorns',
          durationTicks: 110,
          damagePerTick: 2.2,
          targeting: 'single_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'thaurissan_avatar',
          name: 'Avatar of Flame',
          icon: 'lorc/campfire',
          durationTicks: 135,
          partyDamageMultiplier: 1.7,
        },
      ],
    },
  },
  {
    id: 'stratholme',
    name: 'Stratholme',
    difficulty: 7,
    levelMin: 19,
    levelMax: 21,
    bossName: 'Baron Rivendare',
    bossHealth: 110000,
    bossIcon: 'lorc/horse-head',
    cardIcon: 'delapouite/plague-doctor-profile',
    enemies: [
      { name: 'Plague Ghoul', icon: 'lorc/fanged-skull' },
      { name: 'Patchwork Horror', icon: 'lorc/frankenstein-creature' },
      { name: 'Banshee', icon: 'lorc/ghost' },
    ],
    lootRewards: ["Deathcharger's Reins", 'Runeblade', 'Gauntlets', "Baron's Scepter"],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'rivendare_plague',
          name: 'Necrotic Plague',
          icon: 'delapouite/plague-doctor-profile',
          durationTicks: 150,
          damagePerTick: 1.3,
          targeting: 'two_random',
        },
        {
          abilityId: 'rivendare_unholy',
          name: 'Unholy Aura',
          icon: 'lorc/death-zone',
          durationTicks: 400,
          damagePerTick: 0.5,
          targeting: 'all_living',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'rivendare_deathwish',
          name: "Death's Advance",
          icon: 'lorc/horse-head',
          durationTicks: 160,
          partyDamageMultiplier: 1.56,
        },
      ],
    },
  },
  {
    id: 'scholomance',
    name: 'Scholomance',
    difficulty: 8,
    levelMin: 22,
    levelMax: 24,
    bossName: 'Darkmaster Gandling',
    bossHealth: 250000,
    bossIcon: 'delapouite/graduate-cap',
    cardIcon: 'delapouite/spooky-house',
    enemies: [
      { name: 'Risen Guard', icon: 'delapouite/shambling-zombie' },
      { name: 'Necromancer', icon: 'lorc/death-note' },
      { name: 'Voidwalker', icon: 'lorc/shadow-follower' },
    ],
    lootRewards: ["Headmaster's Charge", "Alanna's Embrace", 'Icebane Robe', 'Staff'],
    bossCombat: {
      debuffTemplates: [
        {
          abilityId: 'gandling_curse',
          name: 'Incinerate Soul',
          icon: 'lorc/cursed-star',
          durationTicks: 50,
          damagePerTick: 4.4,
          targeting: 'single_random',
        },
        {
          abilityId: 'gandling_soul',
          name: 'Harsh Lesson',
          icon: 'lorc/shadow-follower',
          durationTicks: 120,
          damagePerTick: 1.5,
          targeting: 'two_random',
        },
      ],
      selfBuffTemplates: [
        {
          abilityId: 'gandling_darkmastery',
          name: 'Dark Mastery',
          icon: 'delapouite/graduate-cap',
          durationTicks: 180,
          partyDamageMultiplier: 1.7,
        },
      ],
    },
  },
];

export const PRIEST_TALENTS: Talent[] = [
  { id: 'p_1_1', name: 'Divine Intellect', description: 'Increases total mana by 40 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'lorc/brain', gridX: 0, gridY: 0, statBonus: { manaPool: 40 } },
  { id: 'p_1_2', name: 'Improved Renew', description: 'Increases healing of Renew by 5% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'lorc/heart-organ', gridX: 2, gridY: 0, statBonus: { healingBoost: 5 } },
  { id: 'p_2_1', name: 'Holy Specialization', description: 'Increases crit chance by 2% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'lorc/target-dummy', gridX: 0, gridY: 1, prerequisites: ['p_1_1'], statBonus: { critChance: 2 } },
  { id: 'p_2_2', name: 'Divine Fury', description: 'Reduces mana cost of direct heals by 3%.', points: 0, maxPoints: 3, levelReq: 5, cost: 1, icon: 'lorc/candle-flame', gridX: 1, gridY: 1, statBonus: { healingBoost: 2 } },
  { id: 'p_2_3', name: 'Divine Light', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 10, cost: 1, icon: 'lorc/sun', gridX: 2, gridY: 1, prerequisites: ['p_1_2'], spellId: 'greater_heal' },
  { id: 'p_3_1', name: 'Inspiration', description: 'Direct heals restore 4 mana per point.', points: 0, maxPoints: 3, levelReq: 15, cost: 1, icon: 'lorc/arcing-bolt', gridX: 0, gridY: 2, prerequisites: ['p_2_1'], statBonus: { manaReturnOnDirectHeal: 4 } },
  { id: 'p_3_2', name: 'Holy Reach', description: 'Increases haste by 3% per point.', points: 0, maxPoints: 2, levelReq: 15, cost: 1, icon: 'delapouite/ascending-block', gridX: 3, gridY: 2, statBonus: { haste: 3 } },
  { id: 'p_4_1', name: 'Circle of Healing', description: 'Unlocks Wild Growth (AOE).', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'lorc/tornado', gridX: 1, gridY: 3, prerequisites: ['p_2_2'], spellId: 'wild_growth' },
  { id: 'p_4_2', name: 'Spiritual Guidance', description: 'Healing power increased by 8%.', points: 0, maxPoints: 5, levelReq: 20, cost: 1, icon: 'lorc/compass', gridX: 2, gridY: 3, prerequisites: ['p_2_3'], statBonus: { healingBoost: 8 } },
  { id: 'p_5_1', name: 'Serendipity', description: 'Haste increased by 5% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'delapouite/alarm-clock', gridX: 0, gridY: 4, prerequisites: ['p_3_1'], statBonus: { haste: 5 } },
  { id: 'p_5_2', name: 'Surge of Light', description: 'Crits grant 10% extra healing.', points: 0, maxPoints: 2, levelReq: 25, cost: 1, icon: 'lorc/arcing-bolt', gridX: 3, gridY: 4, prerequisites: ['p_3_2'], statBonus: { healingBoost: 10 } },
  { id: 'p_6_1', name: 'Test of Faith', description: 'Mana pool increased by 150.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'delapouite/heart-battery', gridX: 1, gridY: 5, prerequisites: ['p_4_1'], statBonus: { manaPool: 150 } },
  { id: 'p_6_2', name: 'Pure of Heart', description: 'All healing increased by 15%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'lorc/ball-heart', gridX: 2, gridY: 5, prerequisites: ['p_4_2'], statBonus: { healingBoost: 15 } },
  { id: 'p_cap', name: 'Guardian Spirit', description: 'Ultimate power: 25% heal boost and 10% haste.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'lorc/crown', gridX: 1, gridY: 6, prerequisites: ['p_6_1', 'p_6_2'], statBonus: { healingBoost: 25, haste: 10 } },
];

export const DRUID_TALENTS: Talent[] = [
  { id: 'd_1_1', name: "Nature's Focus", description: 'Reduces mana cost of all spells by 2% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'delapouite/ginkgo-leaf', gridX: 1, gridY: 0, statBonus: { healingBoost: 2 } },
  { id: 'd_1_2', name: 'Furor', description: 'Increases total mana by 50 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'lorc/arcing-bolt', gridX: 3, gridY: 0, statBonus: { manaPool: 50 } },
  { id: 'd_2_1', name: 'Naturalist', description: 'Increases all healing by 4% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'delapouite/bonsai-tree', gridX: 1, gridY: 1, prerequisites: ['d_1_1'], statBonus: { healingBoost: 4 } },
  { id: 'd_2_2', name: 'Intensity', description: 'Increases haste by 3% per point.', points: 0, maxPoints: 3, levelReq: 5, cost: 1, icon: 'lorc/wind-hole', gridX: 2, gridY: 1, statBonus: { haste: 3 } },
  { id: 'd_3_1', name: 'Gift of Nature', description: 'Increases crit chance by 4% per point.', points: 0, maxPoints: 5, levelReq: 10, cost: 1, icon: 'delapouite/sparkles', gridX: 0, gridY: 2, statBonus: { critChance: 4 } },
  { id: 'd_3_2', name: 'Tranquil Spirit', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 12, cost: 1, icon: 'lorc/heavy-rain', gridX: 1, gridY: 2, prerequisites: ['d_2_1'], spellId: 'greater_heal' },
  { id: 'd_4_1', name: 'Living Seed', description: 'Direct heals restore 5 mana per point.', points: 0, maxPoints: 3, levelReq: 18, cost: 1, icon: 'delapouite/seedling', gridX: 2, gridY: 3, prerequisites: ['d_2_2'], statBonus: { manaReturnOnDirectHeal: 5 } },
  { id: 'd_4_2', name: "Nature's Bounty", description: 'Unlocks Wild Growth.', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'lorc/tornado', gridX: 3, gridY: 3, prerequisites: ['d_1_2'], spellId: 'wild_growth' },
  { id: 'd_5_1', name: 'Empowered Rejuv', description: 'HoT healing increased by 10% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'lorc/arcing-bolt', gridX: 0, gridY: 4, prerequisites: ['d_3_1'], statBonus: { healingBoost: 10 } },
  { id: 'd_5_2', name: 'Gift of Earthmother', description: 'Haste increased by 5% per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'lorc/wind-hole', gridX: 1, gridY: 4, prerequisites: ['d_3_2'], statBonus: { haste: 5 } },
  { id: 'd_6_1', name: 'Wild Growth Opt', description: 'Mana pool increased by 200.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'delapouite/car-battery', gridX: 2, gridY: 5, prerequisites: ['d_4_1'], statBonus: { manaPool: 200 } },
  { id: 'd_6_2', name: 'Tree of Life', description: 'Healing increased by 20%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'delapouite/bonsai-tree', gridX: 3, gridY: 5, prerequisites: ['d_4_2'], statBonus: { healingBoost: 20 } },
  { id: 'd_cap', name: 'Genesis', description: 'Nature Mastery: 15% Crit, 15% Haste, 15% Healing.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'lorc/crown', gridX: 2, gridY: 6, prerequisites: ['d_6_1', 'd_6_2'], statBonus: { healingBoost: 15, critChance: 15, haste: 15 } },
];

export const PALADIN_TALENTS: Talent[] = [
  { id: 'h_1_1', name: 'Divine Intellect', description: 'Increases mana by 60 per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'lorc/brain', gridX: 0, gridY: 0, statBonus: { manaPool: 60 } },
  { id: 'h_1_2', name: 'Spiritual Focus', description: 'Increases haste by 2% per point.', points: 0, maxPoints: 5, levelReq: 1, cost: 1, icon: 'lorc/wind-hole', gridX: 2, gridY: 0, statBonus: { haste: 2 } },
  { id: 'h_2_1', name: 'Healing Light', description: 'Increases healing by 5% per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'lorc/sun', gridX: 0, gridY: 1, prerequisites: ['h_1_1'], statBonus: { healingBoost: 5 } },
  { id: 'h_2_2', name: 'Illumination', description: 'Crits restore 10 mana per point.', points: 0, maxPoints: 5, levelReq: 5, cost: 1, icon: 'lorc/light-bulb', gridX: 1, gridY: 1, statBonus: { manaReturnOnDirectHeal: 10 } },
  { id: 'h_3_1', name: 'Divine Favor', description: 'Unlocks Greater Heal.', points: 0, maxPoints: 1, levelReq: 10, cost: 1, icon: 'delapouite/healing-shield', gridX: 2, gridY: 2, prerequisites: ['h_1_2'], spellId: 'greater_heal' },
  { id: 'h_3_2', name: 'Sanctified Light', description: 'Increases crit by 3% per point.', points: 0, maxPoints: 3, levelReq: 12, cost: 1, icon: 'lorc/target-dummy', gridX: 3, gridY: 2, statBonus: { critChance: 3 } },
  { id: 'h_4_1', name: 'Holy Power', description: 'Unlocks Wild Growth.', points: 0, maxPoints: 1, levelReq: 20, cost: 1, icon: 'lorc/tornado', gridX: 1, gridY: 3, prerequisites: ['h_2_2'], spellId: 'wild_growth' },
  { id: 'h_4_2', name: 'Pure of Heart', description: 'Haste increased by 4% per point.', points: 0, maxPoints: 5, levelReq: 20, cost: 1, icon: 'lorc/wind-hole', gridX: 0, gridY: 3, prerequisites: ['h_2_1'], statBonus: { haste: 4 } },
  { id: 'h_5_1', name: "Light's Grace", description: 'Healing increased by 10% per point.', points: 0, maxPoints: 2, levelReq: 25, cost: 1, icon: 'delapouite/sparkles', gridX: 2, gridY: 4, prerequisites: ['h_3_1'], statBonus: { healingBoost: 10 } },
  { id: 'h_5_2', name: 'Blessed Hands', description: 'Mana pool increased by 100 per point.', points: 0, maxPoints: 3, levelReq: 25, cost: 1, icon: 'delapouite/car-battery', gridX: 3, gridY: 4, prerequisites: ['h_3_2'], statBonus: { manaPool: 100 } },
  { id: 'h_6_1', name: 'Aura Mastery', description: 'Crit chance increased by 10%.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'lorc/target-dummy', gridX: 1, gridY: 5, prerequisites: ['h_4_1'], statBonus: { critChance: 10 } },
  { id: 'h_6_2', name: 'Infusion of Light', description: 'Mana pool increased by 300.', points: 0, maxPoints: 1, levelReq: 30, cost: 1, icon: 'lorc/arcing-bolt', gridX: 0, gridY: 5, prerequisites: ['h_4_2'], statBonus: { manaPool: 300 } },
  { id: 'h_cap', name: 'Beacon of Light', description: 'Holy Perfection: 30% Healing, 10% Haste, 500 Mana.', points: 0, maxPoints: 1, levelReq: 40, cost: 1, icon: 'lorc/crown', gridX: 1, gridY: 6, prerequisites: ['h_6_1', 'h_6_2'], statBonus: { healingBoost: 30, haste: 10, manaPool: 500 } },
];

export function cloneTalentsForClass(cls: ClassType): Talent[] {
  const src =
    cls === ClassType.PRIEST ? PRIEST_TALENTS : cls === ClassType.DRUID ? DRUID_TALENTS : PALADIN_TALENTS;
  return src.map((t) => ({ ...t }));
}

export const TANK_POOL: { name: string; role: 'TANK' }[] = [
  { name: 'Tanky McShield', role: 'TANK' },
  { name: 'Ironheart Bear', role: 'TANK' },
  { name: 'Sunbreaker', role: 'TANK' },
  { name: 'Stonekin', role: 'TANK' },
];

export const DPS_POOL: { name: string; role: 'DPS' }[] = [
  { name: 'Zappy Mage', role: 'DPS' },
  { name: 'Sneaky Rogue', role: 'DPS' },
  { name: 'Shadow Warlock', role: 'DPS' },
  { name: 'Wildfire Mage', role: 'DPS' },
  { name: 'Frostweaver', role: 'DPS' },
  { name: 'Blade Dancer', role: 'DPS' },
  { name: 'Hunter Mark', role: 'DPS' },
  { name: 'Demon Hunter', role: 'DPS' },
  { name: 'Retri Pally', role: 'DPS' },
  { name: 'Shadow Priest', role: 'DPS' },
  { name: 'Windwalker', role: 'DPS' },
  { name: 'Feral Kitty', role: 'DPS' },
];

export function generateRandomParty(playerLevel: number, playerClass: ClassType | null): Unit[] {
  const tankTpl = TANK_POOL[Math.floor(Math.random() * TANK_POOL.length)];
  const dpsCopy = [...DPS_POOL];
  for (let i = dpsCopy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = dpsCopy[i];
    dpsCopy[i] = dpsCopy[j];
    dpsCopy[j] = t;
  }
  const selectedDps = dpsCopy.slice(0, 3);
  const tankLevel = randomAllyLevel(playerLevel);
  const tankHp = allyMaxHealthForRoleAndLevel('TANK', tankLevel);
  const healerLevel = Math.max(1, playerLevel);
  const healerHp = healerMaxHealthFromStats(playerClass, healerLevel);
  return [
    {
      ...tankTpl,
      id: '1',
      level: tankLevel,
      maxHealth: tankHp,
      health: tankHp,
      buffs: [],
      debuffs: [],
    },
    ...selectedDps.map((tpl, i) => {
      const lv = randomAllyLevel(playerLevel);
      const hp = allyMaxHealthForRoleAndLevel('DPS', lv);
      return {
        ...tpl,
        id: String(i + 2),
        level: lv,
        maxHealth: hp,
        health: hp,
        buffs: [],
        debuffs: [],
      };
    }),
    {
      id: '5',
      name: 'Player (You)',
      role: 'HEALER',
      level: healerLevel,
      maxHealth: healerHp,
      health: healerHp,
      buffs: [],
      debuffs: [],
    },
  ];
}
