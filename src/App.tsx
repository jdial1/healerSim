import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useEngine } from './hooks';
import { SplashPage } from './pages/SplashPage';
import { RosterPage } from './pages/RosterPage';
import { DungeonPage } from './pages/DungeonPage';
import { CombatPage } from './pages/CombatPage';
import { TalentPage } from './pages/TalentPage';
import { DungeonOutcomeModal, NavPrimerModal, TutorialOverlay } from './components';
import { useIntroTutorial } from './hooks';
import { useDevXpHotkey } from './ui/useCombatControls';
import { INTRO_DEBUFF_DATA_ID } from './constants';
import { buildPlayerCombatStats } from './combat';
import { motion, AnimatePresence } from 'motion/react';

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
  } = useEngine();

  const [targetId, setTargetId] = useState<string | null>(null);
  const [castTutorialSignal, setCastTutorialSignal] = useState<{ id: string; nonce: number } | null>(null);
  const [reorderTutorialSignal, setReorderTutorialSignal] = useState(0);
  const [showRoster, setShowRoster] = useState(true);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [menuView, setMenuView] = useState<'dungeons' | 'talents' | 'character'>('dungeons');
  const [pwaNeedsRefresh, setPwaNeedsRefresh] = useState(false);
  const swUpdate = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);

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
      clearCastTutorialSignal,
      setTutorialPaused,
      completeIntroTutorial,
      markTutorialStepCompleted,
      reorderSignal: reorderTutorialSignal,
    });

  const introDebuffTutorialStep =
    introTutorialOverlay.open && introTutorialOverlay.targetId === INTRO_DEBUFF_DATA_ID;

  useEffect(() => {
    if (!targetId) return;
    const alive = state.party.some((m) => m.id === targetId && m.health > 0);
    if (!alive) setTargetId(null);
  }, [state.party, targetId]);

  const playerCombatStats = useMemo(
    () => buildPlayerCombatStats(state, actionBarHighlights),
    [state, actionBarHighlights],
  );

  useDevXpHotkey(state.playerClass, addXpNextLevel);

  const showGlobalMenuNav = state.playerClass && !showRoster && !state.currentDungeon;

  const goToCharacter = () => setMenuView('character');
  const goToTalents = () => setMenuView('talents');
  const goToDungeons = () => setMenuView('dungeons');

  const showNavPrimerModal =
    !showRoster &&
    !!state.playerClass &&
    !state.currentDungeon &&
    !state.introComplete &&
    !state.tutorialCompletedSteps.includes('intro_core') &&
    !state.tutorialCompletedSteps.includes('TUTORIAL_STEP_NAV_PRIMER');

  const dismissNavPrimerModal = useCallback(() => {
    markTutorialStepCompleted('TUTORIAL_STEP_NAV_PRIMER');
  }, [markTutorialStepCompleted]);

  return (
    <div
      className={`bg-slate-950 font-sans selection:bg-amber-500 selection:text-slate-950 ${
        state.playerClass && !showRoster ? 'min-h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      <AnimatePresence mode="wait">
        {!splashDismissed ? (
          <SplashPage
            onEnter={() => setSplashDismissed(true)}
            version={__APP_VERSION__}
            communityUrl={COMMUNITY_URL}
          />
        ) : showRoster || !state.playerClass ? (
          <RosterPage
            roster={roster}
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
            onReturn={() => {
              returnToRoster();
              setShowRoster(true);
            }}
          />
        ) : state.currentDungeon ? (
          <CombatPage
            state={state}
            playerCombatStats={playerCombatStats}
            cooldowns={cooldowns}
            onCastSpell={castSpellWithTutorialSignal}
            onReorderActionBar={reorderActionBarWithSignal}
            onAbandonDungeon={() => {
              abandonDungeon();
              setShowRoster(true);
            }}
            onTargetSelect={setTargetId}
            introDebuffTutorialStep={introDebuffTutorialStep}
          />
        ) : menuView === 'talents' ? (
          <TalentPage
            talents={state.talents}
            talentPoints={state.talentPoints}
            onUnlock={unlockTalent}
            onDecrement={decrementTalent}
            onRespec={respecTalents}
            onClose={goToDungeons}
            playerLevel={state.level}
            playerClass={state.playerClass!}
            tutorialHighlightTalentId={highlightTalentIdForTree}
          />
        ) : (
          <DungeonPage
            onSelect={(dungeon, pace) => {
              startDungeon(dungeon, pace);
              setShowRoster(false);
            }}
            level={state.level}
            completedDungeonIds={state.completedDungeonIds}
          />
        )}
      </AnimatePresence>

      {/* Modals and Overlays */}
      <AnimatePresence>
        {dungeonOutcome ? (
          <DungeonOutcomeModal outcome={dungeonOutcome} onDismiss={dismissDungeonOutcome} />
        ) : null}
      </AnimatePresence>

      {showGlobalMenuNav && (
        <div className="ui-frame-divider-top fixed bottom-0 left-0 right-0 z-[130] bg-slate-950/95 px-3 py-2 shadow-[0_-10px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto flex w-full max-w-md items-center gap-2">
            <button
              type="button"
              onClick={goToCharacter}
              className={`ui-state-frame flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                menuView === 'character'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={menuView === 'character' ? 'page' : undefined}
            >
              Character
            </button>
            <button
              type="button"
              onClick={goToTalents}
              className={`ui-state-frame flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                menuView === 'talents'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : state.talentPoints > 0
                    ? 'ui-state-hover bg-slate-900/80 text-sky-100 hover:text-sky-50'
                    : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={menuView === 'talents' ? 'page' : undefined}
            >
              Talents
              {state.talentPoints > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border border-red-200/85 bg-red-600 px-1 font-mono text-[10px] font-bold leading-none text-white shadow-[0_0_12px_rgba(239,68,68,0.65)] sm:text-[11px]">
                  {state.talentPoints}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={goToDungeons}
              className={`ui-state-frame flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold tracking-[0.04em] transition-colors active:scale-[0.97] sm:text-sm ${
                menuView === 'dungeons'
                  ? 'ui-state-selected bg-amber-900/35 text-amber-100'
                  : 'ui-state-hover bg-slate-900/70 text-slate-200 hover:text-amber-200'
              }`}
              aria-current={menuView === 'dungeons' ? 'page' : undefined}
            >
              Dungeons
            </button>
          </div>
        </div>
      )}

      {showNavPrimerModal ? <NavPrimerModal onDismiss={dismissNavPrimerModal} /> : null}

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
        overlay={introTutorialOverlay}
        onTapContinue={introTutorialTapContinue}
        highlightTalentIdForTree={highlightTalentIdForTree}
      />

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
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white"
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
    </div>
  );
}