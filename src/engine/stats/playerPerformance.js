// ==================================================
// STATS: PLAYER PERFORMANCE (RECORD DISTRIBUTION)
// PURPOSE: % breakdown of final records (e.g. 5-0, 4-1)
// NOTE: Uses row fields: Played, Won, Drawn
// ==================================================

// ==================================================
// HELPERS
// ==================================================
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function safeRate(num, den) {
  return den > 0 ? num / den : 0;
}

function recordLabel({ won, drawn, lost }) {
  // If you ever get draws, show W-L-D so it’s not misleading
  return drawn > 0 ? `${won}-${lost}-${drawn}` : `${won}-${lost}`;
}

function recordSortKey(label) {
  // Prefer sensible order for common 5-round events:
  // 5-0, 4-1, 3-2, 2-3, 1-4, 0-5
  const preferred = ["5-0", "4-1", "3-2", "2-3", "1-4", "0-5"];
  const i = preferred.indexOf(label);
  return i >= 0 ? i : 999;
}

// ==================================================
// CORE LOGIC
// ==================================================
/**
 * Build record distribution for a set of rows (attendees).
 *
 * @param {Array<Object>} rows
 * @returns {{
 *   total: number,
 *   items: Array<{ record: string, count: number, pct: number }>
 * }}
 */
export function playerPerformance(rows) {
  const counts = new Map();
  let total = 0;

  for (const r of rows || []) {
    const played = n(r.Played);
    const won = n(r.Won);
    const drawn = n(r.Drawn);
    if (played <= 0) continue;

    const lost = Math.max(0, played - won - drawn);

    const rec = recordLabel({ won, drawn, lost });
    counts.set(rec, (counts.get(rec) ?? 0) + 1);
    total += 1;
  }

  let items = Array.from(counts.entries()).map(([record, count]) => ({
    record,
    count,
    pct: safeRate(count, total),
  }));

  // If it looks like a 5-round set, use the canonical order.
  const hasFiveRoundLabels = items.some((x) =>
    ["5-0", "4-1", "3-2", "2-3", "1-4", "0-5"].includes(x.record)
  );

  items = items.sort((a, b) => {
    if (hasFiveRoundLabels) {
      return recordSortKey(a.record) - recordSortKey(b.record);
    }
    // fallback: most common first
    return b.count - a.count;
  });

  return { total, items };
}

// ==================================================
// EXPORTS
// ==================================================
export default { playerPerformance };