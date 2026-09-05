import {
  TRASH_PACK_COUNT,
  SPELLS,
  generateRandomParty,
  getTrashMaxHealth
} from "./constants.js";
import { buildEndlessWaveDungeon, endlessBossPool, getEndlessTemplate } from "./dungeons/index.js";
import { BALANCE } from "./data/index.js";
import { INTRO_TUTORIAL_DUNGEON_ID } from "./tutorialConfig.js";
import { getTalents } from "./talents/index.js";
import {
  patchFromSavedShape,
  getMeta,
  reconcileActionBarOrder,
  xpProgressWithinLevel,
  levelUpRewardSummary
} from "./gameStorage.js";
import {
  arePrereqsSatisfied,
  getPrerequisiteIds,
  CLASS_PROGRESSION,
  CAPSTONE_PLAYER_BUFF_IDS
} from "./playerStats.js";
import { exclusiveUnlock, addBuff, removeBuff } from "./talentMechanics.js";
import { getAuraTicks } from "./auraConfig.js";
import { advanceCombatTick } from "./gameTick.js";
import { tryCast } from "./spellCastPipeline.js";
function getBaseCombatState() {
  return {
    currentDungeon: null,
    dungeonPace: null,
    dungeonProgress: 0,
    combatPhase: "TRASH",
    trashPullsRemaining: TRASH_PACK_COUNT,
    bossSelfBuffs: [],
    playerCombatBuffs: [],
    internalCooldowns: {},
    capstoneForm: null,
    holyPower: 0,
    mechanicCooldown: 0,
    mechanicOrdinal: 0,
    spellCooldowns: {},
    combatElapsedTicks: 0,
    runDpsJitter: 1,
    floatingCombatTexts: [],
    endlessStacks: 0,
    dungeonRunHealEffective: 0,
    dungeonRunHealOverheal: 0,
    dungeonRunManaSpentHealing: 0,
    manaPotionsUsedThisDungeon: 0,
    diagnostics: null
  };
}
function tickSpellCooldowns(state) {
  const prev = state.spellCooldowns;
  if (Object.keys(prev).length === 0) return state;
  let touched = false;
  const next = {};
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
function gameReducer(state, action) {
  switch (action.type) {
    case "TICK": {
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
        if (!nextState.isCombatActive) break;
      }
      return nextState;
    }
    case "SET_TUTORIAL_PAUSED":
      return { ...state, isTutorialPaused: action.value };
    case "COMPLETE_INTRO_TUTORIAL":
      return { ...state, introTutorialComplete: true, isTutorialPaused: false };
    case "MARK_TUTORIAL_STEP_COMPLETED": {
      if (state.tutorialCompletedSteps.includes(action.stepId)) return state;
      return {
        ...state,
        tutorialCompletedSteps: [...state.tutorialCompletedSteps, action.stepId]
      };
    }
    case "SET":
      return action.state;
    case "REORDER_ACTION_BAR": {
      if (state.currentDungeon) return state;
      const { from, to } = action;
      const bar = state.activeActionBars;
      if (from === to || from < 0 || to < 0 || from >= bar.length || to >= bar.length) return state;
      const next = [...bar];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...state, activeActionBars: next };
    }
    case "DISMISS_DUNGEON_OUTCOME":
      return { ...state, dungeonOutcome: null };
    case "ABANDON_DUNGEON":
      return {
        ...state,
        ...getBaseCombatState(),
        isCombatActive: false,
        isTutorialPaused: false,
        dungeonOutcome: null
      };
    case "START_DUNGEON": {
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
      const introTutorialRun = dungeon.id === INTRO_TUTORIAL_DUNGEON_ID && !state.introTutorialComplete && !state.tutorialCompletedSteps.includes("intro_core") && !!state.playerClass;
      let party = generateRandomParty(state.level, state.playerClass);
      let isTutorialPaused = false;
      if (introTutorialRun) {
        isTutorialPaused = true;
        party = party.map(
          (u) => u.id === "1" ? { ...u, health: Math.max(1, Math.floor(u.maxHealth * 0.34)) } : u
        );
      }
      // One roll per run, so a dungeon does not clear in exactly the same time
      // twice. Rolled here (not per tick) to keep pacing steady within a run.
      const jitter = BALANCE.partyDps.runJitter ?? 0;
      const runDpsJitter = 1 - jitter + rnd() * (jitter * 2);
      const now = Date.now();
      return {
        ...state,
        ...getBaseCombatState(),
        runDpsJitter,
        currentDungeon: dungeon,
        dungeonPace: pace,
        enemyHealth: trashHp,
        enemyMaxHealth: trashHp,
        isCombatActive: true,
        isTutorialPaused,
        party,
        mana: state.maxMana,
        dungeonOutcome: null,
        endlessStacks,
        diagnostics: {
          runStartTimeMs: now,
          lastPhaseStartTimeMs: now,
          lastPhaseStartTick: 0,
          events: []
        }
      };
    }
    case "UNLOCK_TALENT":
      return reduceUnlockTalent(state, action.talentId);
    case "DECREMENT_TALENT":
      return reduceDecrementTalent(state, action.talentId);
    case "RESPEC_TALENTS":
      return reduceRespecTalents(state);
    case "CAST_SPELL":
      return reduceCastSpell(state, action.spellId, action.targetId, action.critRoll);
    case "ADD_XP_NEXT_LEVEL": {
      if (!state.playerClass) return state;
      const { into, needed } = xpProgressWithinLevel(state.xp);
      const delta = Math.max(0, needed - into) + 1;
      const newXp = state.xp + delta;
      const meta = getMeta(newXp, state.playerClass, state.talents);
      const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
      const party = meta.level > state.level ? generateRandomParty(meta.level, state.playerClass) : state.party;
      const leveled = meta.level > state.level;
      const rewards = leveled ? levelUpRewardSummary(state.playerClass, state.talents, state.level, meta.level) : { upgradedSpellIds: [], upgradedPotion: false };
      return {
        ...state,
        ...meta,
        activeActionBars,
        mana: Math.min(meta.maxMana, state.mana),
        party,
        dungeonOutcome: leveled ? {
          kind: "success",
          successFlavor: "level_up",
          dungeonName: `Level ${meta.level}`,
          bossName: "",
          xpGained: delta,
          levelUp: true,
          levelAfter: meta.level,
          playerClass: state.playerClass,
          upgradedSpellIds: rewards.upgradedSpellIds,
          upgradedPotion: rewards.upgradedPotion
        } : state.dungeonOutcome
      };
    }
    default:
      return state;
  }
}
function applyTalentUpdate(state, newTalents, capstoneCheck = false) {
  const meta = getMeta(state.xp, state.playerClass, newTalents);
  const activeActionBars = reconcileActionBarOrder(state.activeActionBars, meta.activeActionBars);
  let next = { ...state, ...meta, activeActionBars, mana: Math.min(meta.maxMana, state.mana) };
  if (capstoneCheck && state.playerClass) {
    const capProg = CLASS_PROGRESSION[state.playerClass];
    const capstonePoints = newTalents.find((t) => t.mechanicId === capProg.capstoneMechanicId)?.points ?? 0;
    if (capstonePoints > 0) {
      next.capstoneForm = capProg.capstoneForm;
      next.playerCombatBuffs = addBuff(next.playerCombatBuffs, capProg.capstonePlayerBuffId, getAuraTicks(capProg.capstonePlayerBuffId), 1);
    } else {
      next.capstoneForm = null;
      next.playerCombatBuffs = removeBuff(next.playerCombatBuffs, capProg.capstonePlayerBuffId);
    }
  }
  return next;
}
function reduceUnlockTalent(state, talentId) {
  const talent = state.talents.find((t) => t.id === talentId);
  if (!talent || !arePrereqsSatisfied(state.talents, talent) || talent.points >= talent.maxPoints || state.talentPoints < talent.cost || state.level < talent.levelReq) return state;
  return applyTalentUpdate(state, exclusiveUnlock(state.talents, talentId), true);
}
function reduceRespecTalents(state) {
  if (!state.playerClass || state.talents.length === 0) return state;
  const next = applyTalentUpdate(state, state.talents.map((t) => ({ ...t, points: 0 })), false);
  next.capstoneForm = null;
  for (const id of CAPSTONE_PLAYER_BUFF_IDS) next.playerCombatBuffs = removeBuff(next.playerCombatBuffs, id);
  return next;
}
function reduceDecrementTalent(state, talentId) {
  const talent = state.talents.find((t) => t.id === talentId);
  if (!talent || talent.points <= 0 || state.talents.some((c) => c.points > 0 && c.id !== talentId && getPrerequisiteIds(state.talents, c).includes(talentId))) return state;
  return applyTalentUpdate(state, state.talents.map((t) => t.id === talentId ? { ...t, points: Math.max(0, t.points - 1) } : t), true);
}
function reduceCastSpell(state, spellId, targetId, critRoll) {
  const spell = SPELLS[spellId];
  if (!spell) return state;
  const cdRem = state.spellCooldowns[spellId] ?? 0;
  const nextCooldowns = { ...state.spellCooldowns };
  const rt = {
    scheduleCooldown: ({
      spellId: sid,
      rawCooldownTicks,
      hastePct,
      powerInfusionStacks
    }) => {
      const nextPi = powerInfusionStacks > 0 ? powerInfusionStacks - 1 : 0;
      const cdR = Math.round(
        rawCooldownTicks * (1 - hastePct / 100) * (powerInfusionStacks > 0 ? 0.5 : 1)
      );
      if (cdR > 0) nextCooldowns[sid] = cdR;
      return nextPi;
    }
  };
  const next = tryCast(state, { spell, spellId, targetId, critRoll }, cdRem, rt);
  if (next === state) return state;
  return { ...next, spellCooldowns: nextCooldowns };
}
function emptyGameBase() {
  const party = generateRandomParty(1, null);
  return {
    playerClass: null,
    ...getBaseCombatState(),
    party,
    mana: 100,
    maxMana: 100,
    xp: 0,
    level: 1,
    talentPoints: 1,
    talents: [],
    unlockedSpells: [],
    activeActionBars: [],
    enemyHealth: 100,
    enemyMaxHealth: 100,
    isCombatActive: false,
    completedDungeonIds: [],
    beaconTargetId: "1",
    dungeonOutcome: null,
    isTutorialPaused: false,
    introTutorialComplete: false,
    tutorialCompletedSteps: []
  };
}
function applyProgressPatchToBase(base, patch) {
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
    beaconTargetId: patch.beaconTargetId ?? "1",
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
    diagnostics: null
  };
}
function getInitialState(cls, saved) {
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
      beaconTargetId: "1",
      dungeonOutcome: null,
      isTutorialPaused: false,
      introTutorialComplete: false,
      tutorialCompletedSteps: []
    };
  }
  const normalized = { ...saved, playerClass: cls, v: 1 };
  const progressPatch = patchFromSavedShape(normalized);
  if (!progressPatch) return getInitialState(cls, void 0);
  return applyProgressPatchToBase(base, progressPatch);
}
export {
  emptyGameBase,
  gameReducer,
  getInitialState
};
