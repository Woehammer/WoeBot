// ==================================================
// STATS: PLAYER RANKINGS (BY FACTION)
// PURPOSE: Build player ladder tables within a faction slice
//          (Closing Elo-based, event-aware participation counts)
// ==================================================

// ==================================================
// HELPERS
// ==================================================
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function norm(s) {
  return safeStr(s).toLowerCase();
}

function effWins(row) {
  const won = Number(row.Won ?? 0) || 0;
  const drawn = Number(row.Drawn ?? 0) || 0;
  return won + 0.5 * drawn;
}

function getClosingElo(row) {
  const candidates = [
    row["Closing Elo"],
    row.ClosingElo,
    row.closingElo,
    row["ClosingElo"],
  ];
  for (const c of candidates) {
    const v = n(c);
    if (v !== null) return v;
  }
  return null;
}

function getPlayer(row) {
  const candidates = [row.Player, row.player, row["Player Name"], row.playerName];
  for (const c of candidates) {
    const s = safeStr(c);
    if (s) return s;
  }
  return null;
}

function getEventName(row) {
  const candidates = [row["Event Name"], row.eventName, row.Event, row.event];
  for (const c of candidates) {
    const s = safeStr(c);
    if (s) return s;
  }
  return null;
}

function parseDateMs(row) {
  const raw = safeStr(row.Date ?? row.date);
  if (!raw) return null;

  // DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function eventKey(row) {
  // Stronger uniqueness: Event Name + Date (prevents reused event names year-to-year)
  const e = norm(getEventName(row) || "");
  const d = safeStr(row.Date ?? row.date);
  return d ? `${e}::${d}` : e;
}

// ==================================================
// CORE LOGIC
// ==================================================

/**
 * Build player rankings from rows already scoped to a faction.
 *
 * Ranking uses latestClosingElo by default (current ladder).
 *
 * Filters can be by games or events (recommended).
 *
 * @param {Object} params
 * @param {Array<Object>} params.rows
 * @param {number} [params.minGames=0]
 * @param {number} [params.minEvents=3]
 * @param {number} [params.topN=50]
 * @param {"latest"|"peak"} [params.mode="latest"]   latest=latestClosingElo, peak=maxClosingElo
 */
export function rankPlayersInFaction({
  rows,
  minGames = 0,
  minEvents = 3,
  topN = 50,
  mode = "latest",
}) {
  /** @type {Map<string, any>} */
  const byPlayer = new Map();

  for (const r of rows || []) {
    const player = getPlayer(r);
    if (!player) continue;

    const key = norm(player);
    const played = Number(r.Played ?? 0) || 0;
    const closing = getClosingElo(r);
    const dateMs = parseDateMs(r);
    const eKey = eventKey(r);

    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        player,

        // participation
        eventsSet: new Set(),
        events: 0,

        // raw row count if you still want it (optional)
        rows: 0,

        games: 0,
        effWins: 0,

        maxClosingElo: null,
        latestClosingElo: null,
        latestDateMs: null,
      });
    }

    const p = byPlayer.get(key);

    p.rows += 1;
    p.games += played;
    p.effWins += effWins(r);

    if (eKey) p.eventsSet.add(eKey);

    if (closing !== null) {
      p.maxClosingElo = p.maxClosingElo === null ? closing : Math.max(p.maxClosingElo, closing);

      if (dateMs !== null) {
        if (p.latestDateMs === null || dateMs > p.latestDateMs) {
          p.latestDateMs = dateMs;
          p.latestClosingElo = closing;
        }
      } else {
        p.latestClosingElo = closing;
      }
    }
  }

  const list = Array.from(byPlayer.values())
    .map((p) => {
      const events = p.eventsSet.size;
      return {
        player: p.player,
        events,
        rows: p.rows,
        games: p.games,
        winRate: p.games > 0 ? p.effWins / p.games : 0,
        maxClosingElo: p.maxClosingElo ?? 0,
        latestClosingElo: p.latestClosingElo ?? (p.maxClosingElo ?? 0),
        rankScore:
          mode === "peak"
            ? (p.maxClosingElo ?? 0)
            : (p.latestClosingElo ?? (p.maxClosingElo ?? 0)),
      };
    })
    .filter((p) => p.games >= minGames && p.events >= minEvents)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, topN);

  return list;
}

export default { rankPlayersInFaction };