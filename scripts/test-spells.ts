import {
  SPELLS,
  TICKS_PER_SECOND,
  MANA_SPIRIT_REGEN_LOCKOUT_TICKS,
  manaRegenAmountPerTick,
  generateRandomParty,
} from '../src/constants.ts';
import {
  spellHealingMultiplierFromProgress,
  effectivePrimaryStats,
  CLASS_STAT_CURVE,
  computedMaxMana,
  computeTalentStats,
  talentCritChancePctFromTalents,
  talentHastePctFromTalents,
  effectiveUniqueStatRating,
  MANA_PER_INTELLECT,
  calculateSpellRank,
  getRankHealMultiplier,
  getRankCostMultiplier,
} from '../src/playerStats.ts';
import { BALANCE } from '../src/balance.ts';
import { totalXpToReachLevel, computeMetaFromProgress } from '../src/gameStorage.ts';
import { emptyGameBase } from '../src/gameEngineReducer.ts';
import {
  resolveManaAfterHealCast,
  nextManaForSpellWithHooks,
  priestDivinityOverhealAbsorb,
} from '../src/combatHooks.ts';
import { priestMentalFortitudeMaxRankCombatManaPerTick } from '../src/talentMechanics.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneTalentsForClass } from '../src/talents/index.ts';
import type { ClassType, GameState, Spell, Talent } from '../src/types.ts';
import { testPalette } from './testColors.ts';

const TEST_LEVEL = 25;
const PARTY_SIZE = 5;
const OOM_LEVEL = 25;
const ROI_LEVEL = 20;
const MIN_GCD_TICKS = 10;

const CLASS_MAP: Record<ClassType, string[]> = {
  PRIEST: ['flash_heal', 'greater_heal', 'renew', 'circle_of_healing'],
  DRUID: ['rejuvenation', 'regrowth', 'wild_growth', 'swiftmend', 'healing_touch', 'lifebloom'],
  PALADIN: ['flash_heal', 'holy_light', 'light_of_dawn'],
};

const OOM_ROTATIONS: Record<ClassType, { label: string; spells: string[] }> = {
  PRIEST: { label: 'Spam (Flash Heal priority)', spells: ['flash_heal', 'renew'] },
  DRUID: {
    label: 'HoT maintenance (Rejuv → Regrowth)',
    spells: ['rejuvenation', 'regrowth', 'rejuvenation', 'lifebloom'],
  },
  PALADIN: { label: 'Direct priority (Flash → Holy Light)', spells: ['flash_heal', 'holy_light'] },
};

const S = testPalette();

function rankedSpellManaCost(spellId: string, cls: ClassType, level: number, baseMana: number): number {
  const rank = calculateSpellRank(spellId, cls, level);
  return Math.round(baseMana * getRankCostMultiplier(rank));
}

function calculateTotalHealing(spell: Spell, multiplier: number, cls: ClassType, level: number): number {
  const rank = calculateSpellRank(spell.id, cls, level);
  const rankM = getRankHealMultiplier(rank);
  const direct = spell.healing * multiplier * rankM;
  const hotTicks = spell.hotDuration ?? 0;
  const hotHeal = (spell.hotHealingPerTick ?? 0) * hotTicks * multiplier * rankM;

  let total = direct + hotHeal;

  if (spell.type === 'AOE') {
    total *= PARTY_SIZE;
  }

  return total;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maxManaWithIntellectBonus(cls: ClassType, level: number, talents: Talent[], bonusInt: number): number {
  const c = CLASS_STAT_CURVE[cls];
  const int = c.baseIntellect + (level - 1) * c.intellectPerLevel + bonusInt;
  return Math.round(int * MANA_PER_INTELLECT + computeTalentStats(talents).flatMana);
}

function shellGameState(
  cls: ClassType,
  level: number,
  talents: Talent[],
  maxMana: number,
  mana: number,
): GameState {
  const xp = totalXpToReachLevel(level);
  const meta = computeMetaFromProgress(xp, cls, talents);
  const base = emptyGameBase();
  return {
    ...base,
    ...meta,
    maxMana,
    mana,
    playerClass: cls,
    party: generateRandomParty(level, cls),
    beaconTargetId: '1',
    playerCombatBuffs: [],
    internalCooldowns: {},
    capstoneForm: null,
    holyPower: 0,
    currentDungeon: null,
    dungeonPace: null,
    dungeonOutcome: null,
    spellCooldowns: {},
  };
}

export function simulateSecondsToOom(
  cls: ClassType,
  level: number,
  talents: Talent[],
  priority: string[],
  seed: number,
  maxManaOverride: number | null,
): number {
  const baseMax = computedMaxMana(cls, level, talents);
  const maxMana = maxManaOverride ?? baseMax;
  const sBase = shellGameState(cls, level, talents, maxMana, maxMana);
  const spirit = effectivePrimaryStats(cls, level).spirit;
  const haste = talentHastePctFromTalents(talents);
  const rng = mulberry32(seed);
  let mana = maxMana;
  let lockout = 0;
  let gcd = 0;
  const cds: Record<string, number> = {};
  let ticks = 0;
  const maxTicks = 600 * TICKS_PER_SECOND;

  while (ticks < maxTicks && mana > 1e-9) {
    ticks += 1;
    mana = Math.min(
      maxMana,
      mana + manaRegenAmountPerTick(lockout, spirit) + priestMentalFortitudeMaxRankCombatManaPerTick(cls, maxMana, talents, lockout),
    );
    lockout = Math.max(0, lockout - 1);
    gcd = Math.max(0, gcd - 1);
    for (const k of Object.keys(cds)) {
      const v = cds[k] ?? 0;
      if (v > 0) cds[k] = v - 1;
    }

    if (gcd > 0) continue;

    let cast = false;
    for (const sid of priority) {
      const sp = SPELLS[sid];
      if (!sp) continue;
      if ((cds[sid] ?? 0) > 0) continue;
      const sNow = { ...sBase, mana };
      const needMana = nextManaForSpellWithHooks(sNow, cls, sp, sid, false);
      if (mana < needMana) continue;
      const crit = rng() * 100 < talentCritChancePctFromTalents(talents);
      const post = resolveManaAfterHealCast(sNow, sp, sid, needMana, false, crit, '2');
      mana = post;
      if (needMana > 0) lockout = MANA_SPIRIT_REGEN_LOCKOUT_TICKS;
      const cdTicks = Math.max(MIN_GCD_TICKS, Math.round(sp.cooldown * (1 - haste / 100)));
      if (sp.cooldown > 0) cds[sid] = cdTicks;
      gcd = MIN_GCD_TICKS;
      cast = true;
      break;
    }
    if (!cast) {
      const minNeed = Math.min(
        ...priority.map((sid) => {
          const sp = SPELLS[sid];
          if (!sp) return 999999;
          return nextManaForSpellWithHooks({ ...sBase, mana }, cls, sp, sid, false);
        }),
      );
      if (lockout === 0 && mana < minNeed) break;
    }
  }

  return ticks / TICKS_PER_SECOND;
}

function runSpellTest(): void {
  console.log(`✨ Spell Efficiency & Value Analysis (Level ${TEST_LEVEL})`);
  console.log(`Comparing HPM (Efficiency) and HPC (Raw Power)\n`);

  for (const [className, spellIds] of Object.entries(CLASS_MAP)) {
    const multiplier = spellHealingMultiplierFromProgress(className as ClassType, TEST_LEVEL, []);

    console.log(`================================================================================`);
    console.log(`🛡️  CLASS: ${className} (Healing Mult: x${multiplier.toFixed(2)})`);
    console.log(`================================================================================`);
    console.log(
      `${'Spell Name'.padEnd(18)} | ` +
        `${'Type'.padEnd(8)} | ` +
        `${'Mana'.padEnd(5)} | ` +
        `${'Tot Heal'.padEnd(8)} | ` +
        `${'HPM'.padEnd(6)} | ` +
        `${'HPC'}`,
    );
    console.log(`--------------------------------------------------------------------------------`);

    const classSpells = spellIds.map((id) => SPELLS[id]).filter(Boolean) as Spell[];

    const cls = className as ClassType;
    for (const spell of classSpells) {
      if (spell.id === 'mana_potion') continue;

      const totalHeal = calculateTotalHealing(spell, multiplier, cls, TEST_LEVEL);
      const actualCost = rankedSpellManaCost(spell.id, cls, TEST_LEVEL, spell.manaCost);
      const hpm = actualCost > 0 ? totalHeal / actualCost : 0;
      const hpc = totalHeal;

      console.log(
        `${spell.name.padEnd(18)} | ` +
          `${spell.type.padEnd(8)} | ` +
          `${actualCost.toString().padEnd(5)} | ` +
          `${Math.round(totalHeal).toString().padEnd(8)} | ` +
          `${hpm.toFixed(2).padEnd(6)} | ` +
          `${Math.round(hpc)}`,
      );
    }
    console.log('');
  }

  console.log(`💡 HPM = Healing Per Mana (Higher is more efficient)`);
  console.log(`💡 HPC = Healing Per Cast (Higher is more burst power)`);
}

function runTimeToOomOverlap(): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Time-to-OOM (Level ${OOM_LEVEL}, no talents, 1s min gap when spell CD is 0)`);
  console.log(`${'='.repeat(80)}`);
  for (const cls of ['PRIEST', 'DRUID', 'PALADIN'] as ClassType[]) {
    const t = cloneTalentsForClass(cls).map((x) => ({ ...x, points: 0 }));
    const rot = OOM_ROTATIONS[cls];
    const sec = simulateSecondsToOom(cls, OOM_LEVEL, t, rot.spells, 42, null);
    const secInt = simulateSecondsToOom(cls, OOM_LEVEL, t, rot.spells, 42, maxManaWithIntellectBonus(cls, OOM_LEVEL, t, 10));
    console.log(
      `${cls} ${rot.label}: ~${sec.toFixed(0)}s to OOM (baseline max mana ${computedMaxMana(cls, OOM_LEVEL, t)})`,
    );
    console.log(`  +10 Intellect (mana only): ~${secInt.toFixed(0)}s to OOM (max mana ${maxManaWithIntellectBonus(cls, OOM_LEVEL, t, 10)})`);
  }
  console.log('');
}

function runRotationalHpmOverlap(): void {
  console.log(`${'='.repeat(80)}`);
  console.log('Rotational HPM (expected procs, Level 25, no talents)');
  console.log(`${'='.repeat(80)}`);
  const mult = spellHealingMultiplierFromProgress('PRIEST', TEST_LEVEL, []);
  const fh = SPELLS.flash_heal;
  const gh = SPELLS.greater_heal;
  const surgeRanks = 3;
  const pSurge = Math.min(1, BALANCE.combat.priest.surgeOfLightProcChancePerRank * surgeRanks);
  const rankFh = calculateSpellRank('flash_heal', 'PRIEST', TEST_LEVEL);
  const rankGh = calculateSpellRank('greater_heal', 'PRIEST', TEST_LEVEL);
  const costFh = rankedSpellManaCost('flash_heal', 'PRIEST', TEST_LEVEL, fh.manaCost);
  const hFlash = fh.healing * mult * 1.15 * getRankHealMultiplier(rankFh);
  const hGh = gh.healing * mult * 1.15 * getRankHealMultiplier(rankGh);
  const rotHeal = (hFlash + pSurge * hGh) / costFh;
  console.log(
    `Priest Flash→Surge→GH chain (EV, ${surgeRanks} Surge ranks): rotational HPM ~${rotHeal.toFixed(2)} (raw Flash HPM ~${(hFlash / costFh).toFixed(2)})`,
  );

  const rg = SPELLS.regrowth;
  const baseTotal = calculateTotalHealing(rg, mult, 'DRUID', TEST_LEVEL);
  const costRg = rankedSpellManaCost(rg.id, 'DRUID', TEST_LEVEL, rg.manaCost);
  const rawHpm = costRg > 0 ? baseTotal / costRg : 0;
  const rating = effectiveUniqueStatRating('DRUID', TEST_LEVEL, []);
  const pTick = Math.min(
    BALANCE.combat.druid.passiveOmenProcChanceCap,
    rating * BALANCE.combat.druid.passiveOmenProcPerHotTickPerRating,
  );
  const nTicks = rg.hotDuration ?? 0;
  const pAny = 1 - Math.pow(1 - pTick, nTicks);
  const omenManaFactor = Math.max(0.35, 1 - pAny * 0.85);
  const critPct = talentCritChancePctFromTalents([]);
  const rankRg = calculateSpellRank(rg.id, 'DRUID', TEST_LEVEL);
  const directPortion = rg.healing * mult * 1.15 * getRankHealMultiplier(rankRg);
  const lsExtra = critPct * (BALANCE.combat.druid.livingSeedPoolFraction * directPortion);
  const adjHpm = (baseTotal + lsExtra) / (costRg * omenManaFactor);
  console.log(
    `Druid Regrowth: raw HPM ~${rawHpm.toFixed(2)}  |  adjusted (Omen EV mana + Living Seed EV) ~${adjHpm.toFixed(2)}`,
  );
  console.log('');
}

function radianceMultAt(missingFrac: number, rating: number): number {
  const missing = Math.max(0, Math.min(1, missingFrac));
  const bonus = Math.min(
    BALANCE.combat.paladin.radianceHealMultBonusCap,
    missing * rating * BALANCE.combat.paladin.radianceHealMultPerMissingHealthPerRating,
  );
  return 1 + bonus;
}

function runStatRoiOverlap(): void {
  console.log(`${'='.repeat(80)}`);
  console.log(`Stat ROI snapshot (Level ${ROI_LEVEL}, 100 casts, seeded decay between casts)`);
  console.log(`${'='.repeat(80)}`);
  const talents = cloneTalentsForClass('PRIEST').map((t) => ({ ...t, points: 0 }));
  const mult = spellHealingMultiplierFromProgress('PRIEST', ROI_LEVEL, talents);
  const flash = SPELLS.flash_heal;
  const rankFlashPriest = calculateSpellRank(flash.id, 'PRIEST', ROI_LEVEL);
  const flashRankM = getRankHealMultiplier(rankFlashPriest);
  const baseRating = effectiveUniqueStatRating('PRIEST', ROI_LEVEL, talents);
  const baseIntMana = computedMaxMana('PRIEST', ROI_LEVEL, talents);
  const intMana = maxManaWithIntellectBonus('PRIEST', ROI_LEVEL, talents, 10);

  let hpToFlesh = 0;
  let shield = 0;
  let tgtHp = 210;
  const maxHp = 300;
  const rng = mulberry32(99);
  for (let i = 0; i < 100; i++) {
    const heal = flash.healing * mult * 1.15 * flashRankM;
    const room = Math.max(0, maxHp - tgtHp);
    const toFlesh = Math.min(room, heal);
    const oh = Math.max(0, heal - room);
    hpToFlesh += toFlesh;
    shield += priestDivinityOverhealAbsorb(oh, baseRating);
    tgtHp = Math.min(maxHp, tgtHp + toFlesh);
    tgtHp = Math.max(1, tgtHp - (6 + rng() * 6));
  }

  let hpToFleshU = 0;
  let shieldU = 0;
  tgtHp = 210;
  const rng2 = mulberry32(99);
  const ratingU = baseRating + 10;
  for (let i = 0; i < 100; i++) {
    const heal = flash.healing * mult * 1.15 * flashRankM;
    const room = Math.max(0, maxHp - tgtHp);
    const toFlesh = Math.min(room, heal);
    const oh = Math.max(0, heal - room);
    hpToFleshU += toFlesh;
    shieldU += priestDivinityOverhealAbsorb(oh, ratingU);
    tgtHp = Math.min(maxHp, tgtHp + toFlesh);
    tgtHp = Math.max(1, tgtHp - (6 + rng2() * 6));
  }

  console.log(
    `Priest Flash Heal x100: baseline flesh+shield ${Math.round(hpToFlesh + shield)} (flesh ${Math.round(hpToFlesh)}, absorb ${Math.round(shield)})`,
  );
  console.log(
    `  +10 Divinity rating: total ${Math.round(hpToFleshU + shieldU)} (flesh ${Math.round(hpToFleshU)}, absorb ${Math.round(shieldU)})`,
  );
  console.log(
    `  +10 Intellect (mana only in this engine): max mana ${baseIntMana} → ${intMana} (+${intMana - baseIntMana}); spell power unchanged`,
  );

  const pTalents = cloneTalentsForClass('PALADIN').map((t) => ({ ...t, points: 0 }));
  const pMult = spellHealingMultiplierFromProgress('PALADIN', ROI_LEVEL, pTalents);
  const hf = SPELLS.flash_heal;
  const rankFlashPalRoi = calculateSpellRank(hf.id, 'PALADIN', ROI_LEVEL);
  const baseR = effectiveUniqueStatRating('PALADIN', ROI_LEVEL, pTalents);
  const maxH = 300;
  const curH = 90;
  const perCast = hf.healing * pMult * 1.15 * getRankHealMultiplier(rankFlashPalRoi);
  const sumBase = perCast * radianceMultAt(1 - curH / maxH, baseR) * 100;
  const sumRad = perCast * radianceMultAt(1 - curH / maxH, baseR + 10) * 100;
  console.log(
    `Paladin Flash at 30% HP x100 static: baseline total ~${Math.round(sumBase)}  |  +10 Radiance rating ~${Math.round(sumRad)}`,
  );
  console.log('');
}

export function runSpellTestCondensed(): void {
  const maxHpmByClass: Record<string, number> = {};
  for (const [className, spellIds] of Object.entries(CLASS_MAP)) {
    const multiplier = spellHealingMultiplierFromProgress(className as ClassType, TEST_LEVEL, []);
    const cls = className as ClassType;
    let maxH = 0;
    for (const sid of spellIds) {
      const spell = SPELLS[sid];
      if (!spell || spell.id === 'mana_potion') continue;
      const totalHeal = calculateTotalHealing(spell, multiplier, cls, TEST_LEVEL);
      const actualCost = rankedSpellManaCost(spell.id, cls, TEST_LEVEL, spell.manaCost);
      const hpm = actualCost > 0 ? totalHeal / actualCost : 0;
      maxH = Math.max(maxH, hpm);
    }
    maxHpmByClass[className] = maxH;
  }

  const out: string[] = [];
  out.push(
    `${S.magenta}[spells]${S.r} ${S.dim}L${TEST_LEVEL} HPM/HPC (party=${PARTY_SIZE})${S.r}`,
  );
  for (const [className, spellIds] of Object.entries(CLASS_MAP)) {
    const multiplier = spellHealingMultiplierFromProgress(className as ClassType, TEST_LEVEL, []);
    const cls = className as ClassType;
    out.push(
      `${S.cyan}${className}${S.r} ${S.dim}mult=${S.r}x${S.yellow}${multiplier.toFixed(2)}${S.r}`,
    );
    const maxH = maxHpmByClass[className] ?? 0;
    for (const sid of spellIds) {
      const spell = SPELLS[sid];
      if (!spell || spell.id === 'mana_potion') continue;
      const totalHeal = calculateTotalHealing(spell, multiplier, cls, TEST_LEVEL);
      const actualCost = rankedSpellManaCost(spell.id, cls, TEST_LEVEL, spell.manaCost);
      const hpm = actualCost > 0 ? totalHeal / actualCost : 0;
      const hpmStr =
        maxH > 0 && hpm >= maxH
          ? `${S.green}hpm${hpm.toFixed(2)}${S.r}`
          : `${S.yellow}hpm${hpm.toFixed(2)}${S.r}`;
      out.push(
        `${S.dim}${sid}${S.r}|${spell.type}|m${actualCost}|h${Math.round(totalHeal)}|${hpmStr}|hpc${Math.round(totalHeal)}`,
      );
    }
  }
  for (const cls of ['PRIEST', 'DRUID', 'PALADIN'] as ClassType[]) {
    const t = cloneTalentsForClass(cls).map((x) => ({ ...x, points: 0 }));
    const rot = OOM_ROTATIONS[cls];
    const sec = simulateSecondsToOom(cls, OOM_LEVEL, t, rot.spells, 42, null);
    const secInt = simulateSecondsToOom(cls, OOM_LEVEL, t, rot.spells, 42, maxManaWithIntellectBonus(cls, OOM_LEVEL, t, 10));
    const secStr = sec >= 60 ? `${S.green}~${sec.toFixed(0)}s${S.r}` : `${S.yellow}~${sec.toFixed(0)}s${S.r}`;
    const secIntStr =
      secInt >= sec ? `${S.green}~${secInt.toFixed(0)}s${S.r}` : `${S.yellow}~${secInt.toFixed(0)}s${S.r}`;
    out.push(
      `${S.dim}oom${S.r} L${OOM_LEVEL} ${S.cyan}${cls}${S.r} ${secStr} maxMana=${computedMaxMana(cls, OOM_LEVEL, t)} +10int ${secIntStr} maxMana=${maxManaWithIntellectBonus(cls, OOM_LEVEL, t, 10)}`,
    );
  }
  const mult = spellHealingMultiplierFromProgress('PRIEST', TEST_LEVEL, []);
  const fh = SPELLS.flash_heal;
  const gh = SPELLS.greater_heal;
  const surgeRanks = 3;
  const pSurge = Math.min(1, BALANCE.combat.priest.surgeOfLightProcChancePerRank * surgeRanks);
  const rankFhC = calculateSpellRank('flash_heal', 'PRIEST', TEST_LEVEL);
  const rankGhC = calculateSpellRank('greater_heal', 'PRIEST', TEST_LEVEL);
  const costFhC = rankedSpellManaCost('flash_heal', 'PRIEST', TEST_LEVEL, fh.manaCost);
  const hFlash = fh.healing * mult * 1.15 * getRankHealMultiplier(rankFhC);
  const hGh = gh.healing * mult * 1.15 * getRankHealMultiplier(rankGhC);
  const rotHeal = (hFlash + pSurge * hGh) / costFhC;
  out.push(
    `${S.dim}rot_priest_flash_surge_gh${S.r} evHpm~${S.green}${rotHeal.toFixed(2)}${S.r} flashHpm~${S.yellow}${(hFlash / costFhC).toFixed(2)}${S.r}`,
  );
  const rg = SPELLS.regrowth;
  const baseTotal = calculateTotalHealing(rg, mult, 'DRUID', TEST_LEVEL);
  const costRgC = rankedSpellManaCost(rg.id, 'DRUID', TEST_LEVEL, rg.manaCost);
  const rawHpm = costRgC > 0 ? baseTotal / costRgC : 0;
  const rating = effectiveUniqueStatRating('DRUID', TEST_LEVEL, []);
  const pTick = Math.min(
    BALANCE.combat.druid.passiveOmenProcChanceCap,
    rating * BALANCE.combat.druid.passiveOmenProcPerHotTickPerRating,
  );
  const nTicks = rg.hotDuration ?? 0;
  const pAny = 1 - Math.pow(1 - pTick, nTicks);
  const omenManaFactor = Math.max(0.35, 1 - pAny * 0.85);
  const critPct = talentCritChancePctFromTalents([]);
  const rankRgC = calculateSpellRank(rg.id, 'DRUID', TEST_LEVEL);
  const directPortion = rg.healing * mult * 1.15 * getRankHealMultiplier(rankRgC);
  const lsExtra = critPct * (BALANCE.combat.druid.livingSeedPoolFraction * directPortion);
  const adjHpm = (baseTotal + lsExtra) / (costRgC * omenManaFactor);
  out.push(
    `${S.dim}rot_druid_regrowth${S.r} rawHpm~${S.yellow}${rawHpm.toFixed(2)}${S.r} adj~${S.green}${adjHpm.toFixed(2)}${S.r}`,
  );

  const talents = cloneTalentsForClass('PRIEST').map((t) => ({ ...t, points: 0 }));
  const multRoi = spellHealingMultiplierFromProgress('PRIEST', ROI_LEVEL, talents);
  const flash = SPELLS.flash_heal;
  const rankFlashPriestRoiC = calculateSpellRank(flash.id, 'PRIEST', ROI_LEVEL);
  const flashRankMC = getRankHealMultiplier(rankFlashPriestRoiC);
  const baseRating = effectiveUniqueStatRating('PRIEST', ROI_LEVEL, talents);
  const baseIntMana = computedMaxMana('PRIEST', ROI_LEVEL, talents);
  const intMana = maxManaWithIntellectBonus('PRIEST', ROI_LEVEL, talents, 10);
  let hpToFlesh = 0;
  let shield = 0;
  let tgtHp = 210;
  const maxHp = 300;
  const rng = mulberry32(99);
  for (let i = 0; i < 100; i++) {
    const heal = flash.healing * multRoi * 1.15 * flashRankMC;
    const room = Math.max(0, maxHp - tgtHp);
    const toFlesh = Math.min(room, heal);
    const oh = Math.max(0, heal - room);
    hpToFlesh += toFlesh;
    shield += priestDivinityOverhealAbsorb(oh, baseRating);
    tgtHp = Math.min(maxHp, tgtHp + toFlesh);
    tgtHp = Math.max(1, tgtHp - (6 + rng() * 6));
  }
  let hpToFleshU = 0;
  let shieldU = 0;
  tgtHp = 210;
  const rng2 = mulberry32(99);
  const ratingU = baseRating + 10;
  for (let i = 0; i < 100; i++) {
    const heal = flash.healing * multRoi * 1.15 * flashRankMC;
    const room = Math.max(0, maxHp - tgtHp);
    const toFlesh = Math.min(room, heal);
    const oh = Math.max(0, heal - room);
    hpToFleshU += toFlesh;
    shieldU += priestDivinityOverhealAbsorb(oh, ratingU);
    tgtHp = Math.min(maxHp, tgtHp + toFlesh);
    tgtHp = Math.max(1, tgtHp - (6 + rng2() * 6));
  }
  const totBase = Math.round(hpToFlesh + shield);
  const totDiv = Math.round(hpToFleshU + shieldU);
  out.push(
    `${S.dim}roi_priest_L${ROI_LEVEL}${S.r} flashx100 total=${S.yellow}${totBase}${S.r} +10div=${S.green}${totDiv}${S.r} intMana ${S.dim}${baseIntMana}->${intMana}${S.r}`,
  );
  const pTalents = cloneTalentsForClass('PALADIN').map((t) => ({ ...t, points: 0 }));
  const pMult = spellHealingMultiplierFromProgress('PALADIN', ROI_LEVEL, pTalents);
  const hf = SPELLS.flash_heal;
  const rankFlashPalCond = calculateSpellRank(hf.id, 'PALADIN', ROI_LEVEL);
  const baseR = effectiveUniqueStatRating('PALADIN', ROI_LEVEL, pTalents);
  const maxH = 300;
  const curH = 90;
  const perCast = hf.healing * pMult * 1.15 * getRankHealMultiplier(rankFlashPalCond);
  const sumBase = perCast * radianceMultAt(1 - curH / maxH, baseR) * 100;
  const sumRad = perCast * radianceMultAt(1 - curH / maxH, baseR + 10) * 100;
  out.push(
    `${S.dim}roi_paladin_flashx100_30hp${S.r} ~${S.yellow}${Math.round(sumBase)}${S.r} vs+10rad ~${S.green}${Math.round(sumRad)}${S.r}`,
  );
  console.log(out.join('\n'));
}

export function runSpellTestSuite(): void {
  runSpellTest();
  runTimeToOomOverlap();
  runRotationalHpmOverlap();
  runStatRoiOverlap();
}

const spellEntry = process.argv[1];
const isSpellMain =
  spellEntry !== undefined && path.resolve(spellEntry) === fileURLToPath(import.meta.url);

if (isSpellMain) {
  runSpellTestSuite();
}
