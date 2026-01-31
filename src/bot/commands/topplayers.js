// ==================================================
// COMMAND: /topplayers
// PURPOSE: Top 10 players (global or by region)
//          + most-used faction + latest Closing Elo
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
  .setDescription("Shows top players by Closing Elo (global or by region)")
  .addStringOption((opt) =>
    opt
      .setName("region")
      .setDescription("Region/country filter (optional)")
      .setRequired(false)
      .setAutocomplete(true)
  );

// ==================================================
// HELPERS
// ==================================================
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function fmt(x, dp = 0) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

function getPlayerName(r) {
  return r.Player ?? r.player ?? r.Name ?? r.name ?? null;
}

function getFactionName(r) {
  return r.Faction ?? r.faction ?? null;
}

function getRegionName(r) {
  return r.Region ?? r.Country ?? r.Nation ?? r.State ?? r.Province ?? null;
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

// If you have a date column, add it here later.
// For now: "latest" = last seen row (dataset order) fallback.
// If your dataset is sorted newest-first, this works great.
function getRowSortKey(r) {
  // Try common date fields if present:
  const d =
    r.Date ?? r.date ?? r.EventDate ?? r.eventDate ?? r["Event Date"] ?? null;

  const t = d ? Date.parse(d) : NaN;
  if (Number.isFinite(t)) return t;

  // Fallback: no date available
  return null;
}

// ==================================================
// RANKING LOGIC
// ==================================================
function rankTopPlayers({ rows, topN = 10, region = null } = {}) {
  const qRegion = region ? norm(region) : null;

  // Filter by region if requested
  const filtered = qRegion
    ? rows.filter((r) => norm(getRegionName(r)) === qRegion)
    : rows;

  // Group by player
  const byPlayer = new Map();

  for (const r of filtered) {
    const player = getPlayerName(r);
    if (!player) continue;

    const key = norm(player);
    const elo = getClosingElo(r);
    const faction = getFactionName(r);
    const regionName = getRegionName(r);

    const entry =
      byPlayer.get(key) ??
      {
        player: String(player),
        region: regionName ? String(regionName) : null,
        // We'll choose "latest" row by date if possible
        latestElo: null,
        latestKey: null,
        // Track faction counts
        factionCounts: new Map(),
        rows: 0,
      };

    entry.rows++;

    // Latest Elo selection
    const k = getRowSortKey(r);
    if (Number.isFinite(elo)) {
      if (entry.latestElo === null) {
        entry.latestElo = elo;
        entry.latestKey = k;
      } else if (k !== null && entry.latestKey !== null) {
        // date-based compare
        if (k > entry.latestKey) {
          entry.latestElo = elo;
          entry.latestKey = k;
        }
      } else if (k !== null && entry.latestKey === null) {
        // we found a dated row after undated
        entry.latestElo = elo;
        entry.latestKey = k;
      } else if (k === null && entry.latestKey === null) {
        // both undated; keep last seen (dataset order)
        entry.latestElo = elo;
        entry.latestKey = null;
      }
    }

    // Most-used faction
    if (faction) {
      const fk = norm(faction);
      entry.factionCounts.set(fk, {
        name: String(faction),
        n: (entry.factionCounts.get(fk)?.n ?? 0) + 1,
      });
    }

    byPlayer.set(key, entry);
  }

  // Build ranked list
  const list = [];
  for (const e of byPlayer.values()) {
    // Choose most-used faction
    let bestFaction = null;
    for (const f of e.factionCounts.values()) {
      if (!bestFaction || f.n > bestFaction.n) bestFaction = f;
    }

    list.push({
      player: e.player,
      elo: e.latestElo,
      faction: bestFaction?.name ?? "—",
      games: e.rows,
      region: e.region ?? "—",
    });
  }

  // Sort by Elo desc, with nulls last
  list.sort((a, b) => {
    const ea = Number.isFinite(a.elo) ? a.elo : -Infinity;
    const eb = Number.isFinite(b.elo) ? b.elo : -Infinity;
    return eb - ea;
  });

  return list.slice(0, topN);
}

// ==================================================
// AUTOCOMPLETE (REGION)
// ==================================================
export async function autocomplete(interaction, { engine }) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "region") return;

  const q = norm(focused.value);

  // Pull all rows (best-effort). If you have a better source, swap this.
  const allRows =
    engine?.indexes?.get?.()?.rows ??
    engine?.indexes?.allRows?.() ??
    [];

  const regions = new Map();
  for (const r of allRows) {
    const region = getRegionName(r);
    if (!region) continue;
    const k = norm(region);
    regions.set(k, String(region));
  }

  const choices = [...regions.values()]
    .filter((name) => !q || norm(name).includes(q))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));

  await interaction.respond(choices);
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction, { engine }) {
  const region = interaction.options.getString("region", false);

  // Pull all rows (best-effort). If you have a better source, swap this.
  const allRows =
    engine?.indexes?.get?.()?.rows ??
    engine?.indexes?.allRows?.() ??
    [];

  if (!allRows.length) {
    await interaction.reply({
      content: "No dataset rows available to rank players.",
      ephemeral: true,
    });
    return;
  }

  const top = rankTopPlayers({
    rows: allRows,
    topN: 10,
    region: region || null,
  });

  const title = region ? `Top Players — ${region}` : "Top Players — Global";

  const lines = top.length
    ? top
        .map(
          (p, i) =>
            `${i + 1}) **${p.player}** — **${fmt(p.elo)}**\n` +
            `   Most used: *${p.faction}* • Rows: **${p.games}**`
        )
        .join("\n")
    : "—";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription("Ranked by latest Closing Elo (best-effort).")
    .addFields({ name: "\u200B", value: lines })
    .setFooter({ text: "Woehammer GT Database" });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };