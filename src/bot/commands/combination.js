import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { ACCESS } from "../access.js";
import { norm, getFactionChoices, findFactionName, getWarscrollCandidates } from "./_warscrollListBase.js";

export const access = ACCESS.PATREON;
export const data = new SlashCommandBuilder().setName("combination")
  .setDescription("Patreon: analyse lists containing two warscrolls")
  .addStringOption((option) => option.setName("faction").setDescription("Faction").setRequired(true).setAutocomplete(true))
  .addStringOption((option) => option.setName("first").setDescription("First warscroll").setRequired(true).setAutocomplete(true))
  .addStringOption((option) => option.setName("second").setDescription("Second warscroll").setRequired(true).setAutocomplete(true));

export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  const query = norm(focused.value);
  let choices = getFactionChoices(ctx);
  if (focused.name !== "faction") {
    const faction = findFactionName(ctx.system, ctx.engine, interaction.options.getString("faction", false));
    choices = faction ? getWarscrollCandidates(ctx.system, faction) : [];
  }
  await interaction.respond(choices.filter((name) => !query || norm(name).includes(query)).slice(0, 25).map((name) => ({ name, value: name })));
}

export async function run(interaction, { system, engine }) {
  const faction = findFactionName(system, engine, interaction.options.getString("faction", true));
  const first = interaction.options.getString("first", true);
  const second = interaction.options.getString("second", true);
  if (!faction) return interaction.reply({ content: "Unknown faction.", ephemeral: true });
  const rows = engine.indexes.factionRows(faction).filter((row) => {
    const units = new Set((row.__units ?? []).map(norm));
    return units.has(norm(first)) && units.has(norm(second));
  });
  const games = rows.reduce((sum, row) => sum + Number(row.Played ?? 0), 0);
  const points = rows.reduce((sum, row) => sum + Number(row.Won ?? 0) + 0.5 * Number(row.Drawn ?? 0), 0);
  const embed = new EmbedBuilder().setTitle(`${first} + ${second}`).setDescription(`Faction: **${faction}**\nLists: **${rows.length}**\nGames: **${games}**\nWin rate: **${games ? (100 * points / games).toFixed(1) : "—"}%**`).setFooter({ text: "Woehammer Patreon · current battlescroll" });
  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete, access };
