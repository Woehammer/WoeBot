// ==================================================
// STATS: ELO SUMMARY
// PURPOSE: avg / median / gap
// ==================================================
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function getRowElo(row) {
  const candidates = [
    row.Elo,
    row.elo,
    row["Player Elo"],
    row.playerElo,
    row["ELO"],
  ];
  for (const c of candidates) {
    const v = n(c);
    if (v !== null) return v;
  }
  return null;
}

export function eloSummary(rows) {
  const elos = [];
  for (const r of rows || []) {
    const e = getRowElo(r);
    if (e !== null) elos.push(e);
  }

  if (!elos.length) {
    return { count: 0, average: 0, median: 0, gap: 0 };
  }

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);
  return {
    count: elos.length,
    average: avg,
    median: med,
    gap: Math.abs(avg - med),
  };
}

export default { eloSummary };