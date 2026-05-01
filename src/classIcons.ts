import type { ClassType } from './types.ts';
import { classTheme } from './classTheme.ts';
import { ClassRegistry } from './classes/index.ts';

function classIconFile(cls: ClassType): string {
  return ClassRegistry.getMetadata(cls)?.portraitIcon?.split('/').pop()?.replace('.svg', '') ?? 'default';
}

export function classIconUrl(cls: ClassType): string {
  const iconFile = classIconFile(cls);
  return `${import.meta.env.BASE_URL}icons/class-icons/${iconFile}.png`;
}

export function classIconBorderClass(cls: ClassType): string {
  return classTheme(cls).iconFrame;
}

export function classIconTransformClass(cls: ClassType): string {
  return ClassRegistry.getMetadata(cls)?.uiTransform ?? '';
}

export function classIconWrapperTransformClass(): string {
  return '-rotate-3 transform';
}