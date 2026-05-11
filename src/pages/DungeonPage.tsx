import { useCallback, useState } from 'react';
import type { Dungeon, DungeonPace } from '../types';
import { DUNGEONS } from '../dungeons/index';

interface DungeonPageProps {
  onSelect: (dungeon: Dungeon, pace: DungeonPace) => void;
  level: number;
  completedDungeonIds: string[];
}

export function DungeonPage({ onSelect, level, completedDungeonIds }: DungeonPageProps) {
  const [selectedDungeon, setSelectedDungeon] = useState<Dungeon | null>(null);
  const [selectedPace, setSelectedPace] = useState<DungeonPace>('normal');

  const handleSelect = useCallback((dungeon: Dungeon, pace: DungeonPace) => {
    onSelect(dungeon, pace);
  }, [onSelect]);

  return (
    <div className="min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
      <h2 className="ui-heading text-3xl mb-6 text-center">DUNGEONS</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DUNGEONS.map((dungeon) => (
          <div
            key={dungeon.id}
            className="ui-panel ui-state-frame p-4 rounded-lg"
          >
            <h3 className="text-xl font-bold">{dungeon.name}</h3>
            <p className="text-sm text-slate-400">Level {dungeon.levelMin}-{dungeon.levelMax}</p>
            <div className="mt-4 flex gap-2">
              <button
                className="ui-button ui-button-primary"
                onClick={() => {
                  setSelectedDungeon(dungeon);
                  setSelectedPace('normal');
                }}
              >
                Normal
              </button>
              <button
                className="ui-button ui-button-secondary"
                onClick={() => {
                  setSelectedDungeon(dungeon);
                  setSelectedPace('fast');
                }}
              >
                Fast
              </button>
            </div>
          </div>
        ))}
      </div>
      {selectedDungeon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedDungeon(null)} />
          <div className="relative z-10 rounded-lg bg-slate-900 p-6 text-white">
            <h3 className="text-xl font-bold mb-4">{selectedDungeon.name}</h3>
            <p>Enter {selectedPace} pace?</p>
            <div className="mt-4 flex gap-2">
              <button
                className="ui-button ui-button-primary"
                onClick={() => handleSelect(selectedDungeon, selectedPace)}
              >
                Enter
              </button>
              <button
                className="ui-button ui-button-secondary"
                onClick={() => setSelectedDungeon(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
