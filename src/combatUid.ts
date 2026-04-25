export type CombatUidRandom = () => number;

const UID_RANDOM_RANGE = 0x1_0000_0000;

export function generateCombatUid(prefix: string, now: number, random: CombatUidRandom): string {
  const n = Math.floor(random() * UID_RANDOM_RANGE);
  return `${prefix}-${now}-${n.toString(36)}`;
}
