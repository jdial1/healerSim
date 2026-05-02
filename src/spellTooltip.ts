import type { ClassType } from './types.ts';
import { Spell } from './types.ts';
import { manaPotionInstantMana, manaPotionOverTimeTotal } from './manaPotionIcon.ts';
import {
  getSpellRank,
  getSpellOrder,
  getRankCostMult,
  getRankHealMult,
} from './playerStats.ts';

export type SpellEffectTooltipContext = {
  spellHealingMultiplier: number;
  spirit: number;
  playerLevel?: number;
  playerClass?: ClassType | null;
  unlockedSpells?: string[];
};

function rankHealMultForSpell(spellId: string, ctx: SpellEffectTooltipContext): number {
  if (!ctx.playerClass || ctx.playerLevel === undefined) return 1;
  if (!getSpellOrder(ctx.playerClass).includes(spellId)) return 1;
  return getRankHealMult(getSpellRank(spellId, ctx.playerClass, ctx.playerLevel));
}

export function spellTooltipRankLabel(spell: Spell, ctx: SpellEffectTooltipContext): string | null {
  if (!ctx.playerClass || ctx.playerLevel === undefined) return null;
  if (!getSpellOrder(ctx.playerClass).includes(spell.id)) return null;
  if (ctx.unlockedSpells !== undefined && !ctx.unlockedSpells.includes(spell.id)) return null;
  return `Rank ${getSpellRank(spell.id, ctx.playerClass, ctx.playerLevel)}`;
}

export function spellDisplayManaCost(spell: Spell, ctx: SpellEffectTooltipContext): number {
  if (spell.manaCost <= 0) return spell.manaCost;
  if (!ctx.playerClass || ctx.playerLevel === undefined) return spell.manaCost;
  if (ctx.unlockedSpells !== undefined && !ctx.unlockedSpells.includes(spell.id)) return spell.manaCost;
  if (!getSpellOrder(ctx.playerClass).includes(spell.id)) return spell.manaCost;
  const rank = getSpellRank(spell.id, ctx.playerClass, ctx.playerLevel);
  return Math.round(spell.manaCost * getRankCostMult(rank));
}

export function spellEffectTooltipText(spell: Spell, ctx: SpellEffectTooltipContext): string {
  if (spell.staticEffectDescription) return spell.staticEffectDescription;
  const integerText = (n: number) => String(Math.round(n));

  if (spell.id === 'mana_potion' && ctx.playerLevel !== undefined) {
    const instant = manaPotionInstantMana(ctx.playerLevel);
    const over = manaPotionOverTimeTotal(ctx.playerLevel);
    const dur = (spell.manaRegenBuffDurationTicks ?? 100) / 10;
    const fmtMana = (n: number) => integerText(n);
    return [`Restores ${fmtMana(instant)} Mana.`, `Restores another ${fmtMana(over)} Mana over ${dur} sec.`].join(
      '\n',
    );
  }

  const rm = rankHealMultForSpell(spell.id, ctx);
  const effDirect =
    spell.healing > 0 ? Math.round(spell.healing * rm * ctx.spellHealingMultiplier) : 0;
  const hotTicks = spell.hotDuration ?? 0;
  const hotPerTick = spell.hotHealingPerTick ?? 0;
  const hasHot = hotTicks > 0 && hotPerTick > 0;
  const effHotTotal = hasHot ? Math.round(hotPerTick * hotTicks * rm * ctx.spellHealingMultiplier) : 0;
  const durSec = hotTicks / 10;
  const fmtHeal = (n: number) => integerText(n);

  const sentences: string[] = [];

  if (spell.type === 'AOE') {
    if (hasHot && effDirect > 0) {
      sentences.push(
        `Heals the entire party for ${effDirect} and another ${fmtHeal(effHotTotal)} over ${durSec} sec.`,
      );
    } else if (effDirect > 0) {
      sentences.push(`Heals the entire party for ${effDirect}.`);
    } else if (hasHot) {
      sentences.push(
        `Heals the entire party for another ${fmtHeal(effHotTotal)} over ${durSec} sec.`,
      );
    } else {
      sentences.push('Heals the entire party.');
    }
    return sentences.join('\n');
  }

  if (hasHot && effDirect > 0) {
    sentences.push(
      `Heals a friendly target for ${effDirect} and another ${fmtHeal(effHotTotal)} over ${durSec} sec.`,
    );
  } else if (hasHot) {
    sentences.push(
      `Heals a friendly target for another ${fmtHeal(effHotTotal)} over ${durSec} sec.`,
    );
  } else if (effDirect > 0) {
    sentences.push(`Heals a friendly target for ${effDirect}.`);
  }

  return sentences.join('\n');
}

export function injectNumericLevelUpMarkers(previousBody: string, nextBody: string): string {
  const previousNumbers = previousBody.match(/\d+(?:\.\d+)?/g) ?? [];
  let idx = 0;
  return nextBody.replace(/\d+(?:\.\d+)?/g, (currentNum) => {
    const previousNum = previousNumbers[idx];
    idx += 1;
    if (!previousNum || previousNum === currentNum) return currentNum;
    return `[[${previousNum}|${currentNum}]]`;
  });
}

export function spellEffectTooltipTextWithPreviousValues(
  spell: Spell,
  previousCtx: SpellEffectTooltipContext,
  currentCtx: SpellEffectTooltipContext,
): string {
  const previous = spellEffectTooltipText(spell, previousCtx);
  const current = spellEffectTooltipText(spell, currentCtx);
  return injectNumericLevelUpMarkers(previous, current);
}
