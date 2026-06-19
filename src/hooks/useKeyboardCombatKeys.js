import { useEffect } from "react";
function useKeyboardCombatKeys(snapshotRef, setTargetId) {
  useEffect(() => {
    const onKeyDown = (e) => {
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
        const tank = s.party.find((u) => u.role === "TANK");
        if (tank) tid = tank.id;
      }
      if (tid) s.castSpell(spellId, tid);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snapshotRef, setTargetId]);
}
export {
  useKeyboardCombatKeys
};
