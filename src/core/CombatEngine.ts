import {
  GameState,
  Dungeon,
  DungeonPace,
  Unit,
  StatusEffect,
  BossCombatProfile,
  BossMechanicTemplate,
  BossMechanicTargeting,
  Talent,
  DungeonRunPostStats,
  CapstoneFormId,
} from '../systems/Types';

import {
  TICK_RATE,
  SPELLS,
  GRACE_SOURCE_ID,
} from '../systems/Constants';

import { ClassRegistry } from '../systems/ClassRegistry';

import {
  TRASH_PACK_COUNT,
  manaRegenAmountPerTick,
  getBossDamageMultiplier,
  getLevelGapDamageMultiplier,
  getTrashMaxHealth,
  dungeonPaceDpsMultiplier,
  dungeonPaceXpMultiplier,
  getEndlessMultiplier,
  getCombatProfile,
  getPrimaryStats,
  getHealingMultiplier,
  arePrereqsSatisfied,
  getPrerequisiteIds,
  getHealSplit,
  diffFloats,
  pruneFloats,
  appendFloatingCombatDrafts,
} from './CombatMechanics';

import { generateRandomParty } from './CombatMechanics';
import { buildEndlessWaveDungeon, endlessBossPool, getEndlessTemplate } from '../dungeons/index';

import {
  getMeta,
  levelUpRewardSummary,
} from './Persistence';

import {
  getManaCost,
  getDirectHealMultiplier,
  getCritBonus,
  trySpecialHealCast,
  onHealLand,
  getDamageTakenMultiplier,
  getManaReturn,
  getSelfHealOnDamage,
  onShieldTransition,
  onManaAfterHeal,
} from './CombatMechanics';

import {
  applyDamage,
  EffectManager,
  getRanks,
  hasBuff,
  tickBuffs,
  getBuffTicks,
  getPotionDrip,
  getGeneralManaReturn,
  addNaturalPerfection,
  getCapstoneAfterTick,
  getNaturalPerfectionStacks,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  exclusiveUnlock,
  removeBuff,
  getHealer,
  hasHot,
  getConsumableHotIndex,
  isHeal,
  isDirectHeal,
  canSwiftmend,
  resolveSwiftmend,
} from './CombatMechanics';

import { generateCombatUid } from '../uids';
import { getClassStrategy } from '../systems/classStrategy';

import { BALANCE } from '../data/index';

import type { TickRandom } from '../systems/Types';

// ---------- Helper functions from tick.ts ----------

function randomIntInclusive(min: number, max: number, random: TickRandom): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function applyDebuffTemplate(
  party: Unit[],
  template: BossMechanicTemplate,
  now: number,
  random: TickRandom,
): Unit[] {
  const livingIds = party.filter((unit) => unit.health > 0).map((unit) => unit.id);
  if (livingIds.length === 0) return party;

  const addToUnit = (units: Unit[], unitId: string): Unit[] =>
    units.map((unit) => {
      if (unit.id !== unitId) return unit;
      const debuff: StatusEffect = {
        id: generateCombatUid(`${template.abilityId}-${unitId}`, now, random),
        name: template.name,
        icon: template.icon,
        remainingTicks: template.durationTicks ?? 0,
        category: 'harmful',
        sourceId: template.abilityId,
        stacks: 1,
        valuePerTick: template.damagePerTick,
        isDispellable: template.dispellable,
      };
      return { ...unit, effects: [...unit.effects, debuff] };
    });

  if (template.targeting === 'all_living') {
    return livingIds.reduce((acc, id) => addToUnit(acc, id), party);
  }

  if (template.targeting === 'single_random') {
    const id = livingIds[Math.floor(random() * livingIds.length)];
    return addToUnit(party, id);
  }

  const shuffled = [...livingIds].sort(() => random() - 0.5);
  const count = Math.min(2, shuffled.length);
  let next = party;
  for (let i = 0; i < count; i++) {
    next = addToUnit(next, shuffled[i]);
  }
  return next;
}

function selectTargets(
  party: Unit[],
  targeting: BossMechanicTargeting,
  random: TickRandom,
): Set<string> {
  const livingIds = party.filter((unit) => unit.health > 0).map((unit) => unit.id);
  const out = new Set<string>();
  if (livingIds.length === 0) return out;
  if (targeting === 'all_living') {
    livingIds.forEach((id) => out.add(id));
    return out;
  }
  if (targeting === 'single_random') {
    out.add(livingIds[Math.floor(random() * livingIds.length)]);
    return out;
  }
  const shuffled = [...livingIds].sort(() => random() - 0.5);
  const count = Math.min(2, shuffled.length);
  for (let i = 0; i < count; i++) out.add(shuffled[i]);
  return out;
}

function bossMechanicKinds(profile: BossCombatProfile): ('debuff' | 'buff' | 'attack')[] {
  const kinds: ('debuff' | 'buff' | 'attack')[] = [];
  if (profile.debuffTemplates.length > 0) kinds.push('debuff');
  if (profile.selfBuffTemplates.length > 0) kinds.push('buff');
  if (profile.attackTemplates.length > 0) kinds.push('attack');
  return kinds;
}

type UnitDamageVitality = Pick<
  Unit,
  'health' | 'maxHealth' | 'shield' | 'shieldTicks' | 'livingSeedPool' | 'role'
>;

function applyDamageToUnit(
  v: UnitDamageVitality,
  damage: number,
  naturalPerfectionRank: number,
): {
  health: number;
  shield: number;
  shieldTicks: number;
  livingSeedPool: number;
  tookHealthDamage: number;
  naturalPerfectionTick: 0 | 1;
} {
  if (damage <= 0) {
    return {
      health: Math.max(0, v.health),
      shield: v.shield,
      shieldTicks: v.shieldTicks,
      livingSeedPool: v.livingSeedPool,
      tookHealthDamage: 0,
      naturalPerfectionTick: 0,
    };
  }
  const hit = applyDamage(v.health, v.shield, damage);
  let hp = hit.health;
  let sh = hit.shield;
  let seed = v.livingSeedPool;
  let ticks = v.shieldTicks;
  if (sh <= 0) ticks = 0;
  if (hit.tookHealthDamage > 0 && seed > 0 && hp > 0) {
    hp = Math.min(v.maxHealth, hp + seed);
    seed = 0;
  }
  const naturalPerfectionTick: 0 | 1 =
    v.role === 'HEALER' && hit.tookHealthDamage > 0 && naturalPerfectionRank > 0 ? 1 : 0;
  return {
    health: hp,
    shield: sh,
    shieldTicks: ticks,
    livingSeedPool: seed,
    tookHealthDamage: hit.tookHealthDamage,
    naturalPerfectionTick,
  };
}

function applyAttackTemplate(
  party: Unit[],
  template: BossMechanicTemplate,
  dungeon: Dungeon,
  partyDamageMult: number,
  talents: Talent[],
  state: GameState,
  random: TickRandom,
): { party: Unit[]; naturalPerfectionAdd: number } {
  const targetIds = selectTargets(party, template.targeting, random);
  if (targetIds.size === 0) return { party, naturalPerfectionAdd: 0 };

  const tank = party.find((unit) => unit.role === 'TANK');
  const tankDead = !tank || tank.health <= 0;
  const baseMult =
    getBossDamageMultiplier(dungeon.difficulty) *
    (dungeon.endless ? getEndlessMultiplier(state.endlessStacks) : 1) *
    partyDamageMult *
    getDamageTakenMultiplier(state, { source: 'boss_attack' });
  const natRank = getRanks(talents, 'natural_perfection');
  let naturalPerfectionAdd = 0;

  const next = party.map((unit) => {
    if (unit.health <= 0 || !targetIds.has(unit.id)) return unit;
    let dmg =
      template.damage *
      baseMult *
      getLevelGapDamageMultiplier(unit.level, dungeon.levelMax);
    if (tankDead && (unit.role === 'DPS' || unit.role === 'HEALER')) dmg *= 2;
    const out = applyDamageToUnit(unit, dmg, natRank);
    if (out.naturalPerfectionTick) naturalPerfectionAdd = 1;
    return {
      ...unit,
      health: out.health,
      shield: out.shield,
      shieldTicks: out.shieldTicks,
      livingSeedPool: out.livingSeedPool,
    };
  });

  return { party: next, naturalPerfectionAdd };
}

export function processBossAI(
  state: GameState,
  random: TickRandom,
  now: number,
): {
  party: Unit[];
  bossEffects: StatusEffect[];
  countdownTicks: number;
  mechanicOrdinal: number;
  naturalPerfectionAdd: number;
} {
  let party = state.party;
  let naturalPerfectionAdd = 0;
  let bossEffects: StatusEffect[] = state.combatPhase === 'BOSS' ? [...state.bossEffects] : [];
  let countdownTicks = state.mechanicCooldown;
  let mechanicOrdinal = state.mechanicOrdinal;

  if (state.combatPhase === 'BOSS' && state.currentDungeon) {
    const profile = getCombatProfile(state.currentDungeon);
    const kinds = bossMechanicKinds(profile);
    if (kinds.length > 0) {
      countdownTicks -= 1;
      if (countdownTicks <= 0) {
        const partyDmgMultPre =
          bossEffects.length > 0 ? Math.max(...bossEffects.map((effect) => effect.multiplier ?? 1)) : 1;
        const L = kinds.length;
        const step = mechanicOrdinal % L;
        const kind = kinds[step];
        const cycle = Math.floor(mechanicOrdinal / L);
        mechanicOrdinal += 1;

        if (kind === 'debuff') {
          const nDebuff = profile.debuffTemplates.length;
          const di = cycle % nDebuff;
          party = applyDebuffTemplate(party, profile.debuffTemplates[di], now, random);
        } else if (kind === 'buff') {
          const nBuff = profile.selfBuffTemplates.length;
          const bi = cycle % nBuff;
          const tpl = profile.selfBuffTemplates[bi];
          const withoutSame = bossEffects.filter((effect) => effect.sourceId !== tpl.abilityId);
          bossEffects = [
            ...withoutSame,
            {
              id: generateCombatUid(tpl.abilityId, now, random),
              name: tpl.name,
              icon: tpl.icon,
              remainingTicks: tpl.durationTicks ?? 0,
              category: 'boss_aura',
              sourceId: tpl.abilityId,
              stacks: 1,
              multiplier: tpl.partyDamageMultiplier,
            },
          ];
        } else {
          const nAtk = profile.attackTemplates.length;
          const ai = cycle % nAtk;
          const atk = applyAttackTemplate(
            party,
            profile.attackTemplates[ai],
            state.currentDungeon,
            partyDmgMultPre,
            state.talents,
            state,
            random,
          );
          party = atk.party;
          naturalPerfectionAdd += atk.naturalPerfectionAdd;
        }
        countdownTicks = randomIntInclusive(
          profile.mechanicIntervalTicksMin,
          profile.mechanicIntervalTicksMax,
          random,
        );
      }
    }
  }

  return {
    party,
    bossEffects,
    countdownTicks,
    mechanicOrdinal,
    naturalPerfectionAdd,
  };
}

// Sub-system: Apply environmental damage and debuff ticks
function applyEnvironmentalDamageAndDebuffs(
  state: GameState,
  partyAfterBossAI: Unit[],
  bossDmgEffects: StatusEffect[],
  random: TickRandom,
): {
  party: Unit[];
  environmentalDamageDone: number;
} {
  const bossPartyDamageMult =
    state.combatPhase === 'BOSS' && bossDmgEffects.length > 0
      ? Math.max(...bossDmgEffects.map((effect) => effect.multiplier ?? 1))
      : 1;

  const envDmg = BALANCE.environmentalDamage;
  const ambientEvery = envDmg.ambientChipEveryTicks;
  const ambientBurst = envDmg.ambientChipDamageMultiplier;
  const allowAmbientChip = ambientEvery <= 1 || state.combatElapsedTicks % ambientEvery === 0;

  const newParty: Unit[] = [];

  for (let idx = 0; idx < partyAfterBossAI.length; idx++) {
    const unit = partyAfterBossAI[idx];
    let damage = 0;
    
    if (!state.isTutorialPaused) {
      const chance = random();
      const diff = state.currentDungeon?.difficulty || 1;
      if (allowAmbientChip) {
        if (unit.role === 'TANK' && chance < envDmg.tankProcChance)
          damage = (random() * envDmg.tankDamageRandomMax + diff) * ambientBurst;
        else if (chance < envDmg.nonTankProcChance)
          damage = (random() * envDmg.nonTankDamageRandomMax + diff) * ambientBurst;
      }

      if (state.combatPhase === 'BOSS' && state.currentDungeon) {
        damage *= getBossDamageMultiplier(state.currentDungeon.difficulty);
        damage *= bossPartyDamageMult;
      }
      if (state.currentDungeon?.endless) {
        damage *= getEndlessMultiplier(state.endlessStacks);
      }
      if (state.currentDungeon) {
        damage *= getLevelGapDamageMultiplier(unit.level, state.currentDungeon.levelMax);
      }
      damage *= getDamageTakenMultiplier(state, { source: 'trash_tick' });
    }

    const tankIndex = partyAfterBossAI.findIndex((u) => u.role === 'TANK');
    const tankHealthNow =
      tankIndex < 0
        ? 1
        : newParty[tankIndex] !== undefined
        ? newParty[tankIndex].health
        : partyAfterBossAI[tankIndex].health;
    if (tankHealthNow <= 0 && (unit.role === 'DPS' || unit.role === 'HEALER')) {
      damage *= 2;
    }

    let currentHealth = unit.health;
    let curShield = unit.shield;
    let curShieldTicks = unit.shieldTicks;
    let liveSeed = unit.livingSeedPool;
    const vit = applyDamageToUnit(
      {
        health: currentHealth,
        maxHealth: unit.maxHealth,
        shield: curShield,
        shieldTicks: curShieldTicks,
        livingSeedPool: liveSeed,
        role: unit.role,
      },
      damage,
      getRanks(state.talents, 'natural_perfection'),
    );
    currentHealth = vit.health;
    curShield = vit.shield;
    curShieldTicks = vit.shieldTicks;
    liveSeed = vit.livingSeedPool;

    // Process debuffs (harmful effects)
    const dotLevelMult = state.currentDungeon
      ? getLevelGapDamageMultiplier(unit.level, state.currentDungeon.levelMax)
      : 1;
    const activeEffects: StatusEffect[] = [];
    unit.effects.forEach((effect) => {
      if (effect.category === 'harmful' && effect.remainingTicks > 0) {
        let dot = (effect.valuePerTick ?? 0) * dotLevelMult;
        if (state.currentDungeon?.endless) {
          dot *= getEndlessMultiplier(state.endlessStacks);
        }
        currentHealth = Math.max(0, currentHealth - dot);
        const nextHarm = EffectManager.afterHarmfulDamageTick(effect);
        if (nextHarm) activeEffects.push(nextHarm);
      } else if (effect.category !== 'harmful') {
        activeEffects.push(effect);
      }
    });

    newParty.push({
      ...unit,
      health: currentHealth,
      shield: curShield,
      shieldTicks: curShieldTicks,
      livingSeedPool: liveSeed,
      effects: activeEffects,
    });
  }

  return { party: newParty, environmentalDamageDone: 0 };
}

// Sub-system: Handle shield decay
function handleShieldDecay(party: Unit[]): Unit[] {
  return party.map((unit) => {
    if (unit.shield > 0 && unit.shieldTicks > 0) {
      const newShieldTicks = unit.shieldTicks - 1;
      return {
        ...unit,
        shieldTicks: newShieldTicks,
        shield: newShieldTicks <= 0 ? 0 : unit.shield,
      };
    }
    return unit;
  });
}

// Sub-system: Calculate resource regen and player effects
function calculateResourceRegen(
  state: GameState,
  party: Unit[],
  hotManaReturn: number,
  playerEffects: StatusEffect[],
): {
  party: Unit[];
  newMana: number;
  playerEffects: StatusEffect[];
  internalCooldowns: Record<string, number>;
  capstoneForm: GameState['capstoneForm'];
  holyPower: number;
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  resourceTickHealEff: number;
  resourceTickHealOh: number;
} {
  let nextIcd = advanceInternalCooldowns(state.internalCooldowns);
  const lockTicksPre = getBuffTicks(state.playerEffects, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT);
  const spirit = state.playerClass !== null ? getPrimaryStats(state.playerClass, state.level).spirit : 0;
  const potionDrip = getPotionDrip(playerEffects);
  const regenThisTick =
    manaRegenAmountPerTick(lockTicksPre, spirit) +
    potionDrip +
    getGeneralManaReturn(state.maxMana, state.talents, lockTicksPre) +
    getManaReturn(state, lockTicksPre);
  const newManaRaw = Math.min(
    state.maxMana,
    state.mana + regenThisTick + hotManaReturn,
  );
  let pComb = tickBuffs(playerEffects);
  let holyPowerOut = state.holyPower;
  let newParty = party;
  let resourceTickHealEff = 0;
  let resourceTickHealOh = 0;
  let resourceTickFloatDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }> =
    [];
  let manaOut = newManaRaw;

  if (state.playerClass) {
    const strat = getClassStrategy(state.playerClass);
    const patch = strat.onResourceTick(
      {
        ...state,
        party: newParty,
        mana: newManaRaw,
        playerEffects: pComb,
        holyPower: holyPowerOut,
        internalCooldowns: nextIcd,
      },
      1,
    );
    if (patch.internalCooldowns !== undefined) nextIcd = patch.internalCooldowns;
    if (patch.mana !== undefined) manaOut = Math.min(state.maxMana, patch.mana);
    if (patch.holyPower !== undefined) holyPowerOut = Math.min(3, patch.holyPower);
    if (patch.playerEffects !== undefined) pComb = patch.playerEffects;
    if (patch.party !== undefined) newParty = patch.party;
    const rd = patch.resourceHealDelta;
    if (rd) {
      resourceTickHealEff += rd.eff;
      resourceTickHealOh += rd.oh;
      resourceTickFloatDrafts.push(...rd.drafts);
    }
  }

  pComb = addNaturalPerfection(pComb, 0);
  const nextForm = getCapstoneAfterTick(state.capstoneForm, pComb, state.playerClass);

  return {
    party: newParty,
    newMana: manaOut,
    playerEffects: pComb,
    internalCooldowns: nextIcd,
    capstoneForm: nextForm,
    holyPower: holyPowerOut,
    fctDrafts: resourceTickFloatDrafts,
    resourceTickHealEff,
    resourceTickHealOh,
  };
}

function processEnvironmentalTick(
  state: GameState,
  partyAfterBossAI: Unit[],
  bossDmgEffects: StatusEffect[],
  random: TickRandom,
  naturalPerfectionStacks: number,
): {
  party: Unit[];
  naturalPerfectionStacks: number;
  hotManaReturn: number;
  playerEffects: StatusEffect[];
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  tickHealEff: number;
  tickHealOh: number;
} {
  const envResult = applyEnvironmentalDamageAndDebuffs(state, partyAfterBossAI, bossDmgEffects, random);

  const hotResult = EffectManager.tickHelpfulHoTs(state, envResult.party, random);

  let party = handleShieldDecay(hotResult.party);

  let tickHealEff = hotResult.tickHealEff;
  let tickHealOh = hotResult.tickHealOh;

  return {
    party,
    naturalPerfectionStacks,
    hotManaReturn: hotResult.hotManaReturn,
    playerEffects: hotResult.playerEffects,
    fctDrafts: [...hotResult.fctDrafts],
    tickHealEff,
    tickHealOh,
  };
}

function mergeBossAiIntoState(state: GameState, boss: ReturnType<typeof processBossAI>): GameState {
  return {
    ...state,
    bossEffects: boss.bossEffects,
    mechanicCooldown: boss.countdownTicks,
    mechanicOrdinal: boss.mechanicOrdinal,
  };
}

function resolveEnvironmentalDamage(
  stateBeforeBossMerge: GameState,
  stateWithBoss: GameState,
  boss: ReturnType<typeof processBossAI>,
  random: TickRandom,
): {
  party: Unit[];
  naturalPerfectionStacks: number;
  hotManaReturn: number;
  playerEffects: StatusEffect[];
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  tickHealEff: number;
  tickHealOh: number;
} {
  const dmg = processEnvironmentalTick(
    stateWithBoss,
    boss.party,
    boss.bossEffects,
    random,
    Math.min(
      5,
      getNaturalPerfectionStacks(stateBeforeBossMerge.playerEffects) + boss.naturalPerfectionAdd,
    ),
  );
  const shieldOut = onShieldTransition(stateBeforeBossMerge, boss.party, dmg.party);
  const newParty = shieldOut.party;
  const transitionFloats = diffFloats(boss.party, newParty, false);
  return {
    party: newParty,
    naturalPerfectionStacks: dmg.naturalPerfectionStacks,
    hotManaReturn: dmg.hotManaReturn,
    playerEffects: dmg.playerEffects,
    fctDrafts: [...dmg.fctDrafts, ...transitionFloats],
    tickHealEff: dmg.tickHealEff + shieldOut.eff,
    tickHealOh: dmg.tickHealOh + shieldOut.oh,
  };
}

function tickBossEffects(
  combatPhase: GameState['combatPhase'],
  bossEffects: StatusEffect[],
): StatusEffect[] {
  if (combatPhase !== 'BOSS') return [];
  return EffectManager.tickSimpleDurations(bossEffects);
}

function advanceInternalCooldowns(icd: Record<string, number>): Record<string, number> {
  const nextIcd = { ...icd };
  Object.keys(nextIcd).forEach((k) => {
    if ((nextIcd[k] ?? 0) > 0) {
      nextIcd[k] = (nextIcd[k] ?? 0) - 1;
    }
  });
  return nextIcd;
}

function resolveFailure(
  state: GameState,
  newParty: Unit[],
  now: number,
): GameState | null {
  if (
    !newParty.every((unit) => unit.health <= 0) &&
    newParty.find((unit) => unit.role === 'HEALER')?.health !== 0
  ) {
    return null;
  }
  const d = state.currentDungeon;
  if (d) {
    const allDead = newParty.every((unit) => unit.health <= 0);
    const reason = allDead ? 'PARTY_WIPE' : 'HEALER_DOWN';
    const pullsCleared = TRASH_PACK_COUNT - state.trashPulls;
    const xpGained = Math.round(
      getDungeonFailureXp(d, state.level, pullsCleared) *
        dungeonPaceXpMultiplier(state.dungeonPace!),
    );
    const newXp = state.xp + xpGained;
    const meta = getMeta(newXp, state.playerClass, state.talents);
    const isLevelUp = meta.level > state.level;
    const rewards = isLevelUp
      ? levelUpRewardSummary(state.playerClass, state.talents, state.level, meta.level)
      : { upgradedSpellIds: [] as string[], upgradedPotion: false };
    let nextDiag = state.diagnostics;
    if (nextDiag) {
      const ticksTaken = state.combatElapsedTicks - nextDiag.lastPhaseStartTick;
      const msTaken = Math.max(0, now - nextDiag.lastPhaseStartTimeMs);
      const name = state.combatPhase === 'BOSS' ? (state.currentDungeon?.bossName ?? 'Boss') : `Trash ${TRASH_PACK_COUNT - state.trashPulls + 1}`;
      nextDiag = {
        ...nextDiag,
        events: [
          ...nextDiag.events,
          { phase: state.combatPhase, name, ticksElapsed: ticksTaken, realMsElapsed: msTaken, expectedMs: ticksTaken * (1000 / TICK_RATE) },
        ],
        totalRealMs: now - nextDiag.runStartTimeMs,
        totalExpectedMs: state.combatElapsedTicks * (1000 / TICK_RATE),
      };
      try {
        nextDiag.userAgent = navigator.userAgent;
      } catch (e) {}
    }

    return {
      ...state,
      party:
        state.playerClass !== null ? generateRandomParty(meta.level, state.playerClass) : state.party,
      xp: newXp,
      level: meta.level,
      talentPoints: meta.talentPoints,
      maxMana: meta.maxMana,
      mana: Math.min(meta.maxMana, state.mana),
      isCombatActive: false,
      currentDungeon: null,
      dungeonPace: null,
      playerEffects: [],
      bossEffects: [],
      mechanicCooldown: 0,
      mechanicOrdinal: 0,
      spellCooldowns: {},
      combatElapsedTicks: 0,
      combatFloats: [],
      endlessStacks: 0,
      dungeonOutcome: {
        kind: 'failure',
        dungeonName: d.name,
        reason,
        xpGained,
        levelUp: isLevelUp,
        levelAfter: meta.level,
        playerClass: state.playerClass,
        upgradedSpellIds: rewards.upgradedSpellIds,
        upgradedPotion: rewards.upgradedPotion,
        endlessWavesCleared: d.endless ? state.endlessStacks : undefined,
        postStats: dungeonPostStatsFromState(state),
        diagnostics: nextDiag ?? undefined,
      },
    };
  }
  return {
    ...state,
    party: newParty,
    isCombatActive: false,
    currentDungeon: null,
    dungeonPace: null,
    playerEffects: [],
    bossEffects: [],
    mechanicCooldown: 0,
    mechanicOrdinal: 0,
    spellCooldowns: {},
    combatElapsedTicks: 0,
    combatFloats: [],
    endlessStacks: 0,
    dungeonOutcome: null,
    diagnostics: null,
  };
}

function resolveOngoingCombat(
  state: GameState,
  sys: { party: Unit[]; newMana: number; playerEffects: StatusEffect[]; internalCooldowns: Record<string, number>; capstoneForm: CapstoneFormId | null; holyPower: number },
  boss: ReturnType<typeof processBossAI>,
  bossEffectsNext: StatusEffect[],
  random: TickRandom,
  dpsPaceMultiplier: number,
  now: number,
): GameState {
  const newParty = sys.party;
  const newMana = sys.newMana;
  const pComb = sys.playerEffects;
  const nextIcd = sys.internalCooldowns;
  const nextForm = sys.capstoneForm;

  const pd = BALANCE.partyDps;
  const partyDps = pd.base + Math.pow(state.level, pd.levelExponent) * pd.levelMultiplier;
  const inactiveDpsCount = newParty.filter((u) => u.role === 'DPS' && u.health <= 0).length;
  const bossDpsMult = state.combatPhase === 'BOSS' ? Math.pow(0.7, inactiveDpsCount) : 1;
  const effectivePartyDps = partyDps * bossDpsMult * dpsPaceMultiplier;
  let currentEnemyHealth = state.enemyHealth - effectivePartyDps;
  let newTrashPulls = state.trashPulls;
  let newPhase = state.combatPhase;
  let newEnemyMaxHealth = state.enemyMaxHealth;
  let mechCd = boss.countdownTicks;
  let mechOrdinal = boss.mechanicOrdinal;

  const trashHp =
    state.currentDungeon !== null ? Math.max(1, getTrashMaxHealth(state.currentDungeon)) : 1;

  let nextDiag = state.diagnostics;

  if (currentEnemyHealth <= 0) {
    if (nextDiag) {
      const ticksTaken = state.combatElapsedTicks - nextDiag.lastPhaseStartTick;
      const msTaken = Math.max(0, now - nextDiag.lastPhaseStartTimeMs);
      const name = state.combatPhase === 'BOSS' ? (state.currentDungeon?.bossName ?? 'Boss') : `Trash ${TRASH_PACK_COUNT - state.trashPulls + 1}`;
      nextDiag = {
        ...nextDiag,
        lastPhaseStartTimeMs: now,
        lastPhaseStartTick: state.combatElapsedTicks,
        events: [
          ...nextDiag.events,
          { phase: state.combatPhase, name, ticksElapsed: ticksTaken, realMsElapsed: msTaken, expectedMs: ticksTaken * (1000 / TICK_RATE) },
        ],
      };
    }

    if (state.combatPhase === 'TRASH') {
      newTrashPulls -= 1;
      if (newTrashPulls > 0) {
        currentEnemyHealth = trashHp;
        newEnemyMaxHealth = trashHp;
      } else {
        newPhase = 'BOSS';
        const bossHp = Math.max(1, state.currentDungeon?.bossHealth || 1000);
        currentEnemyHealth = bossHp;
        newEnemyMaxHealth = bossHp;
        const dung = state.currentDungeon;
        if (dung) {
          const prof = getCombatProfile(dung);
          mechCd = randomIntInclusive(
            prof.mechanicIntervalTicksMin,
            prof.mechanicIntervalTicksMax,
            random,
          );
          mechOrdinal = 0;
        }
      }
    } else {
      const d = state.currentDungeon;
      if (d?.endless) {
        const nextStacks = state.endlessStacks + 1;
        const pool = endlessBossPool(state.level);
        const source = pool[Math.floor(random() * pool.length)];
        const nextDungeon = buildEndlessWaveDungeon(getEndlessTemplate(), source, nextStacks);
        const waveXp = Math.round(
          getDungeonXp(source, state.level) *
            BALANCE.endless.bossKillXpFraction *
            dungeonPaceXpMultiplier(state.dungeonPace!),
        );
        const newXp = state.xp + waveXp;
        const meta = getMeta(newXp, state.playerClass, state.talents);
        const leveled = meta.level > state.level;
        const nextParty =
          leveled && state.playerClass
            ? generateRandomParty(meta.level, state.playerClass)
            : newParty;
        const trashHpNext = getTrashMaxHealth(nextDungeon);
        const profNext = getCombatProfile(nextDungeon);
        const mechCdNext = randomIntInclusive(
          profNext.mechanicIntervalTicksMin,
          profNext.mechanicIntervalTicksMax,
          random,
        );
        const tickMana = Math.min(meta.maxMana, newMana);
        return finalizeTickState(
          {
            ...state,
            ...meta,
            mana: tickMana,
            party: nextParty,
            currentDungeon: nextDungeon,
            endlessStacks: nextStacks,
            combatPhase: 'TRASH',
            trashPulls: TRASH_PACK_COUNT,
            enemyHealth: trashHpNext,
            enemyMaxHealth: trashHpNext,
            bossEffects: [],
            mechanicCooldown: mechCdNext,
            mechanicOrdinal: 0,
            isCombatActive: true,
            playerEffects: pComb,
            capstoneForm: nextForm,
            internalCooldowns: nextIcd,
            holyPower: sys.holyPower,
          },
          tickMana,
        );
      }
      const xpGained = d
        ? Math.round(
            getDungeonXp(d, state.level) * dungeonPaceXpMultiplier(state.dungeonPace!),
          )
        : 0;
      const newXp = state.xp + xpGained;
      const meta = getMeta(newXp, state.playerClass, state.talents);
      const isLevelUp = meta.level > state.level;
      const rewards = isLevelUp
        ? levelUpRewardSummary(state.playerClass, state.talents, state.level, meta.level)
        : { upgradedSpellIds: [] as string[], upgradedPotion: false };
      const dungeonId = d?.id ?? '';
      const completedDungeonIds =
        dungeonId && d && !d.endless && !state.completedDungeonIds.includes(dungeonId)
          ? [...state.completedDungeonIds, dungeonId]
          : state.completedDungeonIds;
      if (nextDiag) {
        nextDiag.totalRealMs = now - nextDiag.runStartTimeMs;
        nextDiag.totalExpectedMs = state.combatElapsedTicks * (1000 / TICK_RATE);
        try {
          nextDiag.userAgent = navigator.userAgent;
        } catch (e) {}
      }

      return {
        ...state,
        xp: newXp,
        level: meta.level,
        talentPoints: meta.talentPoints,
        dungeonProgress: 100,
        isCombatActive: false,
        currentDungeon: null,
        dungeonPace: null,
        playerEffects: [],
        bossEffects: [],
        mechanicCooldown: 0,
        mechanicOrdinal: 0,
        spellCooldowns: {},
        completedDungeonIds,
        maxMana: meta.maxMana,
        mana: Math.min(meta.maxMana, state.mana),
        party: state.playerClass !== null ? generateRandomParty(meta.level, state.playerClass) : state.party,
        combatFloats: [],
        endlessStacks: 0,
        dungeonOutcome: d
          ? {
              kind: 'success',
              successFlavor: 'dungeon',
              dungeonName: d.name,
              bossName: d.bossName,
              xpGained,
              levelUp: isLevelUp,
              levelAfter: meta.level,
              playerClass: state.playerClass,
              upgradedSpellIds: rewards.upgradedSpellIds,
              upgradedPotion: rewards.upgradedPotion,
              postStats: dungeonPostStatsFromState(state),
              diagnostics: nextDiag ?? undefined,
            }
          : null,
      };
    }
  }

  return finalizeTickState(
    {
      ...state,
      party: newParty,
      trashPulls: newTrashPulls,
      combatPhase: newPhase,
      enemyHealth: currentEnemyHealth,
      enemyMaxHealth: newEnemyMaxHealth,
      bossEffects: newPhase === 'BOSS' ? bossEffectsNext : [],
      playerEffects: pComb,
      capstoneForm: nextForm,
      internalCooldowns: nextIcd,
      mechanicCooldown: mechCd,
      mechanicOrdinal: mechOrdinal,
      holyPower: sys.holyPower,
      diagnostics: nextDiag,
    },
    newMana,
  );
}

// ---------- Main advanceTick function ----------

export function advanceTick(
  state: GameState,
  random: TickRandom,
  now: number,
  dpsMultiplierOverride?: number,
): GameState {
  if (!state.isCombatActive) return state;

  const combatElapsedTicks = state.combatElapsedTicks + 1;
  let floats = pruneFloats(state.combatFloats, combatElapsedTicks);
  const st = { ...state, combatElapsedTicks };

  const dpsPaceMultiplier =
    dpsMultiplierOverride !== undefined
      ? dpsMultiplierOverride
      : st.dungeonPace !== null
      ? dungeonPaceDpsMultiplier(st.dungeonPace)
      : 1;

  const boss = processBossAI(st, random, now);
  const stateWithBoss = mergeBossAiIntoState(st, boss);
  
  const {
    party: partyAfterEnv,
    naturalPerfectionStacks,
    hotManaReturn,
    playerEffects,
    fctDrafts: envFctDrafts,
    tickHealEff,
    tickHealOh,
  } = resolveEnvironmentalDamage(st, stateWithBoss, boss, random);
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, envFctDrafts);
  
  const bossEffectsNext = tickBossEffects(st.combatPhase, boss.bossEffects);
  let stAcc: GameState = {
    ...st,
    runHealEff: st.runHealEff + tickHealEff,
    runHealOh: st.runHealOh + tickHealOh,
  };
  
  const sys = resolvePlayerSystems(stAcc, partyAfterEnv, naturalPerfectionStacks, hotManaReturn, playerEffects);
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, sys.fctDrafts);
  stAcc = {
    ...stAcc,
    runHealEff: stAcc.runHealEff + sys.resourceTickHealEff,
    runHealOh: stAcc.runHealOh + sys.resourceTickHealOh,
  };
  
  const fail = resolveFailure(stAcc, sys.party, now);
  if (fail) return { ...fail, combatFloats: [] };
  
  return {
    ...resolveOngoingCombat(stAcc, sys, boss, bossEffectsNext, random, dpsPaceMultiplier, now),
    combatFloats: floats,
  };
}

function resolvePlayerSystems(
  state: GameState,
  party: Unit[],
  naturalPerfectionStacks: number,
  hotManaReturn: number,
  playerEffects: StatusEffect[],
) {
  const res = calculateResourceRegen(state, party, hotManaReturn, playerEffects);

  let nextEffects = res.playerEffects;
  if (naturalPerfectionStacks > 0) {
    nextEffects = addNaturalPerfection(nextEffects, naturalPerfectionStacks);
  }

  return {
    ...res,
    playerEffects: nextEffects,
  };
}

function dungeonPostStatsFromState(state: GameState): DungeonRunPostStats {
  const sec = Math.max(0.001, state.combatElapsedTicks / (TICK_RATE / 1000));
  const effectiveHealing = state.runHealEff;
  const overhealing = state.runHealOh;
  const raw = effectiveHealing + overhealing;
  return {
    totalHealing: effectiveHealing,
    hps: effectiveHealing / sec,
    overhealPct: raw > 0 ? (100 * overhealing) / raw : 0,
    hpm: state.runManaSpent > 0 ? effectiveHealing / state.runManaSpent : 0,
  };
}

function getDungeonXp(dungeon: Dungeon, playerLevel: number): number {
  const base = dungeon.baseXp ?? 100;
  const tier = dungeon.difficulty;
  const levelsOver = Math.max(0, playerLevel - dungeon.levelMax);
  return Math.max(
    0,
    Math.round(base * Math.pow(BALANCE.xp.overlevelDiminishingBase, levelsOver)),
  );
}

function getDungeonFailureXp(
  dungeon: Dungeon,
  playerLevel: number,
  pullsCleared: number,
): number {
  const full = getDungeonXp(dungeon, playerLevel);
  const x = BALANCE.xp;
  let fraction = 0;
  if (pullsCleared >= TRASH_PACK_COUNT) fraction = x.failureFractionWhenAllTrashCleared;
  else if (pullsCleared === 2) fraction = x.failureFractionWhenTwoPullsCleared;
  else if (pullsCleared === 1) fraction = x.failureFractionWhenOnePullCleared;
  return Math.round(full * fraction);
}

function finalizeTickState(s: GameState, newMana: number): GameState {
  let newProgress = s.dungeonProgress;
  const trashHp =
    s.currentDungeon !== null ? Math.max(1, getTrashMaxHealth(s.currentDungeon)) : 1;
  if (s.combatPhase === 'TRASH') {
    const pullProgress = (TRASH_PACK_COUNT - s.trashPulls) * 25;
    const trashCap = s.enemyMaxHealth > 0 ? s.enemyMaxHealth : trashHp;
    const currentPullPercent =
      trashCap > 0 ? Math.max(0, (trashCap - s.enemyHealth) / trashCap) * 25 : 0;
    newProgress = Math.min(75, pullProgress + currentPullPercent);
  } else {
    const bossMax = s.enemyMaxHealth > 0 ? s.enemyMaxHealth : 1;
    const bossPercent = Math.max(0, (bossMax - s.enemyHealth) / bossMax) * 25;
    newProgress = 75 + bossPercent;
  }

  return {
    ...s,
    dungeonProgress: newProgress,
    mana: newMana,
  };
}
