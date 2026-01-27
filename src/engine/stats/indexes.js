// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

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
 */

// ==================================================
// INTERNAL STATE
// ==================================================

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
  }

  return { byFaction, byPlayer, byEvent };
}

// ==================================================
// CORE LOGIC
// ==================================================
function createService({ dataset }) {
  let indexes = {
    byFaction: new Map(),
    byPlayer: new Map(),
    byEvent: new Map(),
  };

  async function refresh() {
    const rows = dataset.getRows ? dataset.getRows() : [];
    indexes = buildIndexes(rows);
    return indexes;
  }

  function get() {
    return indexes;
  }

  return { refresh, get };
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
