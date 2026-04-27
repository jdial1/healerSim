/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Spell,
  ClassType,
  Dungeon,
  DungeonPace,
  Unit,
  BossCombatProfile,
  BossCombatOverrides,
} from './types.ts';
import {
  allyMaxHealthForPoolEntry,
  healerMaxHealthFromStats,
  randomAllyLevel,
  spiritManaRegenMultiplier,
} from './playerStats.ts';
import spellsData from './data/spells.json';
import npcPoolsData from './data/npc_pools.json';
import balanceData from './data/balance.json';

export const TICK_RATE = 100; // ms per tick
export const MANA_REGEN_PER_TICK = 0.5;
export const MANA_SPIRIT_REGEN_LOCKOUT_TICKS = 5000 / TICK_RATE;
export const MANA_POTION_USES_PER_DUNGEON = 2;

export function bossDamageMultiplierForDifficulty(difficulty: number): number {
  return Math.pow(
    balanceData.boss.damageMultiplierPerDifficultyStep,
    Math.max(0, difficulty - 1),
  );
}

export function damageTakenMultiplierFromDungeonLevelGap(
  partyMemberLevel: number,
  dungeonLevelMax: number,
): number {
  const gap = partyMemberLevel - dungeonLevelMax;
  if (gap <= 0) return 1;
  return Math.pow(balanceData.partyDamageFromDungeonLevelGap.multiplierPerPartyLevelOverDungeonMax, gap);
}

export const TRASH_PACK_COUNT = 3;

export function trashMaxHealthForDungeon(dungeon: Dungeon): number {
  return Math.max(
    1,
    Math.round(dungeon.bossHealth * balanceData.trash.maxHealthFractionOfBoss),
  );
}

export function dungeonPaceDpsMultiplier(pace: DungeonPace): number {
  if (pace === 'fast') return 1.3333;
  if (pace === 'normal') return 1;
  return 0.6667;
}

export function dungeonPaceXpMultiplier(pace: DungeonPace): number {
  if (pace === 'fast') return 0.5;
  if (pace === 'normal') return 1;
  return 2;
}

export function dungeonXpTierMultiplier(difficulty: number): number {
  return 1 + balanceData.xp.dungeonTierAdditivePerDifficultyOver1 * Math.max(0, difficulty - 1);
}

export function dungeonBaseXp(difficulty: number): number {
  return Math.round(
    balanceData.xp.dungeonBaseAmount * Math.pow(balanceData.xp.dungeonBaseDifficultyPowBase, difficulty - 1),
  );
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

export const SPELLS = spellsData as Record<string, Spell>;

export const SPELL_TAG_DRUID_HOT = 'druid-hot';
export const SPELL_TAG_DRUID_CULTIVATION_HOT = 'druid-cultivation-hot';
export const SPELL_TAG_SWIFTMEND_CONSUMABLE = 'swiftmend-consumable';
export const SPELL_TAG_SWIFTMEND_PREFER = 'swiftmend-prefer';

export function spellHasTag(spellId: string | undefined, tag: string): boolean {
  if (!spellId) return false;
  return SPELLS[spellId]?.tags?.includes(tag) ?? false;
}

function roundedManaRegenPerTickAndPerSec(
  spiritRegenLockoutTicksRemaining: number,
  spirit: number,
): { perTick: number; perSec: number } {
  const rawPerTick = MANA_REGEN_PER_TICK * spiritManaRegenMultiplier(spirit);
  if (spiritRegenLockoutTicksRemaining > 0) {
    return { perTick: 0, perSec: 0 };
  }
  const rawPerSec = rawPerTick * TICKS_PER_SECOND;
  const perSec = Math.round(rawPerSec * 10) / 10;
  const perTick = Math.round((perSec / TICKS_PER_SECOND) * 1000) / 1000;
  return { perTick, perSec };
}

export function manaRegenAmountPerTick(
  spiritRegenLockoutTicksRemaining: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(spiritRegenLockoutTicksRemaining, spirit).perTick;
}

export function getManaRegenPerSecond(
  spiritRegenLockoutTicksRemaining: number,
  spirit: number,
): number {
  return roundedManaRegenPerTickAndPerSec(spiritRegenLockoutTicksRemaining, spirit).perSec;
}

export type AllyHealthScaling = { base: number; perLevel: number };

export type AllyNpcTemplate<R extends 'TANK' | 'DPS'> = {
  name: string;
  role: R;
  healthScaling?: AllyHealthScaling;
};

export const TANK_POOL = npcPoolsData.tankPool as AllyNpcTemplate<'TANK'>[];

export const DPS_POOL = npcPoolsData.dpsPool as AllyNpcTemplate<'DPS'>[];

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
  const tankHp = allyMaxHealthForPoolEntry('TANK', tankLevel, tankTpl.healthScaling);
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
      const hp = allyMaxHealthForPoolEntry('DPS', lv, tpl.healthScaling);
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
