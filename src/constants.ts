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
    attackTemplates: c?.attackTemplates ?? [],
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
    manaCost: 18,
    healing: 20,
    cooldown: 0,
    icon: 'lorc/glowing-hands',
    color: 'bg-yellow-400',
  },
  greater_heal: {
    id: 'greater_heal',
    name: 'Greater Heal',
    type: SpellType.DIRECT,
    manaCost: 36,
    healing: 66,
    cooldown: 50, // 5 seconds if 100ms tick and logic is ticks
    icon: 'delapouite/hand-of-god',
    color: 'bg-yellow-100',
  },
  renew: {
    id: 'renew',
    name: 'Renew',
    type: SpellType.HOT,
    manaCost: 9,
    healing: 5,
    hotDuration: 150, // 15 seconds
    hotHealingPerTick: 1.1,
    cooldown: 0,
    icon: 'lorc/prayer',
    color: 'bg-green-300',
  },
  
  // Druid Spells
  rejuvenation: {
    id: 'rejuvenation',
    name: 'Rejuvenation',
    type: SpellType.HOT,
    manaCost: 11,
    healing: 2,
    hotDuration: 120, // 12 seconds
    hotHealingPerTick: 1.8,
    cooldown: 0,
    icon: 'lorc/leaf-swirl',
    color: 'bg-green-500',
  },
  regrowth: {
    id: 'regrowth',
    name: 'Regrowth',
    type: SpellType.DIRECT,
    manaCost: 22,
    healing: 16,
    hotDuration: 60, // 6 seconds
    hotHealingPerTick: 0.9,
    cooldown: 0,
    icon: 'lorc/fruiting',
    color: 'bg-emerald-400',
  },
  wild_growth: {
    id: 'wild_growth',
    name: 'Wild Growth',
    type: SpellType.AOE,
    manaCost: 40,
    healing: 10,
    hotDuration: 70,
    hotHealingPerTick: 1.36,
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
    icon: 'lorc/fruiting',
    color: 'bg-emerald-300',
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
