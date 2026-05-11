import type { GameState, PlayerCombatStats } from '../types';
import { GameHUD, HealGrid, ActionBars } from '../components';
import { useState, useMemo, useRef } from 'react';
import { TRASH_PACK_COUNT } from '../formulas';
import {
  getBuffTicks,
  PLAYER_BUFF_MANA_REGEN_POTION,
  partyWithHealerManaRegenDisplayBuff,
} from '../combat';
import type { KeyboardCombatSnapshot } from '../ui/useCombatControls';
import { useKeyboardCombatKeys, useMenuCastHandler } from '../ui/useCombatControls';



interface CombatPageProps {
  state: GameState;
  playerCombatStats: PlayerCombatStats | null;
  cooldowns: Record<string, number>;
  onCastSpell: (spellId: string, targetId: string) => void;
  onReorderActionBar: (from: number, to: number) => void;
  onAbandonDungeon: () => void;
  onTargetSelect: (id: string | null) => void;
  introDebuffTutorialStep: boolean;
}

export function CombatPage({
  state,
  playerCombatStats,
  cooldowns,
  onCastSpell,
  onReorderActionBar,
  onAbandonDungeon,
  onTargetSelect,
  introDebuffTutorialStep,
}: CombatPageProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const handleCast = useMenuCastHandler(
    state.currentDungeon,
    state.party,
    targetId,
    onCastSpell,
  );

  const manaRegenTicksForUi = useMemo(
    () =>
      state.currentDungeon
        ? getBuffTicks(state.playerEffects, PLAYER_BUFF_MANA_REGEN_POTION)
        : 0,
    [state.currentDungeon, state.playerEffects],
  );

  const partyForHealGrid = useMemo(
    () =>
      partyWithHealerManaRegenDisplayBuff(state.party, manaRegenTicksForUi, state.level),
    [state.party, manaRegenTicksForUi, state.level],
  );

  const keyboardRef = useRef<KeyboardCombatSnapshot | null>(null);
  keyboardRef.current = {
    party: state.party,
    currentDungeon: state.currentDungeon,
    activeActionBars: state.activeActionBars,
    targetId,
    castSpell: (spellId: string, tid: string) => onCastSpell(spellId, tid),
  };
  useKeyboardCombatKeys(keyboardRef, setTargetId);

  return (
    <div className="relative flex h-dvh max-h-dvh min-h-0 flex-col">
      <div className="fixed top-3 right-3 z-[60]">
        <button
          type="button"
          onClick={onAbandonDungeon}
          className="ui-state-frame ui-state-hover flex items-center gap-1.5 rounded bg-slate-900/90 px-2.5 py-1.5 text-slate-300 shadow-sm transition-colors hover:text-red-300 sm:px-3 sm:py-2"
          aria-label="Leave dungeon"
        >
          Leave
        </button>
      </div>

      <GameHUD
        combatPhase={state.combatPhase}
        trashPacks={state.trashPulls}
        enemyHealth={state.enemyHealth}
        enemyMaxHealth={state.enemyMaxHealth}
        bossName={state.currentDungeon?.bossName ?? ''}
        trashEnemyName={
          state.currentDungeon?.enemies[TRASH_PACK_COUNT - state.trashPulls]?.name ?? ''
        }
        bossEffects={state.combatPhase === 'BOSS' ? state.bossEffects : []}
        endlessStacks={state.currentDungeon?.endless ? state.endlessStacks : undefined}
      />

      <main className="flex min-h-0 flex-1 w-full max-w-xl flex-col justify-center gap-0 self-center overflow-visible px-1 pb-1">
        <div className="flex min-h-0 flex-1 w-full max-w-md flex-col justify-center gap-1.5 px-[max(0.75rem,env(safe-area-inset-left,0px))] py-2 pe-[max(0.75rem,env(safe-area-inset-right,0px))]">
          <HealGrid
            party={partyForHealGrid}
            selectedId={targetId}
            onTargetSelect={(id) => {
              setTargetId(id);
              onTargetSelect(id);
            }}
            combatFloats={state.combatFloats}
            syncIntroDebuffTip={introDebuffTutorialStep}
            debuffTipZIndex={introDebuffTutorialStep ? 10200 : 400}
            holdIntroDebuffTip={introDebuffTutorialStep}
          />
        </div>
      </main>

      {playerCombatStats && (
        <ActionBars
          playerCombatStats={playerCombatStats}
          spellIds={state.activeActionBars}
          cooldowns={cooldowns}
          onCast={handleCast}
          allowReorder={!state.currentDungeon}
          onReorderSlots={onReorderActionBar}
          hideResourcePanels={!state.currentDungeon}
        />
      )}
    </div>
  );
}