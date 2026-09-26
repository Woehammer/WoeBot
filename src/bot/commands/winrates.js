import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export const data = new SlashCommandBuilder()
  .setName("winrates")
  .setDescription("Current battlescroll faction win rates")
  .addIntegerOption((option) =>
    option.setName("limit").setDescription("Factions to show (default 25)")
      .setMinValue(5).setMaxValue(25).setRequired(false)
  );

export async function run(interaction, { engine }) {
  const limit = interaction.options.getInteger("limit", false) ?? 25;
  const rows = engine.indexes.allRows();
  const byFaction = new Map();

  for (const row of rows) {
    const faction = String(row.Faction ?? "").trim();
    if (!faction) continue;
    const current = byFaction.get(faction) ?? { games: 0, points: 0 };
    current.games += n(row.Played);
    current.points += n(row.Won) + 0.5 * n(row.Drawn);
    byFaction.set(faction, current);
  }

  const results = [...byFaction.entries()]
    .map(([faction, value]) => ({ faction, ...value, rate: value.games ? value.points / value.games : 0 }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games)
    .slice(0, limit);

  const period = engine.dataset?.getMeta?.().battlescrollLabel ?? "Current battlescroll";
  const embed = new EmbedBuilder()
    .setTitle("Faction win rates")
    .setDescription(results.map((row, index) =>
      `${index + 1}. **${row.faction}** — ${pct(row.rate)} (${row.games} games)`
    ).join("\n"))
    .setFooter({ text: `${period} · draws count as half a win` });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run };
