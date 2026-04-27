import {
  Buff,
  ClassType,
  GameState,
  PlayerCombatBuff,
  Spell,
  Unit,
} from './types.ts';
import {
  talentRanks,
  isHealSpell,
  isDirectHealSpell,
  upsertPlayerBuff,
  naturalPerfectionStacksFrom,
  SURGE_OF_LIGHT_TICKS,
  PLAYER_BUFF_POWER_INFUSION,
  getPlayerBuffStacks,
  grantPowerInfusionCharges,
  applyPowerInfusionCastsAfterCooldown,
  upsertSpiritRegenLockoutIfSpentMana,
  hasHotOnUnit,
} from './talentMechanics.ts';
import { rollCritAgainstEffective } from './effectivePlayerCombat.ts';
import { oneHotTickDoubleRoll, resolveSwiftmend } from './combatHelper.ts';
import { BALANCE } from './balance.ts';
import {
  applyAegisBurstsFromShieldTransitions,
  applyBeaconEcho,
  applyBindingHealSelf,
  applyDivineAegis,
  applyGraceStacksFromDirectHeal,
  applyLivingSeed,
  druidHotTickManaReturn,
  druidHotTickRateMultiplier,
  druidRampCritBonus,
  druidRampHasteBonus,
  druidBarkskinSelfHealOnDamage,
  dispellableCurseCleanseProcChance,
  stripOneDispellableDebuff,
  cultivationHotMultiplier,
  deepRootsHotMultiplier,
  devotionDamageTakenMultiplier,
  druidHarmonyDirectMultiplier,
  druidHarmonyHotTickMultiplier,
  DRUID_HARMONY_HOT_BUFF,
  DRUID_HARMONY_HOT_TICKS,
  paladinAvengingWrathSplashFraction,
  paladinEmergencyCritBonusForTarget,
  paladinEmergencyHasteBonusForTarget,
  priestSelfShieldDamageReduction,
  priestShieldMaintenanceHasteBonus,
  priestMeditativeManaReturnPerTick,
  priestFlashCritBonusFromSynergy,
  rollSurgeOfLight,
  vowCrusaderAoEMultiplier,
} from './combatHooks.ts';

export type SpecialHealCastEff = {
  healingFromProgress: number;
  critChancePercent: (naturalPerfectionStacks: number, extraCritPct?: number) => number;
};

export type HealCastContext = {
  spell: Spell;
  spellId: string;
  targetId: string;
  needMana: number;
  surgeFree: boolean;
};

export type HealLandContext = {
  spell: Spell;
  spellId: string;
  targetId: string;
  partyBeforeCast: Unit[];
  healMultB: number;
  critH: number;
  tMod: number;
  isCrit: boolean;
};

export type CritContext = HealLandContext;

export type DamageTakenContext = {
  source: 'boss_attack' | 'trash_tick';
};

export type PostHealAccumulator = {
  party: Unit[];
  playerCombatBuffs: PlayerCombatBuff[];
};

export type HealManaCostContext = {
  classType: ClassType;
  spell: Spell;
  spellId: string;
  surgeFree: boolean;
};

export type ManaAfterHealContext = {
  spell: Spell;
  spellId: string;
  needMana: number;
  surgeFree: boolean;
  isCritH: boolean;
  healTargetId: string;
};

export type HotTickModifierContext = {
  state: GameState;
  unit: Unit;
  buff: Buff;
  healPerTick: number;
};

export type SpecialHealCastContext = {
  spellId: string;
  targetId: string;
  spell: Spell;
  needMana: number;
  critRoll: number;
  runCooldown: (rawCd: number, piLeft: number) => number;
  eff: SpecialHealCastEff;
};

export function runOnHealCast(_s: GameState, _ctx: HealCastContext): void {}

export function runOnCrit(_s: GameState, _ctx: CritContext): void {}

export function runHasteBonusSum(
  s: GameState,
  classType: ClassType,
  healer: Unit | undefined,
): number {
  let bonus = 0;
  if (classType === 'DRUID' && healer) {
    const p = talentRanks(s.talents, 'photosynthesis');
    if (p > 0 && hasHotOnUnit(healer, 'DRUID')) {
      bonus += p * BALANCE.combat.druid.photosynthesisHastePerRankWhenSelfHoT;
    }
    bonus += druidRampHasteBonus(s);
  }
  if (classType === 'PRIEST') {
    bonus += priestShieldMaintenanceHasteBonus(s);
  }
  return bonus;
}

export function runHotTickAmount(ctx: HotTickModifierContext): number {
  let amt = ctx.healPerTick;
  const { state } = ctx;
  const photo = state.playerClass ? talentRanks(state.talents, 'photosynthesis') : 0;
  if (state.playerClass === 'DRUID' && photo > 0 && oneHotTickDoubleRoll(photo)) {
    amt *= 2;
  }
  amt *= druidHarmonyHotTickMultiplier(state, state.playerCombatBuffs);
  amt *= cultivationHotMultiplier(state, ctx.buff.sourceSpellId);
  amt *= deepRootsHotMultiplier(state, ctx.unit, ctx.buff.sourceSpellId);
  return amt;
}

export function runHotTickRateMultiplier(ctx: HotTickModifierContext): number {
  return druidHotTickRateMultiplier(ctx.state, ctx.buff.sourceSpellId);
}

export function runHotTickManaReturn(ctx: HotTickModifierContext): number {
  return druidHotTickManaReturn(ctx.state, ctx.buff.sourceSpellId);
}

export function runCastDirectHealMultipliers(s: GameState, spell: Spell, spellId: string): number {
  let m = druidHarmonyDirectMultiplier(s);
  if (spell.type === 'AOE') m *= vowCrusaderAoEMultiplier(s, spellId);
  return m;
}

export function runCritBonusForHealRoll(s: GameState, spellId: string, targetId: string): number {
  let bonus = 0;
  if (s.playerClass === 'PRIEST' && spellId === 'flash_heal') {
    bonus += priestFlashCritBonusFromSynergy(s);
  }
  if (s.playerClass === 'PALADIN') {
    const target = s.party.find((u) => u.id === targetId);
    bonus += paladinEmergencyCritBonusForTarget(s, target);
  }
  if (s.playerClass === 'DRUID') {
    bonus += druidRampCritBonus(s);
  }
  return bonus;
}

export function trySpecialHealCast(s: GameState, ctx: SpecialHealCastContext): GameState | null {
  if (ctx.spellId !== 'swiftmend' || s.playerClass !== 'DRUID') return null;
  const isCrit0 = rollCritAgainstEffective(
    ctx.critRoll,
    ctx.eff,
    naturalPerfectionStacksFrom(s.playerCombatBuffs),
  );
  const critMod0 = isCrit0 ? 1.5 : 1.0;
  const healMult0 = ctx.eff.healingFromProgress;
  const { party: pr, applied } = resolveSwiftmend(s, s.playerClass, ctx.targetId, healMult0, critMod0, ctx.spell);
  if (!applied) return null;
  let m0 = s.mana - ctx.needMana;
  let pbSm = s.playerCombatBuffs;
  if (isCrit0 && talentRanks(s.talents, 'power_infusion') > 0) {
    pbSm = grantPowerInfusionCharges(pbSm, 3);
  }
  const piSm = getPlayerBuffStacks(pbSm, PLAYER_BUFF_POWER_INFUSION);
  const nPiSm = ctx.runCooldown(ctx.spell.cooldown, piSm);
  pbSm = upsertSpiritRegenLockoutIfSpentMana(pbSm, ctx.needMana > 0);
  pbSm = applyPowerInfusionCastsAfterCooldown(pbSm, nPiSm);
  return { ...s, party: pr, mana: m0, playerCombatBuffs: pbSm };
}

export function runOnHealLand(
  s: GameState,
  ctx: HealLandContext,
  partyAfterDirect: Unit[],
  playerCombatBuffs: PlayerCombatBuff[],
): PostHealAccumulator {
  let acc: PostHealAccumulator = { party: partyAfterDirect, playerCombatBuffs };

  if (ctx.isCrit && talentRanks(s.talents, 'divine_aegis') > 0) {
    acc = {
      ...acc,
      party: applyDivineAegis(s, ctx.partyBeforeCast, acc.party, ctx.isCrit),
    };
  }

  if (s.playerClass && talentRanks(s.talents, 'binding_heal') > 0) {
    acc = {
      ...acc,
      party: applyBindingHealSelf(s, acc.party, ctx.targetId, ctx.spell, ctx.healMultB, ctx.critH, ctx.tMod),
    };
  }

  if (talentRanks(s.talents, 'beacon_of_light') > 0) {
    acc = {
      ...acc,
      party: applyBeaconEcho(
        s,
        acc.party,
        ctx.targetId,
        ctx.spell,
        ctx.spellId,
        ctx.healMultB,
        ctx.critH,
        ctx.tMod,
      ),
    };
  }

  if (ctx.isCrit && talentRanks(s.talents, 'living_seed') > 0) {
    acc = {
      ...acc,
      party: applyLivingSeed(
        s,
        acc.party,
        ctx.targetId,
        ctx.isCrit,
        ctx.spell,
        ctx.healMultB,
        ctx.critH,
        ctx.tMod,
      ),
    };
  }

  {
    const pCurse = dispellableCurseCleanseProcChance(s);
    const tgt = acc.party.find((x) => x.id === ctx.targetId);
    if (pCurse > 0 && tgt && isHealSpell(ctx.spell, ctx.spellId) && Math.random() < pCurse) {
      acc = {
        ...acc,
        party: acc.party.map((u) => {
          if (u.id !== ctx.targetId) return u;
          const nextDebuffs = stripOneDispellableDebuff(u.debuffs);
          if (nextDebuffs === u.debuffs) return u;
          return { ...u, debuffs: nextDebuffs };
        }),
      };
    }
  }

  if (talentRanks(s.talents, 'surge_of_light') > 0 && rollSurgeOfLight(s, ctx.spellId)) {
    acc = {
      ...acc,
      playerCombatBuffs: upsertPlayerBuff(acc.playerCombatBuffs, 'surge_of_light', SURGE_OF_LIGHT_TICKS, 1),
    };
  }

  if (talentRanks(s.talents, 'priest_grace') > 0) {
    acc = {
      ...acc,
      party: applyGraceStacksFromDirectHeal(s, acc.party, ctx.targetId, ctx.spell, ctx.spellId),
    };
  }

  if (talentRanks(s.talents, 'druid_harmony') > 0) {
    if (isDirectHealSpell(ctx.spell, ctx.spellId) && ctx.spell.type !== 'AOE') {
      acc = {
        ...acc,
        playerCombatBuffs: upsertPlayerBuff(
          acc.playerCombatBuffs,
          DRUID_HARMONY_HOT_BUFF,
          DRUID_HARMONY_HOT_TICKS,
          1,
        ),
      };
    }
  }

  return acc;
}

export function runDamageTakenMultiplier(s: GameState, _ctx: DamageTakenContext): number {
  let m = devotionDamageTakenMultiplier(s);
  m *= 1 - priestSelfShieldDamageReduction(s);
  return m;
}

export function runPriestMeditativeManaReturnPerTick(
  s: GameState,
  spiritRegenLockoutTicksRemaining: number,
): number {
  return priestMeditativeManaReturnPerTick(s, spiritRegenLockoutTicksRemaining);
}

export function runPaladinEmergencyHasteBonusForTarget(s: GameState, targetId: string): number {
  return paladinEmergencyHasteBonusForTarget(
    s,
    s.party.find((unit) => unit.id === targetId),
  );
}

export function runDruidBarkskinSelfHealOnDamage(s: GameState, damageTaken: number): number {
  return druidBarkskinSelfHealOnDamage(s, damageTaken);
}

export function runPaladinAvengingWrathSplashFraction(s: GameState): number {
  return paladinAvengingWrathSplashFraction(s);
}

export function runOnShieldTransition(s: GameState, partyBefore: Unit[], partyAfter: Unit[]): Unit[] {
  return applyAegisBurstsFromShieldTransitions(s, partyBefore, partyAfter);
}
