// ==================================================
// FILE: indexes.js
// PURPOSE: Build and cache fast lookup indexes over dataset rows
//          + provide common summary helpers
//          + formation slicing
//          + battleplan breakdown
//          + event aggregation
// ==================================================

import { computeWithWithout } from "./withWithout.js";

// ==================================================
// BASIC HELPERS
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
// ROW ACCESSORS
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

// ==================================================
// ROUND + BATTLEPLAN PARSING
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
// INDEX BUILDER
// ==================================================

function buildIndexes(rows) {
  const byFaction = new Map();
  const byPlayer = new Map();
  const byEvent = new Map();
  const byWarscroll = new Map();
  const byFormation = new Map();
  const byFactionFormation = new Map();

  for (const row of rows || []) {
    const factionKey = safeKey(getFaction(row));
    const playerKey = safeKey(getPlayer(row));
    const eventKey = safeKey(getEventName(row));
    const formationKey = safeKey(getFormation(row));

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
      if (!byFactionFormation.has(factionKey))
        byFactionFormation.set(factionKey, new Map());

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

  return {
    byFaction,
    byPlayer,
    byEvent,
    byWarscroll,
    byFormation,
    byFactionFormation,
  };
}

// ==================================================
// SERVICE FACTORY
// ==================================================

function createService({ dataset }) {
  let rowsCache = [];
  let indexes = {};

  async function refresh() {
    rowsCache = dataset.getRows ? dataset.getRows() : [];
    indexes = buildIndexes(rowsCache);
    return indexes;
  }

  function get() {
    return indexes;
  }

  // ==================================================
  // BASIC ROW LOOKUPS
  // ==================================================

  function factionRows(name) {
    return indexes.byFaction.get(safeKey(name)) || [];
  }

  function formationRows(name) {
    return indexes.byFormation.get(safeKey(name)) || [];
  }

  function eventRows(name) {
    return indexes.byEvent.get(safeKey(name)) || [];
  }

  function factionRowsInFormation(factionName, formationName) {
    const inner = indexes.byFactionFormation.get(safeKey(factionName));
    if (!inner) return [];
    return inner.get(safeKey(formationName)) || [];
  }

  // ==================================================
  // EVENT HELPERS
  // ==================================================

  function eventsAll() {
    const out = [];
    for (const rows of indexes.byEvent.values()) {
      const any = rows?.[0];
      const display = getEventName(any);
      if (display) out.push(String(display));
    }
    return Array.from(new Set(out));
  }

  function battlescrollsAll() {
    const out = [];
    for (const r of rowsCache || []) {
      const b = getBattlescroll(r);
      if (b) out.push(String(b));
    }
    return Array.from(new Set(out));
  }

  function battlescrollsForEvent(eventName) {
    const rows = eventRows(eventName);
    const out = [];
    for (const r of rows || []) {
      const b = getBattlescroll(r);
      if (b) out.push(String(b));
    }
    return Array.from(new Set(out));
  }

  function playersForEvent(eventName, battlescroll = null) {
    let rows = eventRows(eventName);

    if (battlescroll) {
      const want = safeKey(battlescroll);
      rows = rows.filter(
        (r) => safeKey(getBattlescroll(r)) === want
      );
    }

    const map = new Map();

    for (const r of rows) {
      const player = getPlayer(r);
      if (!player) continue;

      const key = safeKey(player);

      const cur =
        map.get(key) ?? {
          player: String(player),
          faction: String(getFaction(r) || "Unknown"),
          won: 0,
          drawn: 0,
          lost: 0,
          played: 0,
        };

      cur.won += n(r.Won);
      cur.drawn += n(r.Drawn);
      cur.lost += n(r.Lost);
      cur.played += n(r.Played);

      map.set(key, cur);
    }

    return Array.from(map.values())
      .map((p) => {
        const g = p.played || (p.won + p.drawn + p.lost);
        return {
          ...p,
          played: g,
          winRate: safeRate(p.won + 0.5 * p.drawn, g),
        };
      })
      .sort((a, b) => b.won - a.won || b.winRate - a.winRate);
  }

  // ==================================================
  // BATTLEPLAN BREAKDOWN
  // ==================================================

  function battleplanBreakdown({ scope, name, battlescroll = null, minGames = 5 } = {}) {
    if (!scope || !name) return [];

    const bsKey = battlescroll ? safeKey(battlescroll) : null;
    const mg = Number(minGames) || 1;

    let baseRows =
      scope === "faction"
        ? factionRows(name)
        : scope === "formation"
        ? formationRows(name)
        : [];

    const map = new Map();

    for (const row of baseRows) {
      if (bsKey && safeKey(getBattlescroll(row)) !== bsKey) continue;

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
        if (g.result === "W") cur.w++;
        else if (g.result === "D") cur.d++;
        else cur.l++;

        map.set(bpKey, cur);
      }
    }

    return Array.from(map.values())
      .filter((v) => v.games >= mg)
      .map((v) => ({
        ...v,
        winRate: safeRate(v.w + 0.5 * v.d, v.games),
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }

  return {
    refresh,
    get,

    factionRows,
    formationRows,
    factionRowsInFormation,
    eventRows,

    eventsAll,
    battlescrollsAll,
    battlescrollsForEvent,
    playersForEvent,

    battleplanBreakdown,
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