import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { ACCESS } from "../access.js";

export const access = ACCESS.PATREON;
const norm = (value) => String(value ?? "").trim().toLowerCase();
const pct = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";

export const data = new SlashCommandBuilder().setName("compare")
  .setDescription("Patreon: compare two warscrolls")
  .addStringOption((option) => option.setName("first").setDescription("First warscroll").setRequired(true).setAutocomplete(true))
  .addStringOption((option) => option.setName("second").setDescription("Second warscroll").setRequired(true).setAutocomplete(true));

export async function autocomplete(interaction, { system }) {
  const query = norm(interaction.options.getFocused());
  await interaction.respond((system.lookups.warscrolls ?? []).map((item) => item.name)
    .filter((name) => !query || norm(name).includes(query)).slice(0, 25).map((name) => ({ name, value: name })));
}

function canonical(system, input) {
  return (system.lookups.warscrolls ?? []).find((item) => norm(item.name) === norm(input) || (item.aliases ?? []).some((alias) => norm(alias) === norm(input)));
}

export async function run(interaction, { system, engine }) {
  const first = canonical(system, interaction.options.getString("first", true));
  const second = canonical(system, interaction.options.getString("second", true));
  if (!first || !second) return interaction.reply({ content: "I couldn't match both warscrolls.", ephemeral: true });
  const fields = [first, second].map((item) => {
    const stats = engine.indexes.warscrollSummaryInFaction(item.name, item.faction, 0);
    return { name: item.name, value: `Faction: **${item.faction}**\nGames included: **${stats.included.games}**\nWin rate: **${pct(stats.included.winRate)}**\nWithout: **${pct(stats.without.winRate)}**`, inline: true };
  });
  await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Warscroll comparison").addFields(fields).setFooter({ text: "Woehammer Patreon · current battlescroll" })] });
}

export default { data, run, autocomplete, access };
