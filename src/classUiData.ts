import { Leaf, Shield, Sun, type LucideIcon } from 'lucide-react';
import classesData from './data/classes.json';
import type { ClassType } from './types.ts';

const ICON_BY_KEY: Record<string, LucideIcon> = {
  sun: Sun,
  leaf: Leaf,
  shield: Shield,
};

export type ClassUiRow = {
  id: ClassType;
  name: string;
  description: string;
  iconKey: string;
  color: string;
  textColor: string;
  hoverBorderClass: string;
  jsonLocked: boolean;
  portraitUrl: string;
  portraitIcon: string;
  portraitGlow: string;
  icon: LucideIcon;
};

export function classUiRows(): ClassUiRow[] {
  return classesData.selector.map((row) => ({
    id: row.id as ClassType,
    name: row.name,
    description: row.description,
    iconKey: row.iconKey,
    color: row.color,
    textColor: row.textColor,
    hoverBorderClass: row.hoverBorderClass,
    jsonLocked: row.locked,
    portraitUrl: row.portraitUrl,
    portraitIcon: row.portraitIcon,
    portraitGlow: row.portraitGlow,
    icon: ICON_BY_KEY[row.iconKey],
  }));
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
