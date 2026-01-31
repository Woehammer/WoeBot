// ==================================================
// STATS: WITH / WITHOUT
// PURPOSE: Compare performance with vs without a unit
//          + reinforced rate for that specific warscroll
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
 * - Reinforced%: % of INCLUDED lists where THIS warscroll has at least one reinforced occurrence
 *
 * Required row fields:
 * - Played, Won, Drawn
 * - __units: string[]
 * - __unitCounts: Record<string, number>
 * - __unitReinforcedCounts: Record<string, number>   (optional but required for reinforced stats)
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
  let includedWins = 0; // effective wins (won + 0.5*draw)
  let includedLists = 0;

  let withoutGames = 0;
  let withoutWins = 0; // effective wins (won + 0.5*draw)
  let withoutLists = 0;

  let occurrencesSum = 0; // for avg occurrences per list

  // Reinforced tracking (for THIS warscroll only)
  let reinforcedLists = 0;        // lists where target is reinforced at least once
  let reinforcedOccSum = 0;       // reinforced occurrences of target across included lists

  /** @type {Map<string, number>} */
  const coListCounts = new Map(); // other warscroll -> number of lists seen together

  for (const row of rows ?? []) {
    const played = n(row.Played);
    const won = n(row.Won);
    const drawn = n(row.Drawn);

    // treat draws as half
    const effWins = won + 0.5 * drawn;

    const counts = row.__unitCounts || {};
    const reinforcedCounts = row.__unitReinforcedCounts || {};
    const units = row.__units || [];

    // target occurrences in this list
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

      // reinforced occurrences for target in THIS list
      let rOcc = 0;
      for (const [k, v] of Object.entries(reinforcedCounts)) {
        if (norm(k) === targetKey) {
          rOcc = n(v);
          break;
        }
      }

      reinforcedOccSum += rOcc;
      if (rOcc > 0) reinforcedLists += 1;

      // co-includes (weighted by lists): count each OTHER unit once per list
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

  // % of included lists where target is reinforced at least once
  const reinforcedPct = safeRate(reinforcedLists, includedLists);

  // % of target occurrences that are reinforced (optional future stat)
  const reinforcedOccPct = safeRate(reinforcedOccSum, occurrencesSum);

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

      // reinforced (this warscroll only)
      reinforcedLists,
      reinforcedPct,
      reinforcedOccPct,
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