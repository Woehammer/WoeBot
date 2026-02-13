// ==================================================
// COMMAND: /battleplan
// PURPOSE: Show win rate by battleplan for a faction OR formation
// NOTE: Uses engine indexes (not direct CSV fetch)
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

import { norm, pct, getFactionChoices, findFactionName } from "./_warscrollListBase.js";

// If you have a formations lookup helper already, import it.
// If not, we’ll do a simple fallback matcher below.
import { getFormationChoices, findFormationName } from "./_formationBase.js"; 
// ^ If you DON'T have this file, remove these imports and use the fallback helper at bottom.

// ==================================================
// SLASH COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("battleplan")
  .setDescription("Battleplan win rates for a faction or formation.")
  .addStringOption((opt) =>
    opt
      .setName("scope")
      .setDescription("Analyse by faction or formation")
      .setRequired(true)
      .addChoices(
        { name: "Faction", value: "faction" },
        { name: "Formation", value: "formation" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Faction or formation name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("battlescroll")
      .setDescription("Optional battlescroll filter (e.g. 2025-12)")
      .setRequired(false)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("min_games")
      .setDescription("Hide battleplans with fewer games (default 5, max 50)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("How many battleplans to show (default 12, max 25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") return;

  const scope = interaction.options.getString("scope", true);
  const q = norm(focused.value);

  let choices = [];
  if (scope === "faction") {
    choices = getFactionChoices(ctx);
  } else {
    // If you don't have formation choices helper yet, return empty to avoid bad UX
    choices = typeof getFormationChoices === "function" ? getFormationChoices(ctx) : [];
  }

  await interaction.respond(
    choices
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }))
  );
}

// ==================================================
// RUN
// ==================================================
export async function run(interaction, { system, engine }) {
  const scope = interaction.options.getString("scope", true);
  const inputName = interaction.options.getString("name", true).trim();

  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;
  const minGames = interaction.options.getInteger("min_games", false) ?? 5;
  const limit = interaction.options.getInteger("limit", false) ?? 12;

  // ----------------------------
  // Resolve name to canonical
  // ----------------------------
  let resolvedName = null;

  if (scope === "faction") {
    resolvedName = findFactionName(system, engine, inputName);
    if (!resolvedName) {
      await interaction.reply({
        content: `Couldn't match **${inputName}** to a known faction.`,
        ephemeral: true,
      });
      return;
    }
  } else {
    if (typeof findFormationName === "function") {
      resolvedName = findFormationName(system, engine, inputName);
    } else {
      // Fallback: accept raw input and let engine handle matching (or fail cleanly)
      resolvedName = inputName;
    }

    if (!resolvedName) {
      await interaction.reply({
        content: `Couldn't match **${inputName}** to a known formation.`,
        ephemeral: true,
      });
      return;
    }
  }

  // ----------------------------
  // Pull breakdown from engine
  // ----------------------------
  // Expected return: [{ battleplan, games, winRate, w, d, l }, ...]
  const rows = engine?.indexes?.battleplanBreakdown?.({
    scope,
    name: resolvedName,
    battlescroll,
    minGames,
  });

  if (!Array.isArray(rows) || !rows.length) {
    const hint =
      `No battleplan breakdown found for **${resolvedName}**.\n` +
      `This usually means the events in the slice didn't publish BP1..BP8.`;
    await interaction.reply({ content: hint, ephemeral: true });
    return;
  }

  // Sort by games desc (stable UX)
  rows.sort((a, b) => Number(b.games ?? 0) - Number(a.games ?? 0));

  const top = rows.slice(0, limit);

  // ----------------------------
  // Build embed
  // ----------------------------
  const embed = new EmbedBuilder()
    .setTitle(`Battleplan win rates — ${resolvedName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overviewParts = [];
  overviewParts.push(`Scope: **${scope}**`);
  if (battlescroll) overviewParts.push(`Battlescroll: **${battlescroll}**`);
  overviewParts.push(`Min games: **${minGames}**`);
  overviewParts.push(`Showing: **${top.length}**`);

  const overview = overviewParts.join(" | ");

  const lines = top.map((r) => {
    const bp = r.battleplan ?? "Unknown";
    const games = Number(r.games ?? 0);
    const wr = Number(r.winRate ?? 0);

    // Optional: show W-D-L if present
    const w = r.w != null ? Number(r.w) : null;
    const d = r.d != null ? Number(r.d) : null;
    const l = r.l != null ? Number(r.l) : null;

    const wdl = (w != null && d != null && l != null) ? ` — ${w}-${d}-${l}` : "";
    return `**${bp}**: ${pct(wr)} (${games} games)${wdl}`;
  });

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };