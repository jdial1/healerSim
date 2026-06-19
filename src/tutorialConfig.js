import { getUnmetPrerequisites } from "./playerStats.js";
const INTRO_TUTORIAL_DUNGEON_ID = "deadmines";
const TUTORIAL_SPOTLIGHT_TANK_DATA_ID = "tutorial-spotlight-tank";
const INTRO_TUTORIAL_DEBUFF_ABILITY = "vc_gut_slash";
const INTRO_TUTORIAL_DEBUFF_DATA_ID = "tutorial-debuff-gut_slash";
const INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME = "The Deadmines";
const TUTORIAL_STEP_PASSIVE = "passive_trait_tip";
const TUTORIAL_STEP_MANA_POTION = "mana_potion_tip";
const TUTORIAL_STEP_AOE = "aoe_heal_tip";
const TUTORIAL_STEP_REORDER = "reorder_tip";
const TUTORIAL_STEP_NAV_PRIMER = "nav_primer";
const TUTORIAL_ACTION_BAR_DROP_DATA_ID = "tutorial-action-bar-drop";
const HEAL_SPELL_BY_CLASS = {
  PRIEST: "flash_heal",
  DRUID: "regrowth",
  PALADIN: "flash_heal"
};
const AOE_SPELL_BY_CLASS = {
  PRIEST: "circle_of_healing",
  DRUID: "wild_growth",
  PALADIN: "light_of_dawn"
};
const PASSIVE_TRIGGER_BY_CLASS = {
  PRIEST: { kind: "buff", key: "echo_of_light" },
  DRUID: { kind: "highlight", key: "regrowth" },
  PALADIN: null
};
function introTutorialPrimaryHealSpellId(cls) {
  return HEAL_SPELL_BY_CLASS[cls];
}
function tutorialAoeSpellId(cls) {
  return AOE_SPELL_BY_CLASS[cls];
}
function tutorialPassiveTrigger(cls) {
  return PASSIVE_TRIGGER_BY_CLASS[cls];
}
function totalSpentTalentPoints(talents) {
  return talents.reduce((acc, t) => acc + t.points * t.cost, 0);
}
function pickTutorialFirstTalentId(talents, talentPoints, playerLevel) {
  for (const t of talents) {
    if (t.points >= t.maxPoints) continue;
    if (t.levelReq > playerLevel) continue;
    if (getUnmetPrerequisites(talents, t).length > 0) continue;
    if (talentPoints < t.cost) continue;
    return t.id;
  }
  return null;
}
export {
  INTRO_TUTORIAL_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DEBUFF_DATA_ID,
  INTRO_TUTORIAL_DUNGEON_ID,
  INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME,
  TUTORIAL_ACTION_BAR_DROP_DATA_ID,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
  TUTORIAL_STEP_AOE,
  TUTORIAL_STEP_MANA_POTION,
  TUTORIAL_STEP_NAV_PRIMER,
  TUTORIAL_STEP_PASSIVE,
  TUTORIAL_STEP_REORDER,
  introTutorialPrimaryHealSpellId,
  pickTutorialFirstTalentId,
  totalSpentTalentPoints,
  tutorialAoeSpellId,
  tutorialPassiveTrigger
};
