// hooks.ts - React integration
// Combines: hooks/combat/useCombatKeys.ts, hooks/state/useEngine.ts, hooks/useGhostBar.ts, hooks/useTutorial.ts

import { useState, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
export type { KeyboardCombatSnapshot } from './ui/useCombatControls';
export { useKeyboardCombatKeys } from './ui/useCombatControls';
import type { GameState, ClassType, Dungeon, DungeonPace, Unit } from './types';
import { TICK_RATE } from './constants';
import { readRoster, readTutorialCompletedSteps, writeRoster, writeTutorialCompletedSteps, mergeRosterWithCharacter, writeSuspendedRun, clearSuspendedRun, getSuspendedRun, type RosterV2 } from './persistence';
import { hasBuff } from './combat';
import { gameReducer, emptyGameBase, getInitialState } from './engine';
import { pickTutorialFirstTalentId } from './formulas';
import {
  evaluateCoreTutorialOverlay,
  evaluateMasteryTutorialOverlay,
  livingPartyBelowThreshold,
  tutorialPassiveCopy,
} from './systems/TutorialSystem';
export type { IntroTutorialOverlay } from './systems/TutorialSystem';
import {
  INTRO_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DUNGEON_ID,
  INTRO_SUCCESS_DUNGEON,
  TUTORIAL_STEP_AOE,
  TUTORIAL_STEP_MANA_POTION,
  TUTORIAL_STEP_PASSIVE,
  TUTORIAL_STEP_REORDER,
  TUTORIAL_STEP_NAV_PRIMER,
  introPrimaryHealId,
  totalSpentTalentPoints,
  tutorialAoeSpellId,
  tutorialPassiveTrigger,
} from './constants';

// ========= useEngine =========

export function useEngine() {
  const initialTutorialSteps = useRef<string[]>(readTutorialCompletedSteps()).current;
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => ({ ...emptyGameBase(), tutorialCompletedSteps: initialTutorialSteps }),
  );
  const [roster, setRoster] = useState<RosterV2>(() => readRoster());
  const tutorialStepsRef = useRef<string[]>(initialTutorialSteps);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  const persistActiveSessionIfAny = useCallback((): RosterV2 => {
    const s = stateRef.current;
    let r = rosterRef.current;
    if (!s.playerClass) return r;
    r = mergeRosterWithCharacter(r, s);
    rosterRef.current = r;
    writeRoster(r);
    setRoster(r);
    return r;
  }, []);

  const loadCharacter = useCallback(
    (cls: ClassType) => {
      const r = persistActiveSessionIfAny();
      const suspended = getSuspendedRun(cls);
      const next = suspended ?? getInitialState(cls, r.byClass[cls]);
      dispatch({
        type: 'SET',
        state: { ...next, tutorialCompletedSteps: tutorialStepsRef.current },
      });
    },
    [persistActiveSessionIfAny],
  );

  const startNewClass = useCallback(
    (cls: ClassType) => {
      persistActiveSessionIfAny();
      dispatch({
        type: 'SET',
        state: {
          ...getInitialState(cls, undefined),
          tutorialCompletedSteps: tutorialStepsRef.current,
        },
      });
    },
    [persistActiveSessionIfAny],
  );

  const returnToRoster = useCallback(() => {
    persistActiveSessionIfAny();
    dispatch({
      type: 'SET',
      state: { ...emptyGameBase(), tutorialCompletedSteps: tutorialStepsRef.current },
    });
  }, [persistActiveSessionIfAny]);

  const reorderActionBar = useCallback((from: number, to: number) => {
    dispatch({ type: 'REORDER_ACTION_BAR', from, to });
  }, []);

  const dismissDungeonOutcome = useCallback(() => {
    dispatch({ type: 'DISMISS_DUNGEON_OUTCOME' });
  }, []);

  const abandonDungeon = useCallback(() => {
    dispatch({ type: 'ABANDON_DUNGEON' });
  }, []);

  const startDungeon = useCallback((dungeon: Dungeon, pace: DungeonPace) => {
    dispatch({ type: 'START_DUNGEON', dungeon, pace, random: Math.random });
  }, []);

  const unlockTalent = useCallback((talentId: string) => {
    dispatch({ type: 'UNLOCK_TALENT', talentId });
  }, []);

  const decrementTalent = useCallback((talentId: string) => {
    dispatch({ type: 'DECREMENT_TALENT', talentId });
  }, []);

  const respecTalents = useCallback(() => {
    dispatch({ type: 'RESPEC_TALENTS' });
  }, []);

  const castSpell = useCallback((spellId: string, targetId: string) => {
    dispatch({
      type: 'CAST_SPELL',
      spellId,
      targetId,
      critRoll: Math.random() * 100,
    });
  }, []);

  const addXpNextLevel = useCallback(() => {
    dispatch({ type: 'ADD_XP_NEXT_LEVEL' });
  }, []);

  useEffect(() => {
    if (!state.isCombatActive || state.isTutorialPaused) return;

    let lastTickTime = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickTime;
      let ticksToProcess = Math.floor(deltaMs / TICK_RATE);

      if (ticksToProcess > 0) {
        if (ticksToProcess > 100) {
          ticksToProcess = 100;
          lastTickTime = now;
        } else {
          lastTickTime += ticksToProcess * TICK_RATE;
        }

        dispatch({ type: 'TICK', random: Math.random, now, ticksToProcess });
      }
    }, TICK_RATE / 2);

    return () => clearInterval(interval);
  }, [state.isCombatActive, state.isTutorialPaused]);

  const setTutorialPaused = useCallback((value: boolean) => {
    dispatch({ type: 'SET_TUTORIAL_PAUSED', value });
  }, []);

  const completeIntroTutorial = useCallback(() => {
    dispatch({ type: 'COMPLETE_INTRO_TUTORIAL' });
  }, []);

  const markTutorialStepCompleted = useCallback((stepId: string) => {
    dispatch({ type: 'MARK_TUTORIAL_STEP_COMPLETED', stepId });
  }, []);

  useEffect(() => {
    if (!state.playerClass) return;
    setRoster((r) => {
      const next = mergeRosterWithCharacter(r, state);
      rosterRef.current = next;
      writeRoster(next);
      return next;
    });
  }, [
    state.xp,
    state.level,
    state.talentPoints,
    state.talents,
    state.playerClass,
    state.completedDungeonIds,
    state.activeActionBars,
  ]);

  useEffect(() => {
    if (!state.playerClass) return;
    if (state.isCombatActive && state.currentDungeon && state.combatPhase === 'BOSS') {
      writeSuspendedRun(state);
      return;
    }
    clearSuspendedRun();
  }, [state]);

  useEffect(() => {
    tutorialStepsRef.current = state.tutorialCompletedSteps;
    writeTutorialCompletedSteps(state.tutorialCompletedSteps);
  }, [state.tutorialCompletedSteps]);

  const actionBarHighlights = useMemo(
    () => ({
      greater_heal: hasBuff(state.playerEffects, 'surge_of_light'),
      regrowth: hasBuff(state.playerEffects, 'omen_clearcasting'),
      healing_touch: hasBuff(state.playerEffects, 'omen_clearcasting'),
    }),
    [state.playerEffects],
  );

  return {
    state,
    roster,
    loadCharacter,
    startNewClass,
    returnToRoster,
    startDungeon,
    abandonDungeon,
    castSpell,
    addXpNextLevel,
    unlockTalent,
    decrementTalent,
    respecTalents,
    reorderActionBar,
    cooldowns: state.spellCooldowns,
    dungeonOutcome: state.dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
    setTutorialPaused,
    completeIntroTutorial,
    markTutorialStepCompleted,
  };
}

// ========= useGhostBar =========

export function useGhostBarPercent(percent: number) {
  const prevRef = useRef(percent);
  const [ghostPercent, setGhostPercent] = useState(percent);
  const [ghostEaseDuration, setGhostEaseDuration] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = percent;
    if (percent >= prev - 0.02) {
      setGhostEaseDuration(0);
      setGhostPercent(percent);
      return;
    }
    setGhostEaseDuration(0);
    setGhostPercent(prev);
    const id = window.setTimeout(() => {
      setGhostEaseDuration(0.4);
      setGhostPercent(percent);
    }, 200);
    return () => window.clearTimeout(id);
  }, [percent]);

  return { ghostPercent, ghostEaseDuration };
}

// ========= useIntroTutorial =========

type MenuView = 'dungeons' | 'talents' | 'character';

type UseIntroTutorialArgs = {
  state: GameState;
  actionBarHighlights: Record<string, boolean>;
  targetId: string | null;
  menuView: MenuView;
  showRoster: boolean;
  castSpellIdSignal: { id: string; nonce: number } | null;
  clearCastTutorialSignal: () => void;
  setTutorialPaused: (v: boolean) => void;
  completeIntroTutorial: () => void;
  markTutorialStepCompleted: (stepId: string) => void;
  reorderSignal: number;
};

export function useIntroTutorial({
  state,
  actionBarHighlights,
  targetId,
  menuView,
  showRoster,
  castSpellIdSignal,
  clearCastTutorialSignal,
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
    !state.introComplete &&
    !state.tutorialCompletedSteps.includes('intro_core') &&
    !showRoster;
  const coreEnabled = coreEnabledBase && (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID || coreStep === 6);
  const firstPickableTalentId = pickTutorialFirstTalentId(state.talents, state.talentPoints, state.level);
  const completedSteps = state.tutorialCompletedSteps;
  const hasMasteryOpen = activeMasteryStep !== null;
  const aoeSpellId = state.playerClass ? tutorialAoeSpellId(state.playerClass) : null;
  const passiveTrigger = state.playerClass ? tutorialPassiveTrigger(state.playerClass) : null;
  const passiveCopy = tutorialPassiveCopy(state.playerClass);

  useEffect(() => {
    const inDeadmines = state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID;
    if (inDeadmines && !prevHadDungeonRef.current && !state.introComplete) {
      setCoreStep(0);
    }
    prevHadDungeonRef.current = !!state.currentDungeon;
  }, [state.currentDungeon, state.introComplete]);

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
    if (castSpellIdSignal.id === introPrimaryHealId(state.playerClass)) {
      setCoreStep(2);
      clearCastTutorialSignal();
    }
  }, [coreEnabledBase, coreStep, castSpellIdSignal, clearCastTutorialSignal, state.currentDungeon?.id, state.playerClass]);

  useEffect(() => {
    if (!coreEnabledBase) return;
    if (coreStep !== 3) return;
    if (state.currentDungeon?.id !== INTRO_TUTORIAL_DUNGEON_ID) return;
    const hit = state.party.some((unit) => unit.effects.some((effect) => effect.category === 'harmful' && effect.sourceId === INTRO_DEBUFF_ABILITY));
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
    if (prev?.kind === 'success' && prev.dungeonName === INTRO_SUCCESS_DUNGEON && state.dungeonOutcome === null) {
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
    if (hasMasteryOpen || !state.introComplete || !state.playerClass || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_PASSIVE)) return;
    if (!passiveTrigger) return;
    if (passiveTrigger.kind === 'buff') {
      const seen = state.party.some((unit) => unit.effects.some((effect) => effect.category === 'helpful' && effect.sourceId === passiveTrigger.key));
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
  }, [hasMasteryOpen, state.introComplete, state.playerClass, showRoster, state.currentDungeon, completedSteps, passiveTrigger, state.party, actionBarHighlights, setTutorialPaused]);

  useEffect(() => {
    if (hasMasteryOpen || !state.introComplete || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_MANA_POTION)) return;
    if (state.combatPhase !== 'BOSS') return;
    if (state.mana / Math.max(1, state.maxMana) >= 0.25) return;
    potionBaselineRef.current = state.potionsUsed;
    setActiveMasteryStep('potion');
    setTutorialPaused(true);
  }, [hasMasteryOpen, state.introComplete, showRoster, state.currentDungeon, completedSteps, state.combatPhase, state.mana, state.maxMana, state.potionsUsed, setTutorialPaused]);

  useEffect(() => {
    if (activeMasteryStep !== 'potion') return;
    const base = potionBaselineRef.current ?? state.potionsUsed;
    if (state.potionsUsed > base) {
      markTutorialStepCompleted(TUTORIAL_STEP_MANA_POTION);
      setActiveMasteryStep(null);
      potionBaselineRef.current = null;
      setTutorialPaused(false);
    }
  }, [activeMasteryStep, state.potionsUsed, markTutorialStepCompleted, setTutorialPaused]);

  useEffect(() => {
    if (hasMasteryOpen || !state.introComplete || showRoster || !state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_AOE)) return;
    if (!aoeSpellId) return;
    if (!state.activeActionBars.includes(aoeSpellId)) return;
    if (livingPartyBelowThreshold(state, 0.6) >= 3) {
      setActiveMasteryStep('aoe');
      setTutorialPaused(true);
    }
  }, [hasMasteryOpen, state.introComplete, showRoster, state.currentDungeon, completedSteps, aoeSpellId, state.activeActionBars, state, setTutorialPaused]);

  useEffect(() => {
    if (activeMasteryStep !== 'aoe' || !aoeSpellId || !castSpellIdSignal) return;
    if (castSpellIdSignal.id === aoeSpellId) {
      markTutorialStepCompleted(TUTORIAL_STEP_AOE);
      setActiveMasteryStep(null);
      setTutorialPaused(false);
      clearCastTutorialSignal();
    }
  }, [activeMasteryStep, aoeSpellId, castSpellIdSignal, markTutorialStepCompleted, setTutorialPaused, clearCastTutorialSignal]);

  useEffect(() => {
    const prevCount = prevCompletedDungeonCountRef.current;
    prevCompletedDungeonCountRef.current = state.completedDungeonIds.length;
    if (hasMasteryOpen || !state.introComplete || showRoster || state.currentDungeon) return;
    if (completedSteps.includes(TUTORIAL_STEP_REORDER)) return;
    if (menuView !== 'dungeons') return;
    if (prevCount < 2 && state.completedDungeonIds.length >= 2) {
      setActiveMasteryStep('reorder');
    }
  }, [hasMasteryOpen, state.introComplete, showRoster, state.currentDungeon, completedSteps, menuView, state.completedDungeonIds.length]);

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

  const masteryOverlay = evaluateMasteryTutorialOverlay({
    activeMasteryStep,
    showRoster,
    state,
    passiveTrigger,
    passiveCopy,
    aoeSpellId,
    filledSlotIdForReorder,
  });

  if (masteryOverlay) {
    return {
      overlay: masteryOverlay,
      onTapContinue: activeMasteryStep === 'passive' ? onTapMasteryPassive : undefined,
      highlightTalentIdForTree: null,
    };
  }

  const coreOverlay = evaluateCoreTutorialOverlay({
    coreEnabled,
    showRoster,
    coreStep,
    state,
    menuView,
    firstPickableTalentId,
  });

  const coreTapContinue = coreStep === 2 ? onTapCoreMana : coreStep === 4 ? onTapCoreDebuff : undefined;

  return {
    overlay: coreOverlay,
    onTapContinue: coreTapContinue,
    highlightTalentIdForTree: coreStep === 6 && menuView === 'talents' ? firstPickableTalentId : null,
  };
}