import type { Dungeon } from '../types.ts';
import { blackrock_depths } from './blackrock_depths.ts';
import { deadmines } from './deadmines.ts';
import { scarlet_monastery } from './scarlet_monastery.ts';
import { scholomance } from './scholomance.ts';
import { stratholme } from './stratholme.ts';
import { sunken_temple } from './sunken_temple.ts';
import { wailing_caverns } from './wailing_caverns.ts';
import { zul_farrak } from './zul_farrak.ts';

export const DUNGEONS: Dungeon[] = [
  deadmines,
  wailing_caverns,
  scarlet_monastery,
  zul_farrak,
  sunken_temple,
  blackrock_depths,
  stratholme,
  scholomance,
];
