import { useState, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameState, ClassType, Dungeon } from '../types.ts';
import { TICK_RATE } from '../constants.ts';
import {
  readRoster,
  writeRoster,
  mergeRosterWithCharacter,
  type RosterV2,
} from '../gameStorage.ts';
import { hasPlayerBuff } from '../talentMechanics.ts';
import { gameReducer, emptyGameBase, gameStateForClass } from '../gameEngineReducer.ts';

export function useGameEngine() {
  const [state, dispatch] = useReducer(gameReducer, undefined, emptyGameBase);
  const [roster, setRoster] = useState<RosterV2>(() => readRoster());
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
      dispatch({ type: 'SET', state: gameStateForClass(cls, r.byClass[cls]) });
    },
    [persistActiveSessionIfAny],
  );

  const startNewClass = useCallback(
    (cls: ClassType) => {
      persistActiveSessionIfAny();
      dispatch({ type: 'SET', state: gameStateForClass(cls, undefined) });
    },
    [persistActiveSessionIfAny],
  );

  const returnToRoster = useCallback(() => {
    persistActiveSessionIfAny();
    dispatch({ type: 'SET', state: emptyGameBase() });
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

  const startDungeon = useCallback(
    (dungeon: Dungeon) => {
      dispatch({ type: 'START_DUNGEON', dungeon });
    },
    [],
  );

  const unlockTalent = useCallback((talentId: string) => {
    dispatch({ type: 'UNLOCK_TALENT', talentId });
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
    if (!state.isCombatActive) return;
    const interval = setInterval(() => {
      dispatch({ type: 'TICK', random: Math.random, now: Date.now() });
    }, TICK_RATE);
    return () => clearInterval(interval);
  }, [state.isCombatActive]);

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

  const actionBarHighlights = useMemo(
    () => ({
      greater_heal: hasPlayerBuff(state.playerCombatBuffs, 'surge_of_light'),
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
    respecTalents,
    reorderActionBar,
    cooldowns: state.spellCooldowns,
    dungeonOutcome: state.dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
  };
}
