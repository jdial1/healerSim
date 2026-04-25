import { useEffect, type RefObject } from 'react';
import type { Unit, Dungeon } from '../types.ts';

export type KeyboardCombatSnapshot = {
  party: Unit[];
  currentDungeon: Dungeon | null;
  activeActionBars: string[];
  targetId: string | null;
  castSpell: (spellId: string, targetId: string) => void;
};

export function useKeyboardCombatKeys(
  snapshotRef: RefObject<KeyboardCombatSnapshot>,
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
