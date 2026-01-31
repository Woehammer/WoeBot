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
 * - "Wins" = Won + 0.5 * Drawn
 * - Avg occurrences: per-list average
 * - Co-includes: weighted by lists
 * - Reinforced %: % of included lists containing the word "Reinforced"
 */
export function computeWithWithout({ rows, warscrollName, topN = 3 }) {
  const target = String(warscrollName ?? "").trim();
  const targetKey = norm(target);

  let includedGames = 0;
  let includedWins = 0;
  let includedLists = 0;

  let withoutGames = 0;
  let withoutWins = 0;
  let withoutLists = 0;

  let occurrencesSum = 0;

  // NEW: reinforced tracking
  let reinforcedLists = 0;

  /** @type {Map<string, number>} */
  const coListCounts = new Map();

  for (const row of rows ?? []) {
    const played = n(row.Played);
    const won = n(row.Won);
    const drawn = n(row.Drawn);

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

      // ----------------------------------------------
      // NEW: Reinforced detection (text-based, honest)
      // ----------------------------------------------
      const listText = String(
        row.List ?? row["Refined List"] ?? ""
      ).toLowerCase();

      if (
        listText.includes(targetKey) &&
        listText.includes("reinforced")
      ) {
        reinforcedLists += 1;
      }

      // co-includes (list-weighted)
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

  const reinforcedPct =
    includedLists > 0 ? reinforcedLists / includedLists : 0;

  const topCoIncludes = Array.from(coListCounts.entries())
    .map(([name, listsTogether]) => ({ name, listsTogether }))
    .sort((a, b) => b.listsTogether - a.listsTogether)
    .slice(0, topN);

  return {
    warscroll: target,

    included: {
      lists: includedLists,
      games: includedGames,
      wins: includedWins,
      winRate: includedWinRate,
      avgOccurrencesPerList,
      reinforcedPct,          // 👈 NEW
      topCoIncludes,
    },

    without: {
      lists: withoutLists,
      games: withoutGames,
      wins: withoutWins,
      winRate: withoutWinRate,
    },
  };
}

// ==================================================
// EXPORTS
// ==================================================
export default { computeWithWithout };