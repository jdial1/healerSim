/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClassType } from '../types.ts';
import { levelFromTotalXp, type RosterV2 } from '../gameStorage.ts';
import { ClassPickList } from './ClassPickList.tsx';
import type { ClassUiRow } from '../classUiData.ts';
import { GameIcon } from './GameIcon.tsx';
import { sentenceCaseLabel } from '../gameUiText.ts';

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
          <span className="inline-block tracking-[0.11em] [font-kerning:normal]">THE ORDER</span>
        </>
      }
      subtitle="Select your path"
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
        const passive = (
          <span className="flex items-center gap-2">
            <GameIcon iconPath={row.passiveTraitIcon} glow="spell" size="xs" />
            <span className="text-[11px] font-semibold leading-tight text-slate-300">
              {sentenceCaseLabel(row.passiveTraitName)}
            </span>
          </span>
        );
        if (hasSave) {
          return (
            <div className="space-y-1.5">
              <div className="font-semibold tracking-[0.04em] text-slate-400">
                <span className="tabular-nums">Lvl&nbsp;</span>
                <span className="font-bold tabular-nums text-slate-100">{level}</span>
              </div>
              {passive}
            </div>
          );
        }
        if (locked) return '—';
        return (
          <div className="space-y-1.5">
            <span className="text-slate-500">Initiate</span>
            {passive}
          </div>
        );
      }}
    />
  );
}
