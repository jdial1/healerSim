/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Spell,
  SpellType,
  ClassType,
  Dungeon,
  Unit,
  BossCombatProfile,
  BossCombatOverrides,
} from './types.ts';
import {
  allyMaxHealthForRoleAndLevel,
  healerMaxHealthFromStats,
  randomAllyLevel,
  spiritManaRegenMultiplier,
} from './playerStats.ts';

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;
export const MANA_SPIRIT_REGEN_LOCKOUT_TICKS = 5000 / TICK_RATE;
export const MANA_POTION_USES_PER_DUNGEON = 2;

export function bossDamageMultiplierForDifficulty(difficulty: number): number {
  return Math.pow(1.12, Math.max(0, difficulty - 1));
}

export function damageTakenMultiplierFromDungeonLevelGap(
  partyMemberLevel: number,
  dungeonLevelMax: number,
): number {
  const gap = partyMemberLevel - dungeonLevelMax;
  if (gap <= 0) return 1;
  return Math.pow(0.62, gap);
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
  'mechanicIntervalTicksMin' | 'mechanicIntervalTicksMax'
> = {
  mechanicIntervalTicksMin: 2 * TICKS_PER_SECOND,
  mechanicIntervalTicksMax: 5 * TICKS_PER_SECOND,
};

export function bossCombatProfileForDungeon(dungeon: Dungeon): BossCombatProfile {
  const c: BossCombatOverrides | undefined = dungeon.bossCombat;
  return {
    ...DEFAULT_BOSS_COMBAT_INTERVALS,
    debuffTemplates: c?.debuffTemplates ?? [],
    selfBuffTemplates: c?.selfBuffTemplates ?? [],
    mechanicIntervalTicksMin: c?.mechanicIntervalTicksMin ?? DEFAULT_BOSS_COMBAT_INTERVALS.mechanicIntervalTicksMin,
    mechanicIntervalTicksMax: c?.mechanicIntervalTicksMax ?? DEFAULT_BOSS_COMBAT_INTERVALS.mechanicIntervalTicksMax,
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
    cooldown: 100,
    icon: 'delapouite/circle-forest',
    color: 'bg-lime-400',
  },
  swiftmend: {
    id: 'swiftmend',
    name: 'Swiftmend',
    type: SpellType.DIRECT,
    manaCost: 18,
    healing: 85,
    cooldown: 150,
    icon: 'delapouite/seedling',
    color: 'bg-emerald-300',
  },
  wand: {
    id: 'wand',
    name: 'Wand',
    type: SpellType.DIRECT,
    manaCost: 0,
    healing: 0,
    cooldown: 30,
    icon: 'delapouite/bolt-spell-cast',
    color: 'bg-violet-400',
    dealDamageToEnemy: 10,
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

function manaPotionRegenMultiplier(manaRegenBuffTicksRemaining: number): number {
  return manaRegenBuffTicksRemaining > 0 && SPELLS.mana_potion.manaRegenBuffMultiplier !== undefined
    ? SPELLS.mana_potion.manaRegenBuffMultiplier
    : 1;
}

function roundedManaRegenPerTickAndPerSec(
  spiritRegenLockoutTicksRemaining: number,
  manaRegenBuffTicksRemaining: number,
  spirit: number,
): { perTick: number; perSec: number } {
  const mult = manaPotionRegenMultiplier(manaRegenBuffTicksRemaining);
  const rawPerTick = MANA_REGEN_PER_TICK * spiritManaRegenMultiplier(spirit) * mult;
  if (spiritRegenLockoutTicksRemaining > 0 && manaRegenBuffTicksRemaining <= 0) {
    return { perTick: 0, perSec: 0 };
  }
  const rawPerSec = rawPerTick * TICKS_PER_SECOND;
  const perSec = Math.round(rawPerSec * 10) / 10;
  const perTick = Math.round((perSec / TICKS_PER_SECOND) * 1000) / 1000;
  return { perTick, perSec };
}

export function manaRegenAmountPerTick(
  spiritRegenLockoutTicksRemaining: number,
  manaRegenBuffTicksRemaining: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(
    spiritRegenLockoutTicksRemaining,
    manaRegenBuffTicksRemaining,
    spirit,
  ).perTick;
}

export function getManaRegenPerSecond(
  spiritRegenLockoutTicksRemaining: number,
  manaRegenBuffTicksRemaining: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(
    spiritRegenLockoutTicksRemaining,
    manaRegenBuffTicksRemaining,
    spirit,
  ).perSec;
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
      shield: 0,
      shieldTicksRemaining: 0,
      livingSeedPool: 0,
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
        shield: 0,
        shieldTicksRemaining: 0,
        livingSeedPool: 0,
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
      shield: 0,
      shieldTicksRemaining: 0,
      livingSeedPool: 0,
    },
  ];
}
