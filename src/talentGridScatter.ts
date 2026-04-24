import type { Talent } from './types.ts';

export type ExclusiveSplitPair = { top: Talent; bottom: Talent };

function exclusiveSplitPartner(allTalents: Talent[], t: Talent): Talent | undefined {
  const pid = t.exclusiveWith?.[0];
  if (!pid) return undefined;
  const p = allTalents.find((x) => x.id === pid);
  if (!p?.exclusiveWith?.includes(t.id)) return undefined;
  if (p.gridX !== t.gridX) return undefined;
  return p;
}

export function collectExclusiveSplitPairs(talents: Talent[]): ExclusiveSplitPair[] {
  const seen = new Set<string>();
  const out: ExclusiveSplitPair[] = [];
  for (const t of talents) {
    const p = exclusiveSplitPartner(talents, t);
    if (!p) continue;
    const key = t.id < p.id ? `${t.id}|${p.id}` : `${p.id}|${t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const top = t.gridY <= p.gridY ? t : p;
    const bottom = t.gridY <= p.gridY ? p : t;
    out.push({ top, bottom });
  }
  return out;
}

export function splitPairContaining(
  talentId: string,
  pairs: ExclusiveSplitPair[],
): ExclusiveSplitPair | undefined {
  return pairs.find((x) => x.top.id === talentId || x.bottom.id === talentId);
}

export function talentScatterKind(t: Talent): string {
  const b = t.statBonus;
  if (b && Object.keys(b).length > 0) {
    const keys = Object.keys(b) as (keyof typeof b)[];
    if (keys.length > 1) return 'stat:mixed';
    return `stat:${String(keys[0])}`;
  }
  if (t.spellId) return `spell:${t.spellId}`;
  if (t.mechanicId) return `mech:${t.mechanicId}`;
  return 'other';
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function orthAdjacentSameKindScore(
  occ: Map<string, string>,
  byId: Map<string, Talent>,
  gridCols: number,
  gridRows: number,
): number {
  let s = 0;
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const id = occ.get(cellKey(x, y));
      if (!id) continue;
      const t = byId.get(id);
      if (!t) continue;
      const k = talentScatterKind(t);
      const idR = occ.get(cellKey(x + 1, y));
      if (idR) {
        const tr = byId.get(idR);
        if (tr && talentScatterKind(tr) === k) s++;
      }
      const idD = occ.get(cellKey(x, y + 1));
      if (idD) {
        const td = byId.get(idD);
        if (td && talentScatterKind(td) === k) s++;
      }
    }
  }
  return s;
}

function permutationsOfIndices(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const used = new Array<boolean>(n);
  const cur: number[] = [];
  function dfs() {
    if (cur.length === n) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      dfs();
      cur.pop();
      used[i] = false;
    }
  }
  dfs();
  return out;
}

function combinationsPick(m: number, from: number[]): number[][] {
  if (m === 0) return [[]];
  if (from.length < m) return [];
  const [head, ...rest] = from;
  const withHead = combinationsPick(m - 1, rest).map((c) => [head, ...c]);
  const withoutHead = combinationsPick(m, rest);
  return [...withHead, ...withoutHead];
}

export function computeScatteredTalentPositions(
  talents: Talent[],
  gridCols: number,
  gridRows: number,
): Map<string, { gridX: number; gridY: number }> {
  const byId = new Map(talents.map((t) => [t.id, t]));
  const pinnedIds = new Set<string>();
  const occ = new Map<string, string>();
  const result = new Map<string, { gridX: number; gridY: number }>();

  for (const pair of collectExclusiveSplitPairs(talents)) {
    const x = pair.top.gridX;
    occ.set(cellKey(x, pair.top.gridY), pair.top.id);
    occ.set(cellKey(x, pair.bottom.gridY), pair.bottom.id);
    result.set(pair.top.id, { gridX: x, gridY: pair.top.gridY });
    result.set(pair.bottom.id, { gridX: x, gridY: pair.bottom.gridY });
    pinnedIds.add(pair.top.id);
    pinnedIds.add(pair.bottom.id);
  }

  const byRow = new Map<number, Talent[]>();
  for (const t of talents) {
    if (pinnedIds.has(t.id)) continue;
    const y = t.gridY;
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y)!.push(t);
  }
  const maxY = Math.max(0, ...talents.map((t) => t.gridY));

  for (let y = 0; y <= maxY; y++) {
    const row = byRow.get(y);
    if (!row || row.length === 0) continue;
    const sorted = [...row].sort((a, b) => a.id.localeCompare(b.id));
    const n = sorted.length;

    const blockedX = new Set<number>();
    for (let x = 0; x < gridCols; x++) {
      if (occ.has(cellKey(x, y))) blockedX.add(x);
    }
    const colIndices = Array.from({ length: gridCols }, (_, i) => i).filter((x) => !blockedX.has(x));

    if (n === 1) {
      const t = sorted[0]!;
      let bestX = -1;
      let bestSc = Infinity;
      for (const x of colIndices) {
        occ.set(cellKey(x, y), t.id);
        const sc = orthAdjacentSameKindScore(occ, byId, gridCols, gridRows);
        occ.delete(cellKey(x, y));
        if (sc < bestSc) {
          bestSc = sc;
          bestX = x;
        }
      }
      if (bestX >= 0) {
        occ.set(cellKey(bestX, y), t.id);
        result.set(t.id, { gridX: bestX, gridY: y });
      }
      continue;
    }

    if (colIndices.length < n) continue;

    const colChoices =
      n === colIndices.length ? [colIndices] : combinationsPick(n, colIndices);

    let bestLocal: Map<string, { gridX: number; gridY: number }> | null = null;
    let bestScore = Infinity;

    for (const cols of colChoices) {
      const perms = permutationsOfIndices(n);
      for (const perm of perms) {
        const trial = new Map(occ);
        const rowPos = new Map<string, { gridX: number; gridY: number }>();
        for (let i = 0; i < n; i++) {
          const t = sorted[i]!;
          const x = cols[perm[i]!]!;
          trial.set(cellKey(x, y), t.id);
          rowPos.set(t.id, { gridX: x, gridY: y });
        }
        const sc = orthAdjacentSameKindScore(trial, byId, gridCols, gridRows);
        if (sc < bestScore) {
          bestScore = sc;
          bestLocal = rowPos;
        }
      }
    }

    if (bestLocal) {
      for (const [id, p] of bestLocal) {
        occ.set(cellKey(p.gridX, p.gridY), id);
        result.set(id, p);
      }
    }
  }

  return result;
}
