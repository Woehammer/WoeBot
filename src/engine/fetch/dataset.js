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
// TYPES / SHAPES (JSDoc)
// ==================================================

/**
 * @typedef {Object} DatasetMeta
 * @property {string} csvUrl
 * @property {number} ttlSeconds
 * @property {number|null} lastFetchedAtMs
 * @property {number|null} rowCount
 */

/**
 * @typedef {Object.<string, any>} DatasetRow
 */

// ==================================================
// INTERNAL STATE
// ==================================================

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
  const res = await fetch(csvUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`[dataset] CSV fetch failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function parseCsvToRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true, // numeric columns become numbers (Played/Won/etc.)
  });

  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`[dataset] CSV parse error: ${first.message}`);
  }

  return parsed.data || [];
}

// ==================================================
// CORE LOGIC
// ==================================================
function createService({ csvUrl, ttlSeconds = DEFAULT_TTL_SECONDS, system }) {
  if (!csvUrl) throw new Error("[dataset] csvUrl is required");
  if (!system) throw new Error("[dataset] system is required");

  /** @type {DatasetRow[]} */
  let rows = [];
  /** @type {DatasetMeta} */
  let meta = {
    csvUrl,
    ttlSeconds,
    lastFetchedAtMs: null,
    rowCount: null,
  };

  async function refresh(force = false) {
    if (!force && !isStale(meta.lastFetchedAtMs, ttlSeconds)) return;

    const csvText = await fetchCsvText(csvUrl);
    const rawRows = parseCsvToRows(csvText);

    // Attach __units / __unitCounts once here (so stats are fast)
    rows = enrichRowsWithParsedLists(rawRows, system);

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

// ==================================================
// EXPORTS
// ==================================================
export default { createDatasetService };
