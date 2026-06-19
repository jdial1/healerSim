import { manaPotionInstantMana, manaPotionOverTimeTotal } from "./manaPotionIcon.js";
import {
  getSpellRank,
  getSpellOrder,
  getRankCostMult,
  getRankHealMult
} from "./playerStats.js";
function rankHealMultForSpell(spellId, ctx) {
  if (!ctx.playerClass || ctx.playerLevel === void 0) return 1;
  if (!getSpellOrder(ctx.playerClass).includes(spellId)) return 1;
  return getRankHealMult(getSpellRank(spellId, ctx.playerClass, ctx.playerLevel));
}
function spellTooltipRankLabel(spell, ctx) {
  if (!ctx.playerClass || ctx.playerLevel === void 0) return null;
  if (!getSpellOrder(ctx.playerClass).includes(spell.id)) return null;
  if (ctx.unlockedSpells !== void 0 && !ctx.unlockedSpells.includes(spell.id)) return null;
  return `Rank ${getSpellRank(spell.id, ctx.playerClass, ctx.playerLevel)}`;
}
function spellDisplayManaCost(spell, ctx) {
  if (spell.manaCost <= 0) return spell.manaCost;
  if (!ctx.playerClass || ctx.playerLevel === void 0) return spell.manaCost;
  if (ctx.unlockedSpells !== void 0 && !ctx.unlockedSpells.includes(spell.id)) return spell.manaCost;
  if (!getSpellOrder(ctx.playerClass).includes(spell.id)) return spell.manaCost;
  const rank = getSpellRank(spell.id, ctx.playerClass, ctx.playerLevel);
  return Math.round(spell.manaCost * getRankCostMult(rank));
}
function spellEffectTooltipText(spell, ctx) {
  if (spell.staticEffectDescription) return spell.staticEffectDescription;
  const integerText = (n) => String(Math.round(n));
  if (spell.id === "mana_potion" && ctx.playerLevel !== void 0) {
    const instant = manaPotionInstantMana(ctx.playerLevel);
    const over = manaPotionOverTimeTotal(ctx.playerLevel);
    const dur = (spell.manaRegenBuffDurationTicks ?? 100) / 10;
    const fmtMana = (n) => integerText(n);
    return [`Restores ${fmtMana(instant)} Mana.`, `Restores another ${fmtMana(over)} Mana over ${dur} sec.`].join(
      "\n"
    );
  }
  const rm = rankHealMultForSpell(spell.id, ctx);
  const effDirect = spell.healing > 0 ? Math.round(spell.healing * rm * ctx.spellHealingMultiplier) : 0;
  const hotTicks = spell.hotDuration ?? 0;
  const hotPerTick = spell.hotHealingPerTick ?? 0;
  const hasHot = hotTicks > 0 && hotPerTick > 0;
  const effHotTotal = hasHot ? Math.round(hotPerTick * hotTicks * rm * ctx.spellHealingMultiplier) : 0;
  const durSec = hotTicks / 10;
  const fmtHeal = (n) => integerText(n);
  const sentences = [];
  if (spell.type === "AOE") {
    if (hasHot && effDirect > 0) {
      sentences.push(
        `Heals the entire party for ${effDirect} and another ${fmtHeal(effHotTotal)} over ${durSec} sec.`
      );
    } else if (effDirect > 0) {
      sentences.push(`Heals the entire party for ${effDirect}.`);
    } else if (hasHot) {
      sentences.push(
        `Heals the entire party for another ${fmtHeal(effHotTotal)} over ${durSec} sec.`
      );
    } else {
      sentences.push("Heals the entire party.");
    }
    return sentences.join("\n");
  }
  if (hasHot && effDirect > 0) {
    sentences.push(
      `Heals a friendly target for ${effDirect} and another ${fmtHeal(effHotTotal)} over ${durSec} sec.`
    );
  } else if (hasHot) {
    sentences.push(
      `Heals a friendly target for another ${fmtHeal(effHotTotal)} over ${durSec} sec.`
    );
  } else if (effDirect > 0) {
    sentences.push(`Heals a friendly target for ${effDirect}.`);
  }
  return sentences.join("\n");
}
function injectNumericLevelUpMarkers(previousBody, nextBody) {
  const previousNumbers = previousBody.match(/\d+(?:\.\d+)?/g) ?? [];
  let idx = 0;
  return nextBody.replace(/\d+(?:\.\d+)?/g, (currentNum) => {
    const previousNum = previousNumbers[idx];
    idx += 1;
    if (!previousNum || previousNum === currentNum) return currentNum;
    return `[[${previousNum}|${currentNum}]]`;
  });
}
function spellEffectTooltipTextWithPreviousValues(spell, previousCtx, currentCtx) {
  const previous = spellEffectTooltipText(spell, previousCtx);
  const current = spellEffectTooltipText(spell, currentCtx);
  return injectNumericLevelUpMarkers(previous, current);
}
export {
  injectNumericLevelUpMarkers,
  spellDisplayManaCost,
  spellEffectTooltipText,
  spellEffectTooltipTextWithPreviousValues,
  spellTooltipRankLabel
};
