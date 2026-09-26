import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { norm, getFactionChoices, findFactionName } from "./_warscrollListBase.js";
import { BRAND, RATE_KEY, pct, periodLabel, rateBand, statsUrl } from "../ui/brand.js";
export const data = new SlashCommandBuilder().setName("matchup").setDescription("Current battlescroll matchups for a faction").addStringOption((option) => option.setName("faction").setDescription("Faction name").setRequired(true).setAutocomplete(true)).addIntegerOption((option) => option.setName("mingames").setDescription("Minimum games (default 5)").setMinValue(1).setMaxValue(100).setRequired(false));
export async function autocomplete(interaction, ctx) { const query = norm(interaction.options.getFocused()); await interaction.respond(getFactionChoices(ctx).filter((name) => !query || norm(name).includes(query)).slice(0, 25).map((name) => ({ name, value: name }))); }
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("faction", true); const minGames = interaction.options.getInteger("mingames", false) ?? 5; const faction = findFactionName(system, engine, input);
  if (!faction) return interaction.reply({ content: `Couldn't match **${input}** to a known faction.`, ephemeral: true }); const map = new Map();
  for (const row of engine.indexes.factionRows(faction)) for (let round = 1; round <= 8; round += 1) { const opponent = String(row[`Opponent Faction ${round}`] ?? "").trim(); const result = String(row[`R${round}`] ?? "").trim().toUpperCase(); if (!opponent || !["W", "D", "L"].includes(result)) continue; const current = map.get(opponent) ?? { games: 0, points: 0 }; current.games += 1; current.points += result === "W" ? 1 : result === "D" ? 0.5 : 0; map.set(opponent, current); }
  const results = [...map.entries()].map(([opponent, value]) => ({ opponent, ...value, rate: value.points / value.games })).filter((row) => row.games >= minGames).sort((a, b) => b.rate - a.rate || b.games - a.games);
  const embed = new EmbedBuilder().setColor(BRAND.teal).setTitle(`Matchups · ${faction}`).setURL(statsUrl("factions.html", { faction })).setDescription(RATE_KEY).addFields({ name: "Results", value: results.length ? results.map((row) => `${rateBand(row.rate).emoji} **${row.opponent}**  ${pct(row.rate)} · ${row.games} games`).join("\n") : `No matchups met the ${minGames}-game minimum.` }).setFooter({ text: `${periodLabel(engine)} · minimum ${minGames} games · Woehammer Stats` });
  await interaction.reply({ embeds: [embed] });
}
export default { data, run, autocomplete };
