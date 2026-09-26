import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { BRAND, periodLabel, statsUrl } from "../ui/brand.js";
export const data = new SlashCommandBuilder().setName("popularity").setDescription("Current battlescroll faction popularity").addIntegerOption((option) => option.setName("limit").setDescription("Factions to show (default 20)").setMinValue(5).setMaxValue(25).setRequired(false));
export async function run(interaction, { engine }) {
  const limit = interaction.options.getInteger("limit", false) ?? 20; const rows = engine.indexes.allRows(); const counts = new Map();
  for (const row of rows) { const faction = String(row.Faction ?? "").trim(); if (faction) counts.set(faction, (counts.get(faction) ?? 0) + 1); }
  const results = [...counts.entries()].map(([faction, runs]) => ({ faction, runs, share: rows.length ? runs / rows.length : 0 })).sort((a, b) => b.runs - a.runs).slice(0, limit);
  const embed = new EmbedBuilder().setColor(BRAND.purple).setTitle("Faction popularity").setURL(statsUrl("overview.html")).setDescription(results.map((row, index) => `**${index + 1}. ${row.faction}** — **${(row.share * 100).toFixed(1)}%** · ${row.runs.toLocaleString()} runs`).join("\n")).setFooter({ text: `${periodLabel(engine)} · ${rows.length.toLocaleString()} tournament runs · Woehammer Stats` });
  await interaction.reply({ embeds: [embed] });
}
export default { data, run };
