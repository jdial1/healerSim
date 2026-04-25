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
