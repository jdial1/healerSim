import type { ClassType, GameState } from './Types';
import {
  INTRO_DEBUFF_DATA_ID,
  INTRO_TUTORIAL_DUNGEON_ID,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
  introPrimaryHealId,
  tutorialAoeSpellId,
  tutorialPassiveTrigger,
} from './Constants';
import { pickTutorialFirstTalentId, getTutorialCopy } from '../core/mechanics/formulas';

export type IntroTutorialOverlay = {
  open: boolean;
  targetId: string | null;
  message: string;
  showTapCatcher: boolean;
  showResumeButton?: boolean;
  tone?: 'benefit' | 'threat';
  resumeLabel?: string;
  ghostHand?: { fromId: string; toId: string };
};

export const TUTORIAL_CORE_STEPS = {
  triage: 'Tank took damage. Tap to target.',
  cast: 'Tap your fast heal spell.',
  manaTap: 'Spells cost mana. Press Resume.',
  debuffResume:
    'Dangerous debuff on an ally. Tap or click the red icon to read full details. Press Resume combat when you are ready.',
  talentsNav: 'Level up! Open Talents here.',
  talentNode: 'Spend your talent point.',
} as const;

export const TUTORIAL_MASTERY_STEPS = {
  potion: 'Low Mana! Use a potion now.',
  aoe: 'Multiple allies hurt. Use AoE.',
  reorder: 'Hold and drag to reorder spells.',
} as const;

export function livingPartyBelowThreshold(state: GameState, thresholdPct: number): number {
  return state.party.filter((u) => u.health > 0 && u.health / Math.max(1, u.maxHealth) < thresholdPct).length;
}

export type MasteryKind = 'passive' | 'potion' | 'aoe' | 'reorder';

export function evaluateMasteryTutorialOverlay(input: {
  activeMasteryStep: MasteryKind | null;
  showRoster: boolean;
  state: GameState;
  passiveTrigger: ReturnType<typeof tutorialPassiveTrigger>;
  passiveCopy: string;
  aoeSpellId: string | null;
  filledSlotIdForReorder: string | null;
}): IntroTutorialOverlay | null {
  const { activeMasteryStep, showRoster, state, passiveTrigger, passiveCopy, aoeSpellId, filledSlotIdForReorder } =
    input;
  if (!state.introComplete || showRoster || !activeMasteryStep) return null;
  if (activeMasteryStep === 'passive') {
    const passiveTarget =
      passiveTrigger?.kind === 'buff' ? 'tutorial-passive-priest-echo' : `spell-${passiveTrigger?.key ?? 'flash_heal'}`;
    return {
      open: true,
      targetId: passiveTarget,
      message: passiveCopy,
      showTapCatcher: true,
      tone: 'benefit',
      resumeLabel: 'Resume',
    };
  }
  if (activeMasteryStep === 'potion') {
    return {
      open: true,
      targetId: 'spell-mana_potion',
      message: TUTORIAL_MASTERY_STEPS.potion,
      showTapCatcher: false,
      tone: 'benefit',
    };
  }
  if (activeMasteryStep === 'aoe' && aoeSpellId) {
    return {
      open: true,
      targetId: `spell-${aoeSpellId}`,
      message: TUTORIAL_MASTERY_STEPS.aoe,
      showTapCatcher: false,
      tone: 'threat',
    };
  }
  if (activeMasteryStep === 'reorder' && filledSlotIdForReorder) {
    return {
      open: true,
      targetId: `spell-${filledSlotIdForReorder}`,
      message: TUTORIAL_MASTERY_STEPS.reorder,
      showTapCatcher: false,
      tone: 'benefit',
      ghostHand: { fromId: `spell-${filledSlotIdForReorder}`, toId: 'spell-mana_potion' },
    };
  }
  return null;
}

export function evaluateCoreTutorialOverlay(input: {
  coreEnabled: boolean;
  showRoster: boolean;
  coreStep: number;
  state: GameState;
  menuView: 'dungeons' | 'talents' | 'character';
  firstPickableTalentId: string | null;
}): IntroTutorialOverlay {
  const { coreEnabled, showRoster, coreStep, state, menuView, firstPickableTalentId } = input;
  const closed: IntroTutorialOverlay = {
    open: false,
    targetId: null,
    message: '',
    showTapCatcher: false,
    showResumeButton: false,
  };
  if (!coreEnabled || showRoster) return closed;
  if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 0) {
    return {
      open: true,
      targetId: TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
      message: TUTORIAL_CORE_STEPS.triage,
      showTapCatcher: false,
      tone: 'threat',
    };
  }
  if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 1 && state.playerClass) {
    return {
      open: true,
      targetId: `spell-${introPrimaryHealId(state.playerClass)}`,
      message: TUTORIAL_CORE_STEPS.cast,
      showTapCatcher: false,
      tone: 'benefit',
    };
  }
  if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 2) {
    return {
      open: true,
      targetId: 'mana-pool',
      message: TUTORIAL_CORE_STEPS.manaTap,
      showTapCatcher: true,
      tone: 'benefit',
      resumeLabel: 'Resume combat',
    };
  }
  if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 4) {
    return {
      open: true,
      targetId: INTRO_DEBUFF_DATA_ID,
      message: TUTORIAL_CORE_STEPS.debuffResume,
      showTapCatcher: false,
      showResumeButton: true,
      tone: 'threat',
      resumeLabel: 'Resume combat',
    };
  }
  if (coreStep === 6 && !state.currentDungeon) {
    if (menuView !== 'talents') {
      return {
        open: true,
        targetId: 'nav-talents',
        message: TUTORIAL_CORE_STEPS.talentsNav,
        showTapCatcher: false,
        tone: 'benefit',
      };
    }
    if (firstPickableTalentId) {
      return {
        open: true,
        targetId: 'tutorial-first-talent',
        message: TUTORIAL_CORE_STEPS.talentNode,
        showTapCatcher: false,
        tone: 'benefit',
      };
    }
  }
  return closed;
}

export function tutorialPassiveCopy(cls: ClassType | null): string {
  return cls ? getTutorialCopy(cls).passiveDescription : 'Passive effect active.';
}
