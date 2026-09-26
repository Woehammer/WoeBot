import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { ACCESS } from "../access.js";

export const access = ACCESS.PATREON;
const norm = (value) => String(value ?? "").trim().toLowerCase();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const data = new SlashCommandBuilder().setName("player")
  .setDescription("Patreon: player profile and tournament history")
  .addStringOption((option) => option.setName("name").setDescription("Player name").setRequired(true).setAutocomplete(true));

export async function autocomplete(interaction, { engine }) {
  const query = norm(interaction.options.getFocused());
  await interaction.respond(engine.indexes.playersAll().filter((name) => !query || norm(name).includes(query)).slice(0, 25).map((name) => ({ name, value: name })));
}

export async function run(interaction, { engine }) {
  const input = interaction.options.getString("name", true);
  let rows = engine.indexes.playerRows(input);
  if (!rows.length) {
    const match = engine.indexes.playersAll().find((name) => norm(name).includes(norm(input)));
    rows = match ? engine.indexes.playerRows(match) : [];
  }
  if (!rows.length) return interaction.reply({ content: `No player found matching **${input}**.`, ephemeral: true });
  rows = [...rows].sort((a, b) => String(b.Date ?? "").localeCompare(String(a.Date ?? "")));
  const totals = rows.reduce((out, row) => {
    out.played += n(row.Played); out.won += n(row.Won); out.drawn += n(row.Drawn); out.lost += n(row.Lost);
    out.factions.set(row.Faction, (out.factions.get(row.Faction) ?? 0) + 1);
    return out;
  }, { played: 0, won: 0, drawn: 0, lost: 0, factions: new Map() });
  const faction = [...totals.factions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const recent = rows.slice(0, 10).map((row) => `**${row["Event Name"]}** — ${row.Won}-${row.Drawn}-${row.Lost}, ${row.Faction}, WoElo ${n(row["Closing Elo"]).toFixed(0)}`);
  const embed = new EmbedBuilder().setTitle(rows[0].Player).addFields(
    { name: "Profile", value: `Country: **${rows[0].Country || "—"}**\nCurrent WoElo: **${n(rows[0]["Closing Elo"]).toFixed(0)}**\nMost played faction: **${faction}**` },
    { name: "Record", value: `**${totals.won}-${totals.drawn}-${totals.lost}** across ${rows.length} events (${totals.played} games)` },
    { name: "Recent tournaments", value: recent.join("\n") || "—" },
  ).setFooter({ text: "Woehammer Patreon · most recent first" });
  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete, access };
