/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClassType } from '../types.ts';
import { levelFromTotalXp, type RosterV2 } from '../gameStorage.ts';
import { ClassPickList } from './ClassPickList.tsx';
import type { ClassUiRow } from '../classUiData.ts';

interface CharacterRosterProps {
  roster: RosterV2;
  paladinUnlocked: boolean;
  onContinue: (cls: ClassType) => void;
  onCreate: (cls: ClassType) => void;
}

export function CharacterRoster({ roster, paladinUnlocked, onContinue, onCreate }: CharacterRosterProps) {
  return (
    <ClassPickList
      title={
        <>
          HEALER <br /> <span className="text-blue-500">ROSTER</span>
        </>
      }
      isRowLocked={(row: ClassUiRow) => row.id === 'PALADIN' && !paladinUnlocked}
      onRowActivate={(cls) => {
        const saved = roster.byClass[cls];
        if (saved) onContinue(cls);
        else onCreate(cls);
      }}
      subline={(row) => {
        const saved = roster.byClass[row.id];
        const level = saved ? levelFromTotalXp(saved.xp) : null;
        const locked = row.id === 'PALADIN' && !paladinUnlocked;
        const hasSave = !!saved;
        if (hasSave) {
          return (
            <>
              LVL <span className="text-white">{level}</span>
            </>
          );
        }
        if (locked) return '—';
        return <span className="text-slate-500">New character</span>;
      }}
    />
  );
}
