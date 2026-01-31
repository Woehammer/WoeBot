// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
//          + provide common summary helpers (faction + warscroll)
//          + formation-aware slicing for /faction
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { computeWithWithout } from "./withWithout.js";

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
// HELPERS: ROW FIELD ACCESSORS
// ==================================================
function getFaction(row) {
  return row.Faction ?? row.faction ?? null;
}

function getPlayer(row) {
  return row.Player ?? row.player ?? row["Player Name"] ?? row.playerName ?? null;
}

function getEventName(row) {
  return row["Event Name"] ?? row.eventName ?? row.Event ?? row.event ?? null;
}

function getFormation(row) {
  // Make this tolerant – your sheet naming WILL change at some point.
  return (
    row["Battle Formation"] ??
    row.BattleFormation ??
    row.battleFormation ??
    row["Formation"] ??
    row.formation ??
    row["Battleformation"] ??
    null
  );
}

// ==================================================
// HELPERS: INDEX BUILDERS
// ==================================================
function buildIndexes(rows) {
  const byFaction = new Map();
  const byPlayer = new Map();
  const byEvent = new Map();

  // warscroll name lowercased -> rows that include it
  const byWarscroll = new Map();

  // formation name lowercased -> rows (all factions)
  const byFormation = new Map();

  // factionKey -> (formationKey -> rows)
  const byFactionFormation = new Map();

  for (const row of rows || []) {
    const factionRaw = getFaction(row);
    const factionKey = safeKey(factionRaw);

    const playerRaw = getPlayer(row);
    const playerKey = safeKey(playerRaw);

    const eventRaw = getEventName(row);
    const eventKey = safeKey(eventRaw);

    const formationRaw = getFormation(row);
    const formationKey = safeKey(formationRaw);

    // ------------------------------
    // INDEX: FACTION
    // ------------------------------
    if (factionKey) {
      if (!byFaction.has(factionKey)) byFaction.set(factionKey, []);
      byFaction.get(factionKey).push(row);
    }

    // ------------------------------
    // INDEX: PLAYER
    // ------------------------------
    if (playerKey) {
      if (!byPlayer.has(playerKey)) byPlayer.set(playerKey, []);
      byPlayer.get(playerKey).push(row);
    }

    // ------------------------------
    // INDEX: EVENT
    // ------------------------------
    if (eventKey) {
      if (!byEvent.has(eventKey)) byEvent.set(eventKey, []);
      byEvent.get(eventKey).push(row);
    }

    // ------------------------------
    // INDEX: FORMATION (global)
    // ------------------------------
    if (formationKey) {
      if (!byFormation.has(formationKey)) byFormation.set(formationKey, []);
      byFormation.get(formationKey).push(row);
    }

    // ------------------------------
    // INDEX: FACTION + FORMATION (nested)
    // ------------------------------
    if (factionKey && formationKey) {
      if (!byFactionFormation.has(factionKey)) byFactionFormation.set(factionKey, new Map());
      const inner = byFactionFormation.get(factionKey);

      if (!inner.has(formationKey)) inner.set(formationKey, []);
      inner.get(formationKey).push(row);
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

  return { byFaction, byPlayer, byEvent, byWarscroll, byFormation, byFactionFormation };
}

// ==================================================
// HELPERS: SUMMARIES
// ==================================================
function factionSummaryFromRows(factionName, rows, formationName = null) {
  let games = 0;
  let wins = 0;
  let lists = 0;

  for (const r of rows || []) {
    lists += 1;
    games += n(r.Played);
    wins += n(r.Won);
  }

  return {
    faction: factionName,
    formation: formationName,
    lists,
    games,
    wins,
    winRate: safeRate(wins, games),
  };
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
    byFormation: new Map(),
    byFactionFormation: new Map(),
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
  function warscrollRows(warscrollName) {
    const key = safeKey(warscrollName);
    return indexes.byWarscroll.get(key) || [];
  }

  function factionRows(factionName) {
    const key = safeKey(factionName);
    return indexes.byFaction.get(key) || [];
  }

  function factionRowsInFormation(factionName, formationName) {
    const fKey = safeKey(factionName);
    const formKey = safeKey(formationName);
    const inner = indexes.byFactionFormation.get(fKey);
    if (!inner) return [];
    return inner.get(formKey) || [];
  }

  // --------------------------------------------------
  // FORMATION LISTS (for autocomplete)
  // --------------------------------------------------
  function formationsAll() {
    // return display names
    const out = [];
    for (const rows of indexes.byFormation.values()) {
      const any = rows?.[0];
      const display = getFormation(any);
      if (display) out.push(String(display));
    }
    return Array.from(new Set(out));
  }

  function formationsForFaction(factionName) {
    const fKey = safeKey(factionName);
    const inner = indexes.byFactionFormation.get(fKey);
    if (!inner) return [];

    const out = [];
    for (const rows of inner.values()) {
      const any = rows?.[0];
      const display = getFormation(any);
      if (display) out.push(String(display));
    }
    return Array.from(new Set(out));
  }

  // --------------------------------------------------
  // SUMMARIES
  // --------------------------------------------------
  function warscrollSummary(warscrollName, topN = 3) {
    return computeWithWithout({ rows: rowsCache, warscrollName, topN });
  }

  function factionSummary(factionName) {
    const rows = factionRows(factionName);
    return factionSummaryFromRows(factionName, rows);
  }

  function factionSummaryInFormation(factionName, formationName) {
    const rows = factionRowsInFormation(factionName, formationName);
    return factionSummaryFromRows(factionName, rows, formationName);
  }

  function warscrollSummaryInFaction(warscrollName, factionName, topN = 3) {
    const rows = factionRows(factionName);
    return computeWithWithout({ rows, warscrollName, topN });
  }

  return {
    refresh,
    get,

    // rows
    warscrollRows,
    factionRows,
    factionRowsInFormation,

    // summaries
    warscrollSummary,
    factionSummary,
    factionSummaryInFormation,
    warscrollSummaryInFaction,

    // formation helpers
    formationsAll,
    formationsForFaction,
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