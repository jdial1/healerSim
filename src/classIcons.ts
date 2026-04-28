import type { ClassType } from './types.ts';
import { classTheme } from './classTheme.ts';

const CLASS_ICON_FILE: Record<ClassType, string> = {
  PRIEST: 'priest',
  DRUID: 'druid',
  PALADIN: 'paladin',
};

const CLASS_ICON_TRANSFORM_CLASS: Record<ClassType, string> = {
  PRIEST: '',
  DRUID: '-rotate-[22deg] -scale-x-100',
  PALADIN: '',
};

const CLASS_ICON_WRAPPER_TRANSFORM_CLASS = '-rotate-3 transform';

export function classIconUrl(cls: ClassType): string {
  return `${import.meta.env.BASE_URL}icons/class-icons/${CLASS_ICON_FILE[cls]}.png`;
}

export function classIconBorderClass(cls: ClassType): string {
  return classTheme(cls).iconFrame;
}

export function classIconTransformClass(cls: ClassType): string {
  return CLASS_ICON_TRANSFORM_CLASS[cls];
}

export function classIconWrapperTransformClass(): string {
  return CLASS_ICON_WRAPPER_TRANSFORM_CLASS;
}
