import type { ClassType, GameAction, GameState, RosterV2 } from '../systems/Types';
import { advanceTick } from './CombatEngine';
import { ClassRegistry } from '../systems/ClassRegistry';
import {
  generateRandomParty,
  getCombatProfile,
  getTrashMaxHealth,
  TRASH_PACK_COUNT,
} from './CombatMechanics';
import { patchFromSavedShape, getMeta } from './Persistence';

function randomIntInclusive(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function tickSpellCooldowns(state: GameState): GameState {
  const prev = state.spellCooldowns;
  if (Object.keys(prev).length === 0) return state;
  let touched = false;
  const next: Record<string, number> = {};
  for (const k of Object.keys(prev)) {
    const v = prev[k];
    if (v > 1) {
      next[k] = v - 1;
      touched = true;
    } else if (v === 1 || v <= 0) {
      touched = true;
    }
  }
  if (!touched) return state;
  return { ...state, spellCooldowns: next };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'TICK': {
      let nextState = state;
      const ticks = action.ticksToProcess ?? 1;

      for (let i = 0; i < ticks; i++) {
        if (nextState.isTutorialPaused) {
          nextState = tickSpellCooldowns(nextState);
        } else {
          nextState = tickSpellCooldowns(
            advanceTick(nextState, action.random, action.now, action.dpsMultiplier),
          );
        }
        if (!nextState.isCombatActive) break;
      }
      return nextState;
    }
    case 'SET': {
      return { ...action.state };
    }
    case 'REORDER_ACTION_BAR': {
      const next = [...state.activeActionBars];
      const [moved] = next.splice(action.from, 1);
      next.splice(action.to, 0, moved);
      return { ...state, activeActionBars: next };
    }
    case 'DISMISS_DUNGEON_OUTCOME': {
      return { ...state, dungeonOutcome: null };
    }
    case 'ABANDON_DUNGEON': {
      return {
        ...state,
        isCombatActive: false,
        currentDungeon: null,
        dungeonPace: null,
        playerEffects: [],
        bossEffects: [],
        mechanicCooldown: 0,
        mechanicOrdinal: 0,
        spellCooldowns: {},
        combatElapsedTicks: 0,
        combatFloats: [],
        endlessStacks: 0,
      };
    }
    case 'START_DUNGEON': {
      const dungeon = action.dungeon;
      const pace = action.pace;
      const random = action.random || Math.random;
      const profile = getCombatProfile(dungeon);
      const mechCd = randomIntInclusive(
        profile.mechanicIntervalTicksMin,
        profile.mechanicIntervalTicksMax,
        random,
      );
      const party = generateRandomParty(state.level, state.playerClass);
      return {
        ...state,
        isCombatActive: true,
        currentDungeon: dungeon,
        dungeonPace: pace,
        combatPhase: 'TRASH',
        trashPulls: TRASH_PACK_COUNT,
        enemyHealth: getTrashMaxHealth(dungeon),
        enemyMaxHealth: getTrashMaxHealth(dungeon),
        party,
        bossEffects: [],
        mechanicCooldown: mechCd,
        mechanicOrdinal: 0,
        combatElapsedTicks: 0,
        combatFloats: [],
        dungeonProgress: 0,
        runHealEff: 0,
        runHealOh: 0,
        runManaSpent: 0,
      };
    }
    case 'UNLOCK_TALENT': {
      const talentId = action.talentId;
      const points = state.talents.map((t) => {
        if (t.id !== talentId) return t;
        const newPoints = Math.min(t.maxPoints, t.points + 1);
        return { ...t, points: newPoints };
      });
      return { ...state, talents: points };
    }
    case 'DECREMENT_TALENT': {
      const talentId = action.talentId;
      const points = state.talents.map((t) => {
        if (t.id !== talentId) return t;
        const newPoints = Math.max(0, t.points - 1);
        return { ...t, points: newPoints };
      });
      return { ...state, talents: points };
    }
    case 'RESPEC_TALENTS': {
      const points = state.talents.map((t) => ({ ...t, points: 0 }));
      return { ...state, talents: points, talentPoints: state.level };
    }
    case 'CAST_SPELL': {
      return state;
    }
    case 'ADD_XP_NEXT_LEVEL': {
      const newXp = state.xp + 100;
      const meta = getMeta(newXp, state.playerClass, state.talents);
      return {
        ...state,
        xp: newXp,
        level: meta.level,
        talentPoints: meta.talentPoints,
        maxMana: meta.maxMana,
        mana: Math.min(meta.maxMana, state.mana),
      };
    }
    case 'SET_TUTORIAL_PAUSED': {
      return { ...state, isTutorialPaused: action.value };
    }
    case 'COMPLETE_INTRO_TUTORIAL': {
      return { ...state, introComplete: true };
    }
    case 'MARK_TUTORIAL_STEP_COMPLETED': {
      return {
        ...state,
        tutorialCompletedSteps: [...state.tutorialCompletedSteps, action.stepId],
      };
    }
    default:
      return state;
  }
}

export function emptyGameBase(): GameState {
  const party = generateRandomParty(1, null);
  return {
    playerClass: null,
    party,
    mana: 100,
    maxMana: 100,
    potionsUsed: 0,
    xp: 0,
    level: 1,
    talentPoints: 1,
    talents: [],
    unlockedSpells: [],
    activeActionBars: [],
    currentDungeon: null,
    dungeonPace: null,
    dungeonProgress: 0,
    combatPhase: 'TRASH',
    trashPulls: TRASH_PACK_COUNT,
    enemyHealth: 100,
    enemyMaxHealth: 100,
    bossEffects: [],
    isCombatActive: false,
    completedDungeonIds: [],
    playerEffects: [],
    internalCooldowns: {},
    capstoneForm: null,
    holyPower: 0,
    beaconTargetId: '1',
    mechanicCooldown: 0,
    mechanicOrdinal: 0,
    dungeonOutcome: null,
    spellCooldowns: {},
    combatElapsedTicks: 0,
    combatFloats: [],
    endlessStacks: 0,
    runHealEff: 0,
    runHealOh: 0,
    runManaSpent: 0,
    isTutorialPaused: false,
    introComplete: false,
    tutorialCompletedSteps: [],
    diagnostics: null,
  };
}

export function getInitialState(cls: ClassType, saved: RosterV2['byClass'][ClassType]): GameState {
  const base = emptyGameBase();
  if (!saved) {
    const talents = ClassRegistry.getTalents(cls);
    const meta = getMeta(0, cls, talents);
    return {
      ...base,
      ...meta,
      playerClass: cls,
      completedDungeonIds: [],
      party: generateRandomParty(meta.level, cls),
      playerEffects: [],
      internalCooldowns: {},
      capstoneForm: null,
      holyPower: 0,
      beaconTargetId: '1',
      dungeonOutcome: null,
      isTutorialPaused: false,
      introComplete: false,
      tutorialCompletedSteps: [],
    };
  }
  const patched = patchFromSavedShape(saved);
  if (!patched) return base;
  return {
    ...base,
    ...patched,
    playerClass: cls,
  };
}

export * from './Persistence';
