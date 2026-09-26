import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { BRAND, RATE_KEY, pct, periodLabel, rateBand, statsUrl } from "../ui/brand.js";
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const data = new SlashCommandBuilder().setName("winrates").setDescription("Current battlescroll faction win rates").addIntegerOption((option) => option.setName("limit").setDescription("Factions to show (default 25)").setMinValue(5).setMaxValue(25).setRequired(false));
export async function run(interaction, { engine }) {
  const limit = interaction.options.getInteger("limit", false) ?? 25; const byFaction = new Map();
  for (const row of engine.indexes.allRows()) { const faction = String(row.Faction ?? "").trim(); if (!faction) continue; const current = byFaction.get(faction) ?? { games: 0, points: 0 }; current.games += n(row.Played); current.points += n(row.Won) + 0.5 * n(row.Drawn); byFaction.set(faction, current); }
  const results = [...byFaction.entries()].map(([faction, value]) => ({ faction, ...value, rate: value.games ? value.points / value.games : 0 })).sort((a, b) => b.rate - a.rate || b.games - a.games).slice(0, limit);
  const embed = new EmbedBuilder().setColor(BRAND.teal).setTitle("Faction win rates").setURL(statsUrl("overview.html")).setDescription(`${RATE_KEY}\n\n${results.map((row, index) => `${rateBand(row.rate).emoji} **${index + 1}. ${row.faction}**  ${pct(row.rate)} · ${row.games.toLocaleString()} games`).join("\n")}`).setFooter({ text: `${periodLabel(engine)} · draws count as half a win · Woehammer Stats` });
  await interaction.reply({ embeds: [embed] });
}
export default { data, run };
