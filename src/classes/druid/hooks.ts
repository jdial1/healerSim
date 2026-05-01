import { GameState, Spell, Unit } from '../../types.ts';
import { talentRanks, hasPlayerBuff, upsertPlayerBuff, isDirectHealSpell } from '../../talentMechanics.ts';
import { SPELLS, SPELL_TAG_DRUID_CULTIVATION_HOT, SPELL_TAG_DRUID_HOT, spellHasTag } from '../../constants.ts';
import type { HealManaCostContext, ManaAfterHealContext } from '../../combatHookRegistry.ts';
import { generateCombatUid } from '../../combatUid.ts';
import { mapEntityById } from '../../mapEntityById.ts';
import balanceData from '../../data/balance.json';
import { effectiveUniqueStatRating } from '../../playerStats.ts';
import { healEffectiveAndOverheal } from '../../healMath.ts';

export const PLAYER_BUFF_OMEN_CLEARCASTING = 'omen_clearcasting';
export const DRUID_HARMONY_HOT_BUFF = 'druid_harmony_for_hot';
export const DRUID_HARMONY_HOT_TICKS = 6 * 10;

const DRUID = balanceData.combat.druid;
const SHARED = balanceData.combat.shared;

// Mana cost hooks
export function onHealManaCost(s: GameState, spell: Spell, spellId: string, surgeFree: boolean): number | undefined {
  // Clearcasting
  if (hasPlayerBuff(s.playerCombatBuffs, PLAYER_BUFF_OMEN_CLEARCASTING)) {
    if (spellId === 'regrowth' || spellId === 'healing_touch') return 0;
  }
  
  // Tree of Life
  if (talentRanks(s.talents, 'tree_of_life') > 0) {
    const isHot = spell.type === 'HOT' || Boolean(spell.hotDuration && spell.healing > 0);
    if (isHot) return Math.round(spell.manaCost * DRUID.treeOfLifeHotManaCostFactor);
    if (spellHasTag(spellId, 'tree-of-life-big-direct')) {
        return Math.round(spell.manaCost * DRUID.treeOfLifeBigDirectManaCostFactor);
    }
  }
  return undefined;
}

// Mana after heal hooks
export function druidHotTickManaReturn(s: GameState, sourceSpellId: string): number {
  if (s.playerClass !== 'DRUID' || !spellHasTag(sourceSpellId, SPELL_TAG_DRUID_HOT)) return 0;
  const ranks = s.talents.find((t) => t.id === 'd_r0c4')?.points ?? 0;
  if (ranks <= 0) return 0;
  return DRUID.hotTickManaReturnPerRank * ranks;
}

// Tick rate/multiplier hooks
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

export function druidHarmonyHotTickMultiplier(s: GameState, pComb: typeof s.playerCombatBuffs): number {
  const h = talentRanks(s.talents, 'druid_harmony');
  if (h <= 0 || !hasPlayerBuff(pComb, DRUID_HARMONY_HOT_BUFF)) return 1;
  return 1 + DRUID.harmonyBonusPerRank * h;
}

export function druidHarmonyDirectMultiplier(s: GameState): number {
  const h = talentRanks(s.talents, 'druid_harmony');
  if (h <= 0 || !partyHasDruidHotOnAnyAlly(s)) return 1;
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

// Ramp bonuses
function druidActiveHotCount(s: GameState): number {
  return s.party.reduce(
    (count, unit) =>
      count + unit.buffs.filter((buff) => buff.remainingTicks > 0 && spellHasTag(buff.sourceSpellId, SPELL_TAG_DRUID_HOT)).length,
    0,
  );
}

export function druidRampHasteBonus(s: GameState): number {
  if (s.playerClass !== 'DRUID') return 0;
  const ranks = s.talents.find((t) => t.id === 'd_r4c3')?.points ?? 0;
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampHastePerHotPerRank * ranks;
}

export function druidRampCritBonus(s: GameState): number {
  if (s.playerClass !== 'DRUID') return 0;
  const ranks = s.talents.find((t) => t.id === 'd_r5c4')?.points ?? 0;
  if (ranks <= 0) return 0;
  return druidActiveHotCount(s) * DRUID.rampCritPerHotPerRank * ranks;
}

// Self heal on damage
export function druidBarkskinSelfHealOnDamage(s: GameState, damageTaken: number): number {
  if (s.playerClass !== 'DRUID' || damageTaken <= 0) return 0;
  const ranks = s.talents.find((t) => t.id === 'd_r2c0')?.points ?? 0;
  if (ranks <= 0) return 0;
  return damageTaken * DRUID.barkskinSelfHealFractionPerRank * ranks;
}

// Living Seed
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

// Vitality bloom
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

// Omen of Clarity
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

// Party check
export function partyHasDruidHotOnAnyAlly(s: GameState): boolean {
  return s.party.some(
    (u) => u.health > 0 && u.buffs.some((b) => spellHasTag(b.sourceSpellId, SPELL_TAG_DRUID_HOT)),
  );
}

// Re-export from talentMechanics for convenience
export { hasPlayerBuff, upsertPlayerBuff, isDirectHealSpell } from '../../talentMechanics.ts';