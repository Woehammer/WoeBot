// ==================================================
// STATS: WITH / WITHOUT
// PURPOSE: Compare performance with vs without a unit
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

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

// ==================================================
// CALCULATION LOGIC
// ==================================================

/**
 * Compute with/without stats for a warscroll.
 *
 * Weighting rules:
 * - Win rates + games: weighted by games (Played)
 * - "Wins" is treated as: Won + 0.5 * Drawn (draws count half)
 * - Avg occurrences: per-list average (not weighted by Played)
 * - Co-includes: weighted by lists (each list counts once)
 *
 * Required row fields:
 * - Played, Won, Drawn
 * - __units: string[]
 * - __unitCounts: Record<string, number>
 *
 * @param {Object} params
 * @param {Array<Object>} params.rows
 * @param {string} params.warscrollName   canonical warscroll name
 * @param {number} [params.topN=3]
 */
export function computeWithWithout({ rows, warscrollName, topN = 3 }) {
  const target = String(warscrollName ?? "").trim();
  const targetKey = norm(target);

  let includedGames = 0;
  let includedWins = 0;     // effective wins (won + 0.5*draw)
  let includedLists = 0;

  let withoutGames = 0;
  let withoutWins = 0;      // effective wins (won + 0.5*draw)
  let withoutLists = 0;

  let occurrencesSum = 0;

  /** @type {Map<string, number>} */
  const coListCounts = new Map();

  for (const row of rows ?? []) {
    const played = n(row.Played);
    const won = n(row.Won);
    const drawn = n(row.Drawn);

    // treat draws as half
    const effWins = won + 0.5 * drawn;

    const counts = row.__unitCounts || {};
    const units = row.__units || [];

    let occ = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (norm(k) === targetKey) {
        occ = n(v);
        break;
      }
    }

    const hasIt = occ > 0;

    if (hasIt) {
      includedLists += 1;
      includedGames += played;
      includedWins += effWins;

      occurrencesSum += occ;

      for (const u of units) {
        if (!u) continue;
        if (norm(u) === targetKey) continue;
        coListCounts.set(u, (coListCounts.get(u) ?? 0) + 1);
      }
    } else {
      withoutLists += 1;
      withoutGames += played;
      withoutWins += effWins;
    }
  }

  const includedWinRate = safeRate(includedWins, includedGames);
  const withoutWinRate = safeRate(withoutWins, withoutGames);

  const avgOccurrencesPerList =
    includedLists > 0 ? occurrencesSum / includedLists : 0;

  const topCoIncludes = Array.from(coListCounts.entries())
    .map(([name, listsTogether]) => ({ name, listsTogether }))
    .sort((a, b) => b.listsTogether - a.listsTogether)
    .slice(0, topN);

  return {
    warscroll: target,

    included: {
      lists: includedLists,
      games: includedGames,
      wins: includedWins, // effective wins
      winRate: includedWinRate,
      avgOccurrencesPerList,
      topCoIncludes,
    },

    without: {
      lists: withoutLists,
      games: withoutGames,
      wins: withoutWins, // effective wins
      winRate: withoutWinRate,
    },
  };
}

// ==================================================
// EXPORTS
// ==================================================
export default { computeWithWithout };