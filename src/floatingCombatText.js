const FLOATING_COMBAT_TEXT_LIFETIME_TICKS = 22;
function pruneFloats(entries, combatElapsedTicks) {
  return entries.filter((e) => e.expiresAtCombatTick > combatElapsedTicks);
}
function diffFloats(before, after, healCrit) {
  return after.flatMap((au) => {
    const bu = before.find((x) => x.id === au.id);
    if (!bu) return [];
    const res = [];
    const dh = au.health - bu.health;
    const ds = au.shield - bu.shield;
    if (dh > 0) res.push({ unitId: au.id, amount: dh, kind: "heal", crit: healCrit });
    if (ds > 0) res.push({ unitId: au.id, amount: ds, kind: "absorb", crit: false });
    return res;
  });
}
function appendFloatingCombatDrafts(pruned, combatElapsedTicks, drafts) {
  const exp = combatElapsedTicks + FLOATING_COMBAT_TEXT_LIFETIME_TICKS;
  return pruned.concat(
    drafts.filter((a) => a.amount > 0).map((a, i) => ({
      ...a,
      id: `${combatElapsedTicks}-f${i}-${Math.random().toString(36).slice(2, 9)}`,
      amount: Math.round(a.amount),
      expiresAtCombatTick: exp
    }))
  );
}
function mergeFloats(existing, combatElapsedTicks, drafts) {
  return appendFloatingCombatDrafts(
    pruneFloats(existing, combatElapsedTicks),
    combatElapsedTicks,
    drafts
  );
}
export {
  FLOATING_COMBAT_TEXT_LIFETIME_TICKS,
  appendFloatingCombatDrafts,
  diffFloats,
  mergeFloats,
  pruneFloats
};
