import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getTutorialCopy } from "../playerStats.js";
import {
  INTRO_TUTORIAL_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DEBUFF_DATA_ID,
  INTRO_TUTORIAL_DUNGEON_ID,
  INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME,
  TUTORIAL_ACTION_BAR_DROP_DATA_ID,
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
  tutorialPassiveTrigger
} from "../tutorialConfig.js";
const CORE = {
  triage: "Tank took damage. Tap to target.",
  cast: "Tap your fast heal spell.",
  manaTap: "Spells cost mana. Press Resume.",
  debuffResume: "Dangerous debuff on an ally. Tap or click the red icon to read full details. Press Resume combat when you are ready.",
  talentsNav: "Level up! Open Talents here.",
  talentNode: "Spend your talent point."
};
const MASTERY = {
  potion: "Low Mana! Use a potion now.",
  aoe: "Multiple allies hurt. Use AoE.",
  reorder: "Hold and drag to reorder spells."
};
function livingPartyBelowThreshold(state, thresholdPct) {
  return state.party.filter((u) => u.health > 0 && u.health / Math.max(1, u.maxHealth) < thresholdPct).length;
}
function useIntroTutorial({
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
  reorderSignal
}) {
  const [coreStep, setCoreStep] = useState(0);
  const [activeMasteryStep, setActiveMasteryStep] = useState(null);
  const talentBaselineRef = useRef(null);
  const talentSpentBaselineRef = useRef(null);
  const prevOutcomeRef = useRef(state.dungeonOutcome);
  const prevHadDungeonRef = useRef(!!state.currentDungeon);
  const potionBaselineRef = useRef(null);
  const prevCompletedDungeonCountRef = useRef(state.completedDungeonIds.length);
  const coreHealNonceBaselineRef = useRef(null);
  const masteryAoeNonceBaselineRef = useRef(null);
  const reorderNonceBaselineRef = useRef(null);
  const coreEnabledBase = !!state.playerClass && !state.introTutorialComplete && !state.tutorialCompletedSteps.includes("intro_core") && !showRoster;
  const coreEnabled = coreEnabledBase && (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID || coreStep === 6);
  const firstPickableTalentId = pickTutorialFirstTalentId(state.talents, state.talentPoints, state.level);
  const completedSteps = state.tutorialCompletedSteps;
  const hasMasteryOpen = activeMasteryStep !== null;
  const aoeSpellId = state.playerClass ? tutorialAoeSpellId(state.playerClass) : null;
  const passiveTrigger = state.playerClass ? tutorialPassiveTrigger(state.playerClass) : null;
  const passiveCopy = state.playerClass ? getTutorialCopy(state.playerClass).passiveDescription : "Passive effect active.";
  useEffect(() => {
    const inDeadmines = state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID;
    if (inDeadmines && !prevHadDungeonRef.current && !state.introTutorialComplete) {
      setCoreStep(0);
      coreHealNonceBaselineRef.current = null;
    }
    prevHadDungeonRef.current = !!state.currentDungeon;
  }, [state.currentDungeon, state.introTutorialComplete]);
  useEffect(() => {
    if (!coreEnabledBase || state.currentDungeon?.id !== INTRO_TUTORIAL_DUNGEON_ID) return;
    if (coreStep === 0 && targetId === "1") setCoreStep(1);
    else if (coreStep === 1) {
      if (coreHealNonceBaselineRef.current === null) coreHealNonceBaselineRef.current = castSpellIdSignal?.nonce ?? 0;
      if (castSpellIdSignal && castSpellIdSignal.nonce > coreHealNonceBaselineRef.current && castSpellIdSignal.id === introTutorialPrimaryHealSpellId(state.playerClass)) {
        setCoreStep(2);
        clearCastSpellSignal();
      }
    } else if (coreStep !== 1) {
      coreHealNonceBaselineRef.current = null;
    }
  }, [coreEnabledBase, coreStep, targetId, castSpellIdSignal, state.currentDungeon?.id, state.playerClass, clearCastSpellSignal]);
  useLayoutEffect(() => {
    if (activeMasteryStep === "aoe") {
      if (masteryAoeNonceBaselineRef.current === null) {
        masteryAoeNonceBaselineRef.current = castSpellIdSignal?.nonce ?? 0;
      }
    } else {
      masteryAoeNonceBaselineRef.current = null;
    }
  }, [activeMasteryStep, castSpellIdSignal?.nonce]);
  useLayoutEffect(() => {
    if (activeMasteryStep === "reorder") {
      if (reorderNonceBaselineRef.current === null) {
        reorderNonceBaselineRef.current = reorderSignal;
      }
    } else {
      reorderNonceBaselineRef.current = null;
    }
  }, [activeMasteryStep, reorderSignal]);
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
    if (prev?.kind === "success" && prev.dungeonName === INTRO_TUTORIAL_SUCCESS_DUNGEON_NAME && state.dungeonOutcome === null) {
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
    markTutorialStepCompleted("intro_core");
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
    markTutorialStepCompleted
  ]);
  useEffect(() => {
    if (hasMasteryOpen || !state.introTutorialComplete || showRoster) return;
    const prevCount = prevCompletedDungeonCountRef.current;
    prevCompletedDungeonCountRef.current = state.completedDungeonIds.length;
    if (!completedSteps.includes(TUTORIAL_STEP_REORDER) && !state.currentDungeon && menuView === "dungeons" && prevCount < 2 && state.completedDungeonIds.length >= 2) {
      setActiveMasteryStep("reorder");
      return;
    }
    if (!state.currentDungeon || !state.playerClass) return;
    if (!completedSteps.includes(TUTORIAL_STEP_PASSIVE) && passiveTrigger) {
      const triggerActive = passiveTrigger.kind === "buff" ? state.party.some((u) => u.buffs.some((b) => b.sourceSpellId === passiveTrigger.key)) : actionBarHighlights[passiveTrigger.key];
      if (triggerActive) {
        setActiveMasteryStep("passive");
        setTutorialPaused(true);
        return;
      }
    }
    if (!completedSteps.includes(TUTORIAL_STEP_MANA_POTION) && state.combatPhase === "BOSS" && state.mana / Math.max(1, state.maxMana) < 0.25) {
      potionBaselineRef.current = state.manaPotionsUsedThisDungeon;
      setActiveMasteryStep("potion");
      setTutorialPaused(true);
      return;
    }
    if (!completedSteps.includes(TUTORIAL_STEP_AOE) && aoeSpellId && state.activeActionBars.includes(aoeSpellId) && livingPartyBelowThreshold(state, 0.6) >= 3) {
      setActiveMasteryStep("aoe");
      setTutorialPaused(true);
    }
  }, [
    hasMasteryOpen,
    state.introTutorialComplete,
    state.playerClass,
    showRoster,
    state.currentDungeon,
    completedSteps,
    menuView,
    state.completedDungeonIds.length,
    passiveTrigger,
    state.party,
    actionBarHighlights,
    setTutorialPaused,
    state.combatPhase,
    state.mana,
    state.maxMana,
    state.manaPotionsUsedThisDungeon,
    aoeSpellId,
    state.activeActionBars
  ]);
  useEffect(() => {
    if (activeMasteryStep !== "potion") return;
    const base = potionBaselineRef.current ?? state.manaPotionsUsedThisDungeon;
    if (state.manaPotionsUsedThisDungeon > base) {
      markTutorialStepCompleted(TUTORIAL_STEP_MANA_POTION);
      setActiveMasteryStep(null);
      potionBaselineRef.current = null;
      setTutorialPaused(false);
    }
  }, [activeMasteryStep, state.manaPotionsUsedThisDungeon, markTutorialStepCompleted, setTutorialPaused]);
  useEffect(() => {
    if (activeMasteryStep !== "aoe" || !aoeSpellId || !castSpellIdSignal) return;
    const startNonce = masteryAoeNonceBaselineRef.current;
    if (startNonce === null) return;
    if (castSpellIdSignal.nonce <= startNonce) return;
    if (castSpellIdSignal.id !== aoeSpellId) return;
    markTutorialStepCompleted(TUTORIAL_STEP_AOE);
    setActiveMasteryStep(null);
    setTutorialPaused(false);
    clearCastSpellSignal();
  }, [activeMasteryStep, aoeSpellId, castSpellIdSignal, markTutorialStepCompleted, setTutorialPaused, clearCastSpellSignal]);
  useEffect(() => {
    if (activeMasteryStep !== "reorder") return;
    const baseline = reorderNonceBaselineRef.current;
    if (baseline === null) return;
    if (reorderSignal <= baseline) return;
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
    if (activeMasteryStep !== "passive") return;
    markTutorialStepCompleted(TUTORIAL_STEP_PASSIVE);
    setActiveMasteryStep(null);
    setTutorialPaused(false);
  }, [activeMasteryStep, markTutorialStepCompleted, setTutorialPaused]);
  const filledSlotIdForReorder = useMemo(() => {
    const i = state.activeActionBars.findIndex((id) => id !== "");
    return i >= 0 ? state.activeActionBars[i] : null;
  }, [state.activeActionBars]);
  const tutorialActionBarDropSlotDataId = activeMasteryStep === "reorder" && !!filledSlotIdForReorder ? TUTORIAL_ACTION_BAR_DROP_DATA_ID : null;
  const masteryOverlay = (() => {
    if (!state.introTutorialComplete || showRoster || !activeMasteryStep) return null;
    if (activeMasteryStep === "passive") {
      const passiveTarget = passiveTrigger?.kind === "buff" ? "tutorial-passive-priest-echo" : `spell-${passiveTrigger?.key ?? "flash_heal"}`;
      return {
        open: true,
        targetDataId: passiveTarget,
        message: passiveCopy,
        showTapCatcher: true,
        tone: "benefit",
        resumeLabel: "Resume"
      };
    }
    if (activeMasteryStep === "potion") {
      return {
        open: true,
        targetDataId: "spell-mana_potion",
        message: MASTERY.potion,
        showTapCatcher: false,
        tone: "benefit"
      };
    }
    if (activeMasteryStep === "aoe" && aoeSpellId) {
      return {
        open: true,
        targetDataId: `spell-${aoeSpellId}`,
        message: MASTERY.aoe,
        showTapCatcher: false,
        tone: "threat"
      };
    }
    if (activeMasteryStep === "reorder" && filledSlotIdForReorder) {
      return {
        open: true,
        targetDataId: `spell-${filledSlotIdForReorder}`,
        message: MASTERY.reorder,
        showTapCatcher: false,
        tone: "benefit",
        ghostHand: { fromDataId: `spell-${filledSlotIdForReorder}`, toDataId: TUTORIAL_ACTION_BAR_DROP_DATA_ID }
      };
    }
    return null;
  })();
  if (masteryOverlay) {
    return {
      overlay: masteryOverlay,
      onTapContinue: activeMasteryStep === "passive" ? onTapMasteryPassive : void 0,
      highlightTalentIdForTree: null,
      tutorialActionBarDropSlotDataId
    };
  }
  const coreOverlay = (() => {
    if (!coreEnabled || showRoster) {
      return { open: false, targetDataId: null, message: "", showTapCatcher: false, showResumeButton: false };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 0) {
      return {
        open: true,
        targetDataId: TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
        message: CORE.triage,
        showTapCatcher: false,
        tone: "threat"
      };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 1 && state.playerClass) {
      return {
        open: true,
        targetDataId: `spell-${introTutorialPrimaryHealSpellId(state.playerClass)}`,
        message: CORE.cast,
        showTapCatcher: false,
        tone: "benefit"
      };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 2) {
      return { open: true, targetDataId: "mana-pool", message: CORE.manaTap, showTapCatcher: true, tone: "benefit", resumeLabel: "Resume combat" };
    }
    if (state.currentDungeon?.id === INTRO_TUTORIAL_DUNGEON_ID && coreStep === 4) {
      return {
        open: true,
        targetDataId: INTRO_TUTORIAL_DEBUFF_DATA_ID,
        message: CORE.debuffResume,
        showTapCatcher: false,
        showResumeButton: true,
        tone: "threat",
        resumeLabel: "Resume combat"
      };
    }
    if (coreStep === 6 && !state.currentDungeon) {
      if (menuView !== "talents") {
        return { open: true, targetDataId: "nav-talents", message: CORE.talentsNav, showTapCatcher: false, tone: "benefit" };
      }
      if (firstPickableTalentId) {
        return { open: true, targetDataId: "tutorial-first-talent", message: CORE.talentNode, showTapCatcher: false, tone: "benefit" };
      }
    }
    return { open: false, targetDataId: null, message: "", showTapCatcher: false, showResumeButton: false };
  })();
  const coreTapContinue = coreStep === 2 ? onTapCoreMana : coreStep === 4 ? onTapCoreDebuff : void 0;
  return {
    overlay: coreOverlay,
    onTapContinue: coreTapContinue,
    highlightTalentIdForTree: coreStep === 6 && menuView === "talents" ? firstPickableTalentId : null,
    tutorialActionBarDropSlotDataId
  };
}
export {
  useIntroTutorial
};
