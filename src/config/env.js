// ==================================================
// FILE: env.js
// PURPOSE: Load and validate environment variables
// ==================================================

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`[env] Missing required var: ${name}`);
  return String(value).trim();
}

function optional(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function toInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) ? number : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function resolveAoSCsvUrl(battlescrollId) {
  const id = String(battlescrollId || "").trim().toUpperCase();
  if (!id) return optional("AOS_DB_SHEET_CSV_URL");
  return optional(`AOS_DB_SHEET_${id}_CSV_URL`, optional("AOS_DB_SHEET_CSV_URL"));
}

function buildEnv() {
  const AOS_BATTLESCROLL_ID = optional("AOS_BATTLESCROLL_ID", "JULY_2026");

  return {
    DISCORD_TOKEN: required("DISCORD_TOKEN"),
    DISCORD_CLIENT_ID: optional("DISCORD_CLIENT_ID"),
    DISCORD_GUILD_ID: optional("DISCORD_GUILD_ID"),

    AOS_DATA_SOURCE: optional("AOS_DATA_SOURCE", "website").toLowerCase(),
    AOS_STATS_BASE_URL: optional("AOS_STATS_BASE_URL", "https://raw.githubusercontent.com/Woehammer/woehammer-stats/main/public"),
    AOS_STATS_TOKEN: optional("AOS_STATS_TOKEN", optional("GITHUB_TOKEN")),
    AOS_CURRENT_GAMES_PATH: optional("AOS_CURRENT_GAMES_PATH", "aos/games.json"),
    AOS_CURRENT_LISTS_PATH: optional("AOS_CURRENT_LISTS_PATH", "aos/lists/july-2026.json"),
    AOS_BATTLESCROLL_LABEL: optional("AOS_BATTLESCROLL_LABEL", "July 2026 Battlescroll"),

    AOS_BATTLESCROLL_ID,
    AOS_DB_SHEET_CSV_URL: resolveAoSCsvUrl(AOS_BATTLESCROLL_ID),

    CACHE_TTL_SECONDS: toInt(optional("CACHE_TTL_SECONDS"), undefined),
    REGISTER_COMMANDS_ON_BOOT: toBool(optional("REGISTER_COMMANDS_ON_BOOT"), false),
  };
}

export function loadEnv() {
  return buildEnv();
}
