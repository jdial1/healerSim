/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassType, Talent } from '../types.ts';
import priestTalentsData from '../data/priest_talents.json';
import druidTalentsData from '../data/druid_talents.json';
import paladinTalentsData from '../data/paladin_talents.json';

export const PRIEST_TALENTS = priestTalentsData as Talent[];
export const DRUID_TALENTS = druidTalentsData as Talent[];
export const PALADIN_TALENTS = paladinTalentsData as Talent[];

export function cloneTalentsForClass(cls: ClassType): Talent[] {
  const src =
    cls === 'PRIEST' ? PRIEST_TALENTS : cls === 'DRUID' ? DRUID_TALENTS : PALADIN_TALENTS;
  return src.map((t) => ({ ...t }));
}
