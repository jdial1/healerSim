import { GameState, PlayerCombatBuff, Spell, Unit } from './types.ts';
import { MANA_POTION_USES_PER_DUNGEON } from './constants.ts';
import {
  talentRanks,
  hasPlayerBuff,
  withBuffRemoved,
  isDirectHealSpell,
  isHealSpell,
  healerInParty,
  PLAYER_BUFF_POWER_INFUSION,
  getPlayerBuffStacks,
  upsertSpiritRegenLockoutIfSpentMana,
  applyPowerInfusionCastsAfterCooldown,
  grantPowerInfusionCharges,
  upsertPlayerBuff,
  PLAYER_BUFF_MANA_REGEN_POTION,
  naturalPerfectionStacksFrom,
} from './talentMechanics.ts';
import {
  computeEffectivePlayerCombatStats,
  rollCritAgainstEffective,
  type EffectivePlayerCombatStats,
} from './effectivePlayerCombat.ts';
import {
  nextManaForSpell,
  applyPandemicHotToUnit,
  directHealSynergyMultiplier,
  swiftmendCanApply,
} from './combatHelper.ts';
import {
  archangelSkipsSpell,
  graceHealMultiplierOnTarget,
  isPriestSurgeFinisher,
  resolveManaAfterHealCast,
} from './combatHooks.ts';
import {
  runCastDirectHealMultipliers,
  runCritBonusForHealRoll,
  runOnCrit,
  runOnHealCast,
  runOnHealLand,
  trySpecialHealCast,
} from './combatPipeline.ts';

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
  pbuffsBaseline: PlayerCombatBuff[];
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
  const healerU = healerInParty(s.party);
  if (!healerU) return null;
  const eff = computeEffectivePlayerCombatStats(s);
  if (!eff) return null;
  const surgeFree =
    hasPlayerBuff(s.playerCombatBuffs, 'surge_of_light') && isPriestSurgeFinisher(spellId);
  const needMana = nextManaForSpell(s, s.playerClass, spell, spellId, surgeFree);
  if (s.mana < needMana) return null;
  const healTgt0 = s.party.find((x) => x.id === targetId);
  if (spell.type !== 'AOE' && isHealSpell(spell, spellId) && healTgt0 && healTgt0.health <= 0) {
    return null;
  }
  return { eff, needMana, healer: healerU };
}

function validateSwiftmendExclusive(
  s: GameState,
  input: CastInput,
  common: CommonValidated,
): SwiftmendReady | null {
  if (!swiftmendCanApply(s, input.targetId)) return null;
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
    hasPlayerBuff(s.playerCombatBuffs, 'surge_of_light') && isPriestSurgeFinisher(spellId);
  const healMultB =
    common.eff.healingFromProgress * common.eff.spiritRedemptionHealingMultiplier;
  const flashCrit = runCritBonusForHealRoll(s, spellId);
  const isCrit = rollCritAgainstEffective(
    critRoll,
    common.eff,
    naturalPerfectionStacksFrom(s.playerCombatBuffs),
    flashCrit,
  );
  const critH = isCrit ? 1.5 : 1.0;
  const tower2 = s.holyPower >= 3 && isDirectHealSpell(spell, spellId);
  const tMod = tower2 ? 2 : 1;
  const arch = s.capstoneForm === 'priest_archangel' && hasPlayerBuff(s.playerCombatBuffs, 'archangel');
  let pbuffsBaseline = s.playerCombatBuffs;
  if (surgeFree) {
    pbuffsBaseline = withBuffRemoved(pbuffsBaseline, 'surge_of_light');
  }
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
    pbuffsBaseline,
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

export function validateSpellCast(
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

export function applyReadyCast(s: GameState, ready: ReadyCast, rt: CastRuntime): GameState {
  switch (ready.kind) {
    case 'swiftmend':
      return applySwiftmendCast(s, ready, rt);
    case 'mana_potion':
      return applyManaPotionCast(s, ready, rt);
    case 'standard':
      return applyStandardHealCast(s, ready, rt);
  }
}

export function tryApplySpellCast(
  s: GameState,
  input: CastInput,
  cooldownRemainTicks: number,
  rt: CastRuntime,
): GameState {
  const ready = validateSpellCast(s, input, cooldownRemainTicks);
  if (!ready) return s;
  return applyReadyCast(s, ready, rt);
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
      healingFromProgress: eff.healingFromProgress,
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
  const newManaP = Math.min(s.maxMana, s.mana + (spell.manaRestore || 0));
  const nPiP = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks: spell.cooldown,
    hastePct: eff.hastePercent,
    powerInfusionStacks: getPlayerBuffStacks(s.playerCombatBuffs, PLAYER_BUFF_POWER_INFUSION),
  });
  let pbMp = upsertPlayerBuff(
    s.playerCombatBuffs,
    PLAYER_BUFF_MANA_REGEN_POTION,
    spell.manaRegenBuffDurationTicks ?? 0,
    1,
  );
  pbMp = applyPowerInfusionCastsAfterCooldown(pbMp, nPiP);
  return {
    ...s,
    mana: newManaP,
    manaPotionsUsedThisDungeon: s.manaPotionsUsedThisDungeon + 1,
    playerCombatBuffs: pbMp,
  };
}

function patchPartyStandardDirectAndHot(s: GameState, ready: StandardReady): { newParty: Unit[] } {
  const { spell, spellId, targetId, healMultB, critH, tMod, arch, eff } = ready;
  const hTickScale = eff.hasteTickScale;
  let newParty2 = s.party.map((u) => ({ ...u, buffs: u.buffs.map((b) => ({ ...b })) }));
  const healOne = (u: Unit) => {
    if (u.health <= 0) return u;
    const syn = directHealSynergyMultiplier(u, spellId);
    const gr = graceHealMultiplierOnTarget(u);
    const healAmp = runCastDirectHealMultipliers(s, spell, spellId);
    const directAmt = spell.healing * healMultB * critH * tMod * syn * gr * healAmp;
    const th = Math.min(u.maxHealth, u.health + directAmt);
    return { ...u, health: th };
  };
  const addHot = (u: Unit) => {
    if (u.health <= 0) return u;
    if (spell.type !== 'HOT' && !spell.hotDuration) return u;
    const tHot = (spell.hotHealingPerTick || 0) * healMultB * critH;
    return applyPandemicHotToUnit(u, spell, tHot, { hasteTickScale: hTickScale });
  };
  if (spell.type === 'AOE') {
    newParty2 = newParty2.map((u) => (u.health > 0 ? addHot(healOne(u)) : u));
  } else {
    newParty2 = newParty2.map((u) => {
      if (u.id === targetId) {
        return addHot(healOne(u));
      }
      if (arch && !archangelSkipsSpell(spellId) && isDirectHealSpell(spell, spellId) && u.health > 0) {
        return healOne(u);
      }
      return u;
    });
  }
  return { newParty: newParty2 };
}

function applyStandardHealCast(s: GameState, ready: StandardReady, rt: CastRuntime): GameState {
  const { spell, spellId, targetId, needMana, surgeFree, isCrit: isCritH, tower2, pbuffsBaseline, eff } =
    ready;
  runOnHealCast(s, { spell, spellId, targetId, needMana, surgeFree });
  const { newParty: partyAfterDirectHot } = patchPartyStandardDirectAndHot(s, ready);
  const landCtx = {
    spell,
    spellId,
    targetId,
    partyBeforeCast: s.party,
    healMultB: ready.healMultB,
    critH: ready.critH,
    tMod: ready.tMod,
    isCrit: isCritH,
  };
  let postHeal = runOnHealLand(s, landCtx, partyAfterDirectHot, pbuffsBaseline);
  let newParty2 = postHeal.party;
  let pbuffs = postHeal.playerCombatBuffs;
  runOnCrit(s, landCtx);
  if (isCritH && talentRanks(s.talents, 'power_infusion') > 0) {
    pbuffs = grantPowerInfusionCharges(pbuffs, 3);
  }
  let mOut = resolveManaAfterHealCast(s, spell, spellId, needMana, surgeFree, isCritH, targetId);
  const nPi = rt.scheduleCooldown({
    spellId,
    rawCooldownTicks: spell.cooldown,
    hastePct: eff.hastePercent,
    powerInfusionStacks: getPlayerBuffStacks(pbuffs, PLAYER_BUFF_POWER_INFUSION),
  });
  let hp2 = s.holyPower;
  if (targetId && spell.type !== 'AOE') {
    const preH = s.party.find((q) => q.id === targetId);
    if (preH && preH.health < preH.maxHealth * 0.5 && talentRanks(s.talents, 'tower_of_radiance') > 0) {
      hp2 = Math.min(3, hp2 + 1);
    }
  }
  if (tower2) {
    hp2 = 0;
  }
  const spentManaForSpiritRegen =
    needMana > 0 && !(surgeFree && isPriestSurgeFinisher(spellId));
  pbuffs = upsertSpiritRegenLockoutIfSpentMana(pbuffs, spentManaForSpiritRegen);
  pbuffs = applyPowerInfusionCastsAfterCooldown(pbuffs, nPi);
  return {
    ...s,
    party: newParty2,
    mana: mOut,
    playerCombatBuffs: pbuffs,
    holyPower: hp2,
    enemyHealth: s.enemyHealth,
  };
}
