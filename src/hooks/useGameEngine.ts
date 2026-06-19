import { useState, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameState, ClassType, Dungeon, DungeonPace } from '../types.ts';
import { SUSPEND_SNAPSHOT_TICK_INTERVAL, TICK_RATE } from '../constants.ts';
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
  const prevDungeonOutcomeRef = useRef<GameState['dungeonOutcome']>(null);
  const prevIntroTutorialCompleteRef = useRef(false);
  const suspendSnapshotTickRef = useRef<number | null>(null);
  const suspendHpBracketRef = useRef<number | null>(null);

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

  const syncPersistGuardsAfterSet = useCallback((next: GameState) => {
    prevDungeonOutcomeRef.current = next.dungeonOutcome;
    prevIntroTutorialCompleteRef.current = next.introTutorialComplete;
  }, []);

  const loadCharacter = useCallback(
    (cls: ClassType) => {
      const r = persistActiveSessionIfAny();
      const suspended = getSuspendedRun(cls);
      suspendSnapshotTickRef.current = null;
      const next = {
        ...(suspended ?? getInitialState(cls, r.byClass[cls])),
        tutorialCompletedSteps: tutorialStepsRef.current,
      };
      syncPersistGuardsAfterSet(next);
      dispatch({ type: 'SET', state: next });
    },
    [persistActiveSessionIfAny, syncPersistGuardsAfterSet],
  );

  const startNewClass = useCallback(
    (cls: ClassType) => {
      persistActiveSessionIfAny();
      const next = {
        ...getInitialState(cls, undefined),
        tutorialCompletedSteps: tutorialStepsRef.current,
      };
      syncPersistGuardsAfterSet(next);
      dispatch({ type: 'SET', state: next });
    },
    [persistActiveSessionIfAny, syncPersistGuardsAfterSet],
  );

  const returnToRoster = useCallback(() => {
    persistActiveSessionIfAny();
    const next = { ...emptyGameBase(), tutorialCompletedSteps: tutorialStepsRef.current };
    syncPersistGuardsAfterSet(next);
    dispatch({ type: 'SET', state: next });
  }, [persistActiveSessionIfAny, syncPersistGuardsAfterSet]);

  const reorderActionBar = useCallback((from: number, to: number) => {
    dispatch({ type: 'REORDER_ACTION_BAR', from, to });
  }, []);

  const dismissDungeonOutcome = useCallback(() => {
    dispatch({ type: 'DISMISS_DUNGEON_OUTCOME' });
  }, []);

  const abandonDungeon = useCallback(() => {
    persistActiveSessionIfAny();
    suspendSnapshotTickRef.current = null;
    clearSuspendedRun();
    dispatch({ type: 'ABANDON_DUNGEON' });
  }, [persistActiveSessionIfAny]);

  const startDungeon = useCallback(
    (dungeon: Dungeon, pace: DungeonPace) => {
      persistActiveSessionIfAny();
      dispatch({ type: 'START_DUNGEON', dungeon, pace, random: Math.random });
    },
    [persistActiveSessionIfAny],
  );

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
    const prev = prevDungeonOutcomeRef.current;
    prevDungeonOutcomeRef.current = state.dungeonOutcome;
    if (state.dungeonOutcome !== null && prev === null) {
      persistActiveSessionIfAny();
      clearSuspendedRun();
    }
  }, [state.dungeonOutcome, state.playerClass, persistActiveSessionIfAny]);

  useEffect(() => {
    if (!state.playerClass) return;
    const prevIntro = prevIntroTutorialCompleteRef.current;
    prevIntroTutorialCompleteRef.current = state.introTutorialComplete;
    if (state.introTutorialComplete && prevIntro !== true) {
      persistActiveSessionIfAny();
    }
  }, [state.introTutorialComplete, state.playerClass, persistActiveSessionIfAny]);

  useEffect(() => {
    if (!state.playerClass) return;
    if (!state.isCombatActive || state.currentDungeon === null || state.combatPhase !== 'BOSS') {
      suspendSnapshotTickRef.current = null;
      suspendHpBracketRef.current = null;
      clearSuspendedRun();
      return;
    }
    const tick = state.combatElapsedTicks;
    const maxHp = state.enemyMaxHealth;
    const hpFrac = maxHp > 0 ? state.enemyHealth / maxHp : 1;
    const bracket =
      Number.isFinite(hpFrac) && hpFrac >= 0
        ? Math.min(3, Math.max(0, Math.floor((1 - hpFrac) * 4)))
        : 0;
    const prevTick = suspendSnapshotTickRef.current;
    const prevBracket = suspendHpBracketRef.current;
    const intervalElapsed = prevTick === null || tick - prevTick >= SUSPEND_SNAPSHOT_TICK_INTERVAL;
    const bracketChanged = prevBracket === null || bracket !== prevBracket;
    if (!intervalElapsed && !bracketChanged) return;
    writeSuspendedRun(state);
    suspendSnapshotTickRef.current = tick;
    suspendHpBracketRef.current = bracket;
  }, [state]);

  useEffect(() => {
    if (!state.playerClass || state.currentDungeon) return;
    setRoster((r) => {
      const next = mergeRosterWithCharacter(r, state);
      rosterRef.current = next;
      writeRoster(next);
      return next;
    });
  }, [
    state.currentDungeon,
    state.playerClass,
    state.xp,
    state.level,
    state.talentPoints,
    state.talents,
    state.completedDungeonIds,
    state.activeActionBars,
    state.introTutorialComplete,
  ]);

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

  const persistRosterNow = useCallback(() => {
    persistActiveSessionIfAny();
  }, [persistActiveSessionIfAny]);

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
    persistRosterNow,
  };
}
