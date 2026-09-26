import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { ACCESS } from "../access.js";
import { countryColor, periodLabel, statsUrl } from "../ui/brand.js";

export const access = ACCESS.PATREON;
const norm = (value) => String(value ?? "").trim().toLowerCase();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const data = new SlashCommandBuilder().setName("player").setDescription("Patreon: player profile and tournament history").addStringOption((option) => option.setName("name").setDescription("Player name").setRequired(true).setAutocomplete(true));
export async function autocomplete(interaction, { engine }) { const query = norm(interaction.options.getFocused()); await interaction.respond(engine.indexes.playersAll().filter((name) => !query || norm(name).includes(query)).slice(0, 25).map((name) => ({ name, value: name }))); }

function profileFor(rows) {
  const ordered = [...rows].sort((a, b) => String(b.Date ?? "").localeCompare(String(a.Date ?? "")));
  const totals = ordered.reduce((out, row) => { out.played += n(row.Played); out.won += n(row.Won); out.drawn += n(row.Drawn); out.lost += n(row.Lost); out.factions.set(row.Faction, (out.factions.get(row.Faction) ?? 0) + 1); out.countries.set(row.Country, (out.countries.get(row.Country) ?? 0) + 1); return out; }, { played: 0, won: 0, drawn: 0, lost: 0, factions: new Map(), countries: new Map() });
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return { rows: ordered, totals, faction: top(totals.factions), country: top(totals.countries), elo: n(ordered[0]["Closing Elo"]) };
}

export async function run(interaction, { engine }) {
  const input = interaction.options.getString("name", true); let rows = engine.indexes.playerRows(input);
  if (!rows.length) { const match = engine.indexes.playersAll().find((name) => norm(name).includes(norm(input))); rows = match ? engine.indexes.playerRows(match) : []; }
  if (!rows.length) return interaction.reply({ content: `No player found matching **${input}**.`, ephemeral: true });
  const profile = profileFor(rows); const allProfiles = engine.indexes.playersAll().map((name) => profileFor(engine.indexes.playerRows(name))).sort((a, b) => b.elo - a.elo);
  const globalRank = allProfiles.findIndex((item) => norm(item.rows[0].Player) === norm(profile.rows[0].Player)) + 1;
  const national = allProfiles.filter((item) => item.country === profile.country); const nationalRank = national.findIndex((item) => norm(item.rows[0].Player) === norm(profile.rows[0].Player)) + 1;
  const winRate = profile.totals.played ? (profile.totals.won + 0.5 * profile.totals.drawn) / profile.totals.played : 0;
  const recent = profile.rows.slice(0, 6).map((row) => `**${row["Event Name"]}**\n${row.Won}-${row.Drawn}-${row.Lost} · ${row.Faction} · WoElo ${n(row["Closing Elo"]).toFixed(0)}`);
  const embed = new EmbedBuilder().setColor(countryColor(profile.country)).setTitle(profile.rows[0].Player).setURL(statsUrl("players.html", { player: profile.rows[0].Player })).setDescription(`🏳️ Competitive circuit: **${profile.country}**\n🏆 Global **#${globalRank}** · ${profile.country} **#${nationalRank}**`).addFields(
    { name: "Current WoElo", value: `**${profile.elo.toFixed(0)}**`, inline: true },
    { name: "Current record", value: `**${profile.totals.won}-${profile.totals.drawn}-${profile.totals.lost}**`, inline: true },
    { name: "Win rate", value: `**${(winRate * 100).toFixed(1)}%**`, inline: true },
    { name: "Most played faction", value: `**${profile.faction}**`, inline: false },
    { name: "Recent tournaments", value: recent.join("\n\n") || "—", inline: false },
  ).setFooter({ text: `${periodLabel(engine)} · Patreon · most recent first · Woehammer Stats` });
  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete, access };
