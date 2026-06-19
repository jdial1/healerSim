import { GameState, PlayerCombatBuff, Spell, Unit } from './types.ts';
import { MANA_POTION_USES_PER_DUNGEON } from './constants.ts';
import { manaPotionInstantMana, manaPotionOverTimeTotal } from './manaPotionIcon.ts';
import { spellHasTag } from './constants.ts';
import { getSpellRank, getUniqueStatRating, getRankHealMult } from './playerStats.ts';
import {
  getRanks,
  hasBuff,
  removeBuff,
  isDirectHeal,
  isHeal,
  getHealer,
  PLAYER_BUFF_POWER_INFUSION,
  getBuffStacks,
  addSpiritLockoutIfSpent,
  applyPiAfterCd,
  addPiCharges,
  addBuff,
  PLAYER_BUFF_MANA_REGEN_POTION,
  getNaturalPerfectionStacks,
} from './talentMechanics.ts';
import {
  computeEffectivePlayerCombatStats,
  rollCritAgainstEffective,
  type EffectivePlayerCombatStats,
} from './effectivePlayerCombat.ts';
import {
  getManaCost,
  applyHot,
  getSynergyMultiplier,
  canSwiftmend,
} from './combatHelper.ts';
import { BALANCE } from './constants.ts';
import {
  getDirectHealMultiplier,
  getCritBonus,
  onCrit,
  onHealCast,
  onHealLand,
  trySpecialHealCast,
  getEmergencyHaste,
  onManaAfterHeal,
} from './combatHookRegistry.ts';
import { diffFloats, mergeFloats } from './floatingCombatText.ts';
import { getHealSplit } from './healMath.ts';
import { archangelEchoShieldBonusFraction, archangelSkipsSpell, graceHealMultiplierOnTarget, isPriestSurgeFinisher, PLAYER_BUFF_OMEN_CLEARCASTING, priestDivinityOverhealAbsorb } from './classes/priest/hooks.ts';
import { paladinAvengingWrathSplashFraction, paladinRadianceHealMultiplier } from './classes/paladin/hooks.ts';

function priestSpellLeavesHoTs(spell: Spell): boolean {
  return spell.type === 'HOT' || Boolean(spell.hotDuration && spell.hotDuration > 0);
}

export type CastRuntime = {
  scheduleCooldown: (p: {
    spellId: string;
    rawCooldownTicks: number;
    hastePct: number;
    powerInfusionStacks: number;
  }) => number;
};

export type CastInput = {
  spell: Spell;
  spellId: string;
  targetId: string;
  critRoll: number;
};

type SwiftmendReady = {
  kind: 'swiftmend';
  spell: Spell;
  spellId: string;
  targetId: string;
  eff: EffectivePlayerCombatStats;
  needMana: number;
  critRoll: number;
};

type ManaPotionReady = {
  kind: 'mana_potion';
  spell: Spell;
  spellId: string;
  targetId: string;
  eff: EffectivePlayerCombatStats;
  needMana: number;
};

type StandardReady = {
  kind: 'standard';
  spell: Spell;
  spellId: string;
  targetId: string;
  eff: EffectivePlayerCombatStats;
  needMana: number;
  surgeFree: boolean;
  healMultB: number;
  isCrit: boolean;
  critH: number;
  tower2: boolean;
  tMod: number;
  arch: boolean;
  paladinEmergencyHasteBonus: number;
  pbuffsBaseline: PlayerCombatBuff[];
  rankHealMult: number;
};

export type ReadyCast = SwiftmendReady | ManaPotionReady | StandardReady;

type CommonValidated = {
  eff: EffectivePlayerCombatStats;
  needMana: number;
  healer: Unit;
};

function buildCommonValidated(
  s: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
): CommonValidated | null {
  const { spell, spellId, targetId, critRoll: _critRoll } = input;
  if (!s.playerClass) return null;
  if (cooldownRemainTicks > 0) return null;
  if (spellId === 'mana_potion' && s.manaPotionsUsedThisDungeon >= MANA_POTION_USES_PER_DUNGEON) {
    return null;
  }
  const healerU = getHealer(s.party);
  if (!healerU) return null;
  const eff = computeEffectivePlayerCombatStats(s);
  if (!eff) return null;
  const surgeFree =
    hasBuff(s.playerCombatBuffs, 'surge_of_light') && isPriestSurgeFinisher(spellId);
  const needMana = getManaCost(s, s.playerClass, spell, spellId, surgeFree);
  if (s.mana < needMana) return null;
  const healTgt0 = s.party.find((x) => x.id === targetId);
  if (spell.type !== 'AOE' && isHeal(spell, spellId) && healTgt0 && healTgt0.health <= 0) {
    return null;
  }
  return { eff, needMana, healer: healerU };
}

function validateSwiftmendExclusive(
  s: GameState,
  input: CastInput,
  common: CommonValidated,
): SwiftmendReady | null {
  if (!canSwiftmend(s, input.targetId)) return null;
  return {
    kind: 'swiftmend',
    spell: input.spell,
    spellId: input.spellId,
    targetId: input.targetId,
    eff: common.eff,
    needMana: common.needMana,
    critRoll: input.critRoll,
  };
}

function validateManaPotionReady(
  _s: GameState,
  input: CastInput,
  common: CommonValidated,
): ManaPotionReady {
  return {
    kind: 'mana_potion',
    spell: input.spell,
    spellId: input.spellId,
    targetId: input.targetId,
    eff: common.eff,
    needMana: common.needMana,
  };
}

function validateStandardHeal(s: GameState, input: CastInput, common: CommonValidated): StandardReady {
  const { spell, spellId, targetId, critRoll } = input;
  const surgeFree =
    hasBuff(s.playerCombatBuffs, 'surge_of_light') && isPriestSurgeFinisher(spellId);
  const healMultB =
    common.eff.baseHealingMultiplier * common.eff.spiritRedemptionHealingMultiplier;
  const flashCrit = getCritBonus(s, spellId, targetId);
  const isCrit = rollCritAgainstEffective(
    critRoll,
    common.eff,
    getNaturalPerfectionStacks(s.playerCombatBuffs),
    flashCrit,
  );
  const critH = isCrit ? 1.5 : 1.0;
  const tower2 = s.holyPower >= 3 && isDirectHeal(spell, spellId);
  const tMod = tower2 ? 2 : 1;
  const arch = s.capstoneForm === 'priest_archangel' && hasBuff(s.playerCombatBuffs, 'archangel');
  const paladinEmergencyHasteBonus = getEmergencyHaste(s, targetId);
  let pbuffsBaseline = s.playerCombatBuffs;
  if (surgeFree) {
    pbuffsBaseline = removeBuff(pbuffsBaseline, 'surge_of_light');
  }
  if (
    s.playerClass === 'DRUID' &&
    hasBuff(s.playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING) &&
    (spellId === 'regrowth' || spellId === 'healing_touch')
  ) {
    pbuffsBaseline = removeBuff(pbuffsBaseline, PLAYER_BUFF_OMEN_CLEARCASTING);
  }
  const rankHealMult = s.playerClass
    ? getRankHealMult(getSpellRank(spellId, s.playerClass, s.level))
    : 1;
  return {
    kind: 'standard',
    spell,
    spellId,
    targetId,
    eff: common.eff,
    needMana: common.needMana,
    surgeFree,
    healMultB,
    isCrit,
    critH,
    tower2,
    tMod,
    arch,
    paladinEmergencyHasteBonus,
    pbuffsBaseline,
    rankHealMult,
  };
}

type SpecialCastResolve = ReadyCast | null | 'standard';

const SPECIAL_CAST_BY_SPELL_ID: Partial<
  Record<string, (s: GameState, input: CastInput, common: CommonValidated) => SpecialCastResolve>
> = {
  swiftmend: (s, input, common) => {
    if (s.playerClass !== 'DRUID') return 'standard';
    return validateSwiftmendExclusive(s, input, common);
  },
  mana_potion: (s, input, common) => validateManaPotionReady(s, input, common),
};

export function validateCast(
  s: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
): ReadyCast | null {
  const common = buildCommonValidated(s, input, cooldownRemainTicks);
  if (!common) return null;
  const special = SPECIAL_CAST_BY_SPELL_ID[input.spellId];
  if (special) {
    const r = special(s, input, common);
    if (r === 'standard') return validateStandardHeal(s, input, common);
    return r;
  }
  return validateStandardHeal(s, input, common);
}

export function applyCast(s: GameState, ready: ReadyCast, rt: CastRuntime): GameState {
  switch (ready.kind) {
    case 'swiftmend':
      return applySwiftmendCast(s, ready, rt);
    case 'mana_potion':
      return applyManaPotionCast(s, ready, rt);
    case 'standard':
      return applyStandardHealCast(s, ready, rt);
  }
}

export function tryCast(
  s: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
  rt: CastRuntime,
): GameState {
  const ready = validateCast(s, input, cooldownRemainTicks);
  if (!ready) return s;
  return applyCast(s, ready, rt);
}

function applySwiftmendCast(s: GameState, ready: SwiftmendReady, rt: CastRuntime): GameState {
  const { spell, spellId, targetId, eff, needMana, critRoll } = ready;
  const out = trySpecialHealCast(s, {
    spellId,
    targetId,
    spell,
    needMana,
    critRoll,
    eff: {
      baseHealingMultiplier: eff.baseHealingMultiplier,
      critChancePercent: eff.critChancePercent,
    },
    runCooldown: (rawCd, piLeft) =>
      rt.scheduleCooldown({
        spellId,
        rawCooldownTicks: rawCd,
        hastePct: eff.hastePercent,
        powerInfusionStacks: piLeft,
      }),
  });
  return out ?? s;
}

function applyManaPotionCast(s: GameState, ready: ManaPotionReady, rt: CastRuntime): GameState {
  const { spell, spellId, eff } = ready;
  const durTicks = spell.manaRegenBuffDurationTicks ?? 0;
  const dripPerTick = durTicks > 0 ? manaPotionOverTimeTotal(s.level) / durTicks : 0;
  const newManaP = Math.min(s.maxMana, s.mana + manaPotionInstantMana(s.level));
  const nPiP = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks: spell.cooldown,
    hastePct: eff.hastePercent,
    powerInfusionStacks: getBuffStacks(s.playerCombatBuffs, PLAYER_BUFF_POWER_INFUSION),
  });
  let pbMp = addBuff(
    s.playerCombatBuffs,
    PLAYER_BUFF_MANA_REGEN_POTION,
    durTicks,
    1,
    { potionDripPerTick: dripPerTick },
  );
  pbMp = applyPiAfterCd(pbMp, nPiP);
  return {
    ...s,
    mana: newManaP,
    manaPotionsUsedThisDungeon: s.manaPotionsUsedThisDungeon + 1,
    playerCombatBuffs: pbMp,
  };
}

function patchPartyStandardDirectAndHot(
  s: GameState,
  ready: StandardReady,
): { newParty: Unit[]; healEff: number; healOh: number } {
  const { spell, spellId, targetId, healMultB, critH, tMod, arch, eff, rankHealMult } = ready;
  const hTickScale = eff.hasteTickScale;
  const archShieldBonus = archangelEchoShieldBonusFraction(s, spellId, spell);
  const archEchoTargets = arch
    ? s.party.filter((u) => u.health > 0 && u.id !== targetId).length
    : 0;
  const archEchoBonusPerTarget = archEchoTargets > 0 ? archShieldBonus / archEchoTargets : 0;
  const awSplashFraction = paladinAvengingWrathSplashFraction(s);
  const graceRanks = getRanks(s.talents, 'priest_grace');
  const shieldTicksDefault = BALANCE.combat.shared.shieldDefaultTicks;
  let newParty2 = s.party.map((u) => ({ ...u, buffs: u.buffs.map((b) => ({ ...b })) }));
  let patchHealEff = 0;
  let patchHealOh = 0;
  const healOne = (u: Unit) => {
    if (u.health <= 0) return u;
    const syn = getSynergyMultiplier(u, spellId);
    const gr = graceHealMultiplierOnTarget(u, graceRanks);
    const healAmp = getDirectHealMultiplier(s, spell, spellId);
    const rad = s.playerClass === 'PALADIN' ? paladinRadianceHealMultiplier(s, u) : 1;
    const directAmt = spell.healing * rankHealMult * healMultB * critH * tMod * syn * gr * healAmp * rad;
    const room = Math.max(0, u.maxHealth - u.health);
    const applied = Math.min(room, directAmt);
    const overheal = Math.max(0, directAmt - applied);
    patchHealEff += applied;
    patchHealOh += overheal;
    let shieldAdd = 0;
    if (s.playerClass === 'PRIEST' && overheal > 0) {
      const rating = getUniqueStatRating(s.playerClass, s.level, s.talents);
      shieldAdd = priestDivinityOverhealAbsorb(overheal, rating);
    }
    const th = Math.min(u.maxHealth, u.health + directAmt);
    const nextShield = u.shield + shieldAdd;
    let nextShieldTicks = u.shieldTicksRemaining;
    if (shieldAdd > 0) nextShieldTicks = shieldTicksDefault;
    if (nextShield <= 0) nextShieldTicks = 0;
    return { ...u, health: th, shield: nextShield, shieldTicksRemaining: nextShieldTicks };
  };
  const addHot = (u: Unit) => {
    if (u.health <= 0) return u;
    if (spell.type !== 'HOT' && !spell.hotDuration) return u;
    const tHot = (spell.hotHealingPerTick || 0) * rankHealMult * healMultB * critH;
    const bloomBurst =
      spell.id === 'lifebloom' ? Math.max(0, spell.healing * rankHealMult) : undefined;
    return applyHot(u, spell, tHot, {
      hasteTickScale: hTickScale,
      bloomBurstHeal: bloomBurst,
    });
  };
  const directBase = spell.healing * rankHealMult * healMultB * critH * tMod;
  if (spell.type === 'AOE') {
    newParty2 = newParty2.map((u) => (u.health > 0 ? addHot(healOne(u)) : u));
  } else {
    let splashDone = false;
    newParty2 = newParty2.map((u) => {
      if (u.id === targetId) {
        const healed = addHot(healOne(u));
        if (awSplashFraction > 0 && !splashDone && isDirectHeal(spell, spellId)) {
          splashDone = true;
          let bestId: string | null = null;
          let bestPct = 2;
          for (const ally of newParty2) {
            if (ally.id === targetId || ally.health <= 0) continue;
            const pct = ally.health / ally.maxHealth;
            if (pct < bestPct) {
              bestPct = pct;
              bestId = ally.id;
            }
          }
          if (bestId) {
            const splashRaw = directBase * awSplashFraction;
            newParty2 = newParty2.map((ally) => {
              if (ally.id !== bestId) return ally;
              const { eff: se, oh: soh } = getHealSplit(ally.health, ally.maxHealth, splashRaw);
              patchHealEff += se;
              patchHealOh += soh;
              return { ...ally, health: Math.min(ally.maxHealth, ally.health + splashRaw) };
            });
          }
        }
        return healed;
      }
      if (arch && !archangelSkipsSpell(spellId) && isDirectHeal(spell, spellId) && u.health > 0) {
        const healed = healOne(u);
        if (archEchoBonusPerTarget <= 0) return healed;
        const { eff: ae, oh: aoh } = getHealSplit(
          healed.health,
          healed.maxHealth,
          archEchoBonusPerTarget,
        );
        patchHealEff += ae;
        patchHealOh += aoh;
        return {
          ...healed,
          health: Math.min(healed.maxHealth, healed.health + archEchoBonusPerTarget),
        };
      }
      return u;
    });
  }
  if (arch && archShieldBonus > 0) {
    newParty2 = newParty2.map((u) => ({ ...u, shield: 0, shieldTicksRemaining: 0 }));
  }
  return { newParty: newParty2, healEff: patchHealEff, healOh: patchHealOh };
}

function applyStandardHealCast(s: GameState, ready: StandardReady, rt: CastRuntime): GameState {
  const {
    spell,
    spellId,
    targetId,
    needMana,
    surgeFree,
    isCrit: isCritH,
    tower2,
    paladinEmergencyHasteBonus,
    pbuffsBaseline,
    eff,
  } =
    ready;
  let castBuffs = pbuffsBaseline;
  let weaveDirectMult = 1;
  let weaveHotMult = 1;
  if (s.playerClass === 'PRIEST') {
    if (priestSpellLeavesHoTs(spell) && hasBuff(castBuffs, 'priest_weave_hot')) {
      weaveHotMult += 0.2;
      castBuffs = removeBuff(castBuffs, 'priest_weave_hot');
    }
    if (isDirectHeal(spell, spellId) && hasBuff(castBuffs, 'priest_weave_direct')) {
      weaveDirectMult += 0.15;
      castBuffs = removeBuff(castBuffs, 'priest_weave_direct');
    }
  }
  onHealCast(s, { spell, spellId, targetId, needMana, surgeFree });
  const readyWithWeave = {
    ...ready,
    healMultB: ready.healMultB * (isDirectHeal(spell, spellId) ? weaveDirectMult : weaveHotMult),
    pbuffsBaseline: castBuffs,
  };
  const {
    newParty: partyAfterDirectHot,
    healEff: patchEff,
    healOh: patchOh,
  } = patchPartyStandardDirectAndHot(s, readyWithWeave);
  const landCtx = {
    spell,
    spellId,
    targetId,
    partyBeforeCast: s.party,
    healMultB: ready.healMultB,
    critH: ready.critH,
    tMod: ready.tMod,
    isCrit: isCritH,
    rankHealMult: ready.rankHealMult,
  };
  let postHeal = onHealLand(s, landCtx, partyAfterDirectHot, castBuffs);
  let newParty2 = postHeal.party;
  let pbuffs = postHeal.playerCombatBuffs;
  onCrit(s, landCtx);
  if (
    isCritH &&
    isHeal(spell, spellId) &&
    getRanks(s.talents, 'power_infusion') > 0
  ) {
    pbuffs = addPiCharges(pbuffs, 3);
  }
  if (s.playerClass === 'PRIEST' && priestSpellLeavesHoTs(spell)) {
    pbuffs = addBuff(pbuffs, 'priest_weave_direct', 80, 1);
  } else if (
    s.playerClass === 'PRIEST' &&
    isDirectHeal(spell, spellId) &&
    spell.type !== 'AOE'
  ) {
    pbuffs = addBuff(pbuffs, 'priest_weave_hot', 80, 1);
  }
  if (
    s.playerClass === 'DRUID' &&
    spellId === 'healing_touch' &&
    isCritH &&
    getRanks(s.talents, 'photosynthesis') > 0
  ) {
    newParty2 = newParty2.map((unit) => ({
      ...unit,
      buffs: unit.buffs.map((buff) =>
        buff.remainingTicks > 0 && spellHasTag(buff.sourceSpellId, 'druid-hot')
          ? { ...buff, remainingTicks: buff.remainingTicks + 20 }
          : buff,
      ),
    }));
  }
  let mOut = onManaAfterHeal(s, spell, spellId, needMana, surgeFree, isCritH, targetId, s.mana - needMana);
  const rawCooldownTicks =
    s.playerClass === 'PALADIN' &&
    spellId === 'light_of_dawn' &&
    s.holyPower >= 3 &&
    (s.talents.find((t) => t.id === 'h_r5c4')?.points ?? 0) > 0
      ? 0
      : spell.cooldown;
  const nPi = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks,
    hastePct: eff.hastePercent + paladinEmergencyHasteBonus,
    powerInfusionStacks: getBuffStacks(pbuffs, PLAYER_BUFF_POWER_INFUSION),
  });
  let hp2 = s.holyPower;
  if (targetId && spell.type !== 'AOE') {
    const preH = s.party.find((q) => q.id === targetId);
    if (preH && preH.health < preH.maxHealth * 0.5 && getRanks(s.talents, 'tower_of_radiance') > 0) {
      const gain =
        s.capstoneForm === 'paladin_avenging_wrath' && hasBuff(pbuffs, 'avenging_wrath_aura') ? 2 : 1;
      hp2 = Math.min(3, hp2 + gain);
    }
  }
  if (
    s.playerClass === 'PALADIN' &&
    isCritH &&
    (s.talents.find((t) => t.id === 'h_r5c4')?.points ?? 0) > 0 &&
    Math.random() < 0.25
  ) {
    hp2 = Math.min(3, hp2 + 1);
  }
  if (tower2) {
    hp2 = 0;
  }
  const spentManaForSpiritRegen =
    needMana > 0 && !(surgeFree && isPriestSurgeFinisher(spellId));
  pbuffs = addSpiritLockoutIfSpent(pbuffs, spentManaForSpiritRegen);
  pbuffs = applyPiAfterCd(pbuffs, nPi);
  const fctDrafts = diffFloats(s.party, newParty2, isCritH);
  const healEffCast = patchEff + postHeal.healEff;
  const healOhCast = patchOh + postHeal.healOh;
  const manaSpentHeal = isHeal(spell, spellId) ? Math.max(0, s.mana - mOut) : 0;
  return {
    ...s,
    party: newParty2,
    mana: mOut,
    playerCombatBuffs: pbuffs,
    holyPower: hp2,
    enemyHealth: s.enemyHealth,
    floatingCombatTexts: mergeFloats(
      s.floatingCombatTexts,
      s.combatElapsedTicks,
      fctDrafts,
    ),
    dungeonRunHealEffective: s.dungeonRunHealEffective + healEffCast,
    dungeonRunHealOverheal: s.dungeonRunHealOverheal + healOhCast,
    dungeonRunManaSpentHealing: s.dungeonRunManaSpentHealing + manaSpentHeal,
  };
}
