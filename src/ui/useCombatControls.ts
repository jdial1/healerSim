import { useEffect, useCallback, type RefObject } from 'react';
import type { Dungeon, Unit } from '../types';

export type KeyboardCombatSnapshot = {
  party: Unit[];
  currentDungeon: Dungeon | null;
  activeActionBars: string[];
  targetId: string | null;
  castSpell: (spellId: string, targetId: string) => void;
};

export function useKeyboardCombatKeys(
  snapshotRef: RefObject<KeyboardCombatSnapshot | null>,
  setTargetId: (id: string | null) => void,
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const num = parseInt(key, 10);
      if (Number.isNaN(num) || num < 1 || num > 5) return;
      const s = snapshotRef.current;
      if (!s) return;
      const index = num - 1;
      if (e.shiftKey) {
        const member = s.party[index];
        if (member && member.health > 0) {
          setTargetId(member.id);
        }
        return;
      }
      if (!s.currentDungeon) return;
      const spellId = s.activeActionBars[index];
      if (!spellId) return;
      let tid = s.targetId;
      if (!tid && s.party.length > 0) {
        const tank = s.party.find((u) => u.role === 'TANK');
        if (tank) tid = tank.id;
      }
      if (tid) s.castSpell(spellId, tid);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snapshotRef, setTargetId]);
}

export function useDevXpHotkey(playerClass: import('../types').ClassType | null, addXpNextLevel: () => void) {
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
      if (!playerClass) return;
      e.preventDefault();
      addXpNextLevel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playerClass, addXpNextLevel]);
}

export function useMenuCastHandler(
  currentDungeon: Dungeon | null,
  party: Unit[],
  targetId: string | null,
  castSpellWithTutorialSignal: (spellId: string, targetIdForSpell: string) => void,
) {
  return useCallback(
    (spellId: string) => {
      if (!currentDungeon) return;
      if (!targetId && party.length > 0) {
        const tank = party.find((u) => u.role === 'TANK');
        if (tank) castSpellWithTutorialSignal(spellId, tank.id);
      } else if (targetId) {
        castSpellWithTutorialSignal(spellId, targetId);
      }
    },
    [currentDungeon, targetId, party, castSpellWithTutorialSignal],
  );
}
