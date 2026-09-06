/**
 * The boss's next move: what it is, and who it can land on.
 *
 * The engine picks mechanics in strict round-robin — `kinds[ordinal % n]`, then
 * `templates[cycle % m]` (see processBossAi in gameTick.js) — so *which* ability
 * comes next is fully determined and can be shown honestly.
 *
 * Only the victims are drawn from the RNG, at the moment it fires. So this
 * reports "two of you", never "these two": naming the targets would be a guess,
 * and peeking at the RNG would desync the parity stream.
 *
 * Mirrors nextMechanic() in the Android CombatScreen.kt.
 */
function whomLabel(targeting) {
  if (targeting === "two_random") return "two of you";
  if (targeting === "all_living") return "everyone";
  return "one of you";
}
function nextMechanic(combatPhase, dungeon, mechanicOrdinal) {
  if (combatPhase !== "BOSS" || !dungeon) return null;
  const c = dungeon.bossCombat;
  if (!c) return null;
  const kinds = [];
  if (c.debuffTemplates?.length) kinds.push("debuff");
  if (c.selfBuffTemplates?.length) kinds.push("buff");
  if (c.attackTemplates?.length) kinds.push("attack");
  if (kinds.length === 0) return null;

  const kind = kinds[mechanicOrdinal % kinds.length];
  const cycle = Math.floor(mechanicOrdinal / kinds.length);
  if (kind === "debuff") {
    const t = c.debuffTemplates[cycle % c.debuffTemplates.length];
    return { icon: t.icon, name: t.name, whom: whomLabel(t.targeting) };
  }
  if (kind === "buff") {
    const t = c.selfBuffTemplates[cycle % c.selfBuffTemplates.length];
    return { icon: t.icon, name: t.name, whom: "empowers itself" };
  }
  const t = c.attackTemplates[cycle % c.attackTemplates.length];
  return { icon: t.icon, name: t.name, whom: whomLabel(t.targeting) };
}
export { nextMechanic };
