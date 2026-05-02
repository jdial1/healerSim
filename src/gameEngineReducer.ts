import { GameState, ClassType, Dungeon, DungeonPace } from './types.ts';
import {
  TICK_RATE,
  TRASH_PACK_COUNT,
  SPELLS,
  generateRandomParty,
  getTrashMaxHealth,
} from './constants.ts';
import { buildEndlessWaveDungeon, endlessBossPool, getEndlessTemplate } from './dungeons/index.ts';
import { INTRO_TUTORIAL_DUNGEON_ID } from './tutorialConfig.ts';
import { getTalents } from './talents/index.ts';
import {
  patchFromSavedShape,
  getMeta,
  reconcileActionBarOrder,
  xpProgressWithinLevel,
  levelUpRewardSummary,
  type RosterV2,
} from './gameStorage.ts';
import {
  arePrereqsSatisfied,
  getPrerequisiteIds,
  CLASS_PROGRESSION,
  CAPSTONE_PLAYER_BUFF_IDS,
} from './playerStats.ts';
import { exclusiveUnlock, addBuff, removeBuff } from './talentMechanics.ts';
import { getAuraTicks } from './auraConfig.ts';
import { advanceCombatTick, type TickRandom } from './gameTick.ts';
import { tryCast, type CastRuntime } from './spellCastPipeline.ts';

export type GameAction =
  | { type: 'TICK'; random: TickRandom; now: number; dpsMultiplier?: number; ticksToProcess?: number }
  | { type: 'SET'; state: GameState }
  | { type: 'REORDER_ACTION_BAR'; from: number; to: number }
  | { type: 'DISMISS_DUNGEON_OUTCOME' }
  | { type: 'ABANDON_DUNGEON' }
  | { type: 'START_DUNGEON'; dungeon: Dungeon; pace: DungeonPace; random?: () => number }
  | { type: 'UNLOCK_TALENT'; talentId: string }
  | { type: 'DECREMENT_TALENT'; talentId: string }
  | { type: 'RESPEC_TALENTS' }
  | { type: 'CAST_SPELL'; spellId: string; targetId: string; critRoll: number }
  | { type: 'ADD_XP_NEXT_LEVEL' }
  | { type: 'SET_TUTORIAL_PAUSED'; value: boolean }
  | { type: 'COMPLETE_INTRO_TUTORIAL' }
  | { type: 'MARK_TUTORIAL_STEP_COMPLETED'; stepId: string };

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
            advanceCombatTick(nextState, action.random, action.now, action.dpsMultiplier)
          );
        }
        // Stop processing extra catch-up ticks if combat finishes during the loop
        if (!nextState.isCombatActive) break;
      }
      return nextState;
    }
    case 'SET_TUTORIAL_PAUSED':
      return { ...state, isTutorialPaused: action.value };
    case 'COMPLETE_INTRO_TUTORIAL':
      return { ...state, introTutorialComplete: true, isTutorialPaused: false };
    case 'MARK_TUTORIAL_STEP_COMPLETED': {
      if (state.tutorialCompletedSteps.includes(action.stepId)) return state;
      return {
        ...state,
        tutorialCompletedSteps: [...state.tutorialCompletedSteps, action.stepId],
      };
    }
    case 'SET':
      return action.state;
    case 'REORDER_ACTION_BAR': {
      if (state.currentDungeon) return state;
      const { from, to } = action;
      const bar = state.activeActionBars;
      if (from === to || from < 0 || to < 0 || from >= bar.length || to >= bar.length) return state;
      const next = [...bar];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...state, activeActionBars: next };
    }
    case 'DISMISS_DUNGEON_OUTCOME':
      return { ...state, dungeonOutcome: null };
    case 'ABANDON_DUNGEON':
      return {
        ...state,
        currentDungeon: null,
        isCombatActive: false,
        isTutorialPaused: false,
        dungeonProgress: 0,
        manaPotionsUsedThisDungeon: 0,
        bossSelfBuffs: [],
        playerCombatBuffs: [],
        internalCooldowns: {},
        capstoneForm: null,
        holyPower: 0,
        dungeonOutcome: null,
        mechanicCooldown: 0,
        mechanicOrdinal: 0,
        spellCooldowns: {},
        dungeonPace: null,
        combatElapsedTicks: 0,
        floatingCombatTexts: [],
        endlessStacks: 0,
        dungeonRunHealEffective: 0,
        dungeonRunHealOverheal: 0,
        dungeonRunManaSpentHealing: 0,
        diagnostics: null,
      };
    case 'START_DUNGEON': {
      if (action.dungeon.endless && state.level < action.dungeon.levelMin) return state;
      const pace = action.pace;
      const rnd = action.random ?? (() => Math.random());
      let dungeon = action.dungeon;
      let endlessStacks = 0;
      if (dungeon.endless) {
        const template = getEndlessTemplate();
        const pool = endlessBossPool(state.level);
        const source = pool[Math.floor(rnd() * pool.length)];
        dungeon = buildEndlessWaveDungeon(template, source, 0);
        endlessStacks = 0;
      }
      const trashHp = getTrashMaxHealth(dungeon);
      const introTutorialRun =
        dungeon.id === INTRO_TUTORIAL_DUNGEON_ID &&
        !state.introTutorialComplete &&
        !state.tutorialCompletedSteps.includes('intro_core') &&
        !!state.playerClass;
      let party = generateRandomParty(state.level, state.playerClass);
      let isTutorialPaused = false;
      if (introTutorialRun) {
        isTutorialPaused = true;
        party = party.map((u) =>
          u.id === '1'
            ? { ...u, health: Math.max(1, Math.floor(u.maxHealth * 0.34)) }
            : u,
        );
      }
      const now = Date.now();
      return {
        ...state,
        currentDungeon: dungeon,
        dungeonPace: pace,
        dungeonProgress: 0,
        combatPhase: 'TRASH',
        trashPullsRemaining: TRASH_PACK_COUNT,
        enemyHealth: trashHp,
        enemyMaxHealth: trashHp,
        isCombatActive: true,
        isTutorialPaused,
        party,
        mana: state.maxMana,
        manaPotionsUsedThisDungeon: 0,
        bossSelfBuffs: [],
        playerCombatBuffs: [],
        internalCooldowns: {},
        capstoneForm: null,
        holyPower: 0,
        dungeonOutcome: null,
        mechanicCooldown: 0,
        mechanicOrdinal: 0,
        spellCooldowns: {},
        combatElapsedTicks: 0,
        floatingCombatTexts: [],
        endlessStacks,
        dungeonRunHealEffective: 0,
        dungeonRunHealOverheal: 0,
        dungeonRunManaSpentHealing: 0,
        diagnostics: {
          runStartTimeMs: now,
          lastPhaseStartTimeMs: now,
          lastPhaseStartTick: 0,
          events: [],
        },
      };
    }
    case 'UNLOCK_TALENT':
      return reduceUnlockTalent(state, action.talentId);
    case 'DECREMENT_TALENT':
      return reduceDecrementTalent(state, action.talentId);
    case 'RESPEC_TALENTS':
      return reduceRespecTalents(state);
    case 'CAST_SPELL':
      return reduceCastSpell(state, action.spellId, action.targetId, action.critRoll);
    case 'ADD_XP_NEXT_LEVEL': {
      if (!state.playerClass) return state;
      const { into, needed } = xpProgressWithinLevel(state.xp);
      const delta = Math.max(0, needed - into) + 1;
      const newXp = state.xp + delta;
      const meta = getMeta(newXp, state.playerClass, state.talents);
      const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
      const party =
        meta.level > state.level
          ? generateRandomParty(meta.level, state.playerClass)
          : state.party;
      const leveled = meta.level > state.level;
      const rewards = leveled
        ? levelUpRewardSummary(state.playerClass, state.talents, state.level, meta.level)
        : { upgradedSpellIds: [] as string[], upgradedPotion: false };
      return {
        ...state,
        ...meta,
        activeActionBars,
        mana: Math.min(meta.maxMana, state.mana),
        party,
        dungeonOutcome: leveled
          ? {
              kind: 'success',
              successFlavor: 'level_up',
              dungeonName: `Level ${meta.level}`,
              bossName: '',
              xpGained: delta,
              levelUp: true,
              levelAfter: meta.level,
              playerClass: state.playerClass,
              upgradedSpellIds: rewards.upgradedSpellIds,
              upgradedPotion: rewards.upgradedPotion,
            }
          : state.dungeonOutcome,
      };
    }
    default:
      return state;
  }
}

function reduceUnlockTalent(state: GameState, talentId: string): GameState {
  const talent = state.talents.find((t) => t.id === talentId);
  if (!talent) return state;
  const hasPrereqs = arePrereqsSatisfied(state.talents, talent);
  if (
    !hasPrereqs ||
    talent.points >= talent.maxPoints ||
    state.talentPoints < talent.cost ||
    state.level < talent.levelReq
  ) {
    return state;
  }
  const newTalents = exclusiveUnlock(state.talents, talentId);
  const meta = getMeta(state.xp, state.playerClass, newTalents);
  const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
  let next: GameState = { ...state, ...meta, activeActionBars, mana: Math.min(meta.maxMana, state.mana) };
  if (state.playerClass) {
    const capProg = CLASS_PROGRESSION[state.playerClass];
    if (
      talent.mechanicId === capProg.capstoneMechanicId &&
      newTalents.find((t) => t.id === talentId)!.points > 0
    ) {
      next = {
        ...next,
        capstoneForm: capProg.capstoneForm,
        playerCombatBuffs: addBuff(
          next.playerCombatBuffs,
          capProg.capstonePlayerBuffId,
          getAuraTicks(capProg.capstonePlayerBuffId),
          1,
        ),
      };
    }
  }
  return next;
}

function reduceRespecTalents(state: GameState): GameState {
  if (!state.playerClass || state.talents.length === 0) return state;
  const cleared = state.talents.map((t) => ({ ...t, points: 0 }));
  const meta = getMeta(state.xp, state.playerClass, cleared);
  const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
  let pbuffs = state.playerCombatBuffs;
  for (const id of CAPSTONE_PLAYER_BUFF_IDS) {
    pbuffs = removeBuff(pbuffs, id);
  }
  return {
    ...state,
    ...meta,
    activeActionBars,
    mana: Math.min(meta.maxMana, state.mana),
    capstoneForm: null,
    playerCombatBuffs: pbuffs,
  };
}

function reduceDecrementTalent(state: GameState, talentId: string): GameState {
  const talent = state.talents.find((t) => t.id === talentId);
  if (!talent || talent.points <= 0) return state;
  const blockedByDependent = state.talents.some(
    (candidate) =>
      candidate.points > 0 &&
      candidate.id !== talentId &&
      getPrerequisiteIds(state.talents, candidate).includes(talentId),
  );
  if (blockedByDependent) return state;

  const newTalents = state.talents.map((t) =>
    t.id === talentId ? { ...t, points: Math.max(0, t.points - 1) } : t,
  );
  const meta = getMeta(state.xp, state.playerClass, newTalents);
  const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
  let next: GameState = {
    ...state,
    ...meta,
    activeActionBars,
    mana: Math.min(meta.maxMana, state.mana),
  };
  if (state.playerClass) {
    const capProg = CLASS_PROGRESSION[state.playerClass];
    const capstonePoints = newTalents.find((t) => t.mechanicId === capProg.capstoneMechanicId)?.points ?? 0;
    if (capstonePoints <= 0) {
      next = {
        ...next,
        capstoneForm: null,
        playerCombatBuffs: removeBuff(next.playerCombatBuffs, capProg.capstonePlayerBuffId),
      };
    }
  }
  return next;
}

function reduceCastSpell(
  state: GameState,
  spellId: string,
  targetId: string,
  critRoll: number,
): GameState {
  const spell = SPELLS[spellId];
  if (!spell) return state;
  const cdRem = state.spellCooldowns[spellId] ?? 0;
  const nextCooldowns = { ...state.spellCooldowns };
  const rt: CastRuntime = {
    scheduleCooldown: ({
      spellId: sid,
      rawCooldownTicks,
      hastePct,
      powerInfusionStacks,
    }) => {
      const nextPi = powerInfusionStacks > 0 ? powerInfusionStacks - 1 : 0;
      const cdR = Math.round(
        rawCooldownTicks * (1 - hastePct / 100) * (powerInfusionStacks > 0 ? 0.5 : 1),
      );
      if (cdR > 0) nextCooldowns[sid] = cdR;
      return nextPi;
    },
  };
  const next = tryCast(state, { spell, spellId, targetId, critRoll }, cdRem, rt);
  if (next === state) return state;
  return { ...next, spellCooldowns: nextCooldowns };
}

export function emptyGameBase(): GameState {
  const party = generateRandomParty(1, null);
  return {
    playerClass: null,
    party,
    mana: 100,
    maxMana: 100,
    manaPotionsUsedThisDungeon: 0,
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
    trashPullsRemaining: TRASH_PACK_COUNT,
    enemyHealth: 100,
    enemyMaxHealth: 100,
    bossSelfBuffs: [],
    isCombatActive: false,
    completedDungeonIds: [],
    playerCombatBuffs: [],
    internalCooldowns: {},
    capstoneForm: null,
    holyPower: 0,
    beaconTargetId: '1',
    mechanicCooldown: 0,
    mechanicOrdinal: 0,
    dungeonOutcome: null,
    spellCooldowns: {},
    combatElapsedTicks: 0,
    floatingCombatTexts: [],
    endlessStacks: 0,
    dungeonRunHealEffective: 0,
    dungeonRunHealOverheal: 0,
    dungeonRunManaSpentHealing: 0,
    isTutorialPaused: false,
    introTutorialComplete: false,
    tutorialCompletedSteps: [],
    diagnostics: null,
  };
}

function applyProgressPatchToBase(base: GameState, patch: Partial<GameState>): GameState {
  if (!patch.playerClass) return base;
  const party = generateRandomParty(patch.level ?? 1, patch.playerClass);
  const cap = patch.maxMana ?? base.maxMana;
  return {
    ...base,
    ...patch,
    talents: patch.talents ?? base.talents,
    party,
    mana: Math.min(cap, patch.mana ?? cap),
    completedDungeonIds: patch.completedDungeonIds ?? [],
    playerCombatBuffs: patch.playerCombatBuffs ?? [],
    internalCooldowns: patch.internalCooldowns ?? {},
    capstoneForm: patch.capstoneForm ?? null,
    holyPower: patch.holyPower ?? 0,
    beaconTargetId: patch.beaconTargetId ?? '1',
    mechanicCooldown: patch.mechanicCooldown ?? base.mechanicCooldown,
    mechanicOrdinal: patch.mechanicOrdinal ?? base.mechanicOrdinal,
    dungeonOutcome: null,
    spellCooldowns: patch.spellCooldowns ?? base.spellCooldowns,
    combatElapsedTicks: patch.combatElapsedTicks ?? base.combatElapsedTicks,
    floatingCombatTexts: patch.floatingCombatTexts ?? base.floatingCombatTexts,
    endlessStacks: patch.endlessStacks ?? base.endlessStacks,
    dungeonRunHealEffective: patch.dungeonRunHealEffective ?? base.dungeonRunHealEffective,
    dungeonRunHealOverheal: patch.dungeonRunHealOverheal ?? base.dungeonRunHealOverheal,
    dungeonRunManaSpentHealing: patch.dungeonRunManaSpentHealing ?? base.dungeonRunManaSpentHealing,
    isTutorialPaused: patch.isTutorialPaused ?? false,
    introTutorialComplete: patch.introTutorialComplete ?? base.introTutorialComplete,
    tutorialCompletedSteps: patch.tutorialCompletedSteps ?? base.tutorialCompletedSteps,
    diagnostics: null,
  };
}

export function getInitialState(cls: ClassType, saved: RosterV2['byClass'][ClassType]): GameState {
  const base = emptyGameBase();
  if (!saved) {
    const talents = getTalents(cls);
    const meta = getMeta(0, cls, talents);
    return {
      ...base,
      ...meta,
      playerClass: cls,
      completedDungeonIds: [],
      party: generateRandomParty(meta.level, cls),
      playerCombatBuffs: [],
      internalCooldowns: {},
      capstoneForm: null,
      holyPower: 0,
      beaconTargetId: '1',
      dungeonOutcome: null,
      isTutorialPaused: false,
      introTutorialComplete: false,
      tutorialCompletedSteps: [],
    };
  }
  const normalized = { ...saved, playerClass: cls, v: 1 as const };
  const progressPatch = patchFromSavedShape(normalized);
  if (!progressPatch) return getInitialState(cls, undefined);
  return applyProgressPatchToBase(base, progressPatch);
}
