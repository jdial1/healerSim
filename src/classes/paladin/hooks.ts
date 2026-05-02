import { GameState, Spell, Unit, PartyDebuff } from '../../types.ts';
import { getRanks, hasBuff, addBuff, isDirectHeal } from '../../talentMechanics.ts';
import { SPELLS } from '../../constants.ts';
import type { HealManaCostContext, ManaAfterHealContext } from '../../combatHookRegistry.ts';
import { generateCombatUid } from '../../combatUid.ts';
import { mapEntityById } from '../../mapEntityById.ts';
import balanceData from '../../data/balance.json';
import { getUniqueStatRating } from '../../playerStats.ts';
import { getHealSplit } from '../../healMath.ts';

export const PLAYER_BUFF_OMEN_CLEARCASTING = 'omen_clearcasting';

const PALADIN = balanceData.combat.paladin;
const SHARED = balanceData.combat.shared;

// Damage reduction
export function devotionDamageTakenMultiplier(s: GameState): number {
  if (s.playerClass !== 'PALADIN') return 1;
  const r = getRanks(s.talents, 'devotion_aura');
  if (r <= 0) return 1;
  return Math.max(PALADIN.devotionDamageTakenFloor, 1 - PALADIN.devotionDamageReductionPerRank * r);
}

// Emergency bonuses
export function paladinEmergencyCritBonusForTarget(s: GameState, target: Unit | undefined): number {
  if (s.playerClass !== 'PALADIN' || !target || target.maxHealth <= 0) return 0;
  const ranks = getRanks(s.talents, 'tower_of_radiance');
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

// Avenging Wrath
export function paladinAvengingWrathSplashFraction(s: GameState): number {
  if (
    s.playerClass !== 'PALADIN' ||
    s.capstoneForm !== 'paladin_avenging_wrath' ||
    !hasBuff(s.playerCombatBuffs, 'avenging_wrath_aura')
  ) {
    return 0;
  }
  return PALADIN.avengingWrathSplashFraction;
}

// Beacon of Light
export function beaconEchoMultiplier(s: GameState): number {
  let m = PALADIN.beaconEchoBaseMultiplier;
  if (getRanks(s.talents, 'paladin_vow_protector') > 0) {
    m += PALADIN.beaconEchoVowBonusPerRank * getRanks(s.talents, 'paladin_vow_protector');
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
  if (getRanks(s.talents, 'beacon_of_light') <= 0) return { party: newParty, eff: 0, oh: 0 };
  const tankId = s.beaconTargetId;
  if (targetId === tankId || spell.type === 'AOE') return { party: newParty, eff: 0, oh: 0 };
  const amount = spell.healing * rankHealMult * healMultB * critH * tMod * beaconEchoMultiplier(s);
  const tank = newParty.find((u) => u.id === tankId);
  if (!tank || tank.health <= 0) return { party: newParty, eff: 0, oh: 0 };
  const { eff, oh } = getHealSplit(tank.health, tank.maxHealth, amount);
  return {
    party: mapEntityById(newParty, tankId, (u) =>
      u.health > 0 ? { ...u, health: Math.min(u.maxHealth, u.health + amount) } : u,
    ),
    eff,
    oh,
  };
}

// Mana after heal
export function manaAfterHealPaladinIllumination(
  s: GameState,
  ctx: ManaAfterHealContext,
  mOut: number,
): number {
  if (
    s.playerClass === 'PALADIN' &&
    ctx.isCritH &&
    isDirectHeal(ctx.spell, ctx.spellId) &&
    getRanks(s.talents, 'illumination') > 0
  ) {
    return Math.min(s.maxMana, mOut + ctx.needMana * PALADIN.illuminationManaRefundFraction);
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
    getRanks(s.talents, 'beacon_of_light') > 0 &&
    getRanks(s.talents, 'paladin_vow_protector') > 0 &&
    ctx.spellId !== 'mana_potion' &&
    ctx.spell.type !== 'AOE' &&
    ctx.healTargetId === beaconId
  ) {
    const refund =
      ctx.needMana *
      PALADIN.vowProtectorCritManaRefundFraction *
      getRanks(s.talents, 'paladin_vow_protector');
    return Math.min(s.maxMana, mOut + refund);
  }
  return mOut;
}

// Radiance
export function paladinRadianceHealMultiplier(s: GameState, unit: Unit): number {
  if (s.playerClass !== 'PALADIN' || unit.maxHealth <= 0) return 1;
  const r = getUniqueStatRating(s.playerClass, s.level, s.talents);
  const missing = Math.max(0, 1 - unit.health / unit.maxHealth);
  const bonus = Math.min(
    PALADIN.radianceHealMultBonusCap,
    missing * r * PALADIN.radianceHealMultPerMissingHealthPerRating,
  );
  return 1 + bonus;
}

// Lightbringer's Resolve
export function applyLightbringerResolveSplash(
  s: GameState,
  partyBefore: Unit[],
  party: Unit[],
  spell: Spell,
  spellId: string,
  targetId: string,
): { party: Unit[]; eff: number; oh: number } {
  if (s.playerClass !== 'PALADIN' || spellId === 'mana_potion' || !isDirectHeal(spell, spellId)) {
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
  const { eff, oh } = getHealSplit(splashTgt.health, splashTgt.maxHealth, splash);
  return {
    party: mapEntityById(party, bestId, (u) => ({
      ...u,
      health: Math.min(u.maxHealth, u.health + splash),
    })),
    eff,
    oh,
  };
}

// Vow Crusader
export function vowCrusaderAoEMultiplier(s: GameState, spellId: string): number {
  if (spellId !== 'light_of_dawn' || getRanks(s.talents, 'paladin_vow_crusader') <= 0) return 1;
  return 1 + PALADIN.vowCrusaderAoEBonusPerRank * getRanks(s.talents, 'paladin_vow_crusader');
}

// Dispel
export function dispellableCurseCleanseProcChance(s: GameState): number {
  if (!s.playerClass) return 0;
  let c = 0;
  if (s.playerClass === 'PALADIN') c = getRanks(s.talents, 'purify');
  if (c <= 0) return 0;
  let p = SHARED.dispellableCurseCleanseProcPerRank * c;
  if (s.playerClass === 'PALADIN' && getRanks(s.talents, 'tower_of_radiance') > 0) {
    p *= PALADIN.purifyTowerOfRadianceMultiplier;
  }
  return p;
}

// Re-export from talentMechanics for convenience
export { hasBuff, addBuff, isDirectHeal } from '../../talentMechanics.ts';