/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, Talent } from '../types.ts';
import { PRIEST_TALENTS } from './priest.ts';
import { DRUID_TALENTS } from './druid.ts';
import { PALADIN_TALENTS } from './paladin.ts';

export { PRIEST_TALENTS, DRUID_TALENTS, PALADIN_TALENTS };

export function cloneTalentsForClass(cls: ClassType): Talent[] {
  const src =
    cls === ClassType.PRIEST ? PRIEST_TALENTS : cls === ClassType.DRUID ? DRUID_TALENTS : PALADIN_TALENTS;
  return src.map((t) => ({ ...t }));
}
