import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../types.ts';
import { classTutorialCopy } from '../playerStats.ts';
import {
  INTRO_TUTORIAL_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DEBUFF_DATA_ID,
  INTRO_TUTORIAL_DUNGEON_ID,
  INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
  TUTORIAL_STEP_AOE,
  TUTORIAL_STEP_MANA_POTION,
  TUTORIAL_STEP_PASSIVE,
  TUTORIAL_STEP_REORDER,
  TUTORIAL_STEP_NAV_PRIMER,
  introTutorialPrimaryHealSpellId,
  pickTutorialFirstTalentId,
  totalSpentTalentPoints,
  tutorialAoeSpellId,
  tutorialPassiveTrigger,
} from '../tutorialConfig.ts';

export type IntroTutorialOverlay = {
  open: boolean;
  targetDataId: string | null;
  message: string;
  showTapCatcher: boolean;
  showResumeButton?: boolean;
  tone?: 'benefit' | 'threat';
  resumeLabel?: string;
  ghostHand?: { fromDataId: string; toDataId: string };
};

type MenuView = 'dungeons' | 'talents' | 'character';

type UseIntroTutorialArgs = {
  state: GameState;
  actionBarHighlights: Record<string, boolean>;
  targetId: string | null;
  menuView: MenuView;
  showRoster: boolean;
  castSpellIdSignal: { id: string; nonce: number } | null;
  clearCastSpellSignal: () => void;
  setTutorialPaused: (v: boolean) => void;
  completeIntroTutorial: () => void;
  markTutorialStepCompleted: (stepId: string) => void;
  reorderSignal: number;
};

const CORE = {
  triage: 'Tank took damage. Tap to target.',
  cast: 'Tap your fast heal spell.',
  manaTap: 'Spells cost mana. Press Resume.',
  debuffResume:
    'Dangerous debuff on an ally. Tap or click the red icon to read full details. Press Resume combat when you are ready.',
  talentsNav: 'Level up! Open Talents here.',
  talentNode: 'Spend your talent point.',
} as const;

const MASTERY = {
  potion: 'Low Mana! Use a potion now.',
  aoe: 'Multiple allies hurt. Use AoE.',
  reorder: 'Hold and drag to reorder spells.',
} as const;

function livingPartyBelowThreshold(state: GameState, thresholdPct: number): number {
  return state.party.filter((u) => u.health > 0 && u.health / Math.max(1, u.maxHealth) < thresholdPct).length;
}

export function useIntroTutorial({
  state,
  actionBarHighlights,
  targetId,
  menuView,
  showRoster,
  castSpellIdSignal,
  clearCastSpellSignal,
  setTutorialPaused,
  completeIntroTutorial,
  markTutorialStepCompleted,
  reorderSignal,
}: UseIntroTutorialArgs) {
  const [coreStep, setCoreStep] = useState(0);
  const [activeMasteryStep, setActiveMasteryStep] = useState<null | 'passive' | 'potion' | 'aoe' | 'reorder'>(null);
  const talentBaselineRef = useRef<number | null>(null);
  const talentSpentBaselineRef = useRef<number | null>(null);
  const prevOutcomeRef = useRef(state.dungeonOutcome);
  const prevHadDungeonRef = useRef(!!state.currentDungeon);
  const potionBaselineRef = useRef<number | null>(null);
  const prevCompletedDungeonCountRef = useRef(state.completedDungeonIds.length);

  const coreEnabledBase =
    !!state.playerClass &&
    !state.introTutorialComplete &&
    !state.tutorialCompletedSteps.includes('intro_core') &&
    !showRoster;
  const coreEnabled = coreEnabledBase && (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID || coreStep === 6);
  const firstPickableTalentId = pickTutorialFirstTalentId(state.talents, state.talentPoints, state.level);
  const completedSteps = state.tutorialCompletedSteps;
  const hasMasteryOpen = activeMasteryStep !== null;
  const aoeSpellId = state.playerClass ? tutorialAoeSpellId(state.playerClass) : null;
  const passiveTrigger = state.playerClass ? tutorialPassiveTrigger(state.playerClass) : null;
  const passiveCopy = state.playerClass ? classTutorialCopy(state.playerClass).passiveDescription : 'Passive effect active.';

  useEffect(() => {
    const inDeadmines = state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID;
    if (inDeadmines && !prevHadDungeonRef.current && !state.introTutorialComplete) {
      setCoreStep(0);
    }
    prevHadDungeonRef.current = !!state.currentDungeon;
  }, [state.currentDungeon, state.introTutorialComplete]);

  useEffect(() => {
    if (!coreEnabledBase) return;
    if (coreStep !== 0) return;
    if (state.currentDungeon?.id !== INTRO_TUTORIAL_DUNGEON_ID) return;
    if (targetId === '1') {
      setCoreStep(1);
    }
  }, [coreEnabledBase, coreStep, targetId, state.currentDungeon?.id]);

  useEffect(() => {
    if (!coreEnabledBase) return;
    if (coreStep !== 1) return;
    if (state.currentDungeon?.id !== INTRO_TUTORIAL_DUNGEON_ID) return;
    if (!castSpellIdSignal || !state.playerClass) return;
    if (castSpellIdSignal.id === introTutorialPrimaryHealSpellId(state.playerClass)) {
      setCoreStep(2);
      clearCastSpellSignal();
    }
  }, [coreEnabledBase, coreStep, castSpellIdSignal, clearCastSpellSignal, state.currentDungeon?.id, state.playerClass]);

  useEffect(() => {
    if (!coreEnabledBase) return;
    if (coreStep !== 3) return;
    if (state.currentDungeon?.id !== INTRO_TUTORIAL_DUNGEON_ID) return;
    const hit = state.party.some((u) => u.debuffs.some((d) => d.sourceAbilityId === INTRO_TUTORIAL_DEBUFF_ABILITY));
    if (hit) {
      setCoreStep(4);
      setTutorialPaused(true);
    }
  }, [coreEnabledBase, coreStep, state.party, state.currentDungeon?.id, setTutorialPaused]);

  useEffect(() => {
    const prev = prevOutcomeRef.current;
    prevOutcomeRef.current = state.dungeonOutcome;
    if (!coreEnabledBase) return;
    if (coreStep !== 5) return;
    if (prev?.kind === 'success' && prev.dungeonName === INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME && state.dungeonOutcome === null) {
      setCoreStep(6);
      talentBaselineRef.current = state.talentPoints;
      talentSpentBaselineRef.current = totalSpentTalentPoints(state.talents);
    }
  }, [coreEnabledBase, coreStep, state.dungeonOutcome, state.talentPoints, state.talents]);

  useEffect(() => {
    if (!coreEnabledBase) return;
    if (coreStep !== 6) return;
    if (state.currentDungeon) return;
    const bankBaseline = talentBaselineRef.current;
    const spentBaseline = talentSpentBaselineRef.current;
    if (bankBaseline === null || spentBaseline === null) return;
    const spentNow = totalSpentTalentPoints(state.talents);
    const bankDropped = state.talentPoints < bankBaseline;
    const spentIncreased = spentNow > spentBaseline;
    const noBankToSpend = bankBaseline <= 0 && state.talentPoints <= 0;
    if (!bankDropped && !spentIncreased && !noBankToSpend) return;
    completeIntroTutorial();
    markTutorialStepCompleted('intro_core');
    markTutorialStepCompleted(TUTORIAL_STEP_NAV_PRIMER);
    setCoreStep(0);
    talentBaselineRef.current = null;
    talentSpentBaselineRef.current = null;
  }, [
    coreEnabledBase,
    coreStep,
    state.currentDungeon,
    state.talentPoints,
    state.talents,
    completeIntroTutorial,
    markTutorialStepCompleted,
  ]);

  useEffect(() => {
    if (hasMasteryOpen || !state.introTutorialComplete || !state.playerClass || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_PASSIVE)) return;
    if (!passiveTrigger) return;
    if (passiveTrigger.kind === 'buff') {
      const seen = state.party.some((u) => u.buffs.some((b) => b.sourceSpellId === passiveTrigger.key));
      if (seen) {
        setActiveMasteryStep('passive');
        setTutorialPaused(true);
      }
      return;
    }
    if (actionBarHighlights[passiveTrigger.key]) {
      setActiveMasteryStep('passive');
      setTutorialPaused(true);
    }
  }, [hasMasteryOpen, state.introTutorialComplete, state.playerClass, showRoster, state.currentDungeon, completedSteps, passiveTrigger, state.party, actionBarHighlights, setTutorialPaused]);

  useEffect(() => {
    if (hasMasteryOpen || !state.introTutorialComplete || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_MANA_POTION)) return;
    if (state.combatPhase !== 'BOSS') return;
    if (state.mana / Math.max(1, state.maxMana) >= 0.25) return;
    potionBaselineRef.current = state.manaPotionsUsedThisDungeon;
    setActiveMasteryStep('potion');
    setTutorialPaused(true);
  }, [hasMasteryOpen, state.introTutorialComplete, showRoster, state.currentDungeon, completedSteps, state.combatPhase, state.mana, state.maxMana, state.manaPotionsUsedThisDungeon, setTutorialPaused]);

  useEffect(() => {
    if (activeMasteryStep !== 'potion') return;
    const base = potionBaselineRef.current ?? state.manaPotionsUsedThisDungeon;
    if (state.manaPotionsUsedThisDungeon > base) {
      markTutorialStepCompleted(TUTORIAL_STEP_MANA_POTION);
      setActiveMasteryStep(null);
      potionBaselineRef.current = null;
      setTutorialPaused(false);
    }
  }, [activeMasteryStep, state.manaPotionsUsedThisDungeon, markTutorialStepCompleted, setTutorialPaused]);

  useEffect(() => {
    if (hasMasteryOpen || !state.introTutorialComplete || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_AOE)) return;
    if (!aoeSpellId) return;
    if (livingPartyBelowThreshold(state, 0.6) >= 3) {
      setActiveMasteryStep('aoe');
      setTutorialPaused(true);
    }
  }, [hasMasteryOpen, state, showRoster, completedSteps, aoeSpellId, setTutorialPaused]);

  useEffect(() => {
    if (activeMasteryStep !== 'aoe' || !aoeSpellId || !castSpellIdSignal) return;
    if (castSpellIdSignal.id === aoeSpellId) {
      markTutorialStepCompleted(TUTORIAL_STEP_AOE);
      setActiveMasteryStep(null);
      setTutorialPaused(false);
      clearCastSpellSignal();
    }
  }, [activeMasteryStep, aoeSpellId, castSpellIdSignal, markTutorialStepCompleted, setTutorialPaused, clearCastSpellSignal]);

  useEffect(() => {
    const prevCount = prevCompletedDungeonCountRef.current;
    prevCompletedDungeonCountRef.current = state.completedDungeonIds.length;
    if (hasMasteryOpen || !state.introTutorialComplete || showRoster || state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_REORDER)) return;
    if (menuView !== 'dungeons') return;
    if (prevCount < 2 && state.completedDungeonIds.length >= 2) {
      setActiveMasteryStep('reorder');
    }
  }, [hasMasteryOpen, state.introTutorialComplete, showRoster, state.currentDungeon, completedSteps, menuView, state.completedDungeonIds.length]);

  useEffect(() => {
    if (activeMasteryStep !== 'reorder') return;
    if (reorderSignal <= 0) return;
    markTutorialStepCompleted(TUTORIAL_STEP_REORDER);
    setActiveMasteryStep(null);
  }, [activeMasteryStep, reorderSignal, markTutorialStepCompleted]);

  const onTapCoreMana = useCallback(() => {
    if (coreStep !== 2) return;
    setCoreStep(3);
    setTutorialPaused(false);
  }, [coreStep, setTutorialPaused]);

  const onTapCoreDebuff = useCallback(() => {
    if (coreStep !== 4) return;
    setCoreStep(5);
    setTutorialPaused(false);
  }, [coreStep, setTutorialPaused]);

  const onTapMasteryPassive = useCallback(() => {
    if (activeMasteryStep !== 'passive') return;
    markTutorialStepCompleted(TUTORIAL_STEP_PASSIVE);
    setActiveMasteryStep(null);
    setTutorialPaused(false);
  }, [activeMasteryStep, markTutorialStepCompleted, setTutorialPaused]);

  const filledSlotIdForReorder = useMemo(() => {
    const i = state.activeActionBars.findIndex((id) => id !== '');
    return i >= 0 ? state.activeActionBars[i] : null;
  }, [state.activeActionBars]);

  const masteryOverlay: IntroTutorialOverlay | null = (() => {
    if (!state.introTutorialComplete || showRoster || !activeMasteryStep) return null;
    if (activeMasteryStep === 'passive') {
      const passiveTarget = passiveTrigger?.kind === 'buff' ? 'tutorial-passive-priest-echo' : `spell-${passiveTrigger?.key ?? 'flash_heal'}`;
      return {
        open: true,
        targetDataId: passiveTarget,
        message: passiveCopy,
        showTapCatcher: true,
        tone: 'benefit',
        resumeLabel: 'Resume',
      };
    }
    if (activeMasteryStep === 'potion') {
      return {
        open: true,
        targetDataId: 'spell-mana_potion',
        message: MASTERY.potion,
        showTapCatcher: false,
        tone: 'benefit',
      };
    }
    if (activeMasteryStep === 'aoe' && aoeSpellId) {
      return {
        open: true,
        targetDataId: `spell-${aoeSpellId}`,
        message: MASTERY.aoe,
        showTapCatcher: false,
        tone: 'threat',
      };
    }
    if (activeMasteryStep === 'reorder' && filledSlotIdForReorder) {
      return {
        open: true,
        targetDataId: `spell-${filledSlotIdForReorder}`,
        message: MASTERY.reorder,
        showTapCatcher: false,
        tone: 'benefit',
        ghostHand: { fromDataId: `spell-${filledSlotIdForReorder}`, toDataId: 'spell-mana_potion' },
      };
    }
    return null;
  })();

  if (masteryOverlay) {
    return {
      overlay: masteryOverlay,
      onTapContinue: activeMasteryStep === 'passive' ? onTapMasteryPassive : undefined,
      highlightTalentIdForTree: null,
    };
  }

  const coreOverlay: IntroTutorialOverlay = (() => {
    if (!coreEnabled || showRoster) {
      return { open: false, targetDataId: null, message: '', showTapCatcher: false, showResumeButton: false };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 0) {
      return {
        open: true,
        targetDataId: TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
        message: CORE.triage,
        showTapCatcher: false,
        tone: 'threat',
      };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 1 && state.playerClass) {
      return {
        open: true,
        targetDataId: `spell-${introTutorialPrimaryHealSpellId(state.playerClass)}`,
        message: CORE.cast,
        showTapCatcher: false,
        tone: 'benefit',
      };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 2) {
      return { open: true, targetDataId: 'mana-pool', message: CORE.manaTap, showTapCatcher: true, tone: 'benefit', resumeLabel: 'Resume combat' };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 4) {
      return {
        open: true,
        targetDataId: INTRO_TUTORIAL_DEBUFF_DATA_ID,
        message: CORE.debuffResume,
        showTapCatcher: false,
        showResumeButton: true,
        tone: 'threat',
        resumeLabel: 'Resume combat',
      };
    }
    if (coreStep === 6 && !state.currentDungeon) {
      if (menuView !== 'talents') {
        return { open: true, targetDataId: 'nav-talents', message: CORE.talentsNav, showTapCatcher: false, tone: 'benefit' };
      }
      if (firstPickableTalentId) {
        return { open: true, targetDataId: 'tutorial-first-talent', message: CORE.talentNode, showTapCatcher: false, tone: 'benefit' };
      }
    }
    return { open: false, targetDataId: null, message: '', showTapCatcher: false, showResumeButton: false };
  })();

  const coreTapContinue = coreStep === 2 ? onTapCoreMana : coreStep === 4 ? onTapCoreDebuff : undefined;

  return {
    overlay: coreOverlay,
    onTapContinue: coreTapContinue,
    highlightTalentIdForTree: coreStep === 6 && menuView === 'talents' ? firstPickableTalentId : null,
  };
}
