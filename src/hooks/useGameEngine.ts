import { useState, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameState, ClassType, Dungeon, DungeonPace } from '../types.ts';
import { TICK_RATE } from '../constants.ts';
import {
  readRoster,
  readTutorialCompletedSteps,
  writeRoster,
  writeTutorialCompletedSteps,
  mergeRosterWithCharacter,
  writeSuspendedRun,
  clearSuspendedRun,
  getSuspendedRun,
  type RosterV2,
} from '../gameStorage.ts';
import { hasBuff } from '../talentMechanics.ts';
import { gameReducer, emptyGameBase, getInitialState } from '../gameEngineReducer.ts';

export function useGameEngine() {
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

    // Track exact time when the interval (combat) starts/unpauses
    let lastTickTime = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickTime;
      let ticksToProcess = Math.floor(deltaMs / TICK_RATE);

      if (ticksToProcess > 0) {
        // Anti-freeze: Cap catch-up to 10 seconds (100 ticks) max if tabbed out
        if (ticksToProcess > 100) {
          ticksToProcess = 100;
          lastTickTime = now; // Drop the lost time gracefully
        } else {
          // Advance the clock exactly by the consumed ticks to keep fractional remainders
          lastTickTime += ticksToProcess * TICK_RATE;
        }

        dispatch({ type: 'TICK', random: Math.random, now, ticksToProcess });
      }
    }, TICK_RATE / 2); // Run the polling loop twice as fast (50ms) for smoother frame catching

    return () => clearInterval(interval);
  }, [state.isCombatActive, state.isTutorialPaused]);

  const setTutorialPaused = useCallback((value: boolean) => {
    dispatch({ type: 'SET_TUTORIAL_PAUSED', value });
  }, []);

  const completeIntroTutorial = useCallback(() => {
    dispatch({ type: 'COMPLETE_INTRO_TUTORIAL' });
  }, []);

  const markTutorialComplete = useCallback((stepId: string) => {
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
      greater_heal: hasBuff(state.playerCombatBuffs, 'surge_of_light'),
      regrowth: hasBuff(state.playerCombatBuffs, 'omen_clearcasting'),
      healing_touch: hasBuff(state.playerCombatBuffs, 'omen_clearcasting'),
    }),
    [state.playerCombatBuffs],
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
    markTutorialComplete,
  };
}
