import { ClassType, GameState, PartyDebuff, Spell, Unit } from './types.ts';
import {
  talentRanks,
  hasPlayerBuff,
  HEALER_UNIT_ID,
  isDirectHealSpell,
  upsertPlayerBuff,
} from './talentMechanics.ts';
import { GRACE_PARTY_AURA, GRACE_SOURCE_ID } from './auraConfig.ts';
import {
  SPELLS,
  SPELL_TAG_DRUID_CULTIVATION_HOT,
  SPELL_TAG_DRUID_HOT,
  spellHasTag,
} from './constants.ts';
import type { HealManaCostContext, ManaAfterHealContext } from './combatHookRegistry.ts';
import { generateCombatUid } from './combatUid.ts';
import { mapEntityById } from './mapEntityById.ts';
import { BALANCE } from './balance.ts';
import {
  calculateSpellRank,
  effectiveTalentPointWeight,
  effectiveUniqueStatRating,
  getRankCostMultiplier,
} from './playerStats.ts';
import { healEffectiveAndOverheal } from './healMath.ts';

export { GRACE_SOURCE_ID };
export const PLAYER_BUFF_OMEN_CLEARCASTING = 'omen_clearcasting';
export const ECHO_OF_LIGHT_SOURCE = 'echo_of_light';

const SHARED = BALANCE.combat.shared;
const PRIEST = BALANCE.combat.priest;
const DRUID = BALANCE.combat.druid;
const PALADIN = BALANCE.combat.paladin;

export function isPriestSurgeFinisher(spellId: string): boolean {
  return spellHasTag(spellId, 'surge-finisher');
}

export function archangelSkipsSpell(spellId: string): boolean {
  return spellHasTag(spellId, 'archangel-skip');
}

export function directHealSynergyMultiplierFromIds(unit: Unit, spellId: string): number {
  if (!spellHasTag(spellId, 'synergy-direct')) return 1;
  if (!unit.buffs.some((b) => spellHasTag(b.sourceSpellId, 'synergy-primer-source'))) return 1;
  const sp = SPELLS[spellId];
  return sp?.balance?.directHealSynergyMultiplier ?? SHARED.directHealSynergyMultiplierDefault;
}

export function devotionDamageTakenMultiplier(s: GameState): number {
  if (s.playerClass !== 'PALADIN') return 1;
  const r = talentRanks(s.talents, 'devotion_aura');
  if (r <= 0) return 1;
  return Math.max(PALADIN.devotionDamageTakenFloor, 1 - PALADIN.devotionDamageReductionPerRank * r);
}

export function healManaCostSurgeFinisher(
  s: GameState,
  ctx: HealManaCostContext,
): number | undefined {
  if (ctx.surgeFree && isPriestSurgeFinisher(ctx.spellId)) return 0;
  return undefined;
}

export function healManaCostDruidClearcasting(
  s: GameState,
  ctx: HealManaCostContext,
): number | undefined {
  if (s.playerClass !== 'DRUID') return undefined;
  if (!hasPlayerBuff(s.playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING)) return undefined;
  if (ctx.spellId !== 'regrowth' && ctx.spellId !== 'healing_touch') return undefined;
  return 0;
}

export function healManaCostTreeOfLife(
  s: GameState,
  ctx: HealManaCostContext,
): number | undefined {
  if (talentRanks(s.talents, 'tree_of_life') <= 0) return undefined;
  const { spell, spellId } = ctx;
  const hot = spell.type === 'HOT' || Boolean(spell.hotDuration && spell.healing > 0);
  if (hot) return Math.round(spell.manaCost * DRUID.treeOfLifeHotManaCostFactor);
  if (
    spellHasTag(spellId, 'tree-of-life-big-direct') ||
    (spellId === 'flash_heal' && spell.healing > DRUID.treeOfLifeFlashHealHealingThreshold)
  ) {
    return Math.round(spell.manaCost * DRUID.treeOfLifeBigDirectManaCostFactor);
  }
  return undefined;
}

export function runHealManaCost(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  const ctx: HealManaCostContext = { classType, spell, spellId, surgeFree };
  const v1 = healManaCostSurgeFinisher(s, ctx);
  if (v1 !== undefined) return v1;
  const v0 = healManaCostDruidClearcasting(s, ctx);
  if (v0 !== undefined) return v0;
  const v2 = healManaCostTreeOfLife(s, ctx);
  const base = v2 !== undefined ? v2 : spell.manaCost;
  if (base > 0) {
    const rank = calculateSpellRank(spellId, classType, s.level);
    return Math.round(base * getRankCostMultiplier(rank));
  }
  return base;
}

export function runManaAfterHealCast(
  s: GameState,
  ctx: ManaAfterHealContext,
  initialMana: number,
): number {
  let m = initialMana;
  m = manaAfterHealPaladinIllumination(s, ctx, m);
  m = manaAfterHealPriestPathMoon(s, ctx, m);
  m = manaAfterHealStatBonusReturnOnDirect(s, ctx, m);
  m = manaAfterHealPaladinBeaconVow(s, ctx, m);
  return m;
}

export function nextManaForSpellWithHooks(
  s: GameState,
  classType: ClassType,
  spell: Spell,
  spellId: string,
  surgeFree: boolean,
): number {
  return runHealManaCost(s, classType, spell, spellId, surgeFree);
}

export function manaAfterHealPaladinIllumination(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  if (
    s.playerClass === 'PALADIN' &&
    ctx.isCritH &&
    isDirectHealSpellId(ctx.spell, ctx.spellId) &&
    talentRanks(s.talents, 'illumination') > 0
  ) {
    return Math.min(s.maxMana, mOut + ctx.needMana * PALADIN.illuminationManaRefundFraction);
  }
  return mOut;
}

export function manaAfterHealPriestPathMoon(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  if (
    s.playerClass === 'PRIEST' &&
    talentRanks(s.talents, 'path_moon') > 0 &&
    isDirectHealSpellId(ctx.spell, ctx.spellId)
  ) {
    return Math.min(
      s.maxMana,
      mOut + s.maxMana * PRIEST.pathMoonMaxManaReturnPerRank * talentRanks(s.talents, 'path_moon'),
    );
  }
  return mOut;
}

function talentPointsById(talents: GameState['talents'], talentId: string): number {
  return talents.find((t) => t.id === talentId)?.points ?? 0;
}

export function priestMeditativeManaReturnPerTick(s: GameState, spiritRegenLockoutTicksRemaining: number): number {
  if (s.playerClass !== 'PRIEST' || spiritRegenLockoutTicksRemaining > 0) return 0;
  const ranks = talentPointsById(s.talents, 'p_r0c4');
  if (ranks <= 0) return 0;
  return s.maxMana * PRIEST.meditativeManaReturnPerRankPerTick * ranks;
}

export function druidHotTickManaReturn(s: GameState, sourceSpellId: string): number {
  if (s.playerClass !== 'DRUID' || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) return 0;
  const ranks = talentPointsById(s.talents, 'd_r0c4');
  if (ranks <= 0) return 0;
  return DRUID.hotTickManaReturnPerRank * ranks;
}

export function druidHotTickRateMultiplier(s: GameState, sourceSpellId: string): number {
  if (
    s.capstoneForm !== 'druid_natures_grace' ||
    !hasPlayerBuff(s.playerCombatBuffs, 'natures_grace_aura') ||
    !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)
  ) {
    return 1;
  }
  return DRUID.naturesGraceHotTickRateMultiplier;
}

export function paladinEmergencyCritBonusForTarget(s: GameState, target: Unit | undefined): number {
  if (s.playerClass !== 'PALADIN' || !target || target.maxHealth <= 0) return 0;
  const ranks = talentPointsById(s.talents, 'h_r4c0');
  if (ranks <= 0) return 0;
  if (target.health / target.maxHealth >= PALADIN.emergencyCritHealthThreshold) return 0;
  return PALADIN.emergencyCritBonusPerRankBelowHealthFraction * ranks;
}

export function paladinEmergencyHasteBonusForTarget(s: GameState, target: Unit | undefined): number {
  if (s.playerClass !== 'PALADIN' || !target || target.maxHealth <= 0) return 0;
  const missingHealthFraction = 1 - target.health / target.maxHealth;
  if (missingHealthFraction <= 0) return 0;
  return missingHealthFraction * PALADIN.emergencyHasteFromMissingHealthMax;
}

export function druidActiveHotCount(s: GameState): number {
  return s.party.reduce(
    (count, unit) =>
      count + unit.buffs.filter((buff) => buff.remainingTicks > 0 && spellHasTag(buff.sourceSpellId, SPELL_TAG_DRUID_HOT)).length,
    0,
  );
}

export function druidRampHasteBonus(s: GameState): number {
  if (s.playerClass !== 'DRUID') return 0;
  const ranks = talentPointsById(s.talents, 'd_r4c3');
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampHastePerHotPerRank * ranks;
}

export function druidRampCritBonus(s: GameState): number {
  if (s.playerClass !== 'DRUID') return 0;
  const ranks = talentPointsById(s.talents, 'd_r5c4');
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampCritPerHotPerRank * ranks;
}

export function priestShieldMaintenanceHasteBonus(s: GameState): number {
  if (s.playerClass !== 'PRIEST') return 0;
  const ranks = talentPointsById(s.talents, 'p_r5c3');
  if (ranks <= 0) return 0;
  const hasAnyShield = s.party.some((unit) => unit.health > 0 && unit.shield > 0);
  if (!hasAnyShield) return 0;
  return PRIEST.shieldMaintenanceHastePerRank * ranks;
}

export function priestSelfShieldDamageReduction(s: GameState): number {
  if (s.playerClass !== 'PRIEST') return 0;
  const ranks = talentPointsById(s.talents, 'p_r3c3');
  if (ranks <= 0) return 0;
  const healer = s.party.find((unit) => unit.role === 'HEALER');
  if (!healer || healer.shield <= 0) return 0;
  return PRIEST.selfShieldDamageReductionPerRank * ranks;
}

export function druidBarkskinSelfHealOnDamage(s: GameState, damageTaken: number): number {
  if (s.playerClass !== 'DRUID' || damageTaken <= 0) return 0;
  const ranks = talentPointsById(s.talents, 'd_r2c0');
  if (ranks <= 0) return 0;
  return damageTaken * DRUID.barkskinSelfHealFractionPerRank * ranks;
}

export function paladinAvengingWrathSplashFraction(s: GameState): number {
  if (
    s.playerClass !== 'PALADIN' ||
    s.capstoneForm !== 'paladin_avenging_wrath' ||
    !hasPlayerBuff(s.playerCombatBuffs, 'avenging_wrath_aura')
  ) {
    return 0;
  }
  return PALADIN.avengingWrathSplashFraction;
}

export function manaAfterHealStatBonusReturnOnDirect(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  const manaR = s.talents.reduce(
    (a, t) =>
      a +
      (t.statBonus?.manaReturnOnDirectHeal || 0) * effectiveTalentPointWeight(t.points, t.maxPoints),
    0,
  );
  if (isDirectHealSpellId(ctx.spell, ctx.spellId)) {
    return Math.min(s.maxMana, mOut + manaR);
  }
  return mOut;
}

export function manaAfterHealPaladinBeaconVow(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  const beaconId = s.beaconTargetId;
  if (
    s.playerClass === 'PALADIN' &&
    ctx.isCritH &&
    talentRanks(s.talents, 'beacon_of_light') > 0 &&
    talentRanks(s.talents, 'paladin_vow_protector') > 0 &&
    ctx.spellId !== 'mana_potion' &&
    ctx.spell.type !== 'AOE' &&
    ctx.healTargetId === beaconId
  ) {
    const refund =
      ctx.needMana *
      PALADIN.vowProtectorCritManaRefundFraction *
      talentRanks(s.talents, 'paladin_vow_protector');
    return Math.min(s.maxMana, mOut + refund);
  }
  return mOut;
}

export function resolveManaAfterHealCast(
  s: GameState,
  spell: Spell,
  spellId: string,
  needMana: number,
  surgeFree: boolean,
  isCritH: boolean,
  healTargetId: string,
): number {
  const initial = s.mana - (surgeFree && isPriestSurgeFinisher(spellId) ? 0 : needMana);
  return runManaAfterHealCast(s, { spell, spellId, needMana, surgeFree, isCritH, healTargetId }, initial);
}

export function isDirectHealSpellId(spell: Spell, spellId: string): boolean {
  if (spellId === 'mana_potion') return false;
  if (spell.type === 'AOE') return true;
  if (spell.type === 'DIRECT') return true;
  if (spell.type === 'HOT' && spell.healing > 0) return true;
  return false;
}

export function applyDivineAegis(
  s: GameState,
  oldParty: Unit[],
  newParty: Unit[],
  isCritH: boolean,
): Unit[] {
  if (!isCritH || talentRanks(s.talents, 'divine_aegis') <= 0) {
    return newParty;
  }
  const daRanks = talentRanks(s.talents, 'divine_aegis');
  let mult = PRIEST.divineAegisShieldFractionPerRank * daRanks;
  if (s.playerClass === 'PRIEST') {
    const rating = effectiveUniqueStatRating(s.playerClass, s.level, s.talents);
    mult *= 1 + rating * PRIEST.divinityAegisMultBonusPerRating;
  }
  if (talentRanks(s.talents, 'luminous_aegis') > 0) {
    mult *= 1 + PRIEST.luminousAegisMultiplierPerRank * talentRanks(s.talents, 'luminous_aegis');
  }
  return newParty.map((uNow) => {
    const uOld = oldParty.find((x) => x.id === uNow.id);
    if (!uOld || uOld.health <= 0) return uNow;
    const gained = uNow.health - uOld.health;
    if (gained <= 0) return uNow;
    return {
      ...uNow,
      shield: uNow.shield + gained * mult,
      shieldTicksRemaining: SHARED.shieldDefaultTicks,
    };
  });
}

export function applyBindingHealSelf(
  s: GameState,
  newParty: Unit[],
  targetId: string,
  spell: Spell,
  healMultB: number,
  critH: number,
  tMod: number,
  rankHealMult: number,
): { party: Unit[]; eff: number; oh: number } {
  if (!s.playerClass || talentRanks(s.talents, 'binding_heal') <= 0) {
    return { party: newParty, eff: 0, oh: 0 };
  }
  const healerW = newParty.find((x) => x.id === HEALER_UNIT_ID);
  const thp = s.party.find((x) => x.id === targetId);
  const bind =
    spell.healing *
    rankHealMult *
    healMultB *
    critH *
    tMod *
    PRIEST.bindingHealSelfFraction *
    Math.min(PRIEST.bindingHealMaxRanksForCap, talentRanks(s.talents, 'binding_heal'));
  if (!healerW || !thp || thp.id === healerW.id) return { party: newParty, eff: 0, oh: 0 };
  const { eff, oh } = healEffectiveAndOverheal(healerW.health, healerW.maxHealth, bind);
  return {
    party: mapEntityById(newParty, HEALER_UNIT_ID, (u) => ({
      ...u,
      health: Math.min(u.maxHealth, u.health + bind),
    })),
    eff,
    oh,
  };
}

export function beaconEchoMultiplier(s: GameState): number {
  let m = PALADIN.beaconEchoBaseMultiplier;
  if (talentRanks(s.talents, 'paladin_vow_protector') > 0) {
    m += PALADIN.beaconEchoVowBonusPerRank * talentRanks(s.talents, 'paladin_vow_protector');
  }
  return m;
}

export function applyBeaconEcho(
  s: GameState,
  newParty: Unit[],
  targetId: string,
  spell: Spell,
  spellId: string,
  healMultB: number,
  critH: number,
  tMod: number,
  rankHealMult: number,
): { party: Unit[]; eff: number; oh: number } {
  if (talentRanks(s.talents, 'beacon_of_light') <= 0) return { party: newParty, eff: 0, oh: 0 };
  const tankId = s.beaconTargetId;
  if (targetId === tankId || spell.type === 'AOE') return { party: newParty, eff: 0, oh: 0 };
  const amount = spell.healing * rankHealMult * healMultB * critH * tMod * beaconEchoMultiplier(s);
  const tank = newParty.find((u) => u.id === tankId);
  if (!tank || tank.health <= 0) return { party: newParty, eff: 0, oh: 0 };
  const { eff, oh } = healEffectiveAndOverheal(tank.health, tank.maxHealth, amount);
  return {
    party: mapEntityById(newParty, tankId, (u) =>
      u.health > 0 ? { ...u, health: Math.min(u.maxHealth, u.health + amount) } : u,
    ),
    eff,
    oh,
  };
}

export function applyLivingSeed(
  s: GameState,
  newParty: Unit[],
  targetId: string,
  isCritH: boolean,
  spell: Spell,
  healMultB: number,
  critH: number,
  tMod: number,
  rankHealMult: number,
): Unit[] {
  if (!isCritH || talentRanks(s.talents, 'living_seed') <= 0) {
    return newParty;
  }
  let pct = DRUID.livingSeedPoolFraction;
  if (talentRanks(s.talents, 'living_seed') > 0 && talentRanks(s.talents, 'natural_perfection') > 0) {
    pct += DRUID.livingSeedNaturalPerfectionBonusFraction;
  }
  const am = spell.healing * rankHealMult * healMultB * critH * tMod * pct;
  return mapEntityById(newParty, targetId, (x) => ({ ...x, livingSeedPool: am }));
}

export function rollSurgeOfLight(
  s: GameState,
  spellId: string,
): boolean {
  return (
    spellId === 'flash_heal' &&
    talentRanks(s.talents, 'surge_of_light') > 0 &&
    Math.random() < PRIEST.surgeOfLightProcChancePerRank * talentRanks(s.talents, 'surge_of_light')
  );
}

export function priestFlashCritBonusFromSynergy(s: GameState): number {
  if (talentRanks(s.talents, 'gleaming_proclamation') <= 0) return 0;
  if (talentRanks(s.talents, 'surge_of_light') <= 0) return 0;
  return PRIEST.gleamingProclamationFlashHealCritBonusPct;
}

export function stripOneDispellableDebuff(debuffs: PartyDebuff[]): PartyDebuff[] {
  for (let i = debuffs.length - 1; i >= 0; i--) {
    if (debuffs[i].dispellable) {
      return debuffs.filter((_, j) => j !== i);
    }
  }
  return debuffs;
}

export function dispellableCurseCleanseProcChance(s: GameState): number {
  if (!s.playerClass) return 0;
  let c = 0;
  if (s.playerClass === 'PRIEST') c = talentRanks(s.talents, 'absolve');
  else if (s.playerClass === 'DRUID') c = talentRanks(s.talents, 'naturalize');
  else if (s.playerClass === 'PALADIN') c = talentRanks(s.talents, 'purify');
  if (c <= 0) return 0;
  let p = SHARED.dispellableCurseCleanseProcPerRank * c;
  if (s.playerClass === 'PALADIN' && talentRanks(s.talents, 'tower_of_radiance') > 0) {
    p *= PALADIN.purifyTowerOfRadianceMultiplier;
  }
  return p;
}

export function partyHasDruidHoTOnAnyAlly(s: GameState): boolean {
  return s.party.some(
    (u) => u.health > 0 && u.buffs.some((b) => spellHasTag(b.sourceSpellId, SPELL_TAG_DRUID_HOT)),
  );
}

export function druidHarmonyHotTickMultiplier(s: GameState, pComb: typeof s.playerCombatBuffs): number {
  const h = talentRanks(s.talents, 'druid_harmony');
  if (h <= 0 || !hasPlayerBuff(pComb, 'druid_harmony_for_hot')) return 1;
  return 1 + DRUID.harmonyBonusPerRank * h;
}

export function druidHarmonyDirectMultiplier(s: GameState): number {
  const h = talentRanks(s.talents, 'druid_harmony');
  if (h <= 0 || !partyHasDruidHoTOnAnyAlly(s)) return 1;
  return 1 + DRUID.harmonyBonusPerRank * h;
}

export function cultivationHotMultiplier(s: GameState, sourceSpellId: string): number {
  if (talentRanks(s.talents, 'druid_path_cultivation') <= 0) return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_CULTIVATION_HOT)) {
    return 1 + DRUID.cultivationBonusPerRank * talentRanks(s.talents, 'druid_path_cultivation');
  }
  return 1;
}

export function deepRootsHotMultiplier(s: GameState, unit: Unit, sourceSpellId: string): number {
  if (talentRanks(s.talents, 'druid_path_deep_roots') <= 0) return 1;
  if (unit.role !== 'TANK') return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return 1 + DRUID.deepRootsBonusPerRank * talentRanks(s.talents, 'druid_path_deep_roots');
  }
  return 1;
}

export function vowCrusaderAoEMultiplier(s: GameState, spellId: string): number {
  if (spellId !== 'light_of_dawn' || talentRanks(s.talents, 'paladin_vow_crusader') <= 0) return 1;
  return 1 + PALADIN.vowCrusaderAoEBonusPerRank * talentRanks(s.talents, 'paladin_vow_crusader');
}

export function archangelEchoShieldBonusFraction(
  s: GameState,
  spellId: string,
  spell: Spell,
): number {
  if (
    s.capstoneForm !== 'priest_archangel' ||
    !hasPlayerBuff(s.playerCombatBuffs, 'archangel') ||
    archangelSkipsSpell(spellId) ||
    !isDirectHealSpellId(spell, spellId)
  ) {
    return 0;
  }
  const totalShield = s.party.reduce((sum, unit) => sum + Math.max(0, unit.shield), 0);
  if (totalShield <= 0) return 0;
  return totalShield * PRIEST.archangelEchoShieldConsumeBonusFraction;
}

export function graceHealMultiplierOnTarget(target: Unit, graceRanks: number): number {
  if (graceRanks <= 0) return 1;
  const g = target.buffs.find((b) => b.sourceSpellId === GRACE_SOURCE_ID && b.remainingTicks > 0);
  if (!g || !g.stacks) return 1;
  const { maxStacks, healingPerStackLinearBonus } = GRACE_PARTY_AURA;
  return 1 + healingPerStackLinearBonus * graceRanks * Math.min(maxStacks, g.stacks);
}

export function upsertGraceOnTarget(unit: Unit, stacksAdd: number, graceRanks: number): Unit {
  if (graceRanks <= 0) return unit;
  const dur = GRACE_PARTY_AURA.defaultDurationTicks;
  const maxS = GRACE_PARTY_AURA.maxStacks;
  const idx = unit.buffs.findIndex((b) => b.sourceSpellId === GRACE_SOURCE_ID);
  const nextStacks = Math.min(
    maxS,
    (idx >= 0 ? (unit.buffs[idx].stacks ?? 1) : 0) + stacksAdd,
  );
  const graceBuff = {
    id: generateCombatUid(`grace-${unit.id}`, Date.now(), Math.random),
    name: GRACE_PARTY_AURA.displayName,
    remainingTicks: dur,
    healingPerTick: 0,
    icon: GRACE_PARTY_AURA.icon,
    sourceSpellId: GRACE_SOURCE_ID,
    stacks: Math.max(1, nextStacks),
  };
  const kept = idx >= 0 ? unit.buffs.filter((_, i) => i !== idx) : unit.buffs;
  return { ...unit, buffs: [...kept, graceBuff] };
}

export function applyGraceStacksFromDirectHeal(
  s: GameState,
  party: Unit[],
  targetId: string,
  spell: Spell,
  spellId: string,
): Unit[] {
  const g = talentRanks(s.talents, 'priest_grace');
  if (g <= 0 || !isDirectHealSpellId(spell, spellId) || spell.type === 'AOE') return party;
  return mapEntityById(party, targetId, (u) =>
    u.health > 0 ? upsertGraceOnTarget(u, 1, g) : u,
  );
}

export function aegisBurstHealFromAbsorb(s: GameState, absorbed: number): number {
  const r = talentRanks(s.talents, 'aegis_burst');
  if (r <= 0 || absorbed <= 0) return 0;
  return absorbed * PRIEST.aegisBurstHealPerAbsorbPerRank * r;
}

export function applyAegisBurstSplash(
  s: GameState,
  party: Unit[],
  shieldedUnitId: string,
  shieldBefore: number,
  shieldAfter: number,
): { party: Unit[]; eff: number; oh: number } {
  if (shieldAfter > 0 || shieldBefore <= 0) return { party, eff: 0, oh: 0 };
  const splash = aegisBurstHealFromAbsorb(s, shieldBefore - shieldAfter);
  if (splash <= 0) return { party, eff: 0, oh: 0 };
  let bestId: string | null = null;
  let bestPct = 2;
  for (const u of party) {
    if (u.health <= 0 || u.id === shieldedUnitId) continue;
    const pct = u.health / u.maxHealth;
    if (pct < bestPct) {
      bestPct = pct;
      bestId = u.id;
    }
  }
  if (!bestId) return { party, eff: 0, oh: 0 };
  const tgt = party.find((u) => u.id === bestId);
  if (!tgt) return { party, eff: 0, oh: 0 };
  const { eff, oh } = healEffectiveAndOverheal(tgt.health, tgt.maxHealth, splash);
  return {
    party: mapEntityById(party, bestId, (u) => ({
      ...u,
      health: Math.min(u.maxHealth, u.health + splash),
    })),
    eff,
    oh,
  };
}

export function applyAegisBurstsFromShieldTransitions(
  s: GameState,
  before: Unit[],
  after: Unit[],
): { party: Unit[]; eff: number; oh: number } {
  let p = after.map((u) => ({ ...u }));
  let effAcc = 0;
  let ohAcc = 0;
  for (let i = 0; i < before.length; i++) {
    const bu = before[i];
    const au = after[i];
    if (!bu || !au || bu.id !== au.id) continue;
    if (bu.shield > 0 && au.shield <= 0) {
      const r = applyAegisBurstSplash(s, p, au.id, bu.shield, au.shield);
      p = r.party;
      effAcc += r.eff;
      ohAcc += r.oh;
    }
  }
  return { party: p, eff: effAcc, oh: ohAcc };
}

export const DRUID_HARMONY_HOT_BUFF = 'druid_harmony_for_hot';
export const DRUID_HARMONY_HOT_TICKS = 6 * 10;

function appendEchoOfLightBuff(unit: Unit, echoTotal: number): Unit {
  const dur = PRIEST.passiveEchoOfLightDurationTicks;
  const hpt = echoTotal / dur;
  const buff = {
    id: generateCombatUid(`echo-${unit.id}`, Date.now(), Math.random),
    name: 'Echo of Light',
    remainingTicks: dur,
    healingPerTick: hpt,
    icon: 'wow/spell_holy_surgeoflight',
    sourceSpellId: ECHO_OF_LIGHT_SOURCE,
    rendersAsHoTRing: true as const,
  };
  const kept = unit.buffs.filter((b) => b.sourceSpellId !== ECHO_OF_LIGHT_SOURCE);
  return { ...unit, buffs: [...kept, buff] };
}

export function applyEchoOfLightPriest(
  s: GameState,
  partyBefore: Unit[],
  party: Unit[],
  spell: Spell,
  spellId: string,
  targetId: string,
): Unit[] {
  if (s.playerClass !== 'PRIEST' || spellId === 'mana_potion' || !isDirectHealSpell(spell, spellId)) {
    return party;
  }
  if (spell.type === 'AOE') {
    let out = party;
    for (const u of party) {
      const b = partyBefore.find((x) => x.id === u.id);
      if (!b || u.health <= 0) continue;
      const gained = u.health - b.health;
      if (gained <= 0) continue;
      const echoTotal = gained * PRIEST.passiveEchoOfLightHealFraction;
      out = mapEntityById(out, u.id, (unit) => appendEchoOfLightBuff(unit, echoTotal));
    }
    return out;
  }
  const b = partyBefore.find((x) => x.id === targetId);
  const u = party.find((x) => x.id === targetId);
  if (!b || !u || u.health <= 0) return party;
  const gained = u.health - b.health;
  if (gained <= 0) return party;
  const echoTotal = gained * PRIEST.passiveEchoOfLightHealFraction;
  return mapEntityById(party, targetId, (unit) => appendEchoOfLightBuff(unit, echoTotal));
}

export function applyLightbringerResolveSplash(
  s: GameState,
  partyBefore: Unit[],
  party: Unit[],
  spell: Spell,
  spellId: string,
  targetId: string,
): { party: Unit[]; eff: number; oh: number } {
  if (s.playerClass !== 'PALADIN' || spellId === 'mana_potion' || !isDirectHealSpell(spell, spellId)) {
    return { party, eff: 0, oh: 0 };
  }
  if (spell.type === 'AOE') return { party, eff: 0, oh: 0 };
  const tank = party.find((u) => u.role === 'TANK' && u.health > 0);
  if (!tank || targetId !== tank.id) return { party, eff: 0, oh: 0 };
  const beforeT = partyBefore.find((u) => u.id === tank.id);
  const afterT = party.find((u) => u.id === tank.id);
  if (!beforeT || !afterT) return { party, eff: 0, oh: 0 };
  const healed = afterT.health - beforeT.health;
  if (healed <= 0) return { party, eff: 0, oh: 0 };
  const splash = healed * PALADIN.passiveLightbringerSplashFraction;
  let bestId: string | null = null;
  let bestPct = 2;
  for (const u of party) {
    if (u.health <= 0 || u.id === tank.id) continue;
    const pct = u.maxHealth > 0 ? u.health / u.maxHealth : 1;
    if (pct < bestPct) {
      bestPct = pct;
      bestId = u.id;
    }
  }
  if (!bestId) return { party, eff: 0, oh: 0 };
  const splashTgt = party.find((u) => u.id === bestId);
  if (!splashTgt) return { party, eff: 0, oh: 0 };
  const { eff, oh } = healEffectiveAndOverheal(splashTgt.health, splashTgt.maxHealth, splash);
  return {
    party: mapEntityById(party, bestId, (u) => ({
      ...u,
      health: Math.min(u.maxHealth, u.health + splash),
    })),
    eff,
    oh,
  };
}

export function paladinRadianceHealMultiplier(s: GameState, unit: Unit): number {
  if (s.playerClass !== 'PALADIN' || unit.maxHealth <= 0) return 1;
  const r = effectiveUniqueStatRating(s.playerClass, s.level, s.talents);
  const missing = Math.max(0, 1 - unit.health / unit.maxHealth);
  const bonus = Math.min(
    PALADIN.radianceHealMultBonusCap,
    missing * r * PALADIN.radianceHealMultPerMissingHealthPerRating,
  );
  return 1 + bonus;
}

export function priestDivinityOverhealAbsorb(overheal: number, rating: number): number {
  if (overheal <= 0 || rating <= 0) return 0;
  return overheal * Math.min(0.45, rating * PRIEST.divinityOverhealToShieldPerRating);
}

export function druidVitalityBloomTickExtras(
  s: GameState,
  tickAmtAfterModifiers: number,
): { extraHeal: number; mana: number } {
  if (s.playerClass !== 'DRUID' || tickAmtAfterModifiers <= 0) return { extraHeal: 0, mana: 0 };
  const r = effectiveUniqueStatRating(s.playerClass, s.level, s.talents);
  if (r <= 0) return { extraHeal: 0, mana: 0 };
  const p = Math.min(DRUID.vitalityBloomChanceCap, r * DRUID.vitalityBloomChancePerRating);
  if (Math.random() >= p) return { extraHeal: 0, mana: 0 };
  let mana = 0;
  if (Math.random() < DRUID.vitalityBloomManaRefundChance) {
    mana = DRUID.vitalityBloomManaRefundAmount;
  }
  return { extraHeal: tickAmtAfterModifiers * DRUID.vitalityBloomHealFractionOfTick, mana };
}

export function rollOmenOfClarityOnHotTick(
  s: GameState,
  tickAmt: number,
  sourceSpellId: string,
  playerCombatBuffs: GameState['playerCombatBuffs'],
  random: () => number,
): GameState['playerCombatBuffs'] {
  if (s.playerClass !== 'DRUID' || tickAmt <= 0 || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return playerCombatBuffs;
  }
  const r = effectiveUniqueStatRating(s.playerClass, s.level, s.talents);
  if (r <= 0) return playerCombatBuffs;
  const p = Math.min(DRUID.passiveOmenProcChanceCap, r * DRUID.passiveOmenProcPerHotTickPerRating);
  if (random() >= p) return playerCombatBuffs;
  return upsertPlayerBuff(playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING, DRUID.passiveOmenClearcastingTicks, 1);
}
