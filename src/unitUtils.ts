import { Unit } from './types.ts';

/**
 * Provides default status values for a Unit.
 */
export const EMPTY_SHIELD = {
  shield: 0,
  shieldTicksRemaining: 0,
} as const;

export const UNIT_STATUS_DEFAULTS: Pick<
  Unit,
  'buffs' | 'debuffs' | 'shield' | 'shieldTicksRemaining' | 'livingSeedPool'
> = {
  buffs: [],
  debuffs: [],
  ...EMPTY_SHIELD,
  livingSeedPool: 0,
};

/**
 * Creates a base Unit with provided properties and default status values.
 */
export function createBaseUnit(
  props: Pick<Unit, 'id' | 'name' | 'role' | 'level' | 'maxHealth' | 'health'> & Partial<Unit>,
): Unit {
  return {
    ...UNIT_STATUS_DEFAULTS,
    ...props,
  };
}

/**
 * Returns a copy of the unit with all status-related fields (buffs, shields, etc.) reset to defaults.
 */
export function resetUnitStatus(unit: Unit): Unit {
  return {
    ...unit,
    ...UNIT_STATUS_DEFAULTS,
  };
}
