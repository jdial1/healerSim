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
} from './types.ts';
import {
  TRASH_PACK_COUNT,
  manaRegenAmountPerTick,
  bossDamageMultiplierForDifficulty,
  damageTakenMultiplierFromDungeonLevelGap,
  trashMaxHealthForDungeon,
  bossCombatProfileForDungeon,
  generateRandomParty,
} from './constants.ts';
import {
  applyDamageThroughShield,
  talentRanks,
  hasPlayerBuff,
  isIcDRdy,
  upsertPlayerBuff,
  tickPlayerBuffs,
  ICD_SPIRIT_REDEMPTION,
  PLAYER_BUFF_MANA_REGEN_POTION,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  getPlayerBuffRemainingTicks,
  naturalPerfectionStacksFrom,
  capstoneFormAfterBuffTick,
  upsertNaturalPerfectionStacks,
} from './talentMechanics.ts';
import { effectivePrimaryStats } from './playerStats.ts';
import { T_SPIRIT_AMP } from './combatHelper.ts';
import { GRACE_SOURCE_ID } from './auraConfig.ts';
import { runDamageTakenMultiplier, runHotTickAmount, runOnShieldTransition } from './combatPipeline.ts';
import { computeMetaFromProgress, computeDungeonXpGain, computeDungeonFailureXpGain } from './gameStorage.ts';
import { generateCombatUid } from './combatUid.ts';

export type TickRandom = () => number;

function randomIntInclusive(min: number, max: number, random: TickRandom): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function applyBossDebuffTemplate(
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

function selectBossAbilityTargetIds(
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

function applyDamageToUnitVitality(
  v: UnitDamageVitality,
  damage: number,
  naturalPerfectionRank: number,
): {
  health: number;
  shield: number;
  shieldTicksRemaining: number;
  livingSeedPool: number;
  naturalPerfectionTick: 0 | 1;
} {
  if (damage <= 0) {
    return {
      health: Math.max(0, v.health),
      shield: v.shield,
      shieldTicksRemaining: v.shieldTicksRemaining,
      livingSeedPool: v.livingSeedPool,
      naturalPerfectionTick: 0,
    };
  }
  const hit = applyDamageThroughShield(v.health, v.shield, damage);
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
    naturalPerfectionTick,
  };
}

function applyBossAttackTemplate(
  party: Unit[],
  template: BossAttackTemplate,
  dungeon: Dungeon,
  partyDamageMult: number,
  talents: Talent[],
  state: GameState,
  random: TickRandom,
): { party: Unit[]; naturalPerfectionAdd: number } {
  const targetIds = selectBossAbilityTargetIds(party, template.targeting, random);
  if (targetIds.size === 0) return { party, naturalPerfectionAdd: 0 };

  const tank = party.find((u) => u.role === 'TANK');
  const tankDead = !tank || tank.health <= 0;
  const baseMult =
    bossDamageMultiplierForDifficulty(dungeon.difficulty) *
    partyDamageMult *
    runDamageTakenMultiplier(state, { source: 'boss_attack' });
  const natRank = talentRanks(talents, 'natural_perfection');
  let naturalPerfectionAdd = 0;

  const next = party.map((u) => {
    if (u.health <= 0 || !targetIds.has(u.id)) return u;
    let dmg =
      template.damage *
      baseMult *
      damageTakenMultiplierFromDungeonLevelGap(u.level, dungeon.levelMax);
    if (tankDead && (u.role === 'DPS' || u.role === 'HEALER')) dmg *= 2;
    const out = applyDamageToUnitVitality(u, dmg, natRank);
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
  let countdownTicks = state.bossMechanicCountdownTicks;
  let mechanicOrdinal = state.bossMechanicOrdinal;

  if (state.combatPhase === 'BOSS' && state.currentDungeon) {
    const profile = bossCombatProfileForDungeon(state.currentDungeon);
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
          party = applyBossDebuffTemplate(party, profile.debuffTemplates[di], now, random);
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
          const atk = applyBossAttackTemplate(
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

function processPartyEnvironmentalTick(
  state: GameState,
  partyAfterBossAI: Unit[],
  bossSelfBuffsForPartyDamageMult: BossSelfBuff[],
  random: TickRandom,
  naturalPerfectionStacks: number,
): { party: Unit[]; naturalPerfectionStacks: number } {
  const bossPartyDamageMult =
    state.combatPhase === 'BOSS' && bossSelfBuffsForPartyDamageMult.length > 0
      ? Math.max(...bossSelfBuffsForPartyDamageMult.map((b) => b.partyDamageMultiplier))
      : 1;

  const tankIndex = partyAfterBossAI.findIndex((u) => u.role === 'TANK');
  const newParty: Unit[] = [];
  let nextNat = naturalPerfectionStacks;
  const natRank = talentRanks(state.talents, 'natural_perfection');

  for (let idx = 0; idx < partyAfterBossAI.length; idx++) {
    const unit = partyAfterBossAI[idx];
    let damage = 0;
    const chance = random();
    if (unit.role === 'TANK' && chance < 0.4)
      damage = random() * 8 + (state.currentDungeon?.difficulty || 1);
    else if (chance < 0.1) damage = random() * 5 + (state.currentDungeon?.difficulty || 1);

    if (state.combatPhase === 'BOSS' && state.currentDungeon) {
      damage *= bossDamageMultiplierForDifficulty(state.currentDungeon.difficulty);
      damage *= bossPartyDamageMult;
    }
    if (state.currentDungeon) {
      damage *= damageTakenMultiplierFromDungeonLevelGap(unit.level, state.currentDungeon.levelMax);
    }
    damage *= runDamageTakenMultiplier(state, { source: 'trash_tick' });

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
    const vit = applyDamageToUnitVitality(
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
    if (vit.naturalPerfectionTick) nextNat = Math.min(5, nextNat + 1);

    const dotLevelMult = state.currentDungeon
      ? damageTakenMultiplierFromDungeonLevelGap(unit.level, state.currentDungeon.levelMax)
      : 1;
    const activeDebuffs: PartyDebuff[] = [];
    unit.debuffs.forEach((d) => {
      if (d.remainingTicks > 0) {
        currentHealth = Math.max(0, currentHealth - d.damagePerTick * dotLevelMult);
        activeDebuffs.push({ ...d, remainingTicks: d.remainingTicks - 1 });
      }
    });

    const activeBuffs: Buff[] = [];
    unit.buffs.forEach((buff) => {
      if (buff.remainingTicks <= 0) return;
      if (buff.sourceSpellId === GRACE_SOURCE_ID) {
        const nr = buff.remainingTicks - 1;
        if (nr > 0) activeBuffs.push({ ...buff, remainingTicks: nr });
        return;
      }
      const hpTick = buff.healingPerTick;
      let tickAcc = (buff.tickAccumulator ?? 0) + (buff.tickIntervalScale ?? 1);
      let rem = buff.remainingTicks;
      while (tickAcc >= 1 && rem > 0 && hpTick > 0) {
        tickAcc -= 1;
        const tickAmt = runHotTickAmount({
          state,
          unit,
          buff,
          healPerTick: hpTick,
        });
        if (currentHealth > 0) {
          currentHealth = Math.min(unit.maxHealth, currentHealth + tickAmt);
        }
      }
      rem -= 1;
      if (rem <= 0 && buff.bloomBurstHeal && currentHealth > 0) {
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

  return { party: newParty, naturalPerfectionStacks: nextNat };
}

function mergeBossAiIntoState(state: GameState, boss: ReturnType<typeof processBossAI>): GameState {
  return {
    ...state,
    bossSelfBuffs: boss.bossSelfBuffs,
    bossMechanicCountdownTicks: boss.countdownTicks,
    bossMechanicOrdinal: boss.mechanicOrdinal,
  };
}

function resolvePartyAfterEnvironmentalDamage(
  stateBeforeBossMerge: GameState,
  stateWithBoss: GameState,
  boss: ReturnType<typeof processBossAI>,
  random: TickRandom,
): { party: Unit[]; naturalPerfectionStacks: number } {
  const dmg = processPartyEnvironmentalTick(
    stateWithBoss,
    boss.party,
    boss.bossSelfBuffs,
    random,
    Math.min(
      5,
      naturalPerfectionStacksFrom(stateBeforeBossMerge.playerCombatBuffs) + boss.naturalPerfectionAdd,
    ),
  );
  const newParty = runOnShieldTransition(stateBeforeBossMerge, boss.party, dmg.party);
  return { party: newParty, naturalPerfectionStacks: dmg.naturalPerfectionStacks };
}

function tickBossDisplayedBuffSurfaces(
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
};

function resolvePlayerSystemsAfterEnvironmentalDamage(
  state: GameState,
  partyAfterEnv: Unit[],
  dmgNaturalPerfectionStacks: number,
): PlayerSystemsAfterDamage {
  let nextIcd = advanceInternalCooldowns(state.internalCooldowns);
  const buffTicksPre = getPlayerBuffRemainingTicks(state.playerCombatBuffs, PLAYER_BUFF_MANA_REGEN_POTION);
  const lockTicksPre = getPlayerBuffRemainingTicks(
    state.playerCombatBuffs,
    PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  );
  const spirit =
    state.playerClass !== null ? effectivePrimaryStats(state.playerClass, state.level).spirit : 0;
  const regenThisTick = manaRegenAmountPerTick(lockTicksPre, buffTicksPre, spirit);
  const newMana = Math.min(state.maxMana, state.mana + regenThisTick);
  let pComb = tickPlayerBuffs(state.playerCombatBuffs);
  let newParty = partyAfterEnv;
  const healerB = newParty.find((u) => u.role === 'HEALER');
  if (
    state.playerClass &&
    healerB &&
    talentRanks(state.talents, 'spirit_of_redemption') > 0 &&
    healerB.health < healerB.maxHealth * 0.3 &&
    isIcDRdy(nextIcd, 'spirit_redemption') &&
    !hasPlayerBuff(pComb, 'spirit_of_redemption_amp')
  ) {
    pComb = upsertPlayerBuff(pComb, 'spirit_of_redemption_amp', T_SPIRIT_AMP, 1);
    nextIcd = { ...nextIcd, spirit_redemption: ICD_SPIRIT_REDEMPTION };
  }
  if (
    state.capstoneForm === 'druid_natures_grace' &&
    hasPlayerBuff(state.playerCombatBuffs, 'natures_grace_aura') &&
    state.playerClass
  ) {
    const ngh = 0.4 * state.level;
    newParty = newParty.map((u) =>
      u.health > 0 ? { ...u, health: Math.min(u.maxHealth, u.health + ngh) } : u,
    );
  }
  pComb = upsertNaturalPerfectionStacks(pComb, dmgNaturalPerfectionStacks);
  const nextForm = capstoneFormAfterBuffTick(state.capstoneForm, pComb);
  return {
    party: newParty,
    newMana,
    playerCombatBuffs: pComb,
    internalCooldowns: nextIcd,
    capstoneForm: nextForm,
  };
}

function resolveCombatFailureFromTick(state: GameState, newParty: Unit[]): GameState | null {
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
    const xpGained = computeDungeonFailureXpGain(d, state.level, pullsCleared);
    const newXp = state.xp + xpGained;
    const meta = computeMetaFromProgress(newXp, state.playerClass, state.talents);
    const isLevelUp = meta.level > state.level;
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
      playerCombatBuffs: [],
      bossSelfBuffs: [],
      bossMechanicCountdownTicks: 0,
      bossMechanicOrdinal: 0,
      spellCooldowns: {},
      dungeonOutcome: {
        kind: 'failure',
        dungeonName: d.name,
        reason,
        xpGained,
        levelUp: isLevelUp,
      },
    };
  }
  return {
    ...state,
    party: newParty,
    isCombatActive: false,
    currentDungeon: null,
    playerCombatBuffs: [],
    bossSelfBuffs: [],
    bossMechanicCountdownTicks: 0,
    bossMechanicOrdinal: 0,
    spellCooldowns: {},
    dungeonOutcome: null,
  };
}

function resolveOngoingCombatAfterPartyAlive(
  state: GameState,
  sys: PlayerSystemsAfterDamage,
  boss: ReturnType<typeof processBossAI>,
  bossBuffsNext: BossSelfBuff[],
  random: TickRandom,
): GameState {
  const newParty = sys.party;
  const newMana = sys.newMana;
  const pComb = sys.playerCombatBuffs;
  const nextIcd = sys.internalCooldowns;
  const nextForm = sys.capstoneForm;

  const partyDps = 2 + state.level * 2;
  const deadDpsCount = newParty.filter((u) => u.role === 'DPS' && u.health <= 0).length;
  const bossDpsMult = state.combatPhase === 'BOSS' ? Math.pow(0.7, deadDpsCount) : 1;
  const effectivePartyDps = partyDps * bossDpsMult;
  let currentEnemyHealth = state.enemyHealth - effectivePartyDps;
  let newTrashPulls = state.trashPullsRemaining;
  let newPhase = state.combatPhase;
  let newEnemyMaxHealth = state.enemyMaxHealth;
  let mechCd = boss.countdownTicks;
  let mechOrdinal = boss.mechanicOrdinal;

  const trashHp = state.currentDungeon !== null ? trashMaxHealthForDungeon(state.currentDungeon) : 1;

  if (currentEnemyHealth <= 0) {
    if (state.combatPhase === 'TRASH') {
      newTrashPulls -= 1;
      if (newTrashPulls > 0) {
        currentEnemyHealth = trashHp;
        newEnemyMaxHealth = trashHp;
      } else {
        newPhase = 'BOSS';
        currentEnemyHealth = state.currentDungeon?.bossHealth || 1000;
        newEnemyMaxHealth = state.currentDungeon?.bossHealth || 1000;
        const dung = state.currentDungeon;
        if (dung) {
          const prof = bossCombatProfileForDungeon(dung);
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
      const xpGained = d ? computeDungeonXpGain(d, state.level) : 0;
      const newXp = state.xp + xpGained;
      const meta = computeMetaFromProgress(newXp, state.playerClass, state.talents);
      const isLevelUp = meta.level > state.level;
      const dungeonId = d?.id ?? '';
      const completedDungeonIds =
        dungeonId && !state.completedDungeonIds.includes(dungeonId)
          ? [...state.completedDungeonIds, dungeonId]
          : state.completedDungeonIds;
      return {
        ...state,
        xp: newXp,
        level: meta.level,
        talentPoints: meta.talentPoints,
        dungeonProgress: 100,
        isCombatActive: false,
        currentDungeon: null,
        playerCombatBuffs: [],
        bossSelfBuffs: [],
        bossMechanicCountdownTicks: 0,
        bossMechanicOrdinal: 0,
        spellCooldowns: {},
        completedDungeonIds,
        maxMana: meta.maxMana,
        mana: Math.min(meta.maxMana, state.mana),
        party: state.playerClass !== null ? generateRandomParty(meta.level, state.playerClass) : state.party,
        dungeonOutcome: d
          ? {
              kind: 'success',
              dungeonName: d.name,
              bossName: d.bossName,
              xpGained,
              levelUp: isLevelUp,
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
      bossMechanicCountdownTicks: mechCd,
      bossMechanicOrdinal: mechOrdinal,
    },
    newMana,
  );
}

export function advanceCombatTick(state: GameState, random: TickRandom, now: number): GameState {
  if (!state.isCombatActive) return state;

  const boss = processBossAI(state, random, now);
  const stateWithBoss = mergeBossAiIntoState(state, boss);
  const { party: partyAfterEnv, naturalPerfectionStacks } = resolvePartyAfterEnvironmentalDamage(
    state,
    stateWithBoss,
    boss,
    random,
  );
  const bossBuffsNext = tickBossDisplayedBuffSurfaces(state.combatPhase, boss.bossSelfBuffs);
  const sys = resolvePlayerSystemsAfterEnvironmentalDamage(
    state,
    partyAfterEnv,
    naturalPerfectionStacks,
  );
  const fail = resolveCombatFailureFromTick(state, sys.party);
  if (fail) return fail;
  return resolveOngoingCombatAfterPartyAlive(state, sys, boss, bossBuffsNext, random);
}

function finalizeTickState(s: GameState, newMana: number): GameState {
  let newProgress = s.dungeonProgress;
  const trashHp = s.currentDungeon !== null ? trashMaxHealthForDungeon(s.currentDungeon) : 1;
  if (s.combatPhase === 'TRASH') {
    const pullProgress = (TRASH_PACK_COUNT - s.trashPullsRemaining) * 25;
    const trashCap = s.enemyMaxHealth > 0 ? s.enemyMaxHealth : trashHp;
    const currentPullPercent =
      trashCap > 0 ? Math.max(0, (trashCap - s.enemyHealth) / trashCap) * 25 : 0;
    newProgress = Math.min(75, pullProgress + currentPullPercent);
  } else {
    const bossMax = s.currentDungeon?.bossHealth || 1000;
    const bossPercent = Math.max(0, (bossMax - s.enemyHealth) / bossMax) * 25;
    newProgress = 75 + bossPercent;
  }

  return {
    ...s,
    dungeonProgress: newProgress,
    mana: newMana,
  };
}
