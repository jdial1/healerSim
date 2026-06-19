import type { ClassType, Talent } from './types.ts';
import { getUnmetPrerequisites } from './playerStats.ts';

export const INTRO_TUTORIAL_DUNGEON_ID = 'deadmines';
export const TUTORIAL_SPOTLIGHT_TANK_DATA_ID = 'tutorial-spotlight-tank';
export const INTRO_TUTORIAL_DEBUFF_ABILITY = 'vc_gut_slash';
export const INTRO_TUTORIAL_DEBUFF_DATA_ID = 'tutorial-debuff-gut_slash';
export const INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME = 'The Deadmines';
export const TUTORIAL_STEP_PASSIVE = 'passive_trait_tip';
export const TUTORIAL_STEP_MANA_POTION = 'mana_potion_tip';
export const TUTORIAL_STEP_AOE = 'aoe_heal_tip';
export const TUTORIAL_STEP_REORDER = 'reorder_tip';
export const TUTORIAL_STEP_NAV_PRIMER = 'nav_primer';
export const TUTORIAL_ACTION_BAR_DROP_DATA_ID = 'tutorial-action-bar-drop';

const HEAL_SPELL_BY_CLASS: Record<ClassType, string> = {
  PRIEST: 'flash_heal',
  DRUID: 'regrowth',
  PALADIN: 'flash_heal',
};

const AOE_SPELL_BY_CLASS: Record<ClassType, string> = {
  PRIEST: 'circle_of_healing',
  DRUID: 'wild_growth',
  PALADIN: 'light_of_dawn',
};

const PASSIVE_TRIGGER_BY_CLASS: Record<ClassType, { kind: 'buff' | 'highlight'; key: string } | null> = {
  PRIEST: { kind: 'buff', key: 'echo_of_light' },
  DRUID: { kind: 'highlight', key: 'regrowth' },
  PALADIN: null,
};

export function introTutorialPrimaryHealSpellId(cls: ClassType): string {
  return HEAL_SPELL_BY_CLASS[cls];
}

export function tutorialAoeSpellId(cls: ClassType): string {
  return AOE_SPELL_BY_CLASS[cls];
}

export function tutorialPassiveTrigger(cls: ClassType): { kind: 'buff' | 'highlight'; key: string } | null {
  return PASSIVE_TRIGGER_BY_CLASS[cls];
}

export function totalSpentTalentPoints(talents: Talent[]): number {
  return talents.reduce((acc, t) => acc + t.points * t.cost, 0);
}

export function pickTutorialFirstTalentId(
  talents: Talent[],
  talentPoints: number,
  playerLevel: number,
): string | null {
  for (const t of talents) {
    if (t.points >= t.maxPoints) continue;
    if (t.levelReq > playerLevel) continue;
    if (getUnmetPrerequisites(talents, t).length > 0) continue;
    if (talentPoints < t.cost) continue;
    return t.id;
  }
  return null;
}
