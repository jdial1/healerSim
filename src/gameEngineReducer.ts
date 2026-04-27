import { GameState, ClassType, Dungeon } from './types.ts';
import {
  TICK_RATE,
  TRASH_PACK_COUNT,
  SPELLS,
  generateRandomParty,
  trashMaxHealthForDungeon,
} from './constants.ts';
import { cloneTalentsForClass } from './talents/index.ts';
import {
  patchFromSavedShape,
  computeMetaFromProgress,
  reconcileActionBarOrder,
  xpProgressWithinLevel,
  type RosterV2,
} from './gameStorage.ts';
import {
  talentChainedPrereqsSatisfied,
  CLASS_PROGRESSION,
  CAPSTONE_PLAYER_BUFF_IDS,
} from './playerStats.ts';
import { applyExclusiveUnlock, upsertPlayerBuff, withBuffRemoved } from './talentMechanics.ts';
import { playerCombatAuraTicks } from './auraConfig.ts';
import { advanceCombatTick, type TickRandom } from './gameTick.ts';
import { tryApplySpellCast, type CastRuntime } from './spellCastPipeline.ts';

export type GameAction =
  | { type: 'TICK'; random: TickRandom; now: number }
  | { type: 'SET'; state: GameState }
  | { type: 'REORDER_ACTION_BAR'; from: number; to: number }
  | { type: 'DISMISS_DUNGEON_OUTCOME' }
  | { type: 'ABANDON_DUNGEON' }
  | { type: 'START_DUNGEON'; dungeon: Dungeon }
  | { type: 'UNLOCK_TALENT'; talentId: string }
  | { type: 'RESPEC_TALENTS' }
  | { type: 'CAST_SPELL'; spellId: string; targetId: string; critRoll: number }
  | { type: 'ADD_XP_NEXT_LEVEL' };

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
    case 'TICK':
      return tickSpellCooldowns(advanceCombatTick(state, action.random, action.now));
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
        dungeonProgress: 0,
        manaPotionsUsedThisDungeon: 0,
        bossSelfBuffs: [],
        playerCombatBuffs: [],
        internalCooldowns: {},
        capstoneForm: null,
        holyPower: 0,
        dungeonOutcome: null,
        bossMechanicCountdownTicks: 0,
        bossMechanicOrdinal: 0,
        spellCooldowns: {},
      };
    case 'START_DUNGEON': {
      const dungeon = action.dungeon;
      const trashHp = trashMaxHealthForDungeon(dungeon);
      return {
        ...state,
        currentDungeon: dungeon,
        dungeonProgress: 0,
        combatPhase: 'TRASH',
        trashPullsRemaining: TRASH_PACK_COUNT,
        enemyHealth: trashHp,
        enemyMaxHealth: trashHp,
        isCombatActive: true,
        party: generateRandomParty(state.level, state.playerClass),
        mana: state.maxMana,
        manaPotionsUsedThisDungeon: 0,
        bossSelfBuffs: [],
        playerCombatBuffs: [],
        internalCooldowns: {},
        capstoneForm: null,
        holyPower: 0,
        dungeonOutcome: null,
        bossMechanicCountdownTicks: 0,
        bossMechanicOrdinal: 0,
        spellCooldowns: {},
      };
    }
    case 'UNLOCK_TALENT':
      return reduceUnlockTalent(state, action.talentId);
    case 'RESPEC_TALENTS':
      return reduceRespecTalents(state);
    case 'CAST_SPELL':
      return reduceCastSpell(state, action.spellId, action.targetId, action.critRoll);
    case 'ADD_XP_NEXT_LEVEL': {
      if (!state.playerClass) return state;
      const { into, needed } = xpProgressWithinLevel(state.xp);
      const delta = Math.max(0, needed - into) + 1;
      const newXp = state.xp + delta;
      const meta = computeMetaFromProgress(newXp, state.playerClass, state.talents);
      const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
      const party =
        meta.level > state.level
          ? generateRandomParty(meta.level, state.playerClass)
          : state.party;
      return {
        ...state,
        ...meta,
        activeActionBars,
        mana: Math.min(meta.maxMana, state.mana),
        party,
      };
    }
    default:
      return state;
  }
}

function reduceUnlockTalent(state: GameState, talentId: string): GameState {
  const talent = state.talents.find((t) => t.id === talentId);
  if (!talent) return state;
  const hasPrereqs = talentChainedPrereqsSatisfied(state.talents, talent);
  if (
    !hasPrereqs ||
    talent.points >= talent.maxPoints ||
    state.talentPoints < talent.cost ||
    state.level < talent.levelReq
  ) {
    return state;
  }
  const newTalents = applyExclusiveUnlock(state.talents, talentId);
  const meta = computeMetaFromProgress(state.xp, state.playerClass, newTalents);
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
        playerCombatBuffs: upsertPlayerBuff(
          next.playerCombatBuffs,
          capProg.capstonePlayerBuffId,
          playerCombatAuraTicks(capProg.capstonePlayerBuffId),
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
  const meta = computeMetaFromProgress(state.xp, state.playerClass, cleared);
  const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
  let pbuffs = state.playerCombatBuffs;
  for (const id of CAPSTONE_PLAYER_BUFF_IDS) {
    pbuffs = withBuffRemoved(pbuffs, id);
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
  const next = tryApplySpellCast(state, { spell, spellId, targetId, critRoll }, cdRem, rt);
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
    bossMechanicCountdownTicks: 0,
    bossMechanicOrdinal: 0,
    dungeonOutcome: null,
    spellCooldowns: {},
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
    bossMechanicCountdownTicks: patch.bossMechanicCountdownTicks ?? base.bossMechanicCountdownTicks,
    bossMechanicOrdinal: patch.bossMechanicOrdinal ?? base.bossMechanicOrdinal,
    dungeonOutcome: null,
    spellCooldowns: patch.spellCooldowns ?? base.spellCooldowns,
  };
}

export function gameStateForClass(cls: ClassType, saved: RosterV2['byClass'][ClassType]): GameState {
  const base = emptyGameBase();
  if (!saved) {
    const talents = cloneTalentsForClass(cls);
    const meta = computeMetaFromProgress(0, cls, talents);
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
    };
  }
  const normalized = { ...saved, playerClass: cls, v: 1 as const };
  const progressPatch = patchFromSavedShape(normalized);
  if (!progressPatch) return gameStateForClass(cls, undefined);
  return applyProgressPatchToBase(base, progressPatch);
}
