import {
  GameState,
  Unit,
  Buff,
  PartyDebuff,
  BossSelfBuff,
  BossCombatProfile,
  BossDebuffTemplate,
  BossAttackTemplate,
  Dungeon,
  Talent,
  DungeonFailureReason,
  DungeonRunPostStats,
} from './types.ts';
import {
  TRASH_PACK_COUNT,
  TICKS_PER_SECOND,
  manaRegenAmountPerTick,
  getBossDamageMultiplier,
  getLevelGapDamageMultiplier,
  getTrashMaxHealth,
  getCombatProfile,
  generateRandomParty,
  dungeonPaceDpsMultiplier,
  dungeonPaceXpMultiplier,
  getEndlessMultiplier,
} from './constants.ts';
import { buildEndlessWaveDungeon, endlessBossPool, getEndlessTemplate } from './dungeons/index.ts';
import {
  applyDamage,
  getRanks,
  hasBuff,
  isReady,
  addBuff,
  tickBuffs,
  ICD_SPIRIT_REDEMPTION,
  getPotionDrip,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  getBuffTicks,
  getNaturalPerfectionStacks,
  getCapstoneAfterTick,
  addNaturalPerfection,
  getGeneralManaReturn,
} from './talentMechanics.ts';
import { getPrimaryStats } from './playerStats.ts';
import { T_SPIRIT_AMP } from './combatHelper.ts';
import { GRACE_SOURCE_ID } from './auraConfig.ts';
import {
  getDamageTakenMultiplier,
  getHotTickAmount,
  getHotTickManaReturn,
  getHotTickRateMultiplier,
  onShieldTransition,
  getSelfHealOnDamage,
  getManaReturn,
} from './combatHookRegistry.ts';
import { ClassRegistry } from './classes/index.ts';
import { BALANCE } from './constants.ts';
import {
  appendFloatingCombatDrafts,
  diffFloats,
  pruneFloats,
} from './floatingCombatText.ts';
import { getHealSplit } from './healMath.ts';
import {
  getMeta,
  computeDungeonXpGain,
  computeDungeonFailureXpGain,
  levelUpRewardSummary,
} from './gameStorage.ts';
import { generateCombatUid } from './combatUid.ts';

export type TickRandom = () => number;

function dungeonPostStatsFromState(state: GameState): DungeonRunPostStats {
  const sec = Math.max(0.001, state.combatElapsedTicks / TICKS_PER_SECOND);
  const eff = state.dungeonRunHealEffective;
  const oh = state.dungeonRunHealOverheal;
  const raw = eff + oh;
  return {
    totalHealing: eff,
    hps: eff / sec,
    overhealPct: raw > 0 ? (100 * oh) / raw : 0,
    hpm: state.dungeonRunManaSpentHealing > 0 ? eff / state.dungeonRunManaSpentHealing : 0,
  };
}

function randomIntInclusive(min: number, max: number, random: TickRandom): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function applyDebuffTemplate(
  party: Unit[],
  template: BossDebuffTemplate,
  now: number,
  random: TickRandom,
): Unit[] {
  const livingIds = party.filter((u) => u.health > 0).map((u) => u.id);
  if (livingIds.length === 0) return party;

  const addToUnit = (units: Unit[], unitId: string): Unit[] =>
    units.map((u) => {
      if (u.id !== unitId) return u;
      const debuff: PartyDebuff = {
        id: generateCombatUid(`${template.abilityId}-${unitId}`, now, random),
        name: template.name,
        remainingTicks: template.durationTicks,
        damagePerTick: template.damagePerTick,
        icon: template.icon,
        sourceAbilityId: template.abilityId,
        dispellable: template.dispellable,
      };
      return { ...u, debuffs: [debuff] };
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
  targeting: BossAttackTemplate['targeting'],
  random: TickRandom,
): Set<string> {
  const livingIds = party.filter((u) => u.health > 0).map((u) => u.id);
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
  'health' | 'maxHealth' | 'shield' | 'shieldTicksRemaining' | 'livingSeedPool' | 'role'
>;

function applyDamageToUnit(
  v: UnitDamageVitality,
  damage: number,
  naturalPerfectionRank: number,
): {
  health: number;
  shield: number;
  shieldTicksRemaining: number;
  livingSeedPool: number;
  tookHealthDamage: number;
  naturalPerfectionTick: 0 | 1;
} {
  if (damage <= 0) {
    return {
      health: Math.max(0, v.health),
      shield: v.shield,
      shieldTicksRemaining: v.shieldTicksRemaining,
      livingSeedPool: v.livingSeedPool,
      tookHealthDamage: 0,
      naturalPerfectionTick: 0,
    };
  }
  const hit = applyDamage(v.health, v.shield, damage);
  let hp = hit.health;
  let sh = hit.shield;
  let seed = v.livingSeedPool;
  let ticks = v.shieldTicksRemaining;
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
    shieldTicksRemaining: ticks,
    livingSeedPool: seed,
    tookHealthDamage: hit.tookHealthDamage,
    naturalPerfectionTick,
  };
}

function applyAttackTemplate(
  party: Unit[],
  template: BossAttackTemplate,
  dungeon: Dungeon,
  partyDamageMult: number,
  talents: Talent[],
  state: GameState,
  random: TickRandom,
): { party: Unit[]; naturalPerfectionAdd: number } {
  const targetIds = selectTargets(party, template.targeting, random);
  if (targetIds.size === 0) return { party, naturalPerfectionAdd: 0 };

  const tank = party.find((u) => u.role === 'TANK');
  const tankDead = !tank || tank.health <= 0;
  const baseMult =
    getBossDamageMultiplier(dungeon.difficulty) *
    (dungeon.endless ? getEndlessMultiplier(state.endlessStacks) : 1) *
    partyDamageMult *
    getDamageTakenMultiplier(state, { source: 'boss_attack' });
  const natRank = getRanks(talents, 'natural_perfection');
  let naturalPerfectionAdd = 0;

  const next = party.map((u) => {
    if (u.health <= 0 || !targetIds.has(u.id)) return u;
    let dmg =
      template.damage *
      baseMult *
      getLevelGapDamageMultiplier(u.level, dungeon.levelMax);
    if (tankDead && (u.role === 'DPS' || u.role === 'HEALER')) dmg *= 2;
    const out = applyDamageToUnit(u, dmg, natRank);
    if (out.naturalPerfectionTick) naturalPerfectionAdd = 1;
    return {
      ...u,
      health: out.health,
      shield: out.shield,
      shieldTicksRemaining: out.shieldTicksRemaining,
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
  bossSelfBuffs: BossSelfBuff[];
  countdownTicks: number;
  mechanicOrdinal: number;
  naturalPerfectionAdd: number;
} {
  let party = state.party;
  let naturalPerfectionAdd = 0;
  let bossBuffs: BossSelfBuff[] = state.combatPhase === 'BOSS' ? [...state.bossSelfBuffs] : [];
  let countdownTicks = state.mechanicCooldown;
  let mechanicOrdinal = state.mechanicOrdinal;

  if (state.combatPhase === 'BOSS' && state.currentDungeon) {
    const profile = getCombatProfile(state.currentDungeon);
    const kinds = bossMechanicKinds(profile);
    if (kinds.length > 0) {
      countdownTicks -= 1;
      if (countdownTicks <= 0) {
        const partyDmgMultPre =
          bossBuffs.length > 0 ? Math.max(...bossBuffs.map((b) => b.partyDamageMultiplier)) : 1;
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
          const withoutSame = bossBuffs.filter((b) => b.sourceAbilityId !== tpl.abilityId);
          bossBuffs = [
            ...withoutSame,
            {
              id: generateCombatUid(tpl.abilityId, now, random),
              name: tpl.name,
              remainingTicks: tpl.durationTicks,
              partyDamageMultiplier: tpl.partyDamageMultiplier,
              icon: tpl.icon,
              sourceAbilityId: tpl.abilityId,
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
    bossSelfBuffs: bossBuffs,
    countdownTicks,
    mechanicOrdinal,
    naturalPerfectionAdd,
  };
}

export function advanceBossSpikeSimTick(
  state: GameState,
  random: TickRandom,
  now: number,
): { state: GameState; tankDamageThisTick: number } {
  if (state.combatPhase !== 'BOSS' || !state.currentDungeon) {
    throw new Error('advanceBossSpikeSimTick requires BOSS phase and currentDungeon');
  }
  const combatElapsedTicks = state.combatElapsedTicks + 1;
  const st = { ...state, combatElapsedTicks };
  const tankBefore = st.party.find((u) => u.role === 'TANK');
  const vit0 = (tankBefore?.health ?? 0) + (tankBefore?.shield ?? 0);
  const boss = processBossAI(st, random, now);
  const merged = mergeBossAiIntoState(st, boss);
  const afterEnv = resolveEnvironmentalDamage(st, merged, boss, random);
  const tankAfter = afterEnv.party.find((u) => u.role === 'TANK');
  const vit1 = (tankAfter?.health ?? 0) + (tankAfter?.shield ?? 0);
  const tankDamageThisTick = Math.max(0, vit0 - vit1);
  const bossBuffsNext = tickBossBuffs(st.combatPhase, boss.bossSelfBuffs);
  let spikeFloats = pruneFloats(state.floatingCombatTexts, combatElapsedTicks);
  spikeFloats = appendFloatingCombatDrafts(spikeFloats, combatElapsedTicks, afterEnv.fctDrafts);
  return {
    state: {
      ...merged,
      party: afterEnv.party,
      bossSelfBuffs: bossBuffsNext,
      floatingCombatTexts: spikeFloats,
      dungeonRunHealEffective: st.dungeonRunHealEffective + afterEnv.tickHealEff,
      dungeonRunHealOverheal: st.dungeonRunHealOverheal + afterEnv.tickHealOh,
    },
    tankDamageThisTick,
  };
}

function processEnvironmentalTick(
  state: GameState,
  partyAfterBossAI: Unit[],
  bossSelfBuffsForPartyDamageMult: BossSelfBuff[],
  random: TickRandom,
  naturalPerfectionStacks: number,
): {
  party: Unit[];
  naturalPerfectionStacks: number;
  manaReturnFromHotTicks: number;
  envPlayerCombatBuffs: GameState['playerCombatBuffs'];
  paladinResolveMana: number;
  paladinResolveHolyPower: number;
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  envHealEff: number;
  envHealOh: number;
} {
  const bossPartyDamageMult =
    state.combatPhase === 'BOSS' && bossSelfBuffsForPartyDamageMult.length > 0
      ? Math.max(...bossSelfBuffsForPartyDamageMult.map((b) => b.partyDamageMultiplier))
      : 1;

  const tankIndex = partyAfterBossAI.findIndex((u) => u.role === 'TANK');
  const newParty: Unit[] = [];
  let nextNat = naturalPerfectionStacks;
  let manaFromHotTicks = 0;
  let envPlayerCombatBuffs = state.playerCombatBuffs;
  let paladinResolveMana = 0;
  let paladinResolveHolyPower = 0;
  let envHealEff = 0;
  let envHealOh = 0;
  const hotTickFloatDrafts: Array<{
    unitId: string;
    amount: number;
    kind: 'heal' | 'absorb';
    crit: boolean;
  }> = [];
  const natRank = getRanks(state.talents, 'natural_perfection');
  const PAL = BALANCE.combat.paladin;
  const envDmg = BALANCE.environmentalDamage;
  const ambientEvery = envDmg.ambientChipEveryTicks;
  const ambientBurst = envDmg.ambientChipDamageMultiplier;
  const allowAmbientChip = ambientEvery <= 1 || state.combatElapsedTicks % ambientEvery === 0;

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
    let curShieldTicks = unit.shieldTicksRemaining;
    let liveSeed = unit.livingSeedPool;
    const vit = applyDamageToUnit(
      {
        health: currentHealth,
        maxHealth: unit.maxHealth,
        shield: curShield,
        shieldTicksRemaining: curShieldTicks,
        livingSeedPool: liveSeed,
        role: unit.role,
      },
      damage,
      natRank,
    );
    currentHealth = vit.health;
    curShield = vit.shield;
    curShieldTicks = vit.shieldTicksRemaining;
    liveSeed = vit.livingSeedPool;
    if (vit.naturalPerfectionTick) {
      nextNat = Math.min(5, nextNat + 1);
    }
    if (unit.role === 'HEALER' && vit.tookHealthDamage > 0) {
      const rawBk = getSelfHealOnDamage(state, vit.tookHealthDamage);
      const bk = getHealSplit(currentHealth, unit.maxHealth, rawBk);
      envHealEff += bk.eff;
      envHealOh += bk.oh;
      currentHealth = Math.min(unit.maxHealth, currentHealth + rawBk);
    }
    if (state.playerClass === 'PALADIN' && unit.role === 'HEALER' && vit.tookHealthDamage > 0) {
      paladinResolveMana += vit.tookHealthDamage * PAL.passiveLightbringerEnvDamageManaPerHp;
      if (random() < PAL.passiveLightbringerEnvDamageHolyPowerChance) {
        paladinResolveHolyPower += 1;
      }
    }

    const dotLevelMult = state.currentDungeon
      ? getLevelGapDamageMultiplier(unit.level, state.currentDungeon.levelMax)
      : 1;
    const activeDebuffs: PartyDebuff[] = [];
    unit.debuffs.forEach((d) => {
      if (d.remainingTicks > 0) {
        let dot = d.damagePerTick * dotLevelMult;
        if (state.currentDungeon?.endless) {
          dot *= getEndlessMultiplier(state.endlessStacks);
        }
        currentHealth = Math.max(0, currentHealth - dot);
        activeDebuffs.push({ ...d, remainingTicks: d.remainingTicks - 1 });
      }
    });

    const hpBeforeBuffTick = currentHealth;
    const activeBuffs: Buff[] = [];
    unit.buffs.forEach((buff) => {
      if (buff.remainingTicks <= 0) return;
      if (buff.sourceSpellId === GRACE_SOURCE_ID) {
        const nr = buff.remainingTicks - 1;
        if (nr > 0) activeBuffs.push({ ...buff, remainingTicks: nr });
        return;
      }
      const hpTick = buff.healingPerTick;
      let tickAcc =
        (buff.tickAccumulator ?? 0) +
        (buff.tickIntervalScale ?? 1) * getHotTickRateMultiplier({ state, unit, buff, healPerTick: hpTick });
      let rem = buff.remainingTicks;
      while (tickAcc >= 1 && rem > 0 && hpTick > 0) {
        tickAcc -= 1;
        const tickCtx = {
          state,
          unit,
          buff,
          healPerTick: hpTick,
        };
        const tickAmt = getHotTickAmount(tickCtx);
        if (currentHealth > 0) {
          const ht = getHealSplit(currentHealth, unit.maxHealth, tickAmt);
          envHealEff += ht.eff;
          envHealOh += ht.oh;
          currentHealth = Math.min(unit.maxHealth, currentHealth + tickAmt);
        }
        manaFromHotTicks += getHotTickManaReturn({
          ...tickCtx,
          appliedTickHeal: tickAmt,
        });
        const hooks = state.playerClass ? ClassRegistry.getHooks(state.playerClass) : null;
        if (hooks?.rollOmenOfClarityOnHotTick) {
          envPlayerCombatBuffs = hooks.rollOmenOfClarityOnHotTick(
            state,
            tickAmt,
            buff.sourceSpellId,
            envPlayerCombatBuffs,
            random,
          );
        }
      }
      rem -= 1;
      if (rem <= 0 && buff.bloomBurstHeal && currentHealth > 0) {
        const bl = getHealSplit(currentHealth, unit.maxHealth, buff.bloomBurstHeal);
        envHealEff += bl.eff;
        envHealOh += bl.oh;
        currentHealth = Math.min(unit.maxHealth, currentHealth + buff.bloomBurstHeal);
      }
      if (rem > 0) {
        activeBuffs.push({
          ...buff,
          remainingTicks: rem,
          tickAccumulator: tickAcc,
        });
      }
    });

    const buffHealGain = currentHealth - hpBeforeBuffTick;
    if (buffHealGain > 0) {
      hotTickFloatDrafts.push({
        unitId: unit.id,
        amount: buffHealGain,
        kind: 'heal',
        crit: false,
      });
    }

    if (curShield > 0 && curShieldTicks > 0) {
      curShieldTicks -= 1;
      if (curShieldTicks <= 0) {
        curShield = 0;
      }
    }

    newParty.push({
      ...unit,
      health: currentHealth,
      buffs: activeBuffs,
      debuffs: activeDebuffs,
      shield: curShield,
      shieldTicksRemaining: curShieldTicks,
      livingSeedPool: liveSeed,
    });
  }

  return {
    party: newParty,
    naturalPerfectionStacks: nextNat,
    manaReturnFromHotTicks: manaFromHotTicks,
    envPlayerCombatBuffs,
    paladinResolveMana,
    paladinResolveHolyPower,
    fctDrafts: hotTickFloatDrafts,
    envHealEff,
    envHealOh,
  };
}

function mergeBossAiIntoState(state: GameState, boss: ReturnType<typeof processBossAI>): GameState {
  return {
    ...state,
    bossSelfBuffs: boss.bossSelfBuffs,
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
  manaReturnFromHotTicks: number;
  envPlayerCombatBuffs: GameState['playerCombatBuffs'];
  paladinResolveMana: number;
  paladinResolveHolyPower: number;
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  tickHealEff: number;
  tickHealOh: number;
} {
  const dmg = processEnvironmentalTick(
    stateWithBoss,
    boss.party,
    boss.bossSelfBuffs,
    random,
    Math.min(
      5,
      getNaturalPerfectionStacks(stateBeforeBossMerge.playerCombatBuffs) + boss.naturalPerfectionAdd,
    ),
  );
  const shieldOut = onShieldTransition(stateBeforeBossMerge, boss.party, dmg.party);
  const newParty = shieldOut.party;
  const transitionDrafts = diffFloats(dmg.party, newParty, false);
  return {
    party: newParty,
    naturalPerfectionStacks: dmg.naturalPerfectionStacks,
    manaReturnFromHotTicks: dmg.manaReturnFromHotTicks,
    envPlayerCombatBuffs: dmg.envPlayerCombatBuffs,
    paladinResolveMana: dmg.paladinResolveMana,
    paladinResolveHolyPower: dmg.paladinResolveHolyPower,
    fctDrafts: [...dmg.fctDrafts, ...transitionDrafts],
    tickHealEff: dmg.envHealEff + shieldOut.eff,
    tickHealOh: dmg.envHealOh + shieldOut.oh,
  };
}

function tickBossBuffs(
  combatPhase: GameState['combatPhase'],
  bossSelfBuffs: BossSelfBuff[],
): BossSelfBuff[] {
  if (combatPhase !== 'BOSS') return [];
  return bossSelfBuffs
    .map((b) => ({ ...b, remainingTicks: b.remainingTicks - 1 }))
    .filter((b) => b.remainingTicks > 0);
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

type PlayerSystemsAfterDamage = {
  party: Unit[];
  newMana: number;
  playerCombatBuffs: GameState['playerCombatBuffs'];
  internalCooldowns: Record<string, number>;
  capstoneForm: GameState['capstoneForm'];
  holyPower: number;
  fctDrafts: Array<{ unitId: string; amount: number; kind: 'heal' | 'absorb'; crit: boolean }>;
  natureGraceEff: number;
  natureGraceOh: number;
};

function resolvePlayerSystems(
  state: GameState,
  partyAfterEnv: Unit[],
  dmgNaturalPerfectionStacks: number,
  manaReturnFromHotTicks: number,
  envPlayerCombatBuffs: GameState['playerCombatBuffs'],
  paladinResolveMana: number,
  paladinResolveHolyPower: number,
): PlayerSystemsAfterDamage {
  let nextIcd = advanceInternalCooldowns(state.internalCooldowns);
  const lockTicksPre = getBuffTicks(
    state.playerCombatBuffs,
    PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  );
  const spirit =
    state.playerClass !== null ? getPrimaryStats(state.playerClass, state.level).spirit : 0;
  const potionDrip = getPotionDrip(state.playerCombatBuffs);
  const regenThisTick =
    manaRegenAmountPerTick(lockTicksPre, spirit) +
    potionDrip +
    getGeneralManaReturn(state.maxMana, state.talents, lockTicksPre) +
    getManaReturn(state, lockTicksPre);
  const newMana = Math.min(
    state.maxMana,
    state.mana + regenThisTick + manaReturnFromHotTicks + paladinResolveMana,
  );
  let pComb = tickBuffs(envPlayerCombatBuffs);
  const nextHolyPower = Math.min(3, state.holyPower + paladinResolveHolyPower);
  let newParty = partyAfterEnv;
  let graceFloatDrafts: Array<{
    unitId: string;
    amount: number;
    kind: 'heal' | 'absorb';
    crit: boolean;
  }> = [];
  const healerB = newParty.find((u) => u.role === 'HEALER');
  if (
    state.playerClass &&
    healerB &&
    getRanks(state.talents, 'spirit_of_redemption') > 0 &&
    healerB.health < healerB.maxHealth * 0.3 &&
    isReady(nextIcd, 'spirit_redemption') &&
    !hasBuff(pComb, 'spirit_of_redemption_amp')
  ) {
    pComb = addBuff(pComb, 'spirit_of_redemption_amp', T_SPIRIT_AMP, 1);
    nextIcd = { ...nextIcd, spirit_redemption: ICD_SPIRIT_REDEMPTION };
  }
  let natureGraceEff = 0;
  let natureGraceOh = 0;
  if (
    state.capstoneForm === 'druid_natures_grace' &&
    hasBuff(state.playerCombatBuffs, 'natures_grace_aura') &&
    state.playerClass
  ) {
    const beforeGrace = newParty;
    const ngh = 0.4 * state.level;
    newParty = newParty.map((u) => {
      if (u.health <= 0) return u;
      const ng = getHealSplit(u.health, u.maxHealth, ngh);
      natureGraceEff += ng.eff;
      natureGraceOh += ng.oh;
      return { ...u, health: Math.min(u.maxHealth, u.health + ngh) };
    });
    graceFloatDrafts = diffFloats(beforeGrace, newParty, false);
  }
  pComb = addNaturalPerfection(pComb, dmgNaturalPerfectionStacks);
  const nextForm = getCapstoneAfterTick(state.capstoneForm, pComb, state.playerClass);
  return {
    party: newParty,
    newMana,
    playerCombatBuffs: pComb,
    internalCooldowns: nextIcd,
    capstoneForm: nextForm,
    holyPower: nextHolyPower,
    fctDrafts: graceFloatDrafts,
    natureGraceEff,
    natureGraceOh,
  };
}

function resolveFailure(
  state: GameState,
  newParty: Unit[],
  now: number,
): GameState | null {
  if (
    !newParty.every((u) => u.health <= 0) &&
    newParty.find((u) => u.role === 'HEALER')?.health !== 0
  ) {
    return null;
  }
  const d = state.currentDungeon;
  if (d) {
    const allDead = newParty.every((u) => u.health <= 0);
    const reason: DungeonFailureReason = allDead ? 'PARTY_WIPE' : 'HEALER_DOWN';
    const pullsCleared = TRASH_PACK_COUNT - state.trashPullsRemaining;
    const xpGained = Math.round(
      computeDungeonFailureXpGain(d, state.level, pullsCleared) *
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
      const name = state.combatPhase === 'BOSS' ? (state.currentDungeon?.bossName ?? 'Boss') : `Trash ${TRASH_PACK_COUNT - state.trashPullsRemaining + 1}`;
      nextDiag = {
        ...nextDiag,
        events: [
          ...nextDiag.events,
          { phase: state.combatPhase, name, ticksElapsed: ticksTaken, realMsElapsed: msTaken, expectedMs: ticksTaken * (1000 / TICKS_PER_SECOND) }
        ],
        totalRealMs: now - nextDiag.runStartTimeMs,
        totalExpectedMs: state.combatElapsedTicks * (1000 / TICKS_PER_SECOND),
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
      playerCombatBuffs: [],
      bossSelfBuffs: [],
      mechanicCooldown: 0,
      mechanicOrdinal: 0,
      spellCooldowns: {},
      floatingCombatTexts: [],
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
      playerCombatBuffs: [],
      bossSelfBuffs: [],
      mechanicCooldown: 0,
      mechanicOrdinal: 0,
      spellCooldowns: {},
      floatingCombatTexts: [],
      endlessStacks: 0,
      dungeonOutcome: null,
      diagnostics: null,
    };
}

function resolveOngoingCombat(
  state: GameState,
  sys: PlayerSystemsAfterDamage,
  boss: ReturnType<typeof processBossAI>,
  bossBuffsNext: BossSelfBuff[],
  random: TickRandom,
  dpsPaceMultiplier: number,
  now: number,
): GameState {
  const newParty = sys.party;
  const newMana = sys.newMana;
  const pComb = sys.playerCombatBuffs;
  const nextIcd = sys.internalCooldowns;
  const nextForm = sys.capstoneForm;

  const pd = BALANCE.partyDps;
  const partyDps = pd.base + Math.pow(state.level, pd.levelExponent) * pd.levelMultiplier;
  const inactiveDpsCount = newParty.filter((u) => u.role === 'DPS' && u.health <= 0).length;
  const bossDpsMult = state.combatPhase === 'BOSS' ? Math.pow(0.7, inactiveDpsCount) : 1;
  const effectivePartyDps = partyDps * bossDpsMult * dpsPaceMultiplier;
  let currentEnemyHealth = state.enemyHealth - effectivePartyDps;
  let newTrashPulls = state.trashPullsRemaining;
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
      const name = state.combatPhase === 'BOSS' ? (state.currentDungeon?.bossName ?? 'Boss') : `Trash ${TRASH_PACK_COUNT - state.trashPullsRemaining + 1}`;
      nextDiag = {
        ...nextDiag,
        lastPhaseStartTimeMs: now,
        lastPhaseStartTick: state.combatElapsedTicks,
        events: [
          ...nextDiag.events,
          { phase: state.combatPhase, name, ticksElapsed: ticksTaken, realMsElapsed: msTaken, expectedMs: ticksTaken * (1000 / TICKS_PER_SECOND) }
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
          computeDungeonXpGain(source, state.level) *
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
            trashPullsRemaining: TRASH_PACK_COUNT,
            enemyHealth: trashHpNext,
            enemyMaxHealth: trashHpNext,
            dungeonProgress: 0,
            bossSelfBuffs: [],
            mechanicCooldown: mechCdNext,
            mechanicOrdinal: 0,
            isCombatActive: true,
            playerCombatBuffs: pComb,
            capstoneForm: nextForm,
            internalCooldowns: nextIcd,
            holyPower: sys.holyPower,
          },
          tickMana,
        );
      }
      const xpGained = d
        ? Math.round(
            computeDungeonXpGain(d, state.level) * dungeonPaceXpMultiplier(state.dungeonPace!),
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
        nextDiag.totalExpectedMs = state.combatElapsedTicks * (1000 / TICKS_PER_SECOND);
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
        playerCombatBuffs: [],
        bossSelfBuffs: [],
        mechanicCooldown: 0,
        mechanicOrdinal: 0,
        spellCooldowns: {},
        completedDungeonIds,
        maxMana: meta.maxMana,
        mana: Math.min(meta.maxMana, state.mana),
        party: state.playerClass !== null ? generateRandomParty(meta.level, state.playerClass) : state.party,
        floatingCombatTexts: [],
        endlessStacks: 0,
        dungeonOutcome: d
          ? {
              kind: 'success',
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
      trashPullsRemaining: newTrashPulls,
      combatPhase: newPhase,
      enemyHealth: currentEnemyHealth,
      enemyMaxHealth: newEnemyMaxHealth,
      bossSelfBuffs: newPhase === 'BOSS' ? bossBuffsNext : [],
      playerCombatBuffs: pComb,
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

export function advanceCombatTick(
  state: GameState,
  random: TickRandom,
  now: number,
  dpsMultiplierOverride?: number,
): GameState {
  if (!state.isCombatActive) return state;

  const combatElapsedTicks = state.combatElapsedTicks + 1;
  let floats = pruneFloats(state.floatingCombatTexts, combatElapsedTicks);
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
    manaReturnFromHotTicks,
    envPlayerCombatBuffs,
    paladinResolveMana,
    paladinResolveHolyPower,
    fctDrafts: envFctDrafts,
    tickHealEff,
    tickHealOh,
  } = resolveEnvironmentalDamage(st, stateWithBoss, boss, random);
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, envFctDrafts);
  const bossBuffsNext = tickBossBuffs(st.combatPhase, boss.bossSelfBuffs);
  let stAcc: GameState = {
    ...st,
    dungeonRunHealEffective: st.dungeonRunHealEffective + tickHealEff,
    dungeonRunHealOverheal: st.dungeonRunHealOverheal + tickHealOh,
  };
  const sys = resolvePlayerSystems(
    stAcc,
    partyAfterEnv,
    naturalPerfectionStacks,
    manaReturnFromHotTicks,
    envPlayerCombatBuffs,
    paladinResolveMana,
    paladinResolveHolyPower,
  );
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, sys.fctDrafts);
  stAcc = {
    ...stAcc,
    dungeonRunHealEffective: stAcc.dungeonRunHealEffective + sys.natureGraceEff,
    dungeonRunHealOverheal: stAcc.dungeonRunHealOverheal + sys.natureGraceOh,
  };
  const fail = resolveFailure(stAcc, sys.party, now);
  if (fail) return { ...fail, floatingCombatTexts: [] };
  return {
    ...resolveOngoingCombat(stAcc, sys, boss, bossBuffsNext, random, dpsPaceMultiplier, now),
    floatingCombatTexts: floats,
  };
}

function finalizeTickState(s: GameState, newMana: number): GameState {
  let newProgress = s.dungeonProgress;
  const trashHp =
    s.currentDungeon !== null ? Math.max(1, getTrashMaxHealth(s.currentDungeon)) : 1;
  if (s.combatPhase === 'TRASH') {
    const pullProgress = (TRASH_PACK_COUNT - s.trashPullsRemaining) * 25;
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