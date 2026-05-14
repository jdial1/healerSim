import type { ClassType } from './types.ts';
import { getTheme } from './classTheme.ts';
import { ClassRegistry } from './classes/index.ts';

function classIconFile(cls: ClassType): string {
  return ClassRegistry.getMetadata(cls)?.portraitIcon?.split('/').pop()?.replace('.svg', '') ?? 'default';
}

export function getIconUrl(cls: ClassType): string {
  const iconFile = classIconFile(cls);
  return `${import.meta.env?.BASE_URL ?? '/'}icons/class-icons/${iconFile}.png`;
}

export function getBorderClass(cls: ClassType): string {
  return getTheme(cls).iconFrame;
}

export function getTransformClass(cls: ClassType): string {
  return ClassRegistry.getMetadata(cls)?.uiTransform ?? '';
}

export function getWrapperTransformClass(): string {
  return '-rotate-3 transform';
}