// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";

import { getFactionIconPath } from "../ui/icons.js";
import { eloSummary, topEloPlayers } from "../../engine/stats/eloSummary.js";

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

function findFaction(system, inputName) {
  const fs = system?.lookups?.factions ?? [];
  const q = norm(inputName);

  for (const f of fs) {
    if (norm(f.name) === q) return f;
  }

  return null;
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true);

  const faction = findFaction(system, input);
  if (!faction) {
    await interaction.reply({
      content: `Couldn't match **${input}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------
  // ROWS + SUMMARIES
  // --------------------------------------------------
  const rows = engine.indexes.factionRows(faction.name);
  if (!rows.length) {
    await interaction.reply({
      content: `No data found for **${faction.name}**.`,
      ephemeral: true,
    });
    return;
  }

  const summary = engine.indexes.factionSummary(faction.name);
  const elo = eloSummary(rows);
  const topPlayers = topEloPlayers(rows, 3);

  // --------------------------------------------------
  // FORMATTING
  // --------------------------------------------------
  const playersText =
    topPlayers.length > 0
      ? topPlayers
          .map(
            (p, i) =>
              `${i + 1}) **${p.player}** — Elo **${fmt(p.elo)}** (${p.lists} lists)`
          )
          .join("\n")
      : "—";

  const statsText =
    `**Games:** ${summary.games}\n` +
    `**Win rate:** ${pct(summary.winRate)}\n\n` +

    `**Elo profile**\n` +
    `Average: **${fmt(elo.average)}**\n` +
    `Median: **${fmt(elo.median)}**\n` +
    `Avg ↔ Median gap: **${fmt(elo.gap, 1)}**`;

  // --------------------------------------------------
  // EMBED
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(faction.name)
    .addFields(
      { name: "\u200B", value: statsText, inline: false },
      {
        name: "**Top Elo players**",
        value: playersText,
        inline: false,
      }
    )
    .setFooter({ text: "Woehammer GT Database" });

  // --------------------------------------------------
  // FACTION IMAGE (large)
  // --------------------------------------------------
  if (faction.image) {
    embed.setImage(faction.image);
  }

  // --------------------------------------------------
  // FACTION ICON (thumbnail)
  // --------------------------------------------------
  const files = [];
  const factionKey = snake(faction.name);
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