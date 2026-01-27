// ==================================================
// FILE: env.js
// PURPOSE: Load and validate environment variables
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

// ==================================================
// CONSTANTS / CONFIG
// ==================================================
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

/**
 * @typedef {Object} Env
 * @property {string} DISCORD_TOKEN
 * @property {string} [DISCORD_CLIENT_ID]
 * @property {string} [DISCORD_GUILD_ID]
 * @property {string} AOS_BATTLESCROLL_ID
 * @property {string} AOS_DB_SHEET_CSV_URL
 * @property {number} [CACHE_TTL_SECONDS]
 * @property {boolean} [REGISTER_COMMANDS_ON_BOOT]
 */

// ==================================================
// INTERNAL STATE
// ==================================================

// ==================================================
// HELPERS
// ==================================================

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`[env] Missing required var: ${name}`);
  return String(v).trim();
}

function optional(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function toInt(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function resolveAoSCsvUrl(battlescrollId) {
  const id = String(battlescrollId || "").trim().toUpperCase();
  if (!id) throw new Error("[env] Missing required var: AOS_BATTLESCROLL_ID");

  const key = `AOS_DB_SHEET_${id}_CSV_URL`;
  const url = process.env[key];

  if (!url || !String(url).trim()) {
    throw new Error(`[env] Missing required var: ${key}`);
  }

  return String(url).trim();
}

// ==================================================
// CORE LOGIC
// ==================================================

function buildEnv() {
  const AOS_BATTLESCROLL_ID = required("AOS_BATTLESCROLL_ID");
  const AOS_DB_SHEET_CSV_URL = resolveAoSCsvUrl(AOS_BATTLESCROLL_ID);

  return {
    DISCORD_TOKEN: required("DISCORD_TOKEN"),
    DISCORD_CLIENT_ID: optional("DISCORD_CLIENT_ID"),
    DISCORD_GUILD_ID: optional("DISCORD_GUILD_ID"),

    AOS_BATTLESCROLL_ID,
    AOS_DB_SHEET_CSV_URL,

    CACHE_TTL_SECONDS: toInt(optional("CACHE_TTL_SECONDS"), undefined),
    REGISTER_COMMANDS_ON_BOOT: toBool(optional("REGISTER_COMMANDS_ON_BOOT"), false),
  };
}

// ==================================================
// PUBLIC API
// ==================================================

export function loadEnv() {
  return buildEnv();
}

// ==================================================
// EXPORTS
// ==================================================