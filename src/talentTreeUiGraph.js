import {
  getSplitPairs
} from "./talentSplitPairs.js";
const TALENT_GRID_COLS = 6;
const TALENT_GRID_ROWS = 7;
const PCT_W = 100 / TALENT_GRID_COLS;
const PCT_H = 100 / TALENT_GRID_ROWS;
function splitPairWhereBottom(pairs, childId) {
  return pairs.find((x) => x.bottom.id === childId);
}
function skipDuplicatePrereqLineToBottom(pairs, child, parentId) {
  const pair = splitPairWhereBottom(pairs, child.id);
  if (!pair) return false;
  const topPrereqs = pair.top.prerequisites ?? [];
  return topPrereqs.includes(parentId);
}
function anchorPctForTalent(t, pairIndex, pairs) {
  if (pairIndex !== void 0) {
    const pair = pairs[pairIndex];
    const midY = (pair.top.gridY + pair.bottom.gridY) / 2;
    return {
      x: `${pair.top.gridX * PCT_W + PCT_W / 2}%`,
      y: `${midY * PCT_H + PCT_H / 2}%`
    };
  }
  return {
    x: `${t.gridX * PCT_W + PCT_W / 2}%`,
    y: `${t.gridY * PCT_H + PCT_H / 2}%`
  };
}
function pairHasAnyPoints(pair) {
  return pair.top.points > 0 || pair.bottom.points > 0;
}
function buildTalentTreeUiGraph(talents) {
  const pairs = getSplitPairs(talents);
  const pairIndexByTalentId = new Map();
  pairs.forEach((pair, i) => {
    pairIndexByTalentId.set(pair.top.id, i);
    pairIndexByTalentId.set(pair.bottom.id, i);
  });
  const byId = new Map(talents.map((t) => [t.id, t]));
  const connections = [];
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
      const synergy = child.synergyWith?.includes(parent.id) === true || parent.synergyWith?.includes(child.id) === true;
      connections.push({
        key: `${parent.id}-${child.id}`,
        parentId: parent.id,
        childId: child.id,
        x1: a1.x,
        y1: a1.y,
        x2: a2.x,
        y2: a2.y,
        synergy
      });
    }
  }
  return { pairs, pairIndexByTalentId, connections };
}
function prereqConnectionStroke(conn, byId, pairs, pairIndexByTalentId, availableTalentIds) {
  const parent = byId.get(conn.parentId);
  const child = byId.get(conn.childId);
  if (!parent || !child) {
    return { stroke: "#64748b", strokeWidth: "2.5", strokeDasharray: "5 4" };
  }
  const parentPairIdx = pairIndexByTalentId.get(parent.id);
  const parentPair = parentPairIdx !== void 0 ? pairs[parentPairIdx] : void 0;
  const parentLit = parentPair ? pairHasAnyPoints(parentPair) : parent.points > 0;
  const childPairIdx = pairIndexByTalentId.get(child.id);
  const childPair = childPairIdx !== void 0 ? pairs[childPairIdx] : void 0;
  const childLit = childPair ? pairHasAnyPoints(childPair) : child.points > 0;
  const childAvailable = availableTalentIds.has(child.id);
  const lit = parentLit && childLit;
  const strokeDasharray = parentLit ? "0" : "4";
  if (lit) {
    if (conn.synergy) {
      return {
        stroke: "#c084fc",
        strokeWidth: "4",
        strokeDasharray,
        className: "opacity-100 drop-shadow-[0_0_10px_rgba(192,132,252,0.95)]"
      };
    }
    return {
      stroke: "#60a5fa",
      strokeWidth: "4",
      strokeDasharray,
      className: "opacity-100 drop-shadow-[0_0_8px_rgba(96,165,250,0.9)]"
    };
  }
  if (parentLit && childAvailable) {
    return {
      stroke: conn.synergy ? "#c084fc" : "#94a3b8",
      strokeWidth: "3",
      strokeDasharray,
      className: conn.synergy ? "opacity-95 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" : "opacity-95 drop-shadow-[0_0_6px_rgba(148,163,184,0.75)]"
    };
  }
  return { stroke: "#94a3b8", strokeWidth: "2.5", strokeDasharray, className: "opacity-75" };
}
function talentInExclusiveSplit(talentId, pairIndexByTalentId) {
  return pairIndexByTalentId.has(talentId);
}
export {
  TALENT_GRID_COLS,
  TALENT_GRID_ROWS,
  buildTalentTreeUiGraph,
  pairHasAnyPoints,
  prereqConnectionStroke,
  talentInExclusiveSplit
};
