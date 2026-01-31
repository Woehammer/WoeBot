// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players (Closing Elo)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";

import { getFactionIconPath } from "../ui/icons.js";
import { rankPlayersInFaction } from "../../engine/stats/playerRankings.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("faction")
  .setDescription("Shows stats for a faction")
  .addStringOption((opt) =>
    opt.setName("name").setDescription("Faction name").setRequired(true)
  );

// ==================================================
// HELPERS
// ==================================================
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function snake(s) {
  return norm(s).replace(/\s+/g, "_");
}

function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, dp = 0) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(dp);
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
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

function closingEloSummary(rows) {
  const elos = [];
  for (const r of rows || []) {
    const e = getClosingElo(r);
    if (e !== null) elos.push(e);
  }

  if (!elos.length) return { count: 0, average: 0, median: 0, gap: 0 };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);
  return {
    count: elos.length,
    average: avg,
    median: med,
    gap: Math.abs(avg - med),
  };
}

/**
 * Match a faction from lookup by name OR aliases.
 */
function findFaction(system, inputName) {
  const factions = system?.lookups?.factions ?? [];
  const q = norm(inputName);

  for (const f of factions) {
    if (norm(f.name) === q) return f;

    for (const a of f.aliases ?? []) {
      if (norm(a) === q) return f;
    }
  }

  return null;
}

/**
 * Fallback: if lookup is missing, try to find the best matching faction name
 * from the dataset itself (exact case-insensitive match).
 */
function findFactionNameFromDataset(engine, inputName) {
  const q = norm(inputName);
  const idx = engine?.indexes?.get?.();
  const byFaction = idx?.byFaction;

  if (!byFaction || !(byFaction instanceof Map)) return null;

  for (const key of byFaction.keys()) {
    if (norm(key) === q) {
      // key is already lowercased by safeKey in indexes.js, so we need a "display name"
      // We can recover it from a row.
      const rows = byFaction.get(key) || [];
      const any = rows[0];
      const display = any?.Faction ?? any?.faction;
      return display ? String(display) : inputName.trim();
    }
  }

  // try exact match against row values (slower but safe)
  for (const rows of byFaction.values()) {
    const any = rows?.[0];
    const display = any?.Faction ?? any?.faction;
    if (display && norm(display) === q) return String(display);
  }

  return null;
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true).trim();

  // 1) Prefer lookup (name/aliases)
  const factionObj = findFaction(system, input);

  // Determine the factionName we’ll use to slice data
  let factionName = factionObj?.name ?? null;

  // 2) Fallback: infer exact faction name from dataset
  if (!factionName) {
    factionName = findFactionNameFromDataset(engine, input);
  }

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${input}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------
  // ROWS + SUMMARIES
  // --------------------------------------------------
  const rows = engine.indexes.factionRows(factionName);

  if (!rows.length) {
    await interaction.reply({
      content: `No data found for **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  const summary = engine.indexes.factionSummary(factionName);

  // Closing Elo profile (consistent with rankings)
  const elo = closingEloSummary(rows);

  // Top players by LATEST Closing Elo within this faction slice
  const topPlayers = rankPlayersInFaction({
    rows,
    topN: 3,
    minGames: 0,
    minEvents: 0,
    mode: "latest",
  });

  // --------------------------------------------------
  // FORMATTING
  // --------------------------------------------------
  const playersText =
    topPlayers.length > 0
      ? topPlayers
          .map(
            (p, i) =>
              `${i + 1}) **${p.player}** — Closing Elo **${fmt(
                p.latestClosingElo,
                0
              )}** (${p.events} events, ${p.games} games)`
          )
          .join("\n")
      : "—";

  const statsText =
    `**Win Rate**\n` +
    `Games: **${summary.games}**\n` +
    `Win rate: **${pct(summary.winRate)}**\n\n` +
    `**Closing Elo**\n` +
    `Average: **${fmt(elo.average, 1)}**\n` +
    `Median: **${fmt(elo.median, 1)}**\n` +
    `Gap: **${fmt(elo.gap, 1)}**\n\n` +
    `**Top players (Closing Elo)**\n` +
    `${playersText}`;

  // --------------------------------------------------
  // EMBED
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(`${factionName} — Overall`)
    .addFields({ name: "\u200B", value: statsText, inline: false })
    .setFooter({ text: "Woehammer GT Database" });

  // Large faction image (only if provided in lookup)
  if (factionObj?.image) {
    embed.setImage(factionObj.image);
  }

  // --------------------------------------------------
  // FACTION ICON (thumbnail attachment)
  // --------------------------------------------------
  const files = [];
  const factionKey = snake(factionName);
  const iconPath = getFactionIconPath(factionKey);

  if (iconPath) {
    const fileName = `${factionKey}.png`;
    files.push(new AttachmentBuilder(iconPath, { name: fileName }));
    embed.setThumbnail(`attachment://${fileName}`);
  }

  await interaction.reply({ embeds: [embed], files });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };