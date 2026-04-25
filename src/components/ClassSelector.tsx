/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClassType } from '../types.ts';
import type { ClassUiRow } from '../classUiData.ts';
import { ClassPickList } from './ClassPickList.tsx';

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
    />
  );
}
