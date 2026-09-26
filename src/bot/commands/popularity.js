import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export const data = new SlashCommandBuilder()
  .setName("popularity")
  .setDescription("Current battlescroll faction popularity")
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
    const current = byFaction.get(faction) ?? { runs: 0, games: 0 };
    current.runs += 1;
    current.games += n(row.Played);
    byFaction.set(faction, current);
  }

  const totalRuns = rows.length;
  const results = [...byFaction.entries()]
    .map(([faction, value]) => ({ faction, ...value, share: totalRuns ? value.runs / totalRuns : 0 }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, limit);
  const period = engine.dataset?.getMeta?.().battlescrollLabel ?? "Current battlescroll";

  const embed = new EmbedBuilder()
    .setTitle("Faction popularity")
    .setDescription(results.map((row, index) =>
      `${index + 1}. **${row.faction}** — ${(row.share * 100).toFixed(1)}% (${row.runs} runs)`
    ).join("\n"))
    .setFooter({ text: `${period} · ${totalRuns} tournament runs` });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run };
