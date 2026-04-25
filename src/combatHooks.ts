import { ClassType, GameState, Spell, Unit } from './types.ts';
import { talentRanks, hasPlayerBuff, HEALER_UNIT_ID } from './talentMechanics.ts';
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

export { GRACE_SOURCE_ID };

const BC = BALANCE.combat;

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
  return sp?.balance?.directHealSynergyMultiplier ?? BC.directHealSynergyMultiplierDefault;
}

export function devotionDamageTakenMultiplier(s: GameState): number {
  if (s.playerClass !== 'PALADIN') return 1;
  const r = talentRanks(s.talents, 'devotion_aura');
  if (r <= 0) return 1;
  return Math.max(BC.devotionDamageTakenFloor, 1 - BC.devotionDamageReductionPerRank * r);
}

export function healManaCostSurgeFinisher(
  s: GameState,
  ctx: HealManaCostContext,
): number | undefined {
  if (ctx.surgeFree && isPriestSurgeFinisher(ctx.spellId)) return 0;
  return undefined;
}

export function healManaCostTreeOfLife(
  s: GameState,
  ctx: HealManaCostContext,
): number | undefined {
  if (talentRanks(s.talents, 'tree_of_life') <= 0) return undefined;
  const { spell, spellId } = ctx;
  const hot = spell.type === 'HOT' || Boolean(spell.hotDuration && spell.healing > 0);
  if (hot) return Math.round(spell.manaCost * BC.treeOfLifeHotManaCostFactor);
  if (
    spellHasTag(spellId, 'tree-of-life-big-direct') ||
    (spellId === 'flash_heal' && spell.healing > BC.treeOfLifeFlashHealHealingThreshold)
  ) {
    return Math.round(spell.manaCost * BC.treeOfLifeBigDirectManaCostFactor);
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
  const v2 = healManaCostTreeOfLife(s, ctx);
  if (v2 !== undefined) return v2;
  return spell.manaCost;
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
    return Math.min(s.maxMana, mOut + ctx.needMana);
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
      mOut + s.maxMana * BC.pathMoonMaxManaReturnPerRank * talentRanks(s.talents, 'path_moon'),
    );
  }
  return mOut;
}

export function manaAfterHealStatBonusReturnOnDirect(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  const manaR = s.talents.reduce(
    (a, t) => a + (t.statBonus?.manaReturnOnDirectHeal || 0) * t.points,
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
      ctx.needMana * BC.paladinVowProtectorCritManaRefundFraction * talentRanks(s.talents, 'paladin_vow_protector');
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
  let mult = BC.divineAegisShieldFractionPerRank * daRanks;
  if (talentRanks(s.talents, 'luminous_aegis') > 0) {
    mult *= 1 + BC.luminousAegisMultiplierPerRank * talentRanks(s.talents, 'luminous_aegis');
  }
  return newParty.map((uNow) => {
    const uOld = oldParty.find((x) => x.id === uNow.id);
    if (!uOld || uOld.health <= 0) return uNow;
    const gained = uNow.health - uOld.health;
    if (gained <= 0) return uNow;
    return {
      ...uNow,
      shield: uNow.shield + gained * mult,
      shieldTicksRemaining: BC.shieldDefaultTicks,
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
): Unit[] {
  if (!s.playerClass || talentRanks(s.talents, 'binding_heal') <= 0) return newParty;
  const healerW = newParty.find((x) => x.id === HEALER_UNIT_ID);
  const thp = s.party.find((x) => x.id === targetId);
  const bind =
    spell.healing *
    healMultB *
    critH *
    tMod *
    BC.bindingHealSelfFraction *
    Math.min(BC.bindingHealMaxRanksForCap, talentRanks(s.talents, 'binding_heal'));
  if (!healerW || !thp || thp.id === healerW.id) return newParty;
  return mapEntityById(newParty, HEALER_UNIT_ID, (u) => ({
    ...u,
    health: Math.min(u.maxHealth, u.health + bind),
  }));
}

export function beaconEchoMultiplier(s: GameState): number {
  let m = BC.beaconEchoBaseMultiplier;
  if (talentRanks(s.talents, 'paladin_vow_protector') > 0) {
    m += BC.beaconEchoVowBonusPerRank * talentRanks(s.talents, 'paladin_vow_protector');
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
): Unit[] {
  if (talentRanks(s.talents, 'beacon_of_light') <= 0) return newParty;
  const tankId = s.beaconTargetId;
  if (targetId === tankId || spell.type === 'AOE') return newParty;
  const amount = spell.healing * healMultB * critH * tMod * beaconEchoMultiplier(s);
  return mapEntityById(newParty, tankId, (u) =>
    u.health > 0 ? { ...u, health: Math.min(u.maxHealth, u.health + amount) } : u,
  );
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
): Unit[] {
  if (!isCritH || talentRanks(s.talents, 'living_seed') <= 0) {
    return newParty;
  }
  let pct = BC.livingSeedPoolFraction;
  if (talentRanks(s.talents, 'living_seed') > 0 && talentRanks(s.talents, 'natural_perfection') > 0) {
    pct += BC.livingSeedNaturalPerfectionBonusFraction;
  }
  const am = spell.healing * healMultB * critH * tMod * pct;
  return mapEntityById(newParty, targetId, (x) => ({ ...x, livingSeedPool: am }));
}

export function rollSurgeOfLight(
  s: GameState,
  spellId: string,
): boolean {
  return (
    spellId === 'flash_heal' &&
    talentRanks(s.talents, 'surge_of_light') > 0 &&
    Math.random() < BC.surgeOfLightProcChancePerRank * talentRanks(s.talents, 'surge_of_light')
  );
}

export function priestFlashCritBonusFromSynergy(s: GameState): number {
  if (talentRanks(s.talents, 'gleaming_proclamation') <= 0) return 0;
  if (talentRanks(s.talents, 'surge_of_light') <= 0) return 0;
  return BC.gleamingProclamationFlashHealCritBonusPct;
}

export function cleanseProcChance(s: GameState): number {
  const c = talentRanks(s.talents, 'cleanse');
  if (c <= 0) return 0;
  let p = BC.cleanseProcPerRank * c;
  if (talentRanks(s.talents, 'tower_of_radiance') > 0) {
    p *= BC.cleanseTowerOfRadianceMultiplier;
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
  return 1 + BC.druidHarmonyBonusPerRank * h;
}

export function druidHarmonyDirectMultiplier(s: GameState): number {
  const h = talentRanks(s.talents, 'druid_harmony');
  if (h <= 0 || !partyHasDruidHoTOnAnyAlly(s)) return 1;
  return 1 + BC.druidHarmonyBonusPerRank * h;
}

export function cultivationHotMultiplier(s: GameState, sourceSpellId: string): number {
  if (talentRanks(s.talents, 'druid_path_cultivation') <= 0) return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_CULTIVATION_HOT)) {
    return 1 + BC.druidCultivationBonusPerRank * talentRanks(s.talents, 'druid_path_cultivation');
  }
  return 1;
}

export function deepRootsHotMultiplier(s: GameState, unit: Unit, sourceSpellId: string): number {
  if (talentRanks(s.talents, 'druid_path_deep_roots') <= 0) return 1;
  if (unit.role !== 'TANK') return 1;
  if (spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) {
    return 1 + BC.druidDeepRootsBonusPerRank * talentRanks(s.talents, 'druid_path_deep_roots');
  }
  return 1;
}

export function vowCrusaderAoEMultiplier(s: GameState, spellId: string): number {
  if (spellId !== 'light_of_dawn' || talentRanks(s.talents, 'paladin_vow_crusader') <= 0) return 1;
  return 1 + BC.paladinVowCrusaderAoEBonusPerRank * talentRanks(s.talents, 'paladin_vow_crusader');
}

export function graceHealMultiplierOnTarget(target: Unit): number {
  const g = target.buffs.find((b) => b.sourceSpellId === GRACE_SOURCE_ID && b.remainingTicks > 0);
  if (!g || !g.stacks) return 1;
  const { maxStacks, healingPerStackLinearBonus } = GRACE_PARTY_AURA;
  return 1 + healingPerStackLinearBonus * Math.min(maxStacks, g.stacks);
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
  return absorbed * BC.aegisBurstHealPerAbsorbPerRank * r;
}

export function applyAegisBurstSplash(
  s: GameState,
  party: Unit[],
  shieldedUnitId: string,
  shieldBefore: number,
  shieldAfter: number,
): Unit[] {
  if (shieldAfter > 0 || shieldBefore <= 0) return party;
  const splash = aegisBurstHealFromAbsorb(s, shieldBefore - shieldAfter);
  if (splash <= 0) return party;
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
  if (!bestId) return party;
  return mapEntityById(party, bestId, (u) => ({
    ...u,
    health: Math.min(u.maxHealth, u.health + splash),
  }));
}

export function applyAegisBurstsFromShieldTransitions(s: GameState, before: Unit[], after: Unit[]): Unit[] {
  let p = after.map((u) => ({ ...u }));
  for (let i = 0; i < before.length; i++) {
    const bu = before[i];
    const au = after[i];
    if (!bu || !au || bu.id !== au.id) continue;
    if (bu.shield > 0 && au.shield <= 0) {
      p = applyAegisBurstSplash(s, p, au.id, bu.shield, au.shield);
    }
  }
  return p;
}

export const DRUID_HARMONY_HOT_BUFF = 'druid_harmony_for_hot';
export const DRUID_HARMONY_HOT_TICKS = 6 * 10;
