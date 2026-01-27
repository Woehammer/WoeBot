// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { computeWithWithout } from "./withWithout.js";

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
 */

// ==================================================
// HELPERS
// ==================================================
function safeKey(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

function buildIndexes(rows) {
  // Minimal starter indexes (expand later)
  const byFaction = new Map();
  const byPlayer = new Map();
  const byEvent = new Map();

  // Warscroll index (canonical name lowercased -> rows that include it)
  const byWarscroll = new Map();

  for (const row of rows || []) {
    const faction = safeKey(row.Faction ?? row.faction);
    const player = safeKey(row.Player ?? row.player);
    const eventName = safeKey(row["Event Name"] ?? row.eventName ?? row.event);

    if (faction) {
      if (!byFaction.has(faction)) byFaction.set(faction, []);
      byFaction.get(faction).push(row);
    }

    if (player) {
      if (!byPlayer.has(player)) byPlayer.set(player, []);
      byPlayer.get(player).push(row);
    }

    if (eventName) {
      if (!byEvent.has(eventName)) byEvent.set(eventName, []);
      byEvent.get(eventName).push(row);
    }

    // Build warscroll index from parsed list units
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
// CORE LOGIC
// ==================================================
function createService({ dataset }) {
  let rowsCache = [];
  let indexes = {
    byFaction: new Map(),
    byPlayer: new Map(),
    byEvent: new Map(),
    byWarscroll: new Map(),
  };

  async function refresh() {
    rowsCache = dataset.getRows ? dataset.getRows() : [];
    indexes = buildIndexes(rowsCache);
    return indexes;
  }

  function get() {
    return indexes;
  }

  /**
   * Return rows that include a given warscroll (canonical name).
   */
  function warscrollRows(warscrollName) {
    const key = safeKey(warscrollName);
    return indexes.byWarscroll.get(key) || [];
  }

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

  return { refresh, get, warscrollRows, warscrollSummary };
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