import { Spell } from './types.ts';
import { manaPotionInstantMana, manaPotionOverTimeTotal } from './manaPotionIcon.ts';

export function spellEffectTooltipText(
  spell: Spell,
  ctx: { spellHealingMultiplier: number; spirit: number; playerLevel?: number },
): string {
  if (spell.staticEffectDescription) return spell.staticEffectDescription;

  if (spell.id === 'mana_potion' && ctx.playerLevel !== undefined) {
    const instant = manaPotionInstantMana(ctx.playerLevel);
    const over = manaPotionOverTimeTotal(ctx.playerLevel);
    const dur = (spell.manaRegenBuffDurationTicks ?? 100) / 10;
    const fmtMana = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return [`Restores ${fmtMana(instant)} Mana.`, `Restores another ${fmtMana(over)} Mana over ${dur} sec.`].join(
      '\n',
    );
  }

  const effDirect =
    spell.healing > 0 ? Math.round(spell.healing * ctx.spellHealingMultiplier) : 0;
  const hotTicks = spell.hotDuration ?? 0;
  const hotPerTick = spell.hotHealingPerTick ?? 0;
  const hasHot = hotTicks > 0 && hotPerTick > 0;
  const effHotTotal = hasHot
    ? Math.round(hotPerTick * hotTicks * ctx.spellHealingMultiplier * 10) / 10
    : 0;
  const durSec = hotTicks / 10;
  const fmtHeal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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
