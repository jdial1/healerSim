import {
  getMaxHealthForPool,
  getHealerMaxHealth,
  randomAllyLevel,
  getSpiritRegenMultiplier
} from "./playerStats.js";
import { SPELLS as spellsData, NPC_POOLS as npcPoolsData, BALANCE as balanceData, PACING as pacingData, MECHANICS } from "./data/index.js";
const TICK_RATE = 100;
const SUSPEND_SNAPSHOT_TICK_INTERVAL = 8;
const MANA_REGEN_PER_TICK = 0.5;
const MANA_SPIRIT_REGEN_LOCKOUT_TICKS = 5e3 / TICK_RATE;
const MANA_POTION_USES_PER_DUNGEON = 2;
function getBossDamageMultiplier(difficulty) {
  return Math.pow(
    balanceData.boss.damageMultiplierPerDifficultyStep,
    Math.max(0, difficulty - 1)
  );
}
function getEndlessMultiplier(stacks) {
  return Math.pow(balanceData.endless.scalingPerCycle, Math.max(0, stacks));
}
function getLevelGapDamageMultiplier(partyMemberLevel, dungeonLevelMax) {
  const gap = partyMemberLevel - dungeonLevelMax;
  if (gap <= 0) return 1;
  return Math.pow(balanceData.partyDamageFromDungeonLevelGap.multiplierPerPartyLevelOverDungeonMax, gap);
}
const TRASH_PACK_COUNT = 3;
function getTrashMaxHealth(dungeon) {
  return Math.max(
    1,
    Math.round(dungeon.bossHealth * balanceData.trash.maxHealthFractionOfBoss)
  );
}
const DUNGEON_PACES = ["fast", "normal", "slow"];
function dungeonPaceDpsMultiplier(pace) {
  return pacingData.paces[pace].dpsMultiplier;
}
function dungeonPaceXpMultiplier(pace) {
  return pacingData.paces[pace].xpMultiplier;
}
function dungeonPaceTrashSec(pace) {
  return pacingData.paces[pace].trashSec;
}
function dungeonPaceBossSec(pace) {
  return pacingData.paces[pace].bossSec;
}
import { BALANCE } from "./data/index.js";
// One source for the Paladin gate. The check and the label used to be written
// out separately and had drifted apart (25 vs 30).
const PALADIN_UNLOCK_LEVEL = BALANCE.progression.paladinUnlockLevel;
function dungeonXpTierMultiplier(difficulty) {
  return 1 + balanceData.xp.dungeonTierAdditivePerDifficultyOver1 * Math.max(0, difficulty - 1);
}
function dungeonBaseXp(difficulty) {
  return Math.round(
    balanceData.xp.dungeonBaseAmount * Math.pow(balanceData.xp.dungeonBaseDifficultyPowBase, difficulty - 1)
  );
}
const TICKS_PER_SECOND = Math.round(1e3 / TICK_RATE);
const DEFAULT_BOSS_COMBAT_INTERVALS = {
  mechanicIntervalTicksMin: 2 * TICKS_PER_SECOND,
  mechanicIntervalTicksMax: 5 * TICKS_PER_SECOND
};
function getCombatProfile(dungeon) {
  const c = dungeon.bossCombat;
  return {
    ...DEFAULT_BOSS_COMBAT_INTERVALS,
    debuffTemplates: c?.debuffTemplates ?? [],
    selfBuffTemplates: c?.selfBuffTemplates ?? [],
    attackTemplates: c?.attackTemplates ?? [],
    mechanicIntervalTicksMin: c?.mechanicIntervalTicksMin ?? DEFAULT_BOSS_COMBAT_INTERVALS.mechanicIntervalTicksMin,
    mechanicIntervalTicksMax: c?.mechanicIntervalTicksMax ?? DEFAULT_BOSS_COMBAT_INTERVALS.mechanicIntervalTicksMax
  };
}
const SPELLS = spellsData;
const NPC_POOLS = npcPoolsData;
const TANK_POOL = npcPoolsData.tankPool;
const DPS_POOL = npcPoolsData.dpsPool;
const SPELL_TAG_DRUID_HOT = "druid-hot";
const SPELL_TAG_DRUID_CULTIVATION_HOT = "druid-cultivation-hot";
const SPELL_TAG_SWIFTMEND_CONSUMABLE = "swiftmend-consumable";
const SPELL_TAG_SWIFTMEND_PREFER = "swiftmend-prefer";
function spellHasTag(spellId, tag) {
  if (!spellId) return false;
  return SPELLS[spellId]?.tags?.includes(tag) ?? false;
}
function roundedManaRegenPerTickAndPerSec(spiritRegenLockoutTicksRemaining, spirit) {
  const rawPerTick = MANA_REGEN_PER_TICK * getSpiritRegenMultiplier(spirit);
  if (spiritRegenLockoutTicksRemaining > 0) {
    return { perTick: 0, perSec: 0 };
  }
  const rawPerSec = rawPerTick * TICKS_PER_SECOND;
  const perSec = Math.round(rawPerSec * 10) / 10;
  const perTick = Math.round(perSec / TICKS_PER_SECOND * 1e3) / 1e3;
  return { perTick, perSec };
}
function manaRegenAmountPerTick(spiritRegenLockoutTicksRemaining, spirit) {
  return roundedManaRegenPerTickAndPerSec(spiritRegenLockoutTicksRemaining, spirit).perTick;
}
function getManaRegenPerSecond(spiritRegenLockoutTicksRemaining, spirit) {
  return roundedManaRegenPerTickAndPerSec(spiritRegenLockoutTicksRemaining, spirit).perSec;
}
function shuffleArray(arr, rng = Math.random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function generateRandomParty(playerLevel, playerClass) {
  const tankTpl = TANK_POOL[Math.floor(Math.random() * TANK_POOL.length)];
  const selectedDps = shuffleArray(DPS_POOL).slice(0, 3);
  const tankLevel = randomAllyLevel(playerLevel);
  const tankHp = getMaxHealthForPool("TANK", tankLevel, tankTpl.healthScaling);
  const healerLevel = Math.max(1, playerLevel);
  const healerHp = getHealerMaxHealth(playerClass, healerLevel);
  return [
    {
      ...tankTpl,
      id: "1",
      level: tankLevel,
      maxHealth: tankHp,
      health: tankHp,
      buffs: [],
      debuffs: [],
      shield: 0,
      shieldTicksRemaining: 0,
      livingSeedPool: 0
    },
    ...selectedDps.map((tpl, i) => {
      const lv = randomAllyLevel(playerLevel);
      const hp = getMaxHealthForPool("DPS", lv, tpl.healthScaling);
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
        livingSeedPool: 0
      };
    }),
    {
      id: "5",
      name: "Player (You)",
      role: "HEALER",
      level: healerLevel,
      maxHealth: healerHp,
      health: healerHp,
      buffs: [],
      debuffs: [],
      shield: 0,
      shieldTicksRemaining: 0,
      livingSeedPool: 0
    }
  ];
}
export {
  BALANCE,
  PALADIN_UNLOCK_LEVEL,
  DPS_POOL,
  DUNGEON_PACES,
  MANA_POTION_USES_PER_DUNGEON,
  MANA_REGEN_PER_TICK,
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  MECHANICS,
  NPC_POOLS,
  SPELLS,
  SPELL_TAG_DRUID_CULTIVATION_HOT,
  SPELL_TAG_DRUID_HOT,
  SPELL_TAG_SWIFTMEND_CONSUMABLE,
  SPELL_TAG_SWIFTMEND_PREFER,
  SUSPEND_SNAPSHOT_TICK_INTERVAL,
  TANK_POOL,
  TICKS_PER_SECOND,
  TICK_RATE,
  TRASH_PACK_COUNT,
  dungeonBaseXp,
  dungeonPaceBossSec,
  dungeonPaceDpsMultiplier,
  dungeonPaceTrashSec,
  dungeonPaceXpMultiplier,
  dungeonXpTierMultiplier,
  generateRandomParty,
  getBossDamageMultiplier,
  getCombatProfile,
  getEndlessMultiplier,
  getLevelGapDamageMultiplier,
  getManaRegenPerSecond,
  getTrashMaxHealth,
  manaRegenAmountPerTick,
  pacingData,
  shuffleArray,
  spellHasTag
};
