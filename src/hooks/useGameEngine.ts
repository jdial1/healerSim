/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  GameState,
  Unit,
  ClassType,
  Buff,
  PartyDebuff,
  BossSelfBuff,
  BossDebuffTemplate,
  SpellType,
  Dungeon,
  DungeonRunOutcome,
  DungeonFailureReason,
} from '../types.ts';
import {
  TICK_RATE,
  MANA_POTION_USES_PER_DUNGEON,
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  SPELLS,
  manaRegenAmountPerTick,
  generateRandomParty,
  bossDamageMultiplierForDifficulty,
  damageTakenMultiplierFromDungeonLevelGap,
  trashMaxHealthForDungeon,
  bossCombatProfileForDungeon,
} from '../constants.ts';
import { cloneTalentsForClass } from '../talents/index.ts';
import {
  readStoredProgress,
  writeStoredProgress,
  computeMetaFromProgress,
  computeDungeonXpGain,
  reconcileActionBarOrder,
} from '../gameStorage.ts';
import {
  spellHealingMultiplierFromProgress,
  effectivePrimaryStats,
  talentChainedPrereqsSatisfied,
} from '../playerStats.ts';
import {
  applyExclusiveUnlock,
  applyDamageThroughShield,
  talentRanks,
  hasPlayerBuff,
  isIcDRdy,
  upsertPlayerBuff,
  getPlayerBuffStacks,
  tickPlayerBuffs,
  isDirectHealSpell,
  isHealSpell,
  HEALER_UNIT_ID,
  healerInParty,
  SURGE_OF_LIGHT_TICKS,
  JUDGMENT_PURE_TICKS,
  ZEAL_MAX_STACKS,
  ZEAL_TICKS,
  ICD_SPIRIT_REDEMPTION,
  withBuffRemoved,
} from '../talentMechanics.ts';
import {
  totalHastePercent,
  rollCrit,
  nextManaForSpell,
  resolveSwiftmend,
  T_ARCHANGEL,
  T_NATURES_GRACE,
  T_AVENGING,
  T_SPIRIT_AMP,
  SHIELD_DEFAULT_TICKS,
  oneHotTickDoubleRoll,
  applyPandemicHotToUnit,
  directHealSynergyMultiplier,
} from '../combatHelper.ts';

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyBossDebuffTemplate(party: Unit[], template: BossDebuffTemplate): Unit[] {
  const livingIds = party.filter((u) => u.health > 0).map((u) => u.id);
  if (livingIds.length === 0) return party;

  const addToUnit = (units: Unit[], unitId: string): Unit[] =>
    units.map((u) => {
      if (u.id !== unitId) return u;
      const debuff: PartyDebuff = {
        id: `${template.abilityId}-${unitId}-${Date.now()}-${Math.random()}`,
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
    const id = livingIds[Math.floor(Math.random() * livingIds.length)];
    return addToUnit(party, id);
  }

  const shuffled = [...livingIds].sort(() => Math.random() - 0.5);
  const count = Math.min(2, shuffled.length);
  let next = party;
  for (let i = 0; i < count; i++) {
    next = addToUnit(next, shuffled[i]);
  }
  return next;
}

function createInitialGameState(): GameState {
  let party = generateRandomParty(1, null);
  const base: GameState = {
    playerClass: null,
    party,
    mana: 100,
    maxMana: 100,
    manaRegenBuffTicksRemaining: 0,
    spiritRegenLockoutTicksRemaining: 0,
    manaPotionsUsedThisDungeon: 0,
    xp: 0,
    level: 1,
    talentPoints: 5,
    talents: [],
    unlockedSpells: [],
    activeActionBars: [],
    currentDungeon: null,
    dungeonProgress: 0,
    combatPhase: 'TRASH',
    trashPullsRemaining: 3,
    enemyHealth: 100,
    enemyMaxHealth: 100,
    bossSelfBuffs: [],
    isCombatActive: false,
    completedDungeonIds: [],
    playerCombatBuffs: [],
    internalCooldowns: {},
    capstoneForm: null,
    capstoneFormTicksRemaining: 0,
    holyPower: 0,
    beaconTargetId: '1',
    powerInfusionCastsRemaining: 0,
    naturalPerfectionStacks: 0,
  };
  const patch = readStoredProgress();
  if (!patch) return base;
  if (patch.playerClass) {
    party = generateRandomParty(patch.level ?? 1, patch.playerClass);
  }
  const cap = patch.maxMana ?? base.maxMana;
  return {
    ...base,
    ...patch,
    talents: patch.talents ?? base.talents,
    party,
    mana: Math.min(cap, patch.mana ?? cap),
    completedDungeonIds: patch.completedDungeonIds ?? [],
    playerCombatBuffs: patch.playerCombatBuffs ?? [],
    internalCooldowns: patch.internalCooldowns ?? {},
    capstoneForm: patch.capstoneForm ?? null,
    capstoneFormTicksRemaining: patch.capstoneFormTicksRemaining ?? 0,
    holyPower: patch.holyPower ?? 0,
    beaconTargetId: patch.beaconTargetId ?? '1',
    powerInfusionCastsRemaining: patch.powerInfusionCastsRemaining ?? 0,
    naturalPerfectionStacks: patch.naturalPerfectionStacks ?? 0,
  };
}

export function useGameEngine() {
  const [state, setState] = useState<GameState>(createInitialGameState);

  const cooldownsRef = useRef<Record<string, number>>({});
  const bossMechanicCountdownRef = useRef(0);
  const critRollRef = useRef(0);
  const [, setCooldownTick] = useState(0);
  const [dungeonOutcome, setDungeonOutcome] = useState<DungeonRunOutcome | null>(null);

  const selectClass = useCallback((cls: ClassType) => {
    setState((s) => {
      const talents = cloneTalentsForClass(cls);
      const meta = computeMetaFromProgress(s.xp, cls, talents);
      return {
        ...s,
        playerClass: cls,
        talents: meta.talents,
        unlockedSpells: meta.unlockedSpells,
        activeActionBars: meta.activeActionBars,
        talentPoints: meta.talentPoints,
        maxMana: meta.maxMana,
        level: meta.level,
        mana: Math.min(meta.maxMana, s.mana),
        party: generateRandomParty(meta.level, cls),
        playerCombatBuffs: [],
        internalCooldowns: {},
        capstoneForm: null,
        capstoneFormTicksRemaining: 0,
        holyPower: 0,
        powerInfusionCastsRemaining: 0,
        naturalPerfectionStacks: 0,
        beaconTargetId: '1',
      };
    });
  }, []);

  const reorderActionBar = useCallback((from: number, to: number) => {
    setState((s) => {
      if (s.currentDungeon) return s;
      const bar = s.activeActionBars;
      if (from === to || from < 0 || to < 0 || from >= bar.length || to >= bar.length) return s;
      const next = [...bar];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...s, activeActionBars: next };
    });
  }, []);

  const dismissDungeonOutcome = useCallback(() => {
    setDungeonOutcome(null);
  }, []);

  const abandonDungeon = useCallback(() => {
    setDungeonOutcome(null);
    setState((s) => ({
      ...s,
      currentDungeon: null,
      isCombatActive: false,
      dungeonProgress: 0,
      manaRegenBuffTicksRemaining: 0,
      spiritRegenLockoutTicksRemaining: 0,
      manaPotionsUsedThisDungeon: 0,
      bossSelfBuffs: [],
      playerCombatBuffs: [],
      internalCooldowns: {},
      capstoneForm: null,
      capstoneFormTicksRemaining: 0,
      holyPower: 0,
      powerInfusionCastsRemaining: 0,
      naturalPerfectionStacks: 0,
    }));
    bossMechanicCountdownRef.current = 0;
  }, []);

  const startDungeon = useCallback((dungeon: Dungeon) => {
    setDungeonOutcome(null);
    const trashHp = trashMaxHealthForDungeon(dungeon);
    setState(s => ({
      ...s,
      currentDungeon: dungeon,
      dungeonProgress: 0,
      combatPhase: 'TRASH',
      trashPullsRemaining: 3,
      enemyHealth: trashHp,
      enemyMaxHealth: trashHp,
      isCombatActive: true,
      party: generateRandomParty(s.level, s.playerClass),
      mana: s.maxMana,
      manaRegenBuffTicksRemaining: 0,
      spiritRegenLockoutTicksRemaining: 0,
      manaPotionsUsedThisDungeon: 0,
      bossSelfBuffs: [],
      playerCombatBuffs: [],
      internalCooldowns: {},
      capstoneForm: null,
      capstoneFormTicksRemaining: 0,
      holyPower: 0,
      powerInfusionCastsRemaining: 0,
      naturalPerfectionStacks: 0,
    }));
    bossMechanicCountdownRef.current = 0;
  }, []);

  const unlockTalent = useCallback((talentId: string) => {
    setState((s) => {
      const talent = s.talents.find((t) => t.id === talentId);
      if (!talent) return s;
      const hasPrereqs = talentChainedPrereqsSatisfied(s.talents, talent);
      if (!hasPrereqs || talent.points >= talent.maxPoints || s.talentPoints < talent.cost || s.level < talent.levelReq) {
        return s;
      }
      const newTalents = applyExclusiveUnlock(s.talents, talentId);
      const meta = computeMetaFromProgress(s.xp, s.playerClass, newTalents);
      const activeActionBars = reconcileActionBarOrder(s.activeActionBars, meta.activeActionBars);
      let next = { ...s, ...meta, activeActionBars, mana: Math.min(meta.maxMana, s.mana) };
      if (s.playerClass) {
        if (talent.mechanicId === 'capstone_archangel' && newTalents.find((t) => t.id === talentId)!.points > 0) {
          next = {
            ...next,
            capstoneForm: 'priest_archangel' as const,
            capstoneFormTicksRemaining: T_ARCHANGEL,
            playerCombatBuffs: upsertPlayerBuff(next.playerCombatBuffs, 'archangel', T_ARCHANGEL, 1),
          };
        } else if (talent.mechanicId === 'capstone_natures_grace' && newTalents.find((t) => t.id === talentId)!.points > 0) {
          next = {
            ...next,
            capstoneForm: 'druid_natures_grace' as const,
            capstoneFormTicksRemaining: T_NATURES_GRACE,
            playerCombatBuffs: upsertPlayerBuff(next.playerCombatBuffs, 'natures_grace_aura', T_NATURES_GRACE, 1),
          };
        } else if (talent.mechanicId === 'capstone_avenging_wrath' && newTalents.find((t) => t.id === talentId)!.points > 0) {
          next = {
            ...next,
            capstoneForm: 'paladin_avenging_wrath' as const,
            capstoneFormTicksRemaining: T_AVENGING,
            playerCombatBuffs: upsertPlayerBuff(next.playerCombatBuffs, 'avenging_wrath_aura', T_AVENGING, 1),
          };
        }
      }
      return next;
    });
  }, []);

  const castSpell = useCallback((spellId: string, targetId: string) => {
    const spell = SPELLS[spellId];
    if (!spell) return;
    critRollRef.current = Math.random() * 100;
    setState((s) => {
      if (!s.playerClass) return s;
      if (cooldownsRef.current[spellId] > 0) return s;
      if (spellId === 'mana_potion' && s.manaPotionsUsedThisDungeon >= MANA_POTION_USES_PER_DUNGEON) {
        return s;
      }
      const healerU = healerInParty(s.party);
      if (!healerU) return s;
      const zStacks = getPlayerBuffStacks(s.playerCombatBuffs, 'zeal');
      const hastePct = totalHastePercent(s, s.playerClass, healerU, zStacks);
      const surgeFree = hasPlayerBuff(s.playerCombatBuffs, 'surge_of_light') && spellId === 'greater_heal';
      const needMana = nextManaForSpell(s, s.playerClass, spell, spellId, !!surgeFree);
      if (s.mana < needMana) return s;

      const runCooldown = (rawCd: number, piLeft: number) => {
        const nextPi = piLeft > 0 ? piLeft - 1 : 0;
        const cdR = Math.round(rawCd * (1 - hastePct / 100) * (piLeft > 0 ? 0.5 : 1));
        if (cdR > 0) {
          const sid = spellId;
          queueMicrotask(() => {
            cooldownsRef.current[sid] = cdR;
            setCooldownTick((x) => x + 1);
          });
        }
        return nextPi;
      };

      if (spellId === 'wand') {
        const d = (spell.dealDamageToEnemy ?? 10) + talentRanks(s.talents, 'pala_path_dusk');
        const pz = getPlayerBuffStacks(s.playerCombatBuffs, 'zeal');
        let comb = upsertPlayerBuff(
          s.playerCombatBuffs,
          'zeal',
          ZEAL_TICKS,
          Math.min(ZEAL_MAX_STACKS, (pz || 0) + 1),
        );
        if (talentRanks(s.talents, 'judgment_of_the_pure') > 0) {
          comb = upsertPlayerBuff(comb, 'judgment_of_the_pure', JUDGMENT_PURE_TICKS, 1);
        }
        const npi = runCooldown(spell.cooldown, s.powerInfusionCastsRemaining);
        return {
          ...s,
          enemyHealth: Math.max(0, s.enemyHealth - d),
          playerCombatBuffs: comb,
          powerInfusionCastsRemaining: npi,
        };
      }

      if (spellId === 'swiftmend' && s.playerClass === ClassType.DRUID) {
        const healMult0 = spellHealingMultiplierFromProgress(s.playerClass, s.level, s.talents);
        const isCrit0 = rollCrit(critRollRef.current, s, s.naturalPerfectionStacks);
        const critMod0 = isCrit0 ? 1.5 : 1.0;
        const { party: pr, applied } = resolveSwiftmend(s, s.playerClass, targetId, healMult0, critMod0, spell);
        if (!applied) return s;
        let m0 = s.mana - needMana;
        let piSm = s.powerInfusionCastsRemaining;
        if (isCrit0 && talentRanks(s.talents, 'power_infusion') > 0) {
          piSm = Math.max(piSm, 3);
        }
        const nPiSm = runCooldown(spell.cooldown, piSm);
        return { ...s, party: pr, mana: m0, powerInfusionCastsRemaining: nPiSm };
      }

      if (spellId === 'mana_potion') {
        const newManaP = Math.min(s.maxMana, s.mana + (spell.manaRestore || 0));
        const nPiP = runCooldown(spell.cooldown, s.powerInfusionCastsRemaining);
        return {
          ...s,
          mana: newManaP,
          manaRegenBuffTicksRemaining: spell.manaRegenBuffDurationTicks ?? 0,
          spiritRegenLockoutTicksRemaining: MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
          manaPotionsUsedThisDungeon: s.manaPotionsUsedThisDungeon + 1,
          powerInfusionCastsRemaining: nPiP,
        };
      }

      const spiritM = hasPlayerBuff(s.playerCombatBuffs, 'spirit_of_redemption_amp') ? 1.5 : 1;
      const healMultB = spellHealingMultiplierFromProgress(s.playerClass, s.level, s.talents) * spiritM;
      const isCritH = rollCrit(critRollRef.current, s, s.naturalPerfectionStacks);
      const critH = isCritH ? 1.5 : 1.0;
      const tower2 = s.holyPower >= 3 && isDirectHealSpell(spell, spellId);
      const tMod = tower2 ? 2 : 1;
      const arch = s.capstoneForm === 'priest_archangel' && s.capstoneFormTicksRemaining > 0;

      let pbuffs = s.playerCombatBuffs;
      if (surgeFree) {
        pbuffs = withBuffRemoved(pbuffs, 'surge_of_light');
      }

      let newParty2 = s.party.map((u) => ({ ...u, buffs: u.buffs.map((b) => ({ ...b })) }));
      const healOne = (u: Unit) => {
        if (u.health <= 0) return u;
        const syn = directHealSynergyMultiplier(u, spellId);
        const directAmt = spell.healing * healMultB * critH * tMod * syn;
        const th = Math.min(u.maxHealth, u.health + directAmt);
        return { ...u, health: th };
      };
      const addHot = (u: Unit) => {
        if (spell.type !== SpellType.HOT && !spell.hotDuration) return u;
        const tHot = (spell.hotHealingPerTick || 0) * healMultB * critH;
        return applyPandemicHotToUnit(u, spell, tHot);
      };

      if (spell.type === SpellType.AOE) {
        newParty2 = newParty2.map((u) => (u.health > 0 ? addHot(healOne(u)) : u));
      } else {
        newParty2 = newParty2.map((u) => {
          if (u.id === targetId) {
            const after = addHot(healOne(u));
            if (arch && spellId !== 'wild_growth' && isDirectHealSpell(spell, spellId)) {
              return after;
            }
            return after;
          }
          if (arch && spellId !== 'wild_growth' && isDirectHealSpell(spell, spellId) && u.health > 0) {
            return healOne(u);
          }
          return u;
        });
      }

      const healerW = newParty2.find((x) => x.id === HEALER_UNIT_ID);
      const tgt = newParty2.find((x) => x.id === targetId);
      if (tgt && s.playerClass && talentRanks(s.talents, 'binding_heal') > 0) {
        const thp = s.party.find((x) => x.id === targetId);
        const bind = (spell.healing * healMultB * critH * tMod * 0.06) * Math.min(2, talentRanks(s.talents, 'binding_heal'));
        if (healerW && thp && thp.id !== healerW.id) {
          newParty2 = newParty2.map((u) =>
            u.id === HEALER_UNIT_ID
              ? { ...u, health: Math.min(u.maxHealth, u.health + bind) }
              : u,
          );
        }
      }

      if (talentRanks(s.talents, 'beacon_of_light') > 0) {
        const tankId = s.beaconTargetId;
        if (targetId !== tankId && spell.type !== SpellType.AOE) {
          const amount = (spell.healing * healMultB * critH * tMod) * 0.5;
          newParty2 = newParty2.map((u) =>
            u.id === tankId ? { ...u, health: Math.min(u.maxHealth, u.health + amount) } : u,
          );
        }
      }

      {
        const u = newParty2.find((x) => x.id === targetId);
        if (u && isCritH && talentRanks(s.talents, 'divine_aegis') > 0) {
          const pool = (spell.healing * healMultB * critH * tMod) * 0.2 * talentRanks(s.talents, 'divine_aegis');
          newParty2 = newParty2.map((x) =>
            x.id === u.id
              ? { ...x, shield: x.shield + pool, shieldTicksRemaining: SHIELD_DEFAULT_TICKS }
              : x,
          );
        }
        if (u && isCritH && s.playerClass === ClassType.DRUID && talentRanks(s.talents, 'living_seed') > 0) {
          const am = spell.healing * healMultB * critH * tMod * 0.15;
          newParty2 = newParty2.map((x) => (x.id === u.id ? { ...x, livingSeedPool: am } : x));
        }
      }

      if (tgt && talentRanks(s.talents, 'cleanse') > 0 && isHealSpell(spell, spellId)) {
        if (Math.random() < 0.08 * talentRanks(s.talents, 'cleanse') && tgt.debuffs.length > 0) {
          newParty2 = newParty2.map((u) => {
            if (u.id !== targetId) return u;
            return { ...u, debuffs: u.debuffs.slice(0, -1) };
          });
        }
      }

      if (s.playerClass === ClassType.PRIEST && spellId === 'flash_heal' && talentRanks(s.talents, 'surge_of_light') > 0) {
        if (Math.random() < 0.1 * talentRanks(s.talents, 'surge_of_light')) {
          pbuffs = upsertPlayerBuff(pbuffs, 'surge_of_light', SURGE_OF_LIGHT_TICKS, 1);
        }
      }
      let piForCd = s.powerInfusionCastsRemaining;
      if (isCritH && talentRanks(s.talents, 'power_infusion') > 0) {
        piForCd = Math.max(piForCd, 3);
      }
      let mOut = s.mana - (surgeFree && spellId === 'greater_heal' ? 0 : needMana);
      if (s.playerClass === ClassType.PALADIN && isCritH && isDirectHealSpell(spell, spellId) && talentRanks(s.talents, 'illumination') > 0) {
        mOut = Math.min(s.maxMana, mOut + needMana);
      }
      if (s.playerClass === ClassType.PRIEST && talentRanks(s.talents, 'path_moon') > 0 && isDirectHealSpell(spell, spellId)) {
        mOut = Math.min(s.maxMana, mOut + s.maxMana * 0.01 * talentRanks(s.talents, 'path_moon'));
      }
      const manaR = s.talents.reduce((a, t) => a + (t.statBonus?.manaReturnOnDirectHeal || 0) * t.points, 0);
      const isDir = isDirectHealSpell(spell, spellId);
      mOut = Math.min(s.maxMana, mOut + (isDir ? manaR : 0));
      let enH = s.enemyHealth;
      if (s.capstoneForm === 'paladin_avenging_wrath' && s.capstoneFormTicksRemaining > 0) {
        const aoeC = newParty2.filter((q) => q.health > 0).length;
        const singleHeal = spell.healing * healMultB * critH * tMod;
        const hEcho = spell.type === SpellType.AOE ? singleHeal * aoeC : singleHeal;
        enH = Math.max(0, s.enemyHealth - hEcho * 0.5);
      }
      const nPi = runCooldown(spell.cooldown, piForCd);
      let hp2 = s.holyPower;
      if (targetId && spell.type !== SpellType.AOE) {
        const preH = s.party.find((q) => q.id === targetId);
        if (preH && preH.health < preH.maxHealth * 0.5 && talentRanks(s.talents, 'tower_of_radiance') > 0) {
          hp2 = Math.min(3, hp2 + 1);
        }
      }
      if (tower2) {
        hp2 = 0;
      }
      return {
        ...s,
        party: newParty2,
        mana: mOut,
        playerCombatBuffs: pbuffs,
        holyPower: hp2,
        powerInfusionCastsRemaining: nPi,
        enemyHealth: enH,
      };
    });
  }, []);

  // Game Loop
  useEffect(() => {
    if (!state.isCombatActive) return;

    const interval = setInterval(() => {
      setState(s => {
        if (!s.isCombatActive) return s;

        let partyAfterBossAI = s.party;
        let bossBuffsWorking: BossSelfBuff[] =
          s.combatPhase === 'BOSS' ? [...s.bossSelfBuffs] : [];

        if (s.combatPhase === 'BOSS' && s.currentDungeon) {
          const profile = bossCombatProfileForDungeon(s.currentDungeon);
          const hasBossMechanics =
            profile.debuffTemplates.length > 0 || profile.selfBuffTemplates.length > 0;
          if (hasBossMechanics) {
            bossMechanicCountdownRef.current -= 1;
            if (bossMechanicCountdownRef.current <= 0) {
              if (profile.debuffTemplates.length > 0) {
                const tpl =
                  profile.debuffTemplates[
                    Math.floor(Math.random() * profile.debuffTemplates.length)
                  ];
                partyAfterBossAI = applyBossDebuffTemplate(partyAfterBossAI, tpl);
              }
              if (profile.selfBuffTemplates.length > 0) {
                const tpl =
                  profile.selfBuffTemplates[
                    Math.floor(Math.random() * profile.selfBuffTemplates.length)
                  ];
                const withoutSame = bossBuffsWorking.filter((b) => b.sourceAbilityId !== tpl.abilityId);
                bossBuffsWorking = [
                  ...withoutSame,
                  {
                    id: `${tpl.abilityId}-${Date.now()}-${Math.random()}`,
                    name: tpl.name,
                    remainingTicks: tpl.durationTicks,
                    partyDamageMultiplier: tpl.partyDamageMultiplier,
                    icon: tpl.icon,
                    sourceAbilityId: tpl.abilityId,
                  },
                ];
              }
              bossMechanicCountdownRef.current = randomIntInclusive(
                profile.mechanicIntervalTicksMin,
                profile.mechanicIntervalTicksMax,
              );
            }
          }
        }

        const bossPartyDamageMult =
          s.combatPhase === 'BOSS' && bossBuffsWorking.length > 0
            ? Math.max(...bossBuffsWorking.map((b) => b.partyDamageMultiplier))
            : 1;

        const tankIndex = partyAfterBossAI.findIndex((u) => u.role === 'TANK');
        let newParty: Unit[] = [];
        let nextNat = s.naturalPerfectionStacks;
        for (let idx = 0; idx < partyAfterBossAI.length; idx++) {
          const unit = partyAfterBossAI[idx];
          let damage = 0;
          const chance = Math.random();
          if (unit.role === 'TANK' && chance < 0.4)
            damage = Math.random() * 8 + (s.currentDungeon?.difficulty || 1);
          else if (chance < 0.1) damage = Math.random() * 5 + (s.currentDungeon?.difficulty || 1);

          if (s.combatPhase === 'BOSS' && s.currentDungeon) {
            damage *= bossDamageMultiplierForDifficulty(s.currentDungeon.difficulty);
            damage *= bossPartyDamageMult;
          }
          if (s.currentDungeon) {
            damage *= damageTakenMultiplierFromDungeonLevelGap(unit.level, s.currentDungeon.levelMax);
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
          if (damage > 0) {
            const hit = applyDamageThroughShield(currentHealth, curShield, damage);
            currentHealth = hit.health;
            curShield = hit.shield;
            if (hit.tookHealthDamage > 0 && liveSeed > 0) {
              currentHealth = Math.min(unit.maxHealth, currentHealth + liveSeed);
              liveSeed = 0;
            }
            if (unit.role === 'HEALER' && hit.tookHealthDamage > 0 && talentRanks(s.talents, 'natural_perfection') > 0) {
              nextNat = Math.min(5, nextNat + 1);
            }
          } else {
            currentHealth = Math.max(0, currentHealth);
          }
          currentHealth = Math.max(0, currentHealth);

          const dotLevelMult = s.currentDungeon
            ? damageTakenMultiplierFromDungeonLevelGap(unit.level, s.currentDungeon.levelMax)
            : 1;
          const activeDebuffs: PartyDebuff[] = [];
          unit.debuffs.forEach((d) => {
            if (d.remainingTicks > 0) {
              currentHealth = Math.max(0, currentHealth - d.damagePerTick * dotLevelMult);
              activeDebuffs.push({ ...d, remainingTicks: d.remainingTicks - 1 });
            }
          });

          const activeBuffs: Buff[] = [];
          const photo = s.playerClass ? talentRanks(s.talents, 'photosynthesis') : 0;
          unit.buffs.forEach((buff) => {
            if (buff.remainingTicks > 0) {
              let tickAmt = buff.healingPerTick;
              if (photo > 0 && s.playerClass === ClassType.DRUID && oneHotTickDoubleRoll(photo)) {
                tickAmt *= 2;
              }
              currentHealth = Math.min(unit.maxHealth, currentHealth + tickAmt);
              activeBuffs.push({ ...buff, remainingTicks: buff.remainingTicks - 1 });
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

        const bossBuffsNext =
          s.combatPhase === 'BOSS'
            ? bossBuffsWorking
                .map((b) => ({ ...b, remainingTicks: b.remainingTicks - 1 }))
                .filter((b) => b.remainingTicks > 0)
            : [];

        const healerB = newParty.find((u) => u.role === 'HEALER');
        let nextIcd: Record<string, number> = { ...s.internalCooldowns };
        Object.keys(nextIcd).forEach((k) => {
          if ((nextIcd[k] ?? 0) > 0) {
            nextIcd[k] = (nextIcd[k] ?? 0) - 1;
          }
        });
        let pComb = tickPlayerBuffs(s.playerCombatBuffs);
        if (
          s.playerClass &&
          healerB &&
          talentRanks(s.talents, 'spirit_of_redemption') > 0 &&
          healerB.health < healerB.maxHealth * 0.3 &&
          isIcDRdy(nextIcd, 'spirit_redemption') &&
          !hasPlayerBuff(pComb, 'spirit_of_redemption_amp')
        ) {
          pComb = upsertPlayerBuff(pComb, 'spirit_of_redemption_amp', T_SPIRIT_AMP, 1);
          nextIcd = { ...nextIcd, spirit_redemption: ICD_SPIRIT_REDEMPTION };
        }
        if (s.capstoneForm === 'druid_natures_grace' && s.capstoneFormTicksRemaining > 0 && s.playerClass) {
          const ngh = 0.4 * s.level;
          newParty = newParty.map((u) =>
            u.health > 0 ? { ...u, health: Math.min(u.maxHealth, u.health + ngh) } : u,
          );
        }
        let nextCapT = s.capstoneFormTicksRemaining;
        if (nextCapT > 0) {
          nextCapT -= 1;
        }
        const nextForm: typeof s.capstoneForm = nextCapT <= 0 ? null : s.capstoneForm;

        if (newParty.every(u => u.health <= 0) || newParty.find(u => u.role === 'HEALER')?.health === 0) {
          const d = s.currentDungeon;
          if (d) {
            const allDead = newParty.every(u => u.health <= 0);
            const reason: DungeonFailureReason = allDead ? 'PARTY_WIPE' : 'HEALER_DOWN';
            queueMicrotask(() => {
              setDungeonOutcome({ kind: 'failure', dungeonName: d.name, reason });
            });
          }
          bossMechanicCountdownRef.current = 0;
          return {
            ...s,
            party: newParty,
            isCombatActive: false,
            currentDungeon: null,
            manaRegenBuffTicksRemaining: 0,
            spiritRegenLockoutTicksRemaining: 0,
            bossSelfBuffs: [],
          };
        }

        const partyDps = 2 + (s.level * 2);
        const deadDpsCount = newParty.filter(u => u.role === 'DPS' && u.health <= 0).length;
        const bossDpsMult =
          s.combatPhase === 'BOSS' ? Math.pow(0.7, deadDpsCount) : 1;
        const effectivePartyDps = partyDps * bossDpsMult;
        let currentEnemyHealth = s.enemyHealth - effectivePartyDps;
        let newTrashPulls = s.trashPullsRemaining;
        let newPhase = s.combatPhase;
        let newProgress = s.dungeonProgress;
        let newEnemyMaxHealth = s.enemyMaxHealth;

        const trashHp =
          s.currentDungeon !== null ? trashMaxHealthForDungeon(s.currentDungeon) : 1;

        if (currentEnemyHealth <= 0) {
          if (s.combatPhase === 'TRASH') {
            newTrashPulls -= 1;
            if (newTrashPulls > 0) {
              currentEnemyHealth = trashHp;
              newEnemyMaxHealth = trashHp;
            } else {
              newPhase = 'BOSS';
              currentEnemyHealth = s.currentDungeon?.bossHealth || 1000;
              newEnemyMaxHealth = s.currentDungeon?.bossHealth || 1000;
              const dung = s.currentDungeon;
              if (dung) {
                const prof = bossCombatProfileForDungeon(dung);
                bossMechanicCountdownRef.current = randomIntInclusive(
                  prof.mechanicIntervalTicksMin,
                  prof.mechanicIntervalTicksMax,
                );
              }
            }
          } else {
            const d = s.currentDungeon;
            const xpGained = d ? computeDungeonXpGain(d, s.level) : 0;
            const newXp = s.xp + xpGained;
            const meta = computeMetaFromProgress(newXp, s.playerClass, s.talents);
            const isLevelUp = meta.level > s.level;
            if (d) {
              queueMicrotask(() => {
                setDungeonOutcome({
                  kind: 'success',
                  dungeonName: d.name,
                  bossName: d.bossName,
                  xpGained,
                  levelUp: isLevelUp,
                  loot: d.lootRewards,
                });
              });
            }
            const dungeonId = d?.id ?? '';
            const completedDungeonIds =
              dungeonId && !s.completedDungeonIds.includes(dungeonId)
                ? [...s.completedDungeonIds, dungeonId]
                : s.completedDungeonIds;
            bossMechanicCountdownRef.current = 0;
            return {
              ...s,
              xp: newXp,
              level: meta.level,
              talentPoints: meta.talentPoints,
              dungeonProgress: 100,
              isCombatActive: false,
              currentDungeon: null,
              manaRegenBuffTicksRemaining: 0,
              spiritRegenLockoutTicksRemaining: 0,
              bossSelfBuffs: [],
              completedDungeonIds,
              maxMana: meta.maxMana,
              mana: Math.min(meta.maxMana, s.mana),
              party:
                s.playerClass !== null
                  ? generateRandomParty(meta.level, s.playerClass)
                  : s.party,
            };
          }
        }

        // Calculate visual progress 0-100%
        if (newPhase === 'TRASH') {
            const pullProgress = (3 - newTrashPulls) * 25;
            const trashCap = newEnemyMaxHealth > 0 ? newEnemyMaxHealth : trashHp;
            const currentPullPercent =
              trashCap > 0 ? Math.max(0, (trashCap - currentEnemyHealth) / trashCap) * 25 : 0;
            newProgress = Math.min(75, pullProgress + currentPullPercent);
        } else {
            const bossMax = s.currentDungeon?.bossHealth || 1000;
            const bossPercent = Math.max(0, (bossMax - currentEnemyHealth) / bossMax) * 25;
            newProgress = 75 + bossPercent;
        }

        const buffTicks = s.manaRegenBuffTicksRemaining;
        const lockTicks = s.spiritRegenLockoutTicksRemaining;
        const spirit =
          s.playerClass !== null ? effectivePrimaryStats(s.playerClass, s.level).spirit : 0;
        const regenThisTick = manaRegenAmountPerTick(lockTicks, buffTicks, spirit);
        const newMana = Math.min(s.maxMana, s.mana + regenThisTick);
        const nextManaRegenBuffTicks = buffTicks > 0 ? buffTicks - 1 : 0;
        const nextSpiritLockout = lockTicks > 0 ? lockTicks - 1 : 0;

        // Update cooldowns
        Object.keys(cooldownsRef.current).forEach(key => {
            if (cooldownsRef.current[key] > 0) cooldownsRef.current[key] -= 1;
        });

        return {
          ...s,
          party: newParty,
          dungeonProgress: newProgress,
          mana: newMana,
          manaRegenBuffTicksRemaining: nextManaRegenBuffTicks,
          spiritRegenLockoutTicksRemaining: nextSpiritLockout,
          enemyHealth: currentEnemyHealth,
          enemyMaxHealth: newEnemyMaxHealth,
          trashPullsRemaining: newTrashPulls,
          combatPhase: newPhase,
          bossSelfBuffs: newPhase === 'BOSS' ? bossBuffsNext : [],
          naturalPerfectionStacks: nextNat,
          playerCombatBuffs: pComb,
          capstoneForm: nextForm,
          capstoneFormTicksRemaining: nextCapT,
          internalCooldowns: nextIcd,
        };
      });
    }, TICK_RATE);

    return () => clearInterval(interval);
  }, [state.isCombatActive]);

  useEffect(() => {
    writeStoredProgress(state);
  }, [
    state.xp,
    state.level,
    state.talentPoints,
    state.talents,
    state.playerClass,
    state.completedDungeonIds,
    state.activeActionBars,
  ]);

  const actionBarHighlights = useMemo(
    () => ({
      greater_heal: hasPlayerBuff(state.playerCombatBuffs, 'surge_of_light'),
      wand: getPlayerBuffStacks(state.playerCombatBuffs, 'zeal') < ZEAL_MAX_STACKS,
    }),
    [state.playerCombatBuffs],
  );

  return {
    state,
    selectClass,
    startDungeon,
    abandonDungeon,
    castSpell,
    unlockTalent,
    reorderActionBar,
    cooldowns: cooldownsRef.current,
    dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
  };
}
