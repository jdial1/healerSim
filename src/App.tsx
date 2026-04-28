/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useGameEngine } from './hooks/useGameEngine.ts';
import { useIntroTutorial } from './hooks/useIntroTutorial.ts';
import {
  useKeyboardCombatKeys,
  type KeyboardCombatSnapshot,
} from './hooks/useKeyboardCombatKeys.ts';
import { HealGrid } from './components/HealGrid.tsx';
import { ActionBars } from './components/ActionBars.tsx';
import { CharacterRoster } from './components/CharacterRoster.tsx';
import { SplashScreen } from './components/SplashScreen.tsx';
import { DungeonSelector } from './components/DungeonSelector.tsx';
import { maxLevelAcrossRoster } from './gameStorage.ts';
import { GameHUD } from './components/GameHUD.tsx';
import { TRASH_PACK_COUNT, TICKS_PER_SECOND, MANA_POTION_USES_PER_DUNGEON } from './constants.ts';
import {
  PLAYER_BUFF_MANA_REGEN_POTION,
  PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT,
  getPlayerBuffRemainingTicks,
  getManaPotionDripPerTick,
} from './talentMechanics.ts';
import { partyWithHealerManaRegenDisplayBuff } from './buffDisplay.ts';
import { TalentTree } from './components/TalentTree.tsx';
import { DungeonOutcomeModal } from './components/DungeonOutcomeModal.tsx';
import { spellHealingMultiplierFromProgress, effectivePrimaryStats } from './playerStats.ts';
import type { PlayerCombatStats } from './types.ts';
import { PlayerStatsModal } from './components/PlayerStatsModal.tsx';
import { TutorialOverlay } from './components/TutorialOverlay.tsx';
import { INTRO_TUTORIAL_DEBUFF_DATA_ID } from './tutorialConfig.ts';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, LogOut, Settings, ScrollText, Swords } from 'lucide-react';

const REPO_URL = 'https://github.com/jdial1/healerSim';
const COMMUNITY_URL = 'https://github.com/jdial1/healerSim';

export default function App() {
  const {
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
    cooldowns,
    dungeonOutcome,
    dismissDungeonOutcome,
    actionBarHighlights,
    setTutorialPaused,
    completeIntroTutorial,
    markTutorialStepCompleted,
  } = useGameEngine();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [castTutorialSignal, setCastTutorialSignal] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [reorderTutorialSignal, setReorderTutorialSignal] = useState(0);
  const [showRoster, setShowRoster] = useState(true);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [menuView, setMenuView] = useState<'dungeons' | 'talents' | 'character'>('dungeons');
  const paladinUnlocked = maxLevelAcrossRoster(roster) >= 25;
  const [pwaNeedsRefresh, setPwaNeedsRefresh] = useState(false);
  const swUpdate = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);
  const keyboardRef = useRef<KeyboardCombatSnapshot>({
    party: [],
    currentDungeon: null,
    activeActionBars: [],
    targetId: null,
    castSpell: () => {},
  });

  useEffect(() => {
    swUpdate.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setPwaNeedsRefresh(true);
      },
    });
  }, []);

  const clearCastTutorialSignal = useCallback(() => {
    setCastTutorialSignal(null);
  }, []);

  const castSpellWithTutorialSignal = useCallback(
    (spellId: string, targetIdForSpell: string) => {
      setCastTutorialSignal((prev) => ({
        id: spellId,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      castSpell(spellId, targetIdForSpell);
    },
    [castSpell],
  );

  const handleCast = useCallback(
    (spellId: string) => {
      if (!state.currentDungeon) return;
      if (!targetId && state.party.length > 0) {
        const tank = state.party.find((u) => u.role === 'TANK');
        if (tank) castSpellWithTutorialSignal(spellId, tank.id);
      } else if (targetId) {
        castSpellWithTutorialSignal(spellId, targetId);
      }
    },
    [state.currentDungeon, targetId, state.party, castSpellWithTutorialSignal],
  );

  const reorderActionBarWithSignal = useCallback(
    (from: number, to: number) => {
      reorderActionBar(from, to);
      setReorderTutorialSignal((v) => v + 1);
    },
    [reorderActionBar],
  );

  const { overlay: introTutorialOverlay, onTapContinue: introTutorialTapContinue, highlightTalentIdForTree } =
    useIntroTutorial({
      state,
      actionBarHighlights,
      targetId,
      menuView,
      showRoster,
      castSpellIdSignal: castTutorialSignal,
      clearCastSpellSignal: clearCastTutorialSignal,
      setTutorialPaused,
      completeIntroTutorial,
      markTutorialStepCompleted,
      reorderSignal: reorderTutorialSignal,
    });

  const introDebuffTutorialStep =
    introTutorialOverlay.open && introTutorialOverlay.targetDataId === INTRO_TUTORIAL_DEBUFF_DATA_ID;

  useEffect(() => {
    if (!targetId) return;
    const alive = state.party.some((m) => m.id === targetId && m.health > 0);
    if (!alive) setTargetId(null);
  }, [state.party, targetId]);

  const manaRegenTicksForUi = useMemo(
    () =>
      state.currentDungeon
        ? getPlayerBuffRemainingTicks(state.playerCombatBuffs, PLAYER_BUFF_MANA_REGEN_POTION)
        : 0,
    [state.currentDungeon, state.playerCombatBuffs],
  );

  const spiritLockTicksForUi = useMemo(
    () =>
      state.currentDungeon
        ? getPlayerBuffRemainingTicks(state.playerCombatBuffs, PLAYER_BUFF_SPIRIT_REGEN_LOCKOUT)
        : 0,
    [state.currentDungeon, state.playerCombatBuffs],
  );

  const partyForHealGrid = useMemo(
    () =>
      partyWithHealerManaRegenDisplayBuff(state.party, manaRegenTicksForUi, state.level),
    [state.party, manaRegenTicksForUi, state.level],
  );

  const playerCombatStats = useMemo((): PlayerCombatStats | null => {
    if (!state.playerClass) return null;
    return {
      playerClass: state.playerClass,
      level: state.level,
      xp: state.xp,
      mana: state.currentDungeon ? state.mana : state.maxMana,
      maxMana: state.maxMana,
      manaRegenBuffTicksRemaining: manaRegenTicksForUi,
      manaPotionDripPerSec: getManaPotionDripPerTick(state.playerCombatBuffs) * TICKS_PER_SECOND,
      spiritRegenLockoutTicksRemaining: spiritLockTicksForUi,
      spirit: effectivePrimaryStats(state.playerClass, state.level).spirit,
      spellsEnabled: !!state.currentDungeon,
      manaPotionChargesRemaining: Math.max(
        0,
        MANA_POTION_USES_PER_DUNGEON - state.manaPotionsUsedThisDungeon,
      ),
      spellHealingMultiplier: spellHealingMultiplierFromProgress(
        state.playerClass,
        state.level,
        state.talents,
      ),
      unlockedSpells: state.unlockedSpells,
      actionBarHighlights,
    };
  }, [
    state.playerClass,
    state.xp,
    state.mana,
    state.maxMana,
    state.currentDungeon,
    state.level,
    state.unlockedSpells,
    state.manaPotionsUsedThisDungeon,
    state.talents,
    manaRegenTicksForUi,
    spiritLockTicksForUi,
    state.playerCombatBuffs,
    actionBarHighlights,
  ]);

  keyboardRef.current = {
    party: state.party,
    currentDungeon: state.currentDungeon,
    activeActionBars: state.activeActionBars,
    targetId,
    castSpell: castSpellWithTutorialSignal,
  };
  useKeyboardCombatKeys(keyboardRef, setTargetId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'l') return;
      if (e.repeat) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest('[contenteditable="true"]'))) {
        return;
      }
      if (!state.playerClass) return;
      e.preventDefault();
      addXpNextLevel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.playerClass, addXpNextLevel]);

  const showCombatUi = !!state.playerClass && !showRoster;
  const showGlobalMenuNav = state.playerClass && !showRoster && !state.currentDungeon;
  const goToCharacter = () => {
    setMenuView('character');
  };
  const goToTalents = () => {
    setMenuView('talents');
  };
  const goToDungeons = () => {
    setMenuView('dungeons');
  };
  const navTab = menuView;

  return (
    <div
      className={`bg-slate-950 font-sans selection:bg-amber-500 selection:text-slate-950 ${
        state.playerClass && !showRoster ? 'min-h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      <AnimatePresence mode="wait">
        {menuView === 'talents' && state.playerClass && !showRoster ? (
          <TalentTree 
            talents={state.talents}
            talentPoints={state.talentPoints}
            onUnlock={unlockTalent}
            onDecrement={decrementTalent}
            onRespec={respecTalents}
            onClose={goToDungeons}
            playerLevel={state.level}
            playerClass={state.playerClass}
            tutorialHighlightTalentId={highlightTalentIdForTree}
          />
        ) : null}

        {showRoster || !state.playerClass ? (
          <AnimatePresence mode="wait">
            {!splashDismissed ? (
              <Fragment key="splash">
                <SplashScreen
                  onEnter={() => setSplashDismissed(true)}
                  version={__APP_VERSION__}
                  communityUrl={COMMUNITY_URL}
                />
              </Fragment>
            ) : (
              <motion.div
                key="character-roster"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -100 }}
              >
                <CharacterRoster
                  roster={roster}
                  paladinUnlocked={paladinUnlocked}
                  onContinue={(cls) => {
                    loadCharacter(cls);
                    setShowRoster(false);
                    setMenuView('dungeons');
                  }}
                  onCreate={(cls) => {
                    startNewClass(cls);
                    setShowRoster(false);
                    setMenuView('dungeons');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : !state.currentDungeon ? (
          <motion.div
            key="dungeon-select"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="relative flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden"
          >
            <div className="fixed left-3 right-3 top-3 z-[60] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  returnToRoster();
                  setShowRoster(true);
                }}
                className="ui-panel ui-state-frame ui-state-hover flex h-8 items-center gap-1.5 px-2.5 backdrop-blur-md transition-colors"
                aria-label="Options"
              >
                <Settings size={12} strokeWidth={2.4} className="-translate-y-px shrink-0 text-amber-200" aria-hidden />
                <span className="-translate-y-px block text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-amber-100 sm:text-[10px]">
                  Options
                </span>
              </button>
              <div className="ui-panel flex h-8 items-center gap-3 px-3 backdrop-blur-md">
                <button
                  type="button"
                  onClick={goToCharacter}
                  className="flex h-full items-center gap-1.5 text-amber-100 transition-colors hover:text-amber-300"
                >
                  <Trophy size={10} className="-translate-y-px text-amber-400" />
                  <span className="-translate-y-px block text-[11px] font-semibold uppercase leading-none tracking-[0.14em] sm:text-[10px]">
                    Lvl <span className="text-white">{state.level}</span>
                  </span>
                </button>
              </div>
            </div>

            <DungeonSelector
              onSelect={startDungeon}
              level={state.level}
              completedDungeonIds={state.completedDungeonIds}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game-active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex h-dvh max-h-dvh min-h-0 flex-col"
          >
            <div className="fixed top-3 right-3 z-[60]">
              <button
                type="button"
                onClick={abandonDungeon}
                className="ui-state-frame ui-state-hover flex items-center gap-1.5 rounded bg-slate-900/90 px-2.5 py-1.5 text-slate-300 shadow-sm transition-colors hover:text-red-300 sm:px-3 sm:py-2"
                aria-label="Leave dungeon"
              >
                <LogOut size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
                <span className="text-[10px] font-black uppercase tracking-widest sm:text-[9px]">Leave</span>
              </button>
            </div>
            <GameHUD 
              combatPhase={state.combatPhase}
              trashPullsRemaining={state.trashPullsRemaining}
              enemyHealth={state.enemyHealth}
              enemyMaxHealth={state.enemyMaxHealth}
              bossName={state.currentDungeon.bossName}
              trashEnemyName={
                state.currentDungeon.enemies[TRASH_PACK_COUNT - state.trashPullsRemaining]?.name ?? ''
              }
              bossSelfBuffs={state.combatPhase === 'BOSS' ? state.bossSelfBuffs : []}
              endlessStacks={state.currentDungeon.endless ? state.endlessStacks : undefined}
            />

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-48 pb-36 sm:pt-52 sm:pb-40">
               <div className="my-auto flex w-full max-w-xl shrink-0 flex-col items-center gap-1 self-center overflow-y-auto px-2 pb-2">
                 <HealGrid
                  party={partyForHealGrid}
                  selectedId={targetId}
                  onTargetSelect={setTargetId}
                  floatingCombatTexts={state.floatingCombatTexts}
                  syncIntroTutorialDebuffTip={introDebuffTutorialStep}
                  debuffTipZIndex={introDebuffTutorialStep ? 10200 : 400}
                  holdTutorialDebuffTip={introDebuffTutorialStep}
                />
               </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuView === 'character' && state.playerClass && !showRoster ? (
          <PlayerStatsModal
            playerClass={state.playerClass}
            level={state.level}
            xp={state.xp}
            talents={state.talents}
            onClose={goToDungeons}
          />
        ) : null}
      </AnimatePresence>

      {showCombatUi && state.playerClass && !showRoster && playerCombatStats ? (
        <ActionBars
          playerCombatStats={playerCombatStats}
          spellIds={state.activeActionBars}
          cooldowns={cooldowns}
          onCast={handleCast}
          allowReorder={!state.currentDungeon}
          onReorderSlots={reorderActionBarWithSignal}
          hideResourcePanels={!state.currentDungeon}
        />
      ) : null}

      {showGlobalMenuNav ? (
        <div
          className="ui-frame-divider-top fixed bottom-0 left-0 right-0 z-[130] bg-slate-950/95 px-3 py-2 shadow-[0_-10px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto flex w-full max-w-md items-center gap-2">
            <button
              type="button"
              onClick={goToCharacter}
              className={`ui-state-frame flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                navTab === 'character'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={navTab === 'character' ? 'page' : undefined}
            >
              <ScrollText size={16} strokeWidth={2.25} className="ui-nav-icon-flat shrink-0 text-amber-300" />
              Character
            </button>
            <button
              type="button"
              onClick={goToTalents}
              data-tutorial-id="nav-talents"
              className={`ui-state-frame relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                navTab === 'talents'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : state.talentPoints > 0
                    ? 'ui-state-hover bg-slate-900/80 text-sky-100 hover:text-sky-50'
                    : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={navTab === 'talents' ? 'page' : undefined}
            >
              <Star size={16} strokeWidth={2.25} className="ui-nav-icon-flat shrink-0 text-amber-300" />
              Talents
              {state.talentPoints > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border border-red-200/85 bg-red-600 px-1 font-mono text-[10px] font-black leading-none text-white shadow-[0_0_12px_rgba(239,68,68,0.65)] sm:text-[11px]">
                  {state.talentPoints}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={goToDungeons}
              className={`ui-state-frame flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                navTab === 'dungeons'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={navTab === 'dungeons' ? 'page' : undefined}
            >
              <Swords size={16} strokeWidth={2.25} className="ui-nav-icon-flat shrink-0 text-amber-300" />
              Dungeons
            </button>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {dungeonOutcome ? (
          <Fragment key={`${dungeonOutcome.kind}-${dungeonOutcome.dungeonName}`}>
            <DungeonOutcomeModal outcome={dungeonOutcome} onDismiss={dismissDungeonOutcome} />
          </Fragment>
        ) : null}
      </AnimatePresence>

      {pwaNeedsRefresh ? (
        <div
          className="ui-frame-divider-top fixed bottom-0 left-0 right-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-slate-950/95 px-4 py-3 text-center backdrop-blur-md"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
            Update ready · v{__APP_VERSION__}
          </span>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white"
            onClick={() => void swUpdate.current?.(true)}
          >
            Reload
          </button>
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400"
            onClick={() => setPwaNeedsRefresh(false)}
          >
            Later
          </button>
        </div>
      ) : null}

      {!state.currentDungeon && showRoster && splashDismissed ? (
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-3 top-3 z-[25] block text-right font-mono text-[10px] tracking-wide text-slate-600 transition-colors hover:text-slate-400"
        >
          v{__APP_VERSION__}
        </a>
      ) : null}

      <TutorialOverlay
        open={introTutorialOverlay.open}
        targetDataId={introTutorialOverlay.targetDataId}
        message={introTutorialOverlay.message}
        showTapCatcher={introTutorialOverlay.showTapCatcher}
        showResumeButton={introTutorialOverlay.showResumeButton}
        anchorMessageBelowTarget={introDebuffTutorialStep}
        tone={introTutorialOverlay.tone}
        resumeLabel={introTutorialOverlay.resumeLabel}
        ghostHand={introTutorialOverlay.ghostHand}
        onTapContinue={introTutorialTapContinue}
      />
    </div>
  );
}

