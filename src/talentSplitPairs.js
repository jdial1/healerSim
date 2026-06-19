function exclusiveSplitPartner(allTalents, t) {
  const pid = t.exclusiveWith?.[0];
  if (!pid) return void 0;
  const p = allTalents.find((x) => x.id === pid);
  if (!p?.exclusiveWith?.includes(t.id)) return void 0;
  if (p.gridX !== t.gridX) return void 0;
  return p;
}
function getSplitPairs(talents) {
  const seen = new Set();
  const out = [];
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
function getPairContaining(talentId, pairs) {
  return pairs.find((x) => x.top.id === talentId || x.bottom.id === talentId);
}
export {
  getPairContaining,
  getSplitPairs
};
