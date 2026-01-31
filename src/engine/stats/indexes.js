// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
//          + provide common summary helpers (faction + warscroll + players)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { computeWithWithout } from "./withWithout.js";
import { rankPlayersInFaction } from "./playerRankings.js";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

/**
 * @typedef {Object} IndexService
 * @property {Function} refresh
 * @property {Function} get
 * @property {Function} warscrollRows
 * @property {Function} warscrollSummary
 * @property {Function} factionRows
 * @property {Function} factionSummary
 * @property {Function} factionPlayerRankings
 * @property {Function} factionTopEloPlayers
 * @property {Function} warscrollSummaryInFaction
 */

// ==================================================
// HELPERS: BASIC NORMALISATION
// ==================================================
function safeKey(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function safeRate(num, den) {
  return den > 0 ? num / den : 0;
}

// ==================================================
// HELPERS: INDEX BUILDERS
// ==================================================
function buildIndexes(rows) {
  const byFaction = new Map();
  const byPlayer = new Map();
  const byEvent = new Map();

  // Warscroll index (name lowercased -> rows that include it)
  const byWarscroll = new Map();

  for (const row of rows || []) {
    const faction = safeKey(row.Faction ?? row.faction);
    const player = safeKey(row.Player ?? row.player);
    const eventName = safeKey(row["Event Name"] ?? row.eventName ?? row.event);

    // ------------------------------
    // INDEX: FACTION
    // ------------------------------
    if (faction) {
      if (!byFaction.has(faction)) byFaction.set(faction, []);
      byFaction.get(faction).push(row);
    }

    // ------------------------------
    // INDEX: PLAYER
    // ------------------------------
    if (player) {
      if (!byPlayer.has(player)) byPlayer.set(player, []);
      byPlayer.get(player).push(row);
    }

    // ------------------------------
    // INDEX: EVENT
    // ------------------------------
    if (eventName) {
      if (!byEvent.has(eventName)) byEvent.set(eventName, []);
      byEvent.get(eventName).push(row);
    }

    // ------------------------------
    // INDEX: WARSCROLL (from parsed list units)
    // ------------------------------
    const units = row.__units || [];
    for (const u of units) {
      const key = safeKey(u);
      if (!key) continue;
      if (!byWarscroll.has(key)) byWarscroll.set(key, []);
      byWarscroll.get(key).push(row);
    }
  }

  return { byFaction, byPlayer, byEvent, byWarscroll };
}

// ==================================================
// CORE LOGIC: SERVICE FACTORY
// ==================================================
function createService({ dataset }) {
  let rowsCache = [];
  let indexes = {
    byFaction: new Map(),
    byPlayer: new Map(),
    byEvent: new Map(),
    byWarscroll: new Map(),
  };

  // --------------------------------------------------
  // REFRESH
  // --------------------------------------------------
  async function refresh() {
    rowsCache = dataset.getRows ? dataset.getRows() : [];
    indexes = buildIndexes(rowsCache);
    return indexes;
  }

  // --------------------------------------------------
  // GET (RAW INDEX ACCESS)
  // --------------------------------------------------
  function get() {
    return indexes;
  }

  // --------------------------------------------------
  // ROW LOOKUPS
  // --------------------------------------------------

  /**
   * Return rows that include a given warscroll (canonical name).
   */
  function warscrollRows(warscrollName) {
    const key = safeKey(warscrollName);
    return indexes.byWarscroll.get(key) || [];
  }

  /**
   * Return rows for a given faction name.
   */
  function factionRows(factionName) {
    const key = safeKey(factionName);
    return indexes.byFaction.get(key) || [];
  }

  // --------------------------------------------------
  // SUMMARIES
  // --------------------------------------------------

  /**
   * Full with/without summary for a warscroll, using ALL rows.
   * (Win rates use games, co-includes use list counts)
   */
  function warscrollSummary(warscrollName, topN = 3) {
    return computeWithWithout({
      rows: rowsCache,
      warscrollName,
      topN,
    });
  }

  /**
   * Summary for a faction baseline (games + wins + winRate).
   * Uses Played/Won totals across ALL rows for that faction.
   */
  function factionSummary(factionName) {
    const rows = factionRows(factionName);

    let games = 0;
    let wins = 0;
    let lists = 0;

    for (const r of rows) {
      lists += 1;
      games += n(r.Played);
      wins += n(r.Won);
    }

    return {
      faction: factionName,
      lists,
      games,
      wins,
      winRate: safeRate(wins, games),
    };
  }

  /**
   * Player rankings inside a faction (based on Closing Elo).
   * No minimums: anyone appearing in this battlescroll slice is included.
   */
  function factionPlayerRankings(factionName, topN = 50) {
    const rows = factionRows(factionName);
    return rankPlayersInFaction({ rows, topN });
  }

  /**
   * Convenience: top N Elo players in faction.
   */
  function factionTopEloPlayers(factionName, topN = 3) {
    return factionPlayerRankings(factionName, topN);
  }

  /**
   * With/without summary for a warscroll scoped to a faction only.
   * (This is the one you want for /warscroll.)
   */
  function warscrollSummaryInFaction(warscrollName, factionName, topN = 3) {
    const rows = factionRows(factionName);
    return computeWithWithout({
      rows,
      warscrollName,
      topN,
    });
  }

  return {
    refresh,
    get,
    warscrollRows,
    warscrollSummary,
    factionRows,
    factionSummary,
    factionPlayerRankings,
    factionTopEloPlayers,
    warscrollSummaryInFaction,
  };
}

// ==================================================
// PUBLIC API
// ==================================================
export function createIndexService({ dataset }) {
  if (!dataset) throw new Error("[indexes] dataset is required");
  return createService({ dataset });
}

// ==================================================
// EXPORTS
// ==================================================
export default { createIndexService };