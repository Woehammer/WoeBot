// ==================================================
// FILE: dataset.js
// PURPOSE: Load, cache, and expose canonical dataset rows
// ==================================================

import Papa from "papaparse";
import { enrichRowsWithParsedLists } from "../parse/parseList.js";

const DEFAULT_TTL_SECONDS = 900;
const FACTION_ALIASES = {
  "Gloomspite Gits": "Gloomspite Gitz",
  "Hedonites of Slanesh": "Hedonites of Slaanesh",
};
const PLAYER_ALIASES = {
  "Luis Mendoza": "Luis Mendoza Jr",
};

function nowMs() {
  return Date.now();
}

function isStale(lastFetchedAtMs, ttlSeconds) {
  if (!lastFetchedAtMs) return true;
  return nowMs() - lastFetchedAtMs > ttlSeconds * 1000;
}

function safeKey(value) {
  return String(value ?? "").trim();
}

function normaliseKey(value) {
  return safeKey(value).toLowerCase().replace(/\s+/g, " ");
}

function canonicalFaction(value) {
  const faction = safeKey(value);
  return FACTION_ALIASES[faction] ?? faction;
}

function canonicalPlayer(value) {
  const player = safeKey(value);
  return PLAYER_ALIASES[player] ?? player;
}

function absoluteUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`[dataset] JSON fetch failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function fetchCsvText(csvUrl) {
  const response = await fetch(csvUrl, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`[dataset] CSV fetch failed: ${response.status} ${response.statusText}`);
  }
  return (await response.text()).replace(/^\uFEFF/, "");
}

function parseCsvToRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  if (parsed.errors?.length) {
    throw new Error(`[dataset] CSV parse error: ${parsed.errors[0].message}`);
  }
  return parsed.data || [];
}

function filterByBattlescroll(rows, battlescrollId) {
  if (!battlescrollId) return rows;
  return (rows || []).filter((row) => {
    const battlescroll = safeKey(row.Battlescroll ?? row.battlescroll ?? row.BattleScroll);
    return battlescroll === battlescrollId;
  });
}

function excelSerialToIso(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return safeKey(value);
  const date = new Date(Date.UTC(1899, 11, 30) + number * 86400000);
  return date.toISOString().slice(0, 10);
}

function runKey(event, player) {
  return `${normaliseKey(event)}::${normaliseKey(player)}`;
}

function listIndex(lists) {
  const index = new Map();
  for (const list of lists || []) {
    const key = runKey(list.event ?? list.Event, canonicalPlayer(list.player ?? list.Player));
    index.set(key, list);
  }
  return index;
}

export function websiteGamesToLegacyRows(games, lists = [], battlescrollLabel = "") {
  const groups = new Map();
  const listsByRun = listIndex(lists);

  for (const game of games || []) {
    const event = safeKey(game.event ?? game.Event);
    const player = canonicalPlayer(game.player ?? game.Player);
    if (!event || !player) continue;

    const key = runKey(event, player);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      ...game,
      event,
      player,
      faction: canonicalFaction(game.faction ?? game.Faction),
    });
  }

  const rows = [];
  for (const [key, runGames] of groups.entries()) {
    runGames.sort((a, b) => Number(a.round ?? 0) - Number(b.round ?? 0));
    const first = runGames[0];
    const last = runGames[runGames.length - 1];
    const list = listsByRun.get(key);
    const wins = runGames.filter((game) => safeKey(game.result).toUpperCase() === "W").length;
    const draws = runGames.filter((game) => safeKey(game.result).toUpperCase() === "D").length;
    const losses = runGames.filter((game) => safeKey(game.result).toUpperCase() === "L").length;

    const row = {
      Battlescroll: battlescrollLabel,
      Date: excelSerialToIso(first.date),
      "Event Name": first.event,
      Player: first.player,
      Country: safeKey(first.country ?? list?.country),
      Faction: canonicalFaction(first.faction ?? list?.faction),
      "Battle Formation": safeKey(first.formation ?? list?.formation),
      Played: runGames.length,
      Won: wins,
      Drawn: draws,
      Lost: losses,
      "Starting Elo": Number(first.elo ?? first.eventElo ?? 0),
      "Closing Elo": Number(last.closingElo ?? last.eventElo ?? first.elo ?? 0),
      "Expected Points": runGames.reduce((sum, game) => sum + Number(game.expected ?? 0), 0),
      "Expected Games": runGames.length,
      "Refined List": safeKey(list?.list ?? list?.["Refined List"]),
      "List Source": safeKey(list?.source),
    };

    runGames.slice(0, 8).forEach((game, index) => {
      const round = index + 1;
      row[`BP${round}`] = safeKey(game.battleplan);
      row[`R${round}`] = safeKey(game.result).toUpperCase();
      row[`Opponent ${round}`] = canonicalPlayer(game.opponent);
      row[`Opponent Faction ${round}`] = canonicalFaction(game.opponentFaction);
    });

    rows.push(row);
  }

  return rows.sort((a, b) =>
    String(b.Date).localeCompare(String(a.Date)) ||
    String(a["Event Name"]).localeCompare(String(b["Event Name"])) ||
    String(a.Player).localeCompare(String(b.Player))
  );
}

async function fetchWebsiteGames(baseUrl, gamesPath) {
  const manifestUrl = absoluteUrl(baseUrl, gamesPath);
  const payload = await fetchJson(manifestUrl);
  if (Array.isArray(payload)) return { games: payload, period: "" };

  const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
  if (!chunks.length) throw new Error("[dataset] Website games manifest contains no chunks");

  const chunkRows = await Promise.all(
    chunks.map((chunk) => fetchJson(new URL(chunk, manifestUrl).toString()))
  );
  return {
    games: chunkRows.flat(),
    period: safeKey(payload.period),
  };
}

async function fetchWebsiteRows({ websiteBaseUrl, gamesPath, listsPath, battlescrollLabel }) {
  const { games, period } = await fetchWebsiteGames(websiteBaseUrl, gamesPath);
  let lists = [];

  if (listsPath) {
    try {
      const payload = await fetchJson(absoluteUrl(websiteBaseUrl, listsPath));
      lists = Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.warn(`[dataset] Lists unavailable; warscroll commands will be limited: ${error.message}`);
    }
  }

  return {
    rows: websiteGamesToLegacyRows(games, lists, battlescrollLabel || period),
    gameCount: games.length,
    listCount: lists.length,
    period: battlescrollLabel || period,
  };
}

function createService({
  source = "website",
  websiteBaseUrl = "https://raw.githubusercontent.com/Woehammer/woehammer-stats/main/public",
  gamesPath = "aos/games.json",
  listsPath = "aos/lists/july-2026.json",
  battlescrollLabel = "",
  csvUrl,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  system,
  battlescrollId,
}) {
  if (!system) throw new Error("[dataset] system is required");
  if (source === "csv" && !csvUrl) throw new Error("[dataset] csvUrl is required for CSV mode");

  let rows = [];
  let meta = {
    source,
    websiteBaseUrl: source === "website" ? websiteBaseUrl : null,
    csvUrl: csvUrl ?? null,
    ttlSeconds,
    battlescrollId: battlescrollId ?? null,
    battlescrollLabel: battlescrollLabel || null,
    lastFetchedAtMs: null,
    rowCount: null,
    gameCount: null,
    listCount: null,
    fallbackUsed: false,
  };

  async function loadCsvRows() {
    const rawRows = parseCsvToRows(await fetchCsvText(csvUrl));
    return filterByBattlescroll(rawRows, battlescrollId);
  }

  async function refresh(force = false) {
    if (!force && !isStale(meta.lastFetchedAtMs, ttlSeconds)) return;

    let rawRows;
    meta.fallbackUsed = false;

    if (source === "website") {
      try {
        const website = await fetchWebsiteRows({
          websiteBaseUrl,
          gamesPath,
          listsPath,
          battlescrollLabel,
        });
        rawRows = website.rows;
        meta.gameCount = website.gameCount;
        meta.listCount = website.listCount;
        meta.battlescrollLabel = website.period || meta.battlescrollLabel;
      } catch (error) {
        if (!csvUrl) throw error;
        console.warn(`[dataset] Website source failed; using CSV fallback: ${error.message}`);
        rawRows = await loadCsvRows();
        meta.fallbackUsed = true;
      }
    } else {
      rawRows = await loadCsvRows();
    }

    rows = enrichRowsWithParsedLists(rawRows, system);
    meta.lastFetchedAtMs = nowMs();
    meta.rowCount = rows.length;
  }

  return {
    refresh,
    getRows: () => rows,
    getMeta: () => ({ ...meta }),
  };
}

export function createDatasetService(options) {
  return createService(options);
}

export default { createDatasetService, websiteGamesToLegacyRows };
