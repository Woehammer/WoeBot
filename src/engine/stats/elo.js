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

// ==================================================
// STATS: TOP ELO PLAYERS
// PURPOSE: top N players by highest recorded Elo
// ==================================================
function safeStr(x) {
  return String(x ?? "").trim();
}

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
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

function getRowPlayer(row) {
  const candidates = [
    row.Player,
    row.player,
    row["Player Name"],
    row.playerName,
    row.Name,
    row.name,
  ];
  for (const c of candidates) {
    const s = safeStr(c);
    if (s) return s;
  }
  return null;
}

/**
 * Return top N players by their highest Elo seen in these rows.
 * Also returns how many lists they appear in for this faction slice.
 */
export function topEloPlayers(rows, topN = 3) {
  /** @type {Map<string, { player: string, elo: number, lists: number }>} */
  const best = new Map();

  for (const r of rows || []) {
    const player = getRowPlayer(r);
    const elo = getRowElo(r);
    if (!player || elo === null) continue;

    const key = player.toLowerCase();
    const cur = best.get(key);

    if (!cur) {
      best.set(key, { player, elo, lists: 1 });
    } else {
      cur.lists += 1;
      if (elo > cur.elo) cur.elo = elo;
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.elo - a.elo)
    .slice(0, topN);
}

export default { eloSummary, topEloPlayers };