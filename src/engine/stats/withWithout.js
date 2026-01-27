// ==================================================
// STATS: WITH / WITHOUT
// PURPOSE: Compare performance WITH vs WITHOUT a warscroll
//          (scoped to the warscroll's faction only)
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
 * Scope rules:
 * - "With"  = lists from the SAME FACTION that include the warscroll
 * - "Without" = lists from the SAME FACTION that do NOT include the warscroll
 *
 * Weighting rules:
 * - Games / wins: weighted by Played / Won
 * - Avg occurrences: per-list average (not game-weighted)
 * - Co-includes: weighted by lists (each list counts once)
 *
 * Required row fields:
 * - Played, Won
 * - Faction
 * - __units: string[]
 * - __unitCounts: Record<string, number>
 *
 * @param {Object} params
 * @param {Array<Object>} params.rows
 * @param {string} params.warscrollName   Canonical warscroll name
 * @param {string} params.faction         Canonical faction name
 * @param {number} [params.topN=3]
 */
export function computeWithWithout({
  rows,
  warscrollName,
  faction,
  topN = 3,
}) {
  const target = String(warscrollName ?? "").trim();
  const targetKey = norm(target);
  const factionKey = norm(faction);

  let includedGames = 0;
  let includedWins = 0;
  let includedLists = 0;

  let withoutGames = 0;
  let withoutWins = 0;
  let withoutLists = 0;

  let occurrencesSum = 0;

  /** @type {Map<string, number>} */
  const coListCounts = new Map();

  for (const row of rows ?? []) {
    // ----------------------------------------------
    // FACTION SCOPE (critical)
    // ----------------------------------------------
    const rowFaction = norm(row.Faction ?? row.faction);
    if (rowFaction !== factionKey) continue;

    const played = n(row.Played);
    const won = n(row.Won);

    const counts = row.__unitCounts || {};
    const units = row.__units || [];

    // ----------------------------------------------
    // OCCURRENCE DETECTION
    // ----------------------------------------------
    let occ = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (norm(k) === targetKey) {
        occ = n(v);
        break;
      }
    }

    const hasIt = occ > 0;

    // ----------------------------------------------
    // WITH
    // ----------------------------------------------
    if (hasIt) {
      includedLists += 1;
      includedGames += played;
      includedWins += won;
      occurrencesSum += occ;

      // Co-includes (count once per list)
      for (const u of units) {
        if (!u) continue;
        if (norm(u) === targetKey) continue;

        coListCounts.set(u, (coListCounts.get(u) ?? 0) + 1);
      }
    }
    // ----------------------------------------------
    // WITHOUT
    // ----------------------------------------------
    else {
      withoutLists += 1;
      withoutGames += played;
      withoutWins += won;
    }
  }

  // ==================================================
  // DERIVED METRICS
  // ==================================================

  const includedWinRate = safeRate(includedWins, includedGames);
  const withoutWinRate = safeRate(withoutWins, withoutGames);

  const avgOccurrencesPerList =
    includedLists > 0 ? occurrencesSum / includedLists : 0;

  const topCoIncludes = Array.from(coListCounts.entries())
    .map(([name, listsTogether]) => ({ name, listsTogether }))
    .sort((a, b) => b.listsTogether - a.listsTogether)
    .slice(0, topN);

  // ==================================================
  // OUTPUT
  // ==================================================

  return {
    warscroll: target,
    faction,

    included: {
      lists: includedLists,
      games: includedGames,
      wins: includedWins,
      winRate: includedWinRate,
      avgOccurrencesPerList,
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