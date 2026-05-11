import type { StatusEffect } from './Types';

export const POWER_INFUSION_BUFF_ID = 'power_infusion';

export function mergePowerInfusionCharges(buffs: StatusEffect[], minCharges: number): StatusEffect[] {
  const i = buffs.findIndex((b) => b.id === POWER_INFUSION_BUFF_ID);
  const cur = i >= 0 ? buffs[i].stacks : 0;
  const stacks = Math.max(cur, minCharges);
  const row: StatusEffect = {
    id: POWER_INFUSION_BUFF_ID,
    name: POWER_INFUSION_BUFF_ID,
    icon: '',
    remainingTicks: 1,
    category: 'helpful',
    sourceId: POWER_INFUSION_BUFF_ID,
    stacks,
  };
  if (i < 0) return [...buffs, row];
  const next = [...buffs];
  next[i] = { ...next[i], stacks, remainingTicks: 1 };
  return next;
}
