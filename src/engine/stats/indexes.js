// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
//          + provide common summary helpers (faction + warscroll)
//          + formation-aware slicing for /faction
//          + battleplan breakdown for /battleplan
//          + event helpers for /event + /list
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

function getBattlescroll(row) {
  return row.Battlescroll ?? row.battlescroll ?? null;
}

// Elo columns in your CSV: "Starting Elo", "Closing Elo", "Change"
function getStartingElo(row) {
  const candidates = [
    row["Starting Elo"],
    row.StartingElo,
    row.startingElo,
    row["StartingElo"],
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function getClosingElo(row) {
  const candidates = [
    row["Closing Elo"],
    row.ClosingElo,
    row.closingElo,
    row["ClosingElo"],
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function getEloChange(row) {
  const candidates = [
    row["Change"],
    row.Change,
    row.change,
    row["Elo Change"],
    row.eloChange,
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function getListText(row) {
  const candidates = [
    row.List,
    row.list,
    row["Army List"],
    row["army list"],
    row["Roster"],
    row.roster,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

// ==================================================
// HELPERS: BATTLEPLAN + ROUND ACCESSORS
// ==================================================
function parseRoundResult(raw) {
  const v = safeKey(raw);
  if (v === "1") return "W";
  if (v === "0") return "L";
  if (v === "d" || v === "draw" || v === "0.5") return "D";
  return null;
}

function extractBattleplanGamesFromRow(row) {
  const out = [];

  for (let i = 1; i <= 8; i++) {
    const bp =
      row[`BP${i}`] ??
      row[`bp${i}`] ??
      row[`Battleplan${i}`] ??
      row[`battleplan${i}`] ??
      null;

    if (!bp) continue;

    const res =
      row[`R${i}`] ??
      row[`r${i}`] ??
      row[`Round${i}`] ??
      row[`round${i}`] ??
      null;

    const result = parseRoundResult(res);
    if (!result) continue;

    out.push({ battleplan: String(bp).trim(), result });
  }

  return out;
}

// ==================================================
// HELPERS: INDEX BUILDERS
// ==================================================
function buildIndexes(rows) {
  const byFaction = new Map();
  const byPlayer = new Map();
  const byEvent = new Map();

  const byWarscroll = new Map();
  const byFormation = new Map();
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

    if (factionKey) {
      if (!byFaction.has(factionKey)) byFaction.set(factionKey, []);
      byFaction.get(factionKey).push(row);
    }

    if (playerKey) {
      if (!byPlayer.has(playerKey)) byPlayer.set(playerKey, []);
      byPlayer.get(playerKey).push(row);
    }

    if (eventKey) {
      if (!byEvent.has(eventKey)) byEvent.set(eventKey, []);
      byEvent.get(eventKey).push(row);
    }

    if (formationKey) {
      if (!byFormation.has(formationKey)) byFormation.set(formationKey, []);
      byFormation.get(formationKey).push(row);
    }

    if (factionKey && formationKey) {
      if (!byFactionFormation.has(factionKey)) byFactionFormation.set(factionKey, new Map());
      const inner = byFactionFormation.get(factionKey);
      if (!inner.has(formationKey)) inner.set(formationKey, []);
      inner.get(formationKey).push(row);
    }

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
// HELPERS: EVENT AGGREGATION
// ==================================================
function aggregatePlayers(rows) {
  // playerKey -> { player, faction, won, drawn, lost, played, startingElo, closingElo, change }
  const map = new Map();

  for (const r of rows || []) {
    const p = getPlayer(r);
    const pKey = safeKey(p);
    if (!pKey) continue;

    const faction = getFaction(r) ?? "Unknown";

    const won = n(r.Won ?? r.won);
    const drawn = n(r.Drawn ?? r.drawn);
    const lost = n(r.Lost ?? r.lost);

    const sElo = getStartingElo(r);
    const cElo = getClosingElo(r);
    const chg = getEloChange(r);

    const cur =
      map.get(pKey) ?? {
        player: String(p).trim(),
        faction,
        won: 0,
        drawn: 0,
        lost: 0,
        played: 0,

        // Elo (prefer actual values from CSV)
        startingElo: null,
        closingElo: null,
        change: null,
      };

    if ((cur.faction === "Unknown" || !cur.faction) && faction) cur.faction = faction;

    cur.won += won;
    cur.drawn += drawn;
    cur.lost += lost;
    cur.played += won + drawn + lost;

    // For Elo: events should usually be one row per player,
    // but if there are duplicates, keep the first valid values we see.
    if (cur.startingElo === null && Number.isFinite(sElo)) cur.startingElo = sElo;
    if (cur.closingElo === null && Number.isFinite(cElo)) cur.closingElo = cElo;
    if (cur.change === null && Number.isFinite(chg)) cur.change = chg;

    map.set(pKey, cur);
  }

  return [...map.values()];
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

  function formationRows(formationName) {
    const key = safeKey(formationName);
    return indexes.byFormation.get(key) || [];
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
  // EVENT HELPERS (for /event + /list)
  // --------------------------------------------------
  function eventsAll() {
    const out = [];
    for (const rows of indexes.byEvent.values()) {
      const any = rows?.[0];
      const display = getEventName(any);
      if (display) out.push(String(display));
    }
    return Array.from(new Set(out));
  }

  function playersAll() {
    const out = [];
    for (const rows of indexes.byPlayer.values()) {
      const any = rows?.[0];
      const display = getPlayer(any);
      if (display) out.push(String(display));
    }
    return Array.from(new Set(out));
  }

  function battlescrollsAll() {
    const out = [];
    for (const r of rowsCache || []) {
      const bs = getBattlescroll(r);
      if (bs) out.push(String(bs));
    }
    return Array.from(new Set(out));
  }

  function eventRows(eventName, battlescroll = null) {
    const eKey = safeKey(eventName);
    const base = indexes.byEvent.get(eKey) || [];
    if (!battlescroll) return base;

    const bsKey = safeKey(battlescroll);
    return base.filter((r) => safeKey(getBattlescroll(r)) === bsKey);
  }

  function battlescrollsForEvent(eventName) {
    const rows = eventRows(eventName, null);
    const out = [];
    for (const r of rows || []) {
      const bs = getBattlescroll(r);
      if (bs) out.push(String(bs));
    }
    return Array.from(new Set(out));
  }

  function playersForEvent(eventName, battlescroll = null) {
    const rows = eventRows(eventName, battlescroll);
    return aggregatePlayers(rows);
  }

  // For /list: find the single row for (event + player) and return list text + record + faction, etc.
  function listForPlayerAtEvent(playerName, eventName, battlescroll = null) {
    const pKey = safeKey(playerName);
    const rows = eventRows(eventName, battlescroll);

    // try exact match on player key first
    let match = rows.find((r) => safeKey(getPlayer(r)) === pKey) || null;

    // fallback: contains match (helps when users type partial names)
    if (!match && pKey) {
      match = rows.find((r) => safeKey(getPlayer(r)).includes(pKey)) || null;
    }

    if (!match) return null;

    const won = n(match.Won ?? match.won);
    const drawn = n(match.Drawn ?? match.drawn);
    const lost = n(match.Lost ?? match.lost);

    return {
      player: String(getPlayer(match) ?? playerName).trim(),
      event: String(getEventName(match) ?? eventName).trim(),
      battlescroll: getBattlescroll(match) ?? null,
      faction: getFaction(match) ?? "Unknown",
      record: { won, drawn, lost },
      startingElo: getStartingElo(match),
      closingElo: getClosingElo(match),
      change: getEloChange(match),
      list: getListText(match) ?? "No list text found for this row.",
      source: match.Source ?? match.source ?? null,
    };
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

  // --------------------------------------------------
  // BATTLEPLAN BREAKDOWN (for /battleplan)
  // --------------------------------------------------
  function battleplanBreakdown({ scope, name, battlescroll = null, minGames = 5 } = {}) {
    if (!scope || !name) return [];

    const bsKey = battlescroll ? safeKey(battlescroll) : null;
    const mg = Number(minGames) || 1;

    let baseRows = [];
    if (scope === "faction") baseRows = factionRows(name);
    else if (scope === "formation") baseRows = formationRows(name);
    else return [];

    const map = new Map(); // bpKey -> { battleplan, games, w, d, l }

    for (const row of baseRows) {
      if (bsKey) {
        const rowBS = getBattlescroll(row);
        if (safeKey(rowBS) !== bsKey) continue;
      }

      const games = extractBattleplanGamesFromRow(row);
      for (const g of games) {
        const bpKey = safeKey(g.battleplan);
        if (!bpKey) continue;

        const cur =
          map.get(bpKey) ?? {
            battleplan: g.battleplan,
            games: 0,
            w: 0,
            d: 0,
            l: 0,
          };

        cur.games += 1;
        if (g.result === "W") cur.w += 1;
        else if (g.result === "D") cur.d += 1;
        else if (g.result === "L") cur.l += 1;

        map.set(bpKey, cur);
      }
    }

    const out = [];
    for (const v of map.values()) {
      if (v.games < mg) continue;
      const winRate = safeRate(v.w + 0.5 * v.d, v.games);
      out.push({ ...v, winRate });
    }

    out.sort((a, b) => b.games - a.games || b.winRate - a.winRate);
    return out;
  }

  return {
    refresh,
    get,

    // rows
    warscrollRows,
    factionRows,
    formationRows,
    factionRowsInFormation,
    eventRows,

    // summaries
    warscrollSummary,
    factionSummary,
    factionSummaryInFormation,
    warscrollSummaryInFaction,

    // formation helpers
    formationsAll,
    formationsForFaction,

    // battleplan helpers
    battleplanBreakdown,

    // event helpers
    eventsAll,
    playersAll,
    battlescrollsAll,
    battlescrollsForEvent,
    playersForEvent,

    // list helper
    listForPlayerAtEvent,
  };
}

// ==================================================
// PUBLIC API
// ==================================================
export function createIndexService({ dataset }) {
  if (!dataset) throw new Error("[indexes] dataset is required");
  return createService({ dataset });
}

export default { createIndexService };