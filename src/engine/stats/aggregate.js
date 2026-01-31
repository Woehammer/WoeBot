// ==================================================
// STATS: AGGREGATE
// PURPOSE: faction performance buckets + most-used warscrolls
// ==================================================
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function safeRate(num, den) {
  return den > 0 ? num / den : 0;
}

export function recordDistribution(rows) {
  const counts = new Map();
  const totalLists = (rows || []).length;

  for (const r of rows || []) {
    const p = n(r.Played);
    const w = n(r.Won);
    const d = n(r.Drawn);
    const l = Math.max(0, p - w - d);

    // If any draws exist, use W-L-D so we don’t pretend draws don’t exist.
    const key = d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return { totalLists, counts };
}

export function mostUsedWarscrolls(rows, topN = 3) {
  const totalLists = (rows || []).length;
  const usage = new Map(); // warscroll -> lists included

  for (const r of rows || []) {
    const units = r.__units || [];
    const unique = new Set(units.map((u) => String(u || "").trim()).filter(Boolean));
    for (const u of unique) {
      usage.set(u, (usage.get(u) ?? 0) + 1);
    }
  }

  return Array.from(usage.entries())
    .map(([name, lists]) => ({
      name,
      lists,
      usedPct: safeRate(lists, totalLists),
    }))
    .sort((a, b) => b.usedPct - a.usedPct)
    .slice(0, topN);
}

export default { recordDistribution, mostUsedWarscrolls };