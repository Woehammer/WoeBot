// ==================================================
// COMMAND: /topplayers
// PURPOSE: Top players by latest Closing Elo
//          (global or filtered by Country and/or Faction)
//          + most-used faction
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("topplayers")
  .setDescription("Shows top players by latest Closing Elo (global or filtered)")
  .addStringOption((opt) =>
    opt
      .setName("country")
      .setDescription("Country filter (optional)")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction filter (optional)")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("How many players to show (default 10, max 25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

// ==================================================
// HELPERS
// ==================================================
const HR = "──────────────";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fmt(x, dp = 0) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

function parseUKDateToTime(dateStr) {
  // Expects dd/mm/yyyy (like "28/12/2025")
  if (!dateStr) return null;

  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!dd || !mm || !yyyy) return null;

  // UTC midnight
  const t = Date.UTC(yyyy, mm - 1, dd, 0, 0, 0);
  return Number.isFinite(t) ? t : null;
}

function getPlayer(r) {
  return r.Player ?? r.player ?? null;
}

function getFaction(r) {
  return r.Faction ?? r.faction ?? null;
}

function getCountry(r) {
  return r.Country ?? r.country ?? null;
}

function getDateTime(r) {
  return parseUKDateToTime(r.Date ?? r.date ?? null);
}

function getClosingElo(r) {
  const candidates = [
    r["Closing Elo"],
    r.ClosingElo,
    r.closingElo,
    r["ClosingElo"],
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// Pull rows in a way that fits your current engine shape.
function getAllRows(engine) {
  const idx = engine?.indexes;

  if (typeof idx?.allRows === "function") return idx.allRows();
  if (typeof idx?.getAllRows === "function") return idx.getAllRows();

  const maybe = idx?.get?.();
  if (maybe?.rows && Array.isArray(maybe.rows)) return maybe.rows;

  const byFaction = maybe?.byFaction;
  if (byFaction instanceof Map) {
    const flat = [];
    for (const rows of byFaction.values()) {
      if (Array.isArray(rows)) flat.push(...rows);
    }
    return flat;
  }

  return [];
}

// ==================================================
// CORE: RANK PLAYERS
// ==================================================
function rankTopPlayers({ rows, country = null, faction = null, limit = 10 } = {}) {
  const qCountry = country ? norm(country) : null;
  const qFaction = faction ? norm(faction) : null;

  const filtered = rows.filter((r) => {
    if (qCountry && norm(getCountry(r)) !== qCountry) return false;
    if (qFaction && norm(getFaction(r)) !== qFaction) return false;
    return true;
  });

  // group rows by player
  const byPlayer = new Map();

  for (const r of filtered) {
    const player = getPlayer(r);
    if (!player) continue;

    const key = norm(player);
    const elo = getClosingElo(r);
    const dt = getDateTime(r);
    const fac = getFaction(r);

    const entry =
      byPlayer.get(key) ??
      {
        player: String(player),
        latestElo: null,
        latestDt: null,
        factionCounts: new Map(),
      };

    // most-used faction (across filtered scope)
    if (fac) {
      const fk = norm(fac);
      entry.factionCounts.set(fk, {
        name: String(fac),
        n: (entry.factionCounts.get(fk)?.n ?? 0) + 1,
      });
    }

    // latest Elo by Date
    if (Number.isFinite(elo)) {
      if (entry.latestElo === null) {
        entry.latestElo = elo;
        entry.latestDt = dt;
      } else {
        if (dt !== null && entry.latestDt !== null) {
          if (dt > entry.latestDt) {
            entry.latestElo = elo;
            entry.latestDt = dt;
          }
        } else if (dt !== null && entry.latestDt === null) {
          entry.latestElo = elo;
          entry.latestDt = dt;
        } else if (dt === null && entry.latestDt === null) {
          entry.latestElo = elo;
          entry.latestDt = null;
        }
      }
    }

    byPlayer.set(key, entry);
  }

  const list = [];
  for (const e of byPlayer.values()) {
    let bestFaction = null;
    for (const f of e.factionCounts.values()) {
      if (!bestFaction || f.n > bestFaction.n) bestFaction = f;
    }

    list.push({
      player: e.player,
      elo: e.latestElo,
      mostUsedFaction: bestFaction?.name ?? "—",
    });
  }

  // sort by Elo desc; nulls last
  list.sort((a, b) => {
    const ea = Number.isFinite(a.elo) ? a.elo : -Infinity;
    const eb = Number.isFinite(b.elo) ? b.elo : -Infinity;
    return eb - ea;
  });

  return list.slice(0, limit);
}

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, { system, engine }) {
  const focused = interaction.options.getFocused(true);
  const q = norm(focused.value);

  // ------------------------------
  // COUNTRY autocomplete
  // ------------------------------
  if (focused.name === "country") {
    const rows = getAllRows(engine);
    const seen = new Map();

    for (const r of rows) {
      const c = getCountry(r);
      if (!c) continue;
      const k = norm(c);
      if (!seen.has(k)) seen.set(k, String(c));
    }

    const choices = [...seen.values()]
      .filter((name) => !q || norm(name).includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));

    await interaction.respond(choices);
    return;
  }

  // ------------------------------
  // FACTION autocomplete
  // ------------------------------
  if (focused.name === "faction") {
    let choices = system?.lookups?.factions?.map((f) => f.name) ?? [];

    if (!choices.length) {
      const byFaction = engine?.indexes?.get?.()?.byFaction;
      if (byFaction instanceof Map) {
        choices = [...byFaction.values()]
          .map((rows) => rows?.[0]?.Faction ?? rows?.[0]?.faction)
          .filter(Boolean);
      }
    }

    await interaction.respond(
      choices
        .filter((name) => !q || norm(name).includes(q))
        .slice(0, 25)
        .map((name) => ({ name, value: name }))
    );
  }
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction, { engine }) {
  const country = interaction.options.getString("country", false);
  const faction = interaction.options.getString("faction", false);
  const limit = interaction.options.getInteger("limit", false) ?? 10;

  const rows = getAllRows(engine);
  if (!rows.length) {
    await interaction.reply({
      content: "No dataset rows available (yet).",
      ephemeral: true,
    });
    return;
  }

  const top = rankTopPlayers({ rows, country, faction, limit });

  const parts = [];
  if (country) parts.push(country);
  if (faction) parts.push(faction);

  const title = parts.length ? `Top Players — ${parts.join(" / ")}` : "Top Players — Global";

  const body = top.length
    ? top
        .map(
          (p, i) =>
            `${i + 1}) **${p.player}** — **${fmt(p.elo)}**\n` +
            `Most used: *${p.mostUsedFaction}*\n${HR}`
        )
        .join("\n")
    : "—";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields({ name: "\u200B", value: body })
    .setFooter({ text: "Woehammer GT Database" });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };