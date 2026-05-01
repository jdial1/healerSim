import { GameState, Spell, Unit } from '../../types.ts';
import { talentRanks, hasPlayerBuff, HEALER_UNIT_ID, isDirectHealSpell, upsertPlayerBuff } from '../../talentMechanics.ts';
import { spellHasTag } from '../../constants.ts';
import { generateCombatUid } from '../../combatUid.ts';
import { mapEntityById } from '../../mapEntityById.ts';
import { effectiveUniqueStatRating } from '../../playerStats.ts';
import { healEffectiveAndOverheal } from '../../healMath.ts';

// Break circular dependency
import balanceData from '../../data/balance.json';
import aurasData from '../../data/auras.json';

export const PLAYER_BUFF_OMEN_CLEARCASTING = 'omen_clearcasting';
export const ECHO_OF_LIGHT_SOURCE = 'echo_of_light';
export const GRACE_SOURCE_ID = 'priest_grace';

const PRIEST = balanceData.combat.priest;
const SHARED = balanceData.combat.shared;
const AURAS = aurasData;

// Mana cost hooks
export function onHealManaCost(s: GameState, spell: Spell, spellId: string, surgeFree: boolean): number | undefined {
  if (surgeFree && spellHasTag(spellId, 'surge-finisher')) return 0;
  return undefined;
}

export function isPriestSurgeFinisher(spellId: string): boolean {
  return spellHasTag(spellId, 'surge-finisher');
}

export function archangelSkipsSpell(spellId: string): boolean {
  return spellHasTag(spellId, 'archangel-skip');
}

// Mana after heal hooks
export function manaAfterHeal(
  s: GameState,
  spellId: string,
  needMana: number,
  surgeFree: boolean,
  isCritH: boolean,
  healTargetId: string,
  initialMana: number
): number {
  if (
    s.playerClass === 'PRIEST' &&
    talentRanks(s.talents, 'path_moon') > 0 &&
    (spellHasTag(spellId, 'synergy-direct') || isDirectHealSpell({type: 'DIRECT', healing: 1}, spellId))
  ) {
    return Math.min(
      s.maxMana,
      initialMana + s.maxMana * PRIEST.pathMoonMaxManaReturnPerRank * talentRanks(s.talents, 'path_moon'),
    );
  }
  return initialMana;
}

export function priestMeditativeManaReturnPerTick(s: GameState, spiritRegenLockoutTicksRemaining: number): number {
  if (s.playerClass !== 'PRIEST' || spiritRegenLockoutTicksRemaining > 0) return 0;
  const ranks = s.talents.find((t) => t.id === 'p_r0c4')?.points ?? 0;
  if (ranks <= 0) return 0;
  return s.maxMana * PRIEST.meditativeManaReturnPerRankPerTick * ranks;
}

// Shield bonuses
export function priestShieldMaintenanceHasteBonus(s: GameState): number {
  if (s.playerClass !== 'PRIEST') return 0;
  const ranks = s.talents.find((t) => t.id === 'p_r5c3')?.points ?? 0;
  if (ranks <= 0) return 0;
  const hasAnyShield = s.party.some((unit) => unit.health > 0 && unit.shield > 0);
  if (!hasAnyShield) return 0;
  return PRIEST.shieldMaintenanceHastePerRank * ranks;
}

export function priestSelfShieldDamageReduction(s: GameState): number {
  if (s.playerClass !== 'PRIEST') return 0;
  const ranks = s.talents.find((t) => t.id === 'p_r3c3')?.points ?? 0;
  if (ranks <= 0) return 0;
  const healer = s.party.find((unit) => unit.role === 'HEALER');
  if (!healer || healer.shield <= 0) return 0;
  return PRIEST.selfShieldDamageReductionPerRank * ranks;
}

// Divine Aegis
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

// Binding Heal
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

// Surge of Light
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

// Echo of Light
const ECHO_DURATION_TICKS = 6 * 10;

function appendEchoOfLightBuff(unit: Unit, echoTotal: number): Unit {
  const dur = ECHO_DURATION_TICKS;
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

// Grace
export function applyGraceStacksFromDirectHeal(
  s: GameState,
  party: Unit[],
  targetId: string,
  spell: Spell,
  spellId: string,
): Unit[] {
  const g = talentRanks(s.talents, 'priest_grace');
  if (g <= 0 || !isDirectHealSpell(spell, spellId) || spell.type === 'AOE') return party;
  return mapEntityById(party, targetId, (u) =>
    u.health > 0 ? upsertGraceOnTarget(u, 1, g) : u,
  );
}

export function graceHealMultiplierOnTarget(target: Unit, graceRanks: number): number {
  if (graceRanks <= 0) return 1;
  const g = target.buffs.find((b) => b.sourceSpellId === GRACE_SOURCE_ID && b.remainingTicks > 0);
  if (!g || !g.stacks) return 1;
  const { maxStacks, healingPerStackLinearBonus } = AURAS.partyUnitBuffs.priest_grace;
  return 1 + healingPerStackLinearBonus * graceRanks * Math.min(maxStacks, g.stacks);
}

export function upsertGraceOnTarget(unit: Unit, stacksAdd: number, graceRanks: number): Unit {
  if (graceRanks <= 0) return unit;
  const dur = AURAS.partyUnitBuffs.priest_grace.defaultDurationTicks;
  const maxS = AURAS.partyUnitBuffs.priest_grace.maxStacks;
  const idx = unit.buffs.findIndex((b) => b.sourceSpellId === GRACE_SOURCE_ID);
  const nextStacks = Math.min(
    maxS,
    (idx >= 0 ? (unit.buffs[idx].stacks ?? 1) : 0) + stacksAdd,
  );
  const graceBuff = {
    id: generateCombatUid(`grace-${unit.id}`, Date.now(), Math.random),
    name: AURAS.partyUnitBuffs.priest_grace.displayName,
    remainingTicks: dur,
    healingPerTick: 0,
    icon: AURAS.partyUnitBuffs.priest_grace.icon,
    sourceSpellId: GRACE_SOURCE_ID,
    stacks: Math.max(1, nextStacks),
  };
  const kept = idx >= 0 ? unit.buffs.filter((_, i) => i !== idx) : unit.buffs;
  return { ...unit, buffs: [...kept, graceBuff] };
}

// Aegis Burst
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

// Archangel
export function archangelEchoShieldBonusFraction(
  s: GameState,
  spellId: string,
  spell: Spell,
): number {
  if (
    s.capstoneForm !== 'priest_archangel' ||
    !hasPlayerBuff(s.playerCombatBuffs, 'archangel') ||
    archangelSkipsSpell(spellId) ||
    !isDirectHealSpell(spell, spellId)
  ) {
    return 0;
  }
  const totalShield = s.party.reduce((sum, unit) => sum + Math.max(0, unit.shield), 0);
  if (totalShield <= 0) return 0;
  return totalShield * PRIEST.archangelEchoShieldConsumeBonusFraction;
}

// Divinity
export function priestDivinityOverhealAbsorb(overheal: number, rating: number): number {
  if (overheal <= 0 || rating <= 0) return 0;
  return overheal * Math.min(0.45, rating * PRIEST.divinityOverhealToShieldPerRating);
}

// Re-export from talentMechanics for convenience
export { hasPlayerBuff, upsertPlayerBuff, isDirectHealSpell, HEALER_UNIT_ID } from '../../talentMechanics.ts';