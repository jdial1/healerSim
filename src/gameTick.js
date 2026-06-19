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
  shuffleArray
} from "./constants.js";
import { buildEndlessWaveDungeon, endlessBossPool, getEndlessTemplate } from "./dungeons/index.js";
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
  addNaturalPerfection
} from "./talentMechanics.js";
import { getPrimaryStats } from "./playerStats.js";
import { T_SPIRIT_AMP } from "./combatHelper.js";
import { GRACE_SOURCE_ID } from "./auraConfig.js";
import {
  getDamageTakenMultiplier,
  getHotTickAmount,
  getHotTickManaReturn,
  getHotTickRateMultiplier,
  onShieldTransition,
  getSelfHealOnDamage,
  getManaReturn
} from "./combatHookRegistry.js";
import { ClassRegistry } from "./classes/index.js";
import { BALANCE } from "./constants.js";
import {
  appendFloatingCombatDrafts,
  diffFloats,
  pruneFloats
} from "./floatingCombatText.js";
import { applyHealToUnit } from "./healMath.js";
import {
  getMeta,
  computeDungeonXpGain,
  computeDungeonFailureXpGain,
  levelUpRewardSummary
} from "./gameStorage.js";
import { generateCombatUid } from "./combatUid.js";
function recordPhaseDiagnostics(state, now) {
  const nextDiag = state.diagnostics;
  if (!nextDiag) return null;
  const ticksTaken = state.combatElapsedTicks - nextDiag.lastPhaseStartTick;
  const msTaken = Math.max(0, now - nextDiag.lastPhaseStartTimeMs);
  const name = state.combatPhase === "BOSS" ? state.currentDungeon?.bossName ?? "Boss" : `Trash ${TRASH_PACK_COUNT - state.trashPullsRemaining + 1}`;
  return {
    ...nextDiag,
    lastPhaseStartTimeMs: now,
    lastPhaseStartTick: state.combatElapsedTicks,
    events: [
      ...nextDiag.events,
      { phase: state.combatPhase, name, ticksElapsed: ticksTaken, realMsElapsed: msTaken, expectedMs: ticksTaken * (1e3 / TICKS_PER_SECOND) }
    ]
  };
}
function finalizeDiagnostics(diag, state, now) {
  if (!diag) return null;
  const res = { ...diag };
  res.totalRealMs = now - res.runStartTimeMs;
  res.totalExpectedMs = state.combatElapsedTicks * (1e3 / TICKS_PER_SECOND);
  try {
    res.userAgent = navigator.userAgent;
  } catch (e) {
  }
  return res;
}
function getPostDungeonLevelInfo(state, xpGained) {
  const newXp = state.xp + xpGained;
  const meta = getMeta(newXp, state.playerClass, state.talents);
  const isLevelUp = meta.level > state.level;
  const rewards = isLevelUp ? levelUpRewardSummary(state.playerClass, state.talents, state.level, meta.level) : { upgradedSpellIds: [], upgradedPotion: false };
  return { newXp, meta, isLevelUp, rewards };
}
function dungeonPostStatsFromState(state) {
  const sec = Math.max(1e-3, state.combatElapsedTicks / TICKS_PER_SECOND);
  const eff = state.dungeonRunHealEffective;
  const oh = state.dungeonRunHealOverheal;
  const raw = eff + oh;
  return {
    totalHealing: eff,
    hps: eff / sec,
    overhealPct: raw > 0 ? 100 * oh / raw : 0,
    hpm: state.dungeonRunManaSpentHealing > 0 ? eff / state.dungeonRunManaSpentHealing : 0
  };
}
function randomIntInclusive(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function applyDebuffTemplate(party, template, now, random) {
  const targetIds = selectTargets(party, template.targeting, random);
  if (targetIds.size === 0) return party;
  return party.map((u) => {
    if (!targetIds.has(u.id)) return u;
    const debuff = {
      id: generateCombatUid(`${template.abilityId}-${u.id}`, now, random),
      name: template.name,
      remainingTicks: template.durationTicks,
      damagePerTick: template.damagePerTick,
      icon: template.icon,
      sourceAbilityId: template.abilityId,
      dispellable: template.dispellable,
      category: "harmful",
      isDispellable: template.dispellable
    };
    return { ...u, debuffs: [debuff] };
  });
}
function selectTargets(party, targeting, random) {
  const livingIds = party.filter((u) => u.health > 0).map((u) => u.id);
  const out = new Set();
  if (livingIds.length === 0) return out;
  if (targeting === "all_living") {
    livingIds.forEach((id) => out.add(id));
    return out;
  }
  if (targeting === "single_random") {
    out.add(livingIds[Math.floor(random() * livingIds.length)]);
    return out;
  }
  shuffleArray(livingIds, random).slice(0, 2).forEach((id) => out.add(id));
  return out;
}
function bossMechanicKinds(profile) {
  const kinds = [];
  if (profile.debuffTemplates.length > 0) kinds.push("debuff");
  if (profile.selfBuffTemplates.length > 0) kinds.push("buff");
  if (profile.attackTemplates.length > 0) kinds.push("attack");
  return kinds;
}
function applyDamageToUnit(v, damage, naturalPerfectionRank) {
  if (damage <= 0) {
    return {
      health: Math.max(0, v.health),
      shield: v.shield,
      shieldTicksRemaining: v.shieldTicksRemaining,
      livingSeedPool: v.livingSeedPool,
      tookHealthDamage: 0,
      naturalPerfectionTick: 0
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
  const naturalPerfectionTick = v.role === "HEALER" && hit.tookHealthDamage > 0 && naturalPerfectionRank > 0 ? 1 : 0;
  return {
    health: hp,
    shield: sh,
    shieldTicksRemaining: ticks,
    livingSeedPool: seed,
    tookHealthDamage: hit.tookHealthDamage,
    naturalPerfectionTick
  };
}
function applyAttackTemplate(party, template, dungeon, partyDamageMult, talents, state, random) {
  const targetIds = selectTargets(party, template.targeting, random);
  if (targetIds.size === 0) return { party, naturalPerfectionAdd: 0 };
  const tank = party.find((u) => u.role === "TANK");
  const tankDead = !tank || tank.health <= 0;
  const baseMult = getBossDamageMultiplier(dungeon.difficulty) * (dungeon.endless ? getEndlessMultiplier(state.endlessStacks) : 1) * partyDamageMult * getDamageTakenMultiplier(state, { source: "boss_attack" });
  const natRank = getRanks(talents, "natural_perfection");
  let naturalPerfectionAdd = 0;
  const next = party.map((u) => {
    if (u.health <= 0 || !targetIds.has(u.id)) return u;
    let dmg = template.damage * baseMult * getLevelGapDamageMultiplier(u.level, dungeon.levelMax);
    if (tankDead && (u.role === "DPS" || u.role === "HEALER")) dmg *= 2;
    const out = applyDamageToUnit(u, dmg, natRank);
    if (out.naturalPerfectionTick) naturalPerfectionAdd = 1;
    return {
      ...u,
      health: out.health,
      shield: out.shield,
      shieldTicksRemaining: out.shieldTicksRemaining,
      livingSeedPool: out.livingSeedPool
    };
  });
  return { party: next, naturalPerfectionAdd };
}
function processBossAI(state, random, now) {
  let party = state.party;
  let naturalPerfectionAdd = 0;
  let bossBuffs = state.combatPhase === "BOSS" ? [...state.bossSelfBuffs] : [];
  let countdownTicks = state.mechanicCooldown;
  let mechanicOrdinal = state.mechanicOrdinal;
  if (state.combatPhase === "BOSS" && state.currentDungeon) {
    const profile = getCombatProfile(state.currentDungeon);
    const kinds = bossMechanicKinds(profile);
    if (kinds.length > 0) {
      countdownTicks -= 1;
      if (countdownTicks <= 0) {
        const partyDmgMultPre = bossBuffs.length > 0 ? Math.max(...bossBuffs.map((b) => b.partyDamageMultiplier)) : 1;
        const L = kinds.length;
        const step = mechanicOrdinal % L;
        const kind = kinds[step];
        const cycle = Math.floor(mechanicOrdinal / L);
        mechanicOrdinal += 1;
        if (kind === "debuff") {
          const nDebuff = profile.debuffTemplates.length;
          const di = cycle % nDebuff;
          party = applyDebuffTemplate(party, profile.debuffTemplates[di], now, random);
        } else if (kind === "buff") {
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
              sourceAbilityId: tpl.abilityId
            }
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
            random
          );
          party = atk.party;
          naturalPerfectionAdd += atk.naturalPerfectionAdd;
        }
        countdownTicks = randomIntInclusive(
          profile.mechanicIntervalTicksMin,
          profile.mechanicIntervalTicksMax,
          random
        );
      }
    }
  }
  return {
    party,
    bossSelfBuffs: bossBuffs,
    countdownTicks,
    mechanicOrdinal,
    naturalPerfectionAdd
  };
}
function advanceBossSpikeSimTick(state, random, now) {
  if (state.combatPhase !== "BOSS" || !state.currentDungeon) {
    throw new Error("advanceBossSpikeSimTick requires BOSS phase and currentDungeon");
  }
  const combatElapsedTicks = state.combatElapsedTicks + 1;
  const st = { ...state, combatElapsedTicks };
  const tankBefore = st.party.find((u) => u.role === "TANK");
  const vit0 = (tankBefore?.health ?? 0) + (tankBefore?.shield ?? 0);
  const boss = processBossAI(st, random, now);
  const merged = mergeBossAiIntoState(st, boss);
  const afterEnv = resolveEnvironmentalDamage(st, merged, boss, random);
  const tankAfter = afterEnv.party.find((u) => u.role === "TANK");
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
      dungeonRunHealOverheal: st.dungeonRunHealOverheal + afterEnv.tickHealOh
    },
    tankDamageThisTick
  };
}
function processEnvironmentalTick(state, partyAfterBossAI, bossSelfBuffsForPartyDamageMult, random, naturalPerfectionStacks) {
  const bossPartyDamageMult = state.combatPhase === "BOSS" && bossSelfBuffsForPartyDamageMult.length > 0 ? Math.max(...bossSelfBuffsForPartyDamageMult.map((b) => b.partyDamageMultiplier)) : 1;
  const tankIndex = partyAfterBossAI.findIndex((u) => u.role === "TANK");
  const newParty = [];
  let nextNat = naturalPerfectionStacks;
  let manaFromHotTicks = 0;
  let envPlayerCombatBuffs = state.playerCombatBuffs;
  let paladinResolveMana = 0;
  let paladinResolveHolyPower = 0;
  let envHealEff = 0;
  let envHealOh = 0;
  const hotTickFloatDrafts = [];
  const natRank = getRanks(state.talents, "natural_perfection");
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
        if (unit.role === "TANK" && chance < envDmg.tankProcChance)
          damage = (random() * envDmg.tankDamageRandomMax + diff) * ambientBurst;
        else if (chance < envDmg.nonTankProcChance)
          damage = (random() * envDmg.nonTankDamageRandomMax + diff) * ambientBurst;
      }
      if (state.combatPhase === "BOSS" && state.currentDungeon) {
        damage *= getBossDamageMultiplier(state.currentDungeon.difficulty);
        damage *= bossPartyDamageMult;
      }
      if (state.currentDungeon?.endless) {
        damage *= getEndlessMultiplier(state.endlessStacks);
      }
      if (state.currentDungeon) {
        damage *= getLevelGapDamageMultiplier(unit.level, state.currentDungeon.levelMax);
      }
      damage *= getDamageTakenMultiplier(state, { source: "trash_tick" });
    }
    const tankHealthNow = tankIndex < 0 ? 1 : newParty[tankIndex] !== void 0 ? newParty[tankIndex].health : partyAfterBossAI[tankIndex].health;
    if (tankHealthNow <= 0 && (unit.role === "DPS" || unit.role === "HEALER")) {
      damage *= 2;
    }
    const vit = applyDamageToUnit(unit, damage, natRank);
    let currentHealth = vit.health;
    let curShield = vit.shield;
    let curShieldTicks = vit.shieldTicksRemaining;
    let liveSeed = vit.livingSeedPool;
    if (vit.naturalPerfectionTick) {
      nextNat = Math.min(5, nextNat + 1);
    }
    if (unit.role === "HEALER" && vit.tookHealthDamage > 0) {
      const rawBk = getSelfHealOnDamage(state, vit.tookHealthDamage);
      const { health, eff, oh } = applyHealToUnit({ health: currentHealth, maxHealth: unit.maxHealth }, rawBk);
      envHealEff += eff;
      envHealOh += oh;
      currentHealth = health;
    }
    if (state.playerClass === "PALADIN" && unit.role === "HEALER" && vit.tookHealthDamage > 0) {
      paladinResolveMana += vit.tookHealthDamage * PAL.passiveLightbringerEnvDamageManaPerHp;
      if (random() < PAL.passiveLightbringerEnvDamageHolyPowerChance) {
        paladinResolveHolyPower += 1;
      }
    }
    const dotLevelMult = state.currentDungeon ? getLevelGapDamageMultiplier(unit.level, state.currentDungeon.levelMax) : 1;
    const activeDebuffs = [];
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
    const activeBuffs = unit.buffs.map((buff) => {
      if (buff.remainingTicks <= 0) return null;
      if (buff.sourceSpellId === GRACE_SOURCE_ID) {
        return buff.remainingTicks > 1 ? { ...buff, remainingTicks: buff.remainingTicks - 1 } : null;
      }
      let tickAcc = (buff.tickAccumulator ?? 0) + (buff.tickIntervalScale ?? 1) * getHotTickRateMultiplier({ state, unit, buff, healPerTick: buff.healingPerTick });
      let rem = buff.remainingTicks;
      const bloomTick = buff.bloomBurstHeal && currentHealth > 0;
      while (tickAcc >= 1 && rem > 0 && buff.healingPerTick > 0) {
        tickAcc -= 1;
        const tickAmt = getHotTickAmount({ state, unit, buff, healPerTick: buff.healingPerTick });
        if (currentHealth > 0) {
          const { health, eff, oh } = applyHealToUnit({ health: currentHealth, maxHealth: unit.maxHealth }, tickAmt);
          envHealEff += eff;
          envHealOh += oh;
          currentHealth = health;
        }
        manaFromHotTicks += getHotTickManaReturn({ state, unit, buff, healPerTick: buff.healingPerTick, appliedTickHeal: tickAmt });
        const hooks = state.playerClass ? ClassRegistry.getHooks(state.playerClass) : null;
        if (hooks?.rollOmenOfClarityOnHotTick) {
          envPlayerCombatBuffs = hooks.rollOmenOfClarityOnHotTick(state, tickAmt, buff.sourceSpellId, envPlayerCombatBuffs, random);
        }
      }
      if (bloomTick && buff.sourceSpellId === "lifebloom" && rem === 1) {
        const { health, eff, oh } = applyHealToUnit({ health: currentHealth, maxHealth: unit.maxHealth }, buff.bloomBurstHeal);
        envHealEff += eff;
        envHealOh += oh;
        currentHealth = health;
      }
      rem -= 1;
      if (rem <= 0 && bloomTick && buff.sourceSpellId !== "lifebloom") {
        const { health, eff, oh } = applyHealToUnit({ health: currentHealth, maxHealth: unit.maxHealth }, buff.bloomBurstHeal);
        envHealEff += eff;
        envHealOh += oh;
        currentHealth = health;
      }
      return rem > 0 ? { ...buff, remainingTicks: rem, tickAccumulator: tickAcc } : null;
    }).filter(Boolean);
    const buffHealGain = currentHealth - hpBeforeBuffTick;
    if (buffHealGain > 0) {
      hotTickFloatDrafts.push({
        unitId: unit.id,
        amount: buffHealGain,
        kind: "heal",
        crit: false
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
      livingSeedPool: liveSeed
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
    envHealOh
  };
}
function mergeBossAiIntoState(state, boss) {
  return {
    ...state,
    bossSelfBuffs: boss.bossSelfBuffs,
    mechanicCooldown: boss.countdownTicks,
    mechanicOrdinal: boss.mechanicOrdinal
  };
}
function resolveEnvironmentalDamage(stateBeforeBossMerge, stateWithBoss, boss, random) {
  const dmg = processEnvironmentalTick(
    stateWithBoss,
    boss.party,
    boss.bossSelfBuffs,
    random,
    Math.min(
      5,
      getNaturalPerfectionStacks(stateBeforeBossMerge.playerCombatBuffs) + boss.naturalPerfectionAdd
    )
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
    tickHealOh: dmg.envHealOh + shieldOut.oh
  };
}
function tickBossBuffs(combatPhase, bossSelfBuffs) {
  if (combatPhase !== "BOSS") return [];
  return bossSelfBuffs.map((b) => ({ ...b, remainingTicks: b.remainingTicks - 1 })).filter((b) => b.remainingTicks > 0);
}
function advanceInternalCooldowns(icd) {
  const nextIcd = { ...icd };
  Object.keys(nextIcd).forEach((k) => {
    if ((nextIcd[k] ?? 0) > 0) {
      nextIcd[k] = (nextIcd[k] ?? 0) - 1;
    }
  });
  return nextIcd;
}
function resolvePlayerSystems(state, partyAfterEnv, dmgNaturalPerfectionStacks, manaReturnFromHotTicks, envPlayerCombatBuffs, paladinResolveMana, paladinResolveHolyPower) {
  let nextIcd = advanceInternalCooldowns(state.internalCooldowns);
  const lockTicksPre = getBuffTicks(
    state.playerCombatBuffs,
    PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT
  );
  const spirit = state.playerClass !== null ? getPrimaryStats(state.playerClass, state.level).spirit : 0;
  const potionDrip = getPotionDrip(state.playerCombatBuffs);
  const regenThisTick = manaRegenAmountPerTick(lockTicksPre, spirit) + potionDrip + getManaReturn(state, lockTicksPre);
  const newMana = Math.min(
    state.maxMana,
    state.mana + regenThisTick + manaReturnFromHotTicks + paladinResolveMana
  );
  let pComb = tickBuffs(envPlayerCombatBuffs);
  const nextHolyPower = Math.min(3, state.holyPower + paladinResolveHolyPower);
  let newParty = partyAfterEnv;
  let graceFloatDrafts = [];
  const healerB = newParty.find((u) => u.role === "HEALER");
  if (state.playerClass && healerB && getRanks(state.talents, "spirit_of_redemption") > 0 && healerB.health < healerB.maxHealth * 0.3 && isReady(nextIcd, "spirit_redemption") && !hasBuff(pComb, "spirit_of_redemption_amp")) {
    pComb = addBuff(pComb, "spirit_of_redemption_amp", T_SPIRIT_AMP, 1);
    nextIcd = { ...nextIcd, spirit_redemption: ICD_SPIRIT_REDEMPTION };
  }
  let natureGraceEff = 0;
  let natureGraceOh = 0;
  if (state.capstoneForm === "druid_natures_grace" && hasBuff(state.playerCombatBuffs, "natures_grace_aura") && state.playerClass) {
    const beforeGrace = newParty;
    const ngh = 0.4 * state.level;
    newParty = newParty.map((u) => {
      if (u.health <= 0) return u;
      const { health, eff, oh } = applyHealToUnit(u, ngh);
      natureGraceEff += eff;
      natureGraceOh += oh;
      return { ...u, health };
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
    natureGraceOh
  };
}
function resolveFailure(state, newParty, now) {
  if (!newParty.every((u) => u.health <= 0) && newParty.find((u) => u.role === "HEALER")?.health !== 0) {
    return null;
  }
  const d = state.currentDungeon;
  if (d) {
    const allDead = newParty.every((u) => u.health <= 0);
    const reason = allDead ? "PARTY_WIPE" : "HEALER_DOWN";
    const pullsCleared = TRASH_PACK_COUNT - state.trashPullsRemaining;
    const xpGained = Math.round(
      computeDungeonFailureXpGain(d, state.level, pullsCleared) * dungeonPaceXpMultiplier(state.dungeonPace)
    );
    const { newXp, meta, isLevelUp, rewards } = getPostDungeonLevelInfo(state, xpGained);
    const nextDiag = finalizeDiagnostics(recordPhaseDiagnostics(state, now), state, now);
    return {
      ...state,
      party: state.playerClass !== null ? generateRandomParty(meta.level, state.playerClass) : state.party,
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
        kind: "failure",
        dungeonName: d.name,
        reason,
        xpGained,
        levelUp: isLevelUp,
        levelAfter: meta.level,
        playerClass: state.playerClass,
        upgradedSpellIds: rewards.upgradedSpellIds,
        upgradedPotion: rewards.upgradedPotion,
        endlessWavesCleared: d.endless ? state.endlessStacks : void 0,
        postStats: dungeonPostStatsFromState(state),
        diagnostics: nextDiag ?? void 0
      }
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
    diagnostics: null
  };
}
function resolveOngoingCombat(state, sys, boss, bossBuffsNext, random, dpsPaceMultiplier, now) {
  const newParty = sys.party;
  const newMana = sys.newMana;
  const pComb = sys.playerCombatBuffs;
  const nextIcd = sys.internalCooldowns;
  const nextForm = sys.capstoneForm;
  const pd = BALANCE.partyDps;
  const partyDps = pd.base + Math.pow(state.level, pd.levelExponent) * pd.levelMultiplier;
  const inactiveDpsCount = newParty.filter((u) => u.role === "DPS" && u.health <= 0).length;
  const bossDpsMult = state.combatPhase === "BOSS" ? Math.pow(0.7, inactiveDpsCount) : 1;
  const effectivePartyDps = partyDps * bossDpsMult * dpsPaceMultiplier;
  let currentEnemyHealth = state.enemyHealth - effectivePartyDps;
  let newTrashPulls = state.trashPullsRemaining;
  let newPhase = state.combatPhase;
  let newEnemyMaxHealth = state.enemyMaxHealth;
  let mechCd = boss.countdownTicks;
  let mechOrdinal = boss.mechanicOrdinal;
  const trashHp = state.currentDungeon !== null ? Math.max(1, getTrashMaxHealth(state.currentDungeon)) : 1;
  let nextDiag = state.diagnostics;
  if (currentEnemyHealth <= 0) {
    nextDiag = recordPhaseDiagnostics(state, now) ?? null;
    if (state.combatPhase === "TRASH") {
      newTrashPulls -= 1;
      if (newTrashPulls > 0) {
        currentEnemyHealth = trashHp;
        newEnemyMaxHealth = trashHp;
      } else {
        newPhase = "BOSS";
        const bossHp = Math.max(1, state.currentDungeon?.bossHealth || 1e3);
        currentEnemyHealth = bossHp;
        newEnemyMaxHealth = bossHp;
        const dung = state.currentDungeon;
        if (dung) {
          const prof = getCombatProfile(dung);
          mechCd = randomIntInclusive(
            prof.mechanicIntervalTicksMin,
            prof.mechanicIntervalTicksMax,
            random
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
          computeDungeonXpGain(source, state.level) * BALANCE.endless.bossKillXpFraction * dungeonPaceXpMultiplier(state.dungeonPace)
        );
        const { meta: meta2, isLevelUp: isLevelUp2 } = getPostDungeonLevelInfo(state, waveXp);
        const nextParty = isLevelUp2 && state.playerClass ? generateRandomParty(meta2.level, state.playerClass) : newParty;
        const trashHpNext = getTrashMaxHealth(nextDungeon);
        const profNext = getCombatProfile(nextDungeon);
        const mechCdNext = randomIntInclusive(
          profNext.mechanicIntervalTicksMin,
          profNext.mechanicIntervalTicksMax,
          random
        );
        const tickMana = Math.min(meta2.maxMana, newMana);
        return finalizeTickState(
          {
            ...state,
            ...meta2,
            mana: tickMana,
            party: nextParty,
            currentDungeon: nextDungeon,
            endlessStacks: nextStacks,
            combatPhase: "TRASH",
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
            holyPower: sys.holyPower
          },
          tickMana
        );
      }
      const xpGained = d ? Math.round(
        computeDungeonXpGain(d, state.level) * dungeonPaceXpMultiplier(state.dungeonPace)
      ) : 0;
      const { newXp, meta, isLevelUp, rewards } = getPostDungeonLevelInfo(state, xpGained);
      const dungeonId = d?.id ?? "";
      const completedDungeonIds = dungeonId && d && !d.endless && !state.completedDungeonIds.includes(dungeonId) ? [...state.completedDungeonIds, dungeonId] : state.completedDungeonIds;
      nextDiag = finalizeDiagnostics(nextDiag, state, now) ?? null;
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
        dungeonOutcome: d ? {
          kind: "success",
          dungeonName: d.name,
          bossName: d.bossName,
          xpGained,
          levelUp: isLevelUp,
          levelAfter: meta.level,
          playerClass: state.playerClass,
          upgradedSpellIds: rewards.upgradedSpellIds,
          upgradedPotion: rewards.upgradedPotion,
          postStats: dungeonPostStatsFromState(state),
          diagnostics: nextDiag ?? void 0
        } : null
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
      bossSelfBuffs: newPhase === "BOSS" ? bossBuffsNext : [],
      playerCombatBuffs: pComb,
      capstoneForm: nextForm,
      internalCooldowns: nextIcd,
      mechanicCooldown: mechCd,
      mechanicOrdinal: mechOrdinal,
      holyPower: sys.holyPower,
      diagnostics: nextDiag
    },
    newMana
  );
}
function advanceCombatTick(state, random, now, dpsMultiplierOverride) {
  if (!state.isCombatActive) return state;
  const combatElapsedTicks = state.combatElapsedTicks + 1;
  let floats = pruneFloats(state.floatingCombatTexts, combatElapsedTicks);
  const st = { ...state, combatElapsedTicks };
  const dpsPaceMultiplier = dpsMultiplierOverride !== void 0 ? dpsMultiplierOverride : st.dungeonPace !== null ? dungeonPaceDpsMultiplier(st.dungeonPace) : 1;
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
    tickHealOh
  } = resolveEnvironmentalDamage(st, stateWithBoss, boss, random);
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, envFctDrafts);
  const bossBuffsNext = tickBossBuffs(st.combatPhase, boss.bossSelfBuffs);
  let stAcc = {
    ...st,
    dungeonRunHealEffective: st.dungeonRunHealEffective + tickHealEff,
    dungeonRunHealOverheal: st.dungeonRunHealOverheal + tickHealOh
  };
  const sys = resolvePlayerSystems(
    stAcc,
    partyAfterEnv,
    naturalPerfectionStacks,
    manaReturnFromHotTicks,
    envPlayerCombatBuffs,
    paladinResolveMana,
    paladinResolveHolyPower
  );
  floats = appendFloatingCombatDrafts(floats, combatElapsedTicks, sys.fctDrafts);
  stAcc = {
    ...stAcc,
    dungeonRunHealEffective: stAcc.dungeonRunHealEffective + sys.natureGraceEff,
    dungeonRunHealOverheal: stAcc.dungeonRunHealOverheal + sys.natureGraceOh
  };
  const fail = resolveFailure(stAcc, sys.party, now);
  if (fail) return { ...fail, floatingCombatTexts: [] };
  return {
    ...resolveOngoingCombat(stAcc, sys, boss, bossBuffsNext, random, dpsPaceMultiplier, now),
    floatingCombatTexts: floats
  };
}
function finalizeTickState(s, newMana) {
  let newProgress = s.dungeonProgress;
  const trashHp = s.currentDungeon !== null ? Math.max(1, getTrashMaxHealth(s.currentDungeon)) : 1;
  if (s.combatPhase === "TRASH") {
    const pullProgress = (TRASH_PACK_COUNT - s.trashPullsRemaining) * 25;
    const trashCap = s.enemyMaxHealth > 0 ? s.enemyMaxHealth : trashHp;
    const currentPullPercent = trashCap > 0 ? Math.max(0, (trashCap - s.enemyHealth) / trashCap) * 25 : 0;
    newProgress = Math.min(75, pullProgress + currentPullPercent);
  } else {
    const bossMax = s.enemyMaxHealth > 0 ? s.enemyMaxHealth : 1;
    const bossPercent = Math.max(0, (bossMax - s.enemyHealth) / bossMax) * 25;
    newProgress = 75 + bossPercent;
  }
  return {
    ...s,
    dungeonProgress: newProgress,
    mana: newMana
  };
}
export {
  advanceBossSpikeSimTick,
  advanceCombatTick,
  processBossAI
};
