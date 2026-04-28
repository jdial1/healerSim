/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClassType } from '../types.ts';
import type { ClassUiRow } from '../classUiData.ts';
import { ClassPickList } from './ClassPickList.tsx';
import { GameIcon } from './GameIcon.tsx';
import { sentenceCaseLabel } from '../gameUiText.ts';

interface ClassSelectorProps {
  onSelect: (cls: ClassType) => void;
}

export function ClassSelector({ onSelect }: ClassSelectorProps) {
  return (
    <ClassPickList
      title={
        <>
          SELECT <br /> <span className="text-blue-500">YOUR CLASS</span>
        </>
      }
      isRowLocked={(row: ClassUiRow) => row.jsonLocked}
      onRowActivate={onSelect}
      showDescription
      subline={(row) => (
        <span className="flex items-center gap-2 text-left">
          <GameIcon iconPath={row.passiveTraitIcon} glow="spell" size="sm" />
          <span>
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Class trait
            </span>
            <span className="text-xs font-semibold text-slate-200">{sentenceCaseLabel(row.passiveTraitName)}</span>
          </span>
        </span>
      )}
    />
  );
}
