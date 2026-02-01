// ==================================================
// COMMAND: /leastcommon
// PURPOSE: Least commonly taken warscrolls for a faction
//          (ranked by Used% ascending)
//          + same stats line format as /impact
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
  .setName("leastcommon")
  .setDescription("Least commonly taken warscrolls for a faction (by usage)")
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
      deltaPP: (incWR - factionWR) * 100,
    });
  }

  // Sort by usage asc, then by games asc as tie-breaker
  rows.sort((a, b) => {
    const ua = Number.isFinite(a.used) ? a.used : Infinity;
    const ub = Number.isFinite(b.used) ? b.used : Infinity;
    if (ua !== ub) return ua - ub;
    return (a.incGames ?? 0) - (b.incGames ?? 0);
  });

  const top = rows.slice(0, limit);

  const embed = new EmbedBuilder()
    .setTitle(`Top ${top.length} least common warscrolls — ${factionName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const header =
    `Baseline (faction overall win rate): **${pct(factionWR)}**.\n` +
    `Ranked by **Used%** ascending (rare picks first).`;

  if (!top.length) {
    embed.addFields({ name: "Overview", value: header }, { name: "Results", value: "No warscroll rows found for this faction (within lookup candidates)." });
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