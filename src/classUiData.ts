import classesData from './data/classes.json';
import type { ClassType } from './types.ts';
import { classTheme, type ClassTheme } from './classTheme.ts';

export type ClassUiRow = {
  id: ClassType;
  name: string;
  description: string;
  iconKey: string;
  iconPath: string;
  color: string;
  textColor: string;
  hoverBorderClass: string;
  jsonLocked: boolean;
  portraitUrl: string;
  portraitIcon: string;
  portraitGlow: string;
  passiveTraitName: string;
  passiveTraitDescription: string;
  passiveTraitIcon: string;
  theme: ClassTheme;
};

export function classUiRows(): ClassUiRow[] {
  return classesData.selector.map((row) => {
    const ext = row as typeof row & {
      passiveTraitName?: string;
      passiveTraitDescription?: string;
      passiveTraitIcon?: string;
    };
    return {
      id: row.id as ClassType,
      name: row.name,
      description: row.description,
      iconKey: row.iconKey,
      iconPath: row.portraitIcon,
      color: row.color,
      textColor: row.textColor,
      hoverBorderClass: row.hoverBorderClass,
      jsonLocked: row.locked,
      portraitUrl: row.portraitUrl,
      portraitIcon: row.portraitIcon,
      portraitGlow: row.portraitGlow,
      passiveTraitName: ext.passiveTraitName ?? '',
      passiveTraitDescription: ext.passiveTraitDescription ?? '',
      passiveTraitIcon: ext.passiveTraitIcon ?? 'wow/spell_holy_sealofwisdom',
      theme: classTheme(row.id as ClassType),
    };
  });
}

export function classDisplayName(cls: ClassType): string {
  const row = classesData.selector.find((r) => r.id === cls);
  return row?.name ?? cls;
}

export function classUiRowForClass(cls: ClassType): ClassUiRow {
  const row = classUiRows().find((x) => x.id === cls);
  if (!row) throw new Error(`Unknown class ${cls}`);
  return row;
}
