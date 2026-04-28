import type { Talent } from './types.ts';
import {
  collectExclusiveSplitPairs,
  type ExclusiveSplitPair,
} from './talentSplitPairs.ts';

export const TALENT_GRID_COLS = 6;
export const TALENT_GRID_ROWS = 7;

const PCT_W = 100 / TALENT_GRID_COLS;
const PCT_H = 100 / TALENT_GRID_ROWS;

export type TalentTreeUiConnection = {
  key: string;
  parentId: string;
  childId: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  synergy: boolean;
};

export type TalentTreeUiGraph = {
  pairs: ExclusiveSplitPair[];
  pairIndexByTalentId: Map<string, number>;
  connections: TalentTreeUiConnection[];
};

function splitPairWhereBottom(
  pairs: ExclusiveSplitPair[],
  childId: string,
): ExclusiveSplitPair | undefined {
  return pairs.find((x) => x.bottom.id === childId);
}

function skipDuplicatePrereqLineToBottom(
  pairs: ExclusiveSplitPair[],
  child: Talent,
  parentId: string,
): boolean {
  const pair = splitPairWhereBottom(pairs, child.id);
  if (!pair) return false;
  const topPrereqs = pair.top.prerequisites ?? [];
  return topPrereqs.includes(parentId);
}

function anchorPctForTalent(
  t: Talent,
  pairIndex: number | undefined,
  pairs: ExclusiveSplitPair[],
): { x: string; y: string } {
  if (pairIndex !== undefined) {
    const pair = pairs[pairIndex];
    const midY = (pair.top.gridY + pair.bottom.gridY) / 2;
    return {
      x: `${pair.top.gridX * PCT_W + PCT_W / 2}%`,
      y: `${midY * PCT_H + PCT_H / 2}%`,
    };
  }
  return {
    x: `${t.gridX * PCT_W + PCT_W / 2}%`,
    y: `${t.gridY * PCT_H + PCT_H / 2}%`,
  };
}

export function pairHasAnyPoints(pair: ExclusiveSplitPair): boolean {
  return pair.top.points > 0 || pair.bottom.points > 0;
}

export function buildTalentTreeUiGraph(talents: Talent[]): TalentTreeUiGraph {
  const pairs = collectExclusiveSplitPairs(talents);
  const pairIndexByTalentId = new Map<string, number>();
  pairs.forEach((pair, i) => {
    pairIndexByTalentId.set(pair.top.id, i);
    pairIndexByTalentId.set(pair.bottom.id, i);
  });

  const byId = new Map(talents.map((t) => [t.id, t] as const));
  const connections: TalentTreeUiConnection[] = [];

  for (const child of talents) {
    const prereqs = child.prerequisites ?? [];
    for (const parentId of prereqs) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      if (skipDuplicatePrereqLineToBottom(pairs, child, parentId)) continue;

      const piP = pairIndexByTalentId.get(parent.id);
      const piC = pairIndexByTalentId.get(child.id);
      const a1 = anchorPctForTalent(parent, piP, pairs);
      const a2 = anchorPctForTalent(child, piC, pairs);
      const synergy =
        child.synergyWith?.includes(parent.id) === true ||
        parent.synergyWith?.includes(child.id) === true;

      connections.push({
        key: `${parent.id}-${child.id}`,
        parentId: parent.id,
        childId: child.id,
        x1: a1.x,
        y1: a1.y,
        x2: a2.x,
        y2: a2.y,
        synergy,
      });
    }
  }

  return { pairs, pairIndexByTalentId, connections };
}

export function prereqConnectionStroke(
  conn: TalentTreeUiConnection,
  byId: Map<string, Talent>,
  pairs: ExclusiveSplitPair[],
  pairIndexByTalentId: Map<string, number>,
  availableTalentIds: Set<string>,
): { stroke: string; strokeWidth: string; strokeDasharray: string; className?: string } {
  const parent = byId.get(conn.parentId);
  const child = byId.get(conn.childId);
  if (!parent || !child) {
    return { stroke: '#64748b', strokeWidth: '2.5', strokeDasharray: '5 4' };
  }

  const parentPairIdx = pairIndexByTalentId.get(parent.id);
  const parentPair = parentPairIdx !== undefined ? pairs[parentPairIdx] : undefined;
  const parentLit = parentPair ? pairHasAnyPoints(parentPair) : parent.points > 0;

  const childPairIdx = pairIndexByTalentId.get(child.id);
  const childPair = childPairIdx !== undefined ? pairs[childPairIdx] : undefined;
  const childLit = childPair ? pairHasAnyPoints(childPair) : child.points > 0;

  const childAvailable = availableTalentIds.has(child.id);
  const lit = parentLit && childLit;
  const strokeDasharray = parentLit ? '0' : '4';

  if (lit) {
    if (conn.synergy) {
      return {
        stroke: '#c084fc',
        strokeWidth: '4',
        strokeDasharray,
        className: 'opacity-100 drop-shadow-[0_0_10px_rgba(192,132,252,0.95)]',
      };
    }
    return {
      stroke: '#60a5fa',
      strokeWidth: '4',
      strokeDasharray,
      className: 'opacity-100 drop-shadow-[0_0_8px_rgba(96,165,250,0.9)]',
    };
  }

  if (parentLit && childAvailable) {
    return {
      stroke: conn.synergy ? '#c084fc' : '#94a3b8',
      strokeWidth: '3',
      strokeDasharray,
      className: conn.synergy
        ? 'opacity-95 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]'
        : 'opacity-95 drop-shadow-[0_0_6px_rgba(148,163,184,0.75)]',
    };
  }

  return { stroke: '#94a3b8', strokeWidth: '2.5', strokeDasharray, className: 'opacity-75' };
}

export function talentInExclusiveSplit(
  talentId: string,
  pairIndexByTalentId: Map<string, number>,
): boolean {
  return pairIndexByTalentId.has(talentId);
}
