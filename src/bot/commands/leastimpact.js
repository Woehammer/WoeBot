// ==================================================
// COMMAND: /leastimpact
// PURPOSE: Warscrolls pulling DOWN a faction's win rate
//          (Included win rate < faction baseline)
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

import {
  norm,
  pct,
  getFactionChoices,
  findFactionName,
  getWarscrollCandidates,
  usedPctByGames,
  shouldShowAvgOcc,
  buildWarscrollBlocks,
} from "./_warscrollListBase.js";

export const data = new SlashCommandBuilder()
  .setName("leastimpact")
  .setDescription("Warscrolls pulling DOWN a faction's win rate (vs faction baseline)")
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("How many warscrolls to show (default 10, max 25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "faction") return;

  const q = norm(focused.value);
  const choices = getFactionChoices(ctx);

  await interaction.respond(
    choices
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }))
  );
}

export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("faction", true).trim();
  const limit = interaction.options.getInteger("limit", false) ?? 10;

  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({ content: `Couldn't match **${inputFaction}** to a known faction.`, ephemeral: true });
    return;
  }

  const factionSummary = engine.indexes.factionSummary(factionName);
  if (!factionSummary?.games) {
    await interaction.reply({ content: `No data found for **${factionName}**.`, ephemeral: true });
    return;
  }

  const factionWR = Number(factionSummary.winRate ?? 0);
  const factionGames = Number(factionSummary.games ?? 0);

  const candidates = getWarscrollCandidates(system, factionName);
  if (!candidates.length) {
    await interaction.reply({ content: `No warscroll lookup entries found for **${factionName}**.`, ephemeral: true });
    return;
  }

  const rows = [];
  for (const wsName of candidates) {
    const s = engine.indexes.warscrollSummaryInFaction(wsName, factionName, 3);
    if (!s?.included) continue;

    const incGames = Number(s.included.games ?? 0);
    const incWR = Number(s.included.winRate ?? NaN);
    if (!incGames || !Number.isFinite(incWR)) continue;

    // Only "pulling DOWN"
    if (!(incWR < factionWR)) continue;

    const withoutWR = Number(s.without?.winRate ?? NaN);
    const used = usedPctByGames(incGames, factionGames);

    const avgOcc = Number(
      s.included.avgOccurrencesPerList ??
      s.included.avgOcc ??
      s.included.avg_occurrences ??
      NaN
    );

    rows.push({
      name: wsName,
      incWR,
      incGames,
      withoutWR,
      used,
      avgOcc,
      showAvgOcc: shouldShowAvgOcc(avgOcc, incGames),
      deltaPP: (incWR - factionWR) * 100, // negative
    });
  }

  // most negative first (largest drop)
  rows.sort((a, b) => a.deltaPP - b.deltaPP);
  const top = rows.slice(0, limit);

  const embed = new EmbedBuilder()
    .setTitle(`Top ${top.length} warscrolls pulling DOWN — ${factionName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const header =
    `Baseline (faction overall win rate): **${pct(factionWR)}**.\n` +
    `Listed warscrolls: **win rate below baseline** (negative lift).`;

  if (!top.length) {
    embed.addFields({ name: "Overview", value: header }, { name: "Results", value: "No warscrolls are below baseline (within lookup candidates)." });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const lines = buildWarscrollBlocks(top);

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: header },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };