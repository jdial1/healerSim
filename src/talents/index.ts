import { ClassType, Talent } from '../types.ts';
import { ClassRegistry } from '../classes/index.ts';

/**
 * KISS: Dynamic clone of talents for the requested class
 */
export function cloneTalentsForClass(cls: ClassType): Talent[] {
  const src = ClassRegistry.getTalents(cls);
  return src.map((t: Talent) => ({ ...t }));
}