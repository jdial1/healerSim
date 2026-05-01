import { Unit } from './types.ts';

/**
 * Provides default status values for a Unit.
 */
export const EMPTY_SHIELD = {
  shield: 0,
  shieldTicksRemaining: 0,
} as const;

/**
 * Returns new default status values for a Unit.
 * Using a factory function ensures that each unit gets its own unique array instances for buffs and debuffs.
 */
export function getUnitStatusDefaults(): Pick<
  Unit,
  'buffs' | 'debuffs' | 'shield' | 'shieldTicksRemaining' | 'livingSeedPool'
> {
  return {
    buffs: [],
    debuffs: [],
    ...EMPTY_SHIELD,
    livingSeedPool: 0,
  };
}

/**
 * Creates a base Unit with provided properties and default status values.
 */
export function createBaseUnit(
  props: Pick<Unit, 'id' | 'name' | 'role' | 'level' | 'maxHealth' | 'health'> & Partial<Unit>,
): Unit {
  return {
    ...getUnitStatusDefaults(),
    ...props,
  };
}

/**
 * Returns a copy of the unit with all status-related fields (buffs, shields, etc.) reset to defaults.
 */
export function resetUnitStatus(unit: Unit): Unit {
  return {
    ...unit,
    ...getUnitStatusDefaults(),
  };
}
