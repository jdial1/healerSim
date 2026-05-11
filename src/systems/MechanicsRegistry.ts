import { BALANCE } from '../data/index';
import { ICD_SPIRIT_REDEMPTION, PLAYER_BUFF_OMEN_CLEARCASTING } from './Constants';
import {
  getClassBlueprint,
  getHealSplit,
  getHealingMultiplier,
  getRankHealMult,
  getSpellRank,
  getUniqueStatRating,
  mapEntityById,
  spellHasTag,
  diffFloats,
  T_SPIRIT_AMP,
} from '../core/mechanics/formulas';
import type {
  GameState,
  Spell,
  Talent,
  Unit,
  EffectCategory,
  StatusEffect,
  HealLandContext,
  HealAccumulator,
  HolyPowerAfterHealCtx,
  ResourceTickOutcome,
  HotTickPlayerEffectsCtx,
} from './Types';
import { mergePowerInfusionCharges } from './powerInfusionCharges';
import { generateCombatUid } from '../uids';
import type {
  OnCritMechanicKey,
  OnHealLandMechanicKey,
  DirectHealTargetAmpKey,
  CastHasteBonusKey,
  HealCastCooldownKey,
  HolyPowerStepAfterHealKey,
  OnResourceTickMechanicKey,
  PassiveCombatHasteBonusKey,
  HotTickPlayerEffectsKey,
} from './Types';

const PRIEST = BALANCE.combat.priest;
const SHARED = BALANCE.combat.shared;
const DRUID = BALANCE.combat.druid;
const PALADIN = BALANCE.combat.paladin;

function rk(talents: Talent[], idOrMech: string): number {
  const t = talents.find((x) => x.id === idOrMech || x.mechanicId === idOrMech);
  return t?.points ?? 0;
}

function mergeHelpfulPlayerBuff(
  buffs: StatusEffect[],
  id: string,
  ticks: number,
  stacks: number,
): StatusEffect[] {
  const i = buffs.findIndex((b) => b.id === id);
  if (i < 0) {
    const newBuff: StatusEffect = {
      id,
      name: id,
      icon: '',
      remainingTicks: ticks,
      category: 'helpful' as EffectCategory,
      sourceId: id,
      stacks,
    };
    return [...buffs, newBuff];
  }
  const prev = buffs[i];
  const next = [...buffs];
  next[i] = { ...prev, remainingTicks: Math.max(ticks, prev.remainingTicks), stacks };
  return next;
}

function helpfulBuffTicksActive(effects: StatusEffect[], buffId: string): boolean {
  const b = effects.find((x) => x.id === buffId);
  return !!b && b.remainingTicks > 0;
}

function icdReady(icds: Record<string, number>, key: string): boolean {
  return (icds[key] ?? 0) <= 0;
}

function auraTicksActive(playerEffects: StatusEffect[], auraId: string): boolean {
  const b = playerEffects.find((x) => x.id === auraId);
  return !!b && b.remainingTicks > 0;
}

function isDirectHeal(
  spell: { type: string; healing: number; hotDuration?: number } | undefined,
  spellId: string,
): boolean {
  if (spellId === 'mana_potion') return false;
  if (!spell) return false;
  if (spell.type === 'AOE' || spell.type === 'DIRECT') return true;
  if (spell.type === 'HOT' && (spell.healing ?? 0) > 0) return true;
  return false;
}

function beaconEchoMultiplier(s: GameState): number {
  let m = PALADIN.beaconEchoBaseMultiplier;
  if (rk(s.talents, 'paladin_vow_protector') > 0) {
    m += PALADIN.beaconEchoVowBonusPerRank * rk(s.talents, 'paladin_vow_protector');
  }
  return m;
}

export function mechanicDivineAegis(ctx: HealLandContext, acc: HealAccumulator): HealAccumulator {
  const s = ctx.state;
  if (!ctx.isCrit || rk(s.talents, 'divine_aegis') <= 0) return acc;
  const daRanks = rk(s.talents, 'divine_aegis');
  let mult = PRIEST.divineAegisShieldFractionPerRank * daRanks;
  if (s.playerClass === 'PRIEST') {
    const rating = getUniqueStatRating(s.playerClass, s.level, s.talents);
    mult *= 1 + rating * PRIEST.divinityAegisMultRating;
  }
  if (rk(s.talents, 'luminous_aegis') > 0) {
    mult *= 1 + PRIEST.luminousAegisMultiplierPerRank * rk(s.talents, 'luminous_aegis');
  }
  const oldParty = ctx.partyBeforeCast;
  const newParty = acc.party.map((uNow) => {
    const uOld = oldParty.find((x) => x.id === uNow.id);
    if (!uOld || uOld.health <= 0) return uNow;
    const gained = uNow.health - uOld.health;
    if (gained <= 0) return uNow;
    return {
      ...uNow,
      shield: uNow.shield + gained * mult,
      shieldTicks: SHARED.shieldDefaultTicks,
    };
  });
  return { ...acc, party: newParty };
}

export function mechanicEchoOfLight(ctx: HealLandContext, acc: HealAccumulator): HealAccumulator {
  const { state: s, spell, spellId, targetId } = ctx;
  if (s.playerClass !== 'PRIEST' || spellId === 'mana_potion' || !isDirectHeal(spell, spellId)) return acc;
  const rankHealMult = getRankHealMult(getSpellRank(spellId, s.playerClass, s.level));
  const healMultB = getHealingMultiplier(s.playerClass, s.level, s.talents);
  const echoHeal = spell.healing * rankHealMult * healMultB * 0.5;
  return {
    ...acc,
    party: acc.party.map((unit: Unit) => {
      if (unit.id !== targetId || unit.health <= 0) return unit;
      return {
        ...unit,
        effects: [
          ...unit.effects,
          {
            id: generateCombatUid('echo_of_light', Date.now(), Math.random),
            name: 'Echo of Light',
            icon: 'spell_holy_holynova',
            remainingTicks: 6,
            category: 'helpful' as EffectCategory,
            sourceId: 'echo_of_light',
            valuePerTick: echoHeal / 6,
            tickIntervalScale: 1,
            stacks: 1,
          },
        ],
      };
    }),
  };
}

export function mechanicLivingSeed(ctx: HealLandContext, acc: HealAccumulator): HealAccumulator {
  const s = ctx.state;
  if (!ctx.isCrit || rk(s.talents, 'living_seed') <= 0) return acc;
  let pct = DRUID.livingSeedPoolFraction;
  if (rk(s.talents, 'living_seed') > 0 && rk(s.talents, 'natural_perfection') > 0) {
    pct += DRUID.livingSeedNaturalPerfectionBonusFraction;
  }
  const { spell, healMultB, critH, tMod, rankHealMult, targetId } = ctx;
  const am = spell.healing * rankHealMult * healMultB * critH * tMod * pct;
  return {
    ...acc,
    party: mapEntityById(acc.party, targetId, (x) => ({ ...x, livingSeedPool: am })),
  };
}

export function mechanicBeaconOfLight(ctx: HealLandContext, acc: HealAccumulator): HealAccumulator {
  const s = ctx.state;
  const { spell, targetId } = ctx;
  if (rk(s.talents, 'beacon_of_light') <= 0) return acc;
  const tankId = s.beaconTargetId;
  if (targetId === tankId || spell.type === 'AOE') return acc;
  const amount =
    spell.healing * ctx.rankHealMult * ctx.healMultB * ctx.critH * ctx.tMod * beaconEchoMultiplier(s);
  const tank = acc.party.find((u) => u.id === tankId);
  if (!tank || tank.health <= 0) return acc;
  const { eff, oh } = getHealSplit(tank.health, tank.maxHealth, amount);
  return {
    ...acc,
    party: mapEntityById(acc.party, tankId, (u) => ({
      ...u,
      health: Math.min(u.maxHealth, u.health + amount),
    })),
    healEff: acc.healEff + eff,
    healOh: acc.healOh + oh,
  };
}

export const ON_HEAL_LAND_MECHANICS: Record<OnHealLandMechanicKey, (ctx: HealLandContext, acc: HealAccumulator) => HealAccumulator> = {
  divineAegis: mechanicDivineAegis,
  echoOfLight: mechanicEchoOfLight,
  livingSeed: mechanicLivingSeed,
  beaconOfLight: mechanicBeaconOfLight,
};

export function critPowerInfusionOnCrit(ctx: HealLandContext, s: GameState): GameState {
  if (!ctx.isCrit || rk(s.talents, 'power_infusion') <= 0) return s;
  return { ...s, playerEffects: mergePowerInfusionCharges(s.playerEffects, 3) };
}

export function critPhotosynthesisOnCrit(ctx: HealLandContext, s: GameState): GameState {
  if (!ctx.isCrit || ctx.spellId !== 'healing_touch' || rk(s.talents, 'photosynthesis') <= 0) return s;
  return {
    ...s,
    party: s.party.map((unit) => ({
      ...unit,
      effects: unit.effects.map((effect) =>
        effect.remainingTicks > 0 && spellHasTag(effect.sourceId, 'druid-hot')
          ? { ...effect, remainingTicks: effect.remainingTicks + 20 }
          : effect,
      ),
    })),
  };
}

export function critInfusionOfLightHolyPower(ctx: HealLandContext, s: GameState): GameState {
  if (!ctx.isCrit || (s.talents.find((t) => t.id === 'h_r5c4')?.points ?? 0) <= 0) return s;
  if (Math.random() >= 0.25) return s;
  return { ...s, holyPower: Math.min(3, s.holyPower + 1) };
}

export const ON_CRIT_MECHANICS: Record<OnCritMechanicKey, (ctx: HealLandContext, s: GameState) => GameState> = {
  powerInfusionOnCrit: critPowerInfusionOnCrit,
  photosynthesisOnCrit: critPhotosynthesisOnCrit,
  infusionOfLightCritHolyPower: critInfusionOfLightHolyPower,
};

export function devotionDamageTakenMultiplier(s: GameState): number {
  const r = rk(s.talents, 'devotion_aura');
  if (r <= 0) return 1;
  return Math.max(PALADIN.devotionDamageTakenFloor, 1 - PALADIN.devotionDamageReductionPerRank * r);
}

export function ampHealRadiance(state: GameState, _spell: Spell, _spellId: string, unit: Unit): number {
  const radRanks = rk(state.talents, 'radiance');
  if (radRanks <= 0) return 1;
  const hpPct = unit.health / unit.maxHealth;
  return 1 + radRanks * 0.15 * (1 - hpPct);
}

export function castHasteEmergency(state: GameState, targetId: string): number {
  const target = state.party.find((u) => u.id === targetId);
  if (!target) return 0;
  if (target.health / target.maxHealth >= 0.5) return 0;
  if (rk(state.talents, 'emergency_haste') <= 0) return 0;
  return 0.15;
}

export function healCooldownLightOfDawnBypass(
  state: GameState,
  spellId: string,
  _spell: Spell,
  currentTicks: number,
): number {
  if (spellId !== 'light_of_dawn' || state.holyPower < 3) return currentTicks;
  if ((state.talents.find((t) => t.id === 'h_r5c4')?.points ?? 0) <= 0) return currentTicks;
  return 0;
}

export function holyPowerTowerOfRadianceStep(state: GameState, ctx: HolyPowerAfterHealCtx): number {
  if (!ctx.targetId || ctx.spell.type === 'AOE') return ctx.holyPower;
  const preH = ctx.preHealParty.find((q) => q.id === ctx.targetId);
  if (!preH || preH.health >= preH.maxHealth * 0.5 || rk(state.talents, 'tower_of_radiance') <= 0) {
    return ctx.holyPower;
  }
  const gain =
    state.capstoneForm === 'paladin_avenging_wrath' && auraTicksActive(ctx.playerEffects, 'avenging_wrath_aura')
      ? 2
      : 1;
  return Math.min(3, ctx.holyPower + gain);
}

export const DIRECT_HEAL_TARGET_AMP: Record<
  DirectHealTargetAmpKey,
  (state: GameState, spell: Spell, spellId: string, unit: Unit) => number
> = {
  radiance: ampHealRadiance,
};

export const CAST_HASTE_BONUS_FRAC: Record<CastHasteBonusKey, (state: GameState, targetId: string) => number> = {
  emergencyHaste: castHasteEmergency,
};

export const HEAL_CAST_COOLDOWN_HOOKS: Record<
  HealCastCooldownKey,
  (state: GameState, spellId: string, spell: Spell, currentTicks: number) => number
> = {
  lightOfDawnHolyPowerBypass: healCooldownLightOfDawnBypass,
};

export const HOLY_POWER_AFTER_HEAL_HOOKS: Record<
  HolyPowerStepAfterHealKey,
  (state: GameState, ctx: HolyPowerAfterHealCtx) => number
> = {
  towerOfRadianceHolyPowerGain: holyPowerTowerOfRadianceStep,
};

export function resourceTickSpiritOfRedemptionAmp(state: GameState, _deltaTicks: number): ResourceTickOutcome {
  void _deltaTicks;
  const healerB = state.party.find((u) => u.role === 'HEALER');
  if (
    !healerB ||
    rk(state.talents, 'spirit_of_redemption') <= 0 ||
    healerB.health >= healerB.maxHealth * 0.3 ||
    !icdReady(state.internalCooldowns, 'spirit_redemption') ||
    helpfulBuffTicksActive(state.playerEffects, 'spirit_of_redemption_amp')
  ) {
    return {};
  }
  return {
    playerEffects: mergeHelpfulPlayerBuff(state.playerEffects, 'spirit_of_redemption_amp', T_SPIRIT_AMP, 1),
    internalCooldowns: { ...state.internalCooldowns, spirit_redemption: ICD_SPIRIT_REDEMPTION },
  };
}

export function resourceTickDruidNaturesGraceCapstone(state: GameState, _deltaTicks: number): ResourceTickOutcome {
  void _deltaTicks;
  if (
    state.capstoneForm !== 'druid_natures_grace' ||
    !auraTicksActive(state.playerEffects, 'natures_grace_aura')
  ) {
    return {};
  }
  const beforeGrace = state.party;
  const ngh = 0.4 * state.level;
  let effAcc = 0;
  let ohAcc = 0;
  const newParty = state.party.map((unit) => {
    if (unit.health <= 0) return unit;
    const split = getHealSplit(unit.health, unit.maxHealth, ngh);
    effAcc += split.eff;
    ohAcc += split.oh;
    return { ...unit, health: Math.min(unit.maxHealth, unit.health + ngh) };
  });
  return {
    party: newParty,
    resourceHealDelta: { eff: effAcc, oh: ohAcc, drafts: diffFloats(beforeGrace, newParty, false) },
  };
}

export const RESOURCE_TICK_MECHANICS: Record<
  OnResourceTickMechanicKey,
  (state: GameState, deltaTicks: number) => ResourceTickOutcome
> = {
  spiritOfRedemptionAmp: resourceTickSpiritOfRedemptionAmp,
  druidNaturesGraceCapstone: resourceTickDruidNaturesGraceCapstone,
};

export function passiveCombatHasteBonusDruidOmenTol(state: GameState): number {
  const d = getClassBlueprint('DRUID').params?.druid;
  if (!d) return 0;
  if (helpfulBuffTicksActive(state.playerEffects, PLAYER_BUFF_OMEN_CLEARCASTING)) return d.hasteClearcasting;
  if (rk(state.talents, 'tree_of_life') > 0) return d.hasteTreeOfLife;
  return 0;
}

export const PASSIVE_COMBAT_HASTE_BONUS: Record<PassiveCombatHasteBonusKey, (state: GameState) => number> = {
  druidOmenTolHaste: passiveCombatHasteBonusDruidOmenTol,
};

export function hotTickPlayerEffectsDruidOmenSpend(ctx: HotTickPlayerEffectsCtx): StatusEffect[] {
  const chance = getClassBlueprint('DRUID').params?.druid?.omenExpendOnHotTickChance;
  if (!helpfulBuffTicksActive(ctx.playerEffects, PLAYER_BUFF_OMEN_CLEARCASTING)) return ctx.playerEffects;
  if (chance === undefined || ctx.random() >= chance) return ctx.playerEffects;
  return ctx.playerEffects.filter((b) => b.id !== PLAYER_BUFF_OMEN_CLEARCASTING);
}

export const HOT_TICK_PLAYER_EFFECTS: Record<
  HotTickPlayerEffectsKey,
  (ctx: HotTickPlayerEffectsCtx) => StatusEffect[]
> = {
  druidOmenHotTickSpend: hotTickPlayerEffectsDruidOmenSpend,
};
