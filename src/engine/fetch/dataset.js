// ==================================================
// FILE: dataset.js
// PURPOSE: Load, cache, and expose canonical dataset rows
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import Papa from "papaparse";
import { enrichRowsWithParsedLists } from "../parse/parseLists.js";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================
const DEFAULT_TTL_SECONDS = 900;

// ==================================================
// HELPERS
// ==================================================
function nowMs() {
  return Date.now();
}

function isStale(lastFetchedAtMs, ttlSeconds) {
  if (!lastFetchedAtMs) return true;
  return nowMs() - lastFetchedAtMs > ttlSeconds * 1000;
}

async function fetchCsvText(csvUrl) {
  const res = await fetch(csvUrl, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`[dataset] CSV fetch failed: ${res.status} ${res.statusText}`);
  }
  // Strip UTF-8 BOM if present
  const text = await res.text();
  return text.replace(/^\uFEFF/, "");
}

function parseCsvToRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`[dataset] CSV parse error: ${first.message}`);
  }

  return parsed.data || [];
}

function safeKey(v) {
  return String(v ?? "").trim();
}

function filterByBattlescroll(rows, battlescrollId) {
  if (!battlescrollId) return rows;

  return (rows || []).filter((r) => {
    const bs = safeKey(r.Battlescroll ?? r.battlescroll ?? r["BattleScroll"]);
    return bs === battlescrollId;
  });
}

// ==================================================
// CORE LOGIC
// ==================================================
function createService({
  csvUrl,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  system,
  battlescrollId, // OPTIONAL but recommended
}) {
  if (!csvUrl) throw new Error("[dataset] csvUrl is required");
  if (!system) throw new Error("[dataset] system is required");

  let rows = [];
  let meta = {
    csvUrl,
    ttlSeconds,
    battlescrollId: battlescrollId ?? null,
    lastFetchedAtMs: null,
    rowCount: null,
  };

  async function refresh(force = false) {
    if (!force && !isStale(meta.lastFetchedAtMs, ttlSeconds)) return;

    const csvText = await fetchCsvText(csvUrl);
    const rawRows = parseCsvToRows(csvText);

    const filtered = filterByBattlescroll(rawRows, battlescrollId);

    // Attach __units / __unitCounts once here (so stats are fast)
    rows = enrichRowsWithParsedLists(filtered, system);

    meta.lastFetchedAtMs = nowMs();
    meta.rowCount = rows.length;
  }

  function getRows() {
    return rows;
  }

  function getMeta() {
    return meta;
  }

  return { refresh, getRows, getMeta };
}

// ==================================================
// PUBLIC API
// ==================================================
export function createDatasetService(options) {
  return createService(options);
}

export default { createDatasetService };