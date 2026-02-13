
// ==================================================
// COMMAND: /battleplan
// PURPOSE: Battleplan win rates for a chosen faction
//          (optionally filtered by battle formation)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

import { norm, pct, getFactionChoices, findFactionName } from "./_warscrollListBase.js";

// If you want to validate formation names against a lookup file later,
// you can import formations.js. For now we use the index service.
import { BATTLEPLANS } from "../../data/aos/battleplans.js";

// ==================================================
// HELPERS
// ==================================================
function getFormationChoicesForFaction(ctx, factionName) {
  const list = ctx?.engine?.indexes?.formationsForFaction?.(factionName);
  return Array.isArray(list) ? list : [];
}

function findFormationNameForFaction(ctx, factionName, input) {
  const q = norm(input);
  const choices = getFormationChoicesForFaction(ctx, factionName);

  // exact match (case-insensitive)
  const exact = choices.find((x) => norm(x) === q);
  if (exact) return exact;

  // contains match
  const partial = choices.find((x) => norm(x).includes(q));
  return partial || null;
}

// Optional helper in case you want to enforce only known battleplans later
function battleplanNamesFromLookup() {
  return (BATTLEPLANS || []).map((b) => b.name);
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("battleplan")
  .setDescription("Battleplan win rates for a faction (optionally filtered by formation)")
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("formation")
      .setDescription("Optional: restrict to a battle formation")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("battlescroll")
      .setDescription("Optional battlescroll filter (exact text match)")
      .setRequired(false)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("mingames")
      .setDescription("Hide battleplans with fewer games (default 5)")
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
  const q = norm(focused.value);

  // ---- faction ----
  if (focused.name === "faction") {
    const choices = getFactionChoices(ctx);
    await interaction.respond(
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // ---- formation (depends on chosen faction) ----
  if (focused.name === "formation") {
    const inputFaction = interaction.options.getString("faction", false)?.trim();
    if (!inputFaction) return await interaction.respond([]);

    const factionName = findFactionName(ctx.system, ctx.engine, inputFaction);
    if (!factionName) return await interaction.respond([]);

    const choices = getFormationChoicesForFaction({ engine: ctx.engine }, factionName);

    await interaction.respond(
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
  }
}

// ==================================================
// RUN
// ==================================================
export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("faction", true).trim();
  const inputFormation = interaction.options.getString("formation", false)?.trim() ?? null;

  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;
  const minGames = interaction.options.getInteger("mingames", false) ?? 5;
  const limit = interaction.options.getInteger("limit", false) ?? 12;

  // ----------------------------
  // Resolve faction
  // ----------------------------
  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // ----------------------------
  // Resolve formation (optional)
  // ----------------------------
  let formationName = null;
  if (inputFormation) {
    formationName = findFormationNameForFaction({ engine }, factionName, inputFormation);
    if (!formationName) {
      await interaction.reply({
        content: `Couldn't match **${inputFormation}** to a known formation for **${factionName}**.`,
        ephemeral: true,
      });
      return;
    }
  }

  // ----------------------------
  // Get rows for scope
  // ----------------------------
  let rows = [];
  if (formationName) {
    rows = engine.indexes.factionRowsInFormation?.(factionName, formationName) ?? [];
  } else {
    rows = engine.indexes.factionRows?.(factionName) ?? [];
  }

  // If no rows, bail early
  if (!rows.length) {
    await interaction.reply({
      content: `No data found for **${factionName}**${formationName ? ` (${formationName})` : ""}.`,
      ephemeral: true,
    });
    return;
  }

  // ----------------------------
  // Breakdown (preferred: rows-based)
  // ----------------------------
  let breakdown = null;

  // Preferred newer helper (you should add this in indexes.js if not already):
  // engine.indexes.battleplanBreakdownFromRows({ rows, battlescroll, minGames })
  if (engine.indexes.battleplanBreakdownFromRows) {
    breakdown = engine.indexes.battleplanBreakdownFromRows({
      rows,
      battlescroll,
      minGames,
    });
  } else {
    // Backwards-compatible fallback if your existing helper only supports scope+name:
    // We'll call it with faction scope always (formation filtering already done via rows,
    // so this fallback is not ideal — but at least won’t crash).
    breakdown = engine.indexes.battleplanBreakdown({
      scope: "faction",
      name: factionName,
      battlescroll,
      minGames,
    });
  }

  const embedTitle = formationName
    ? `Battleplans — ${factionName} (${formationName})`
    : `Battleplans — ${factionName}`;

  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setFooter({ text: "Woehammer GT Database" });

  const overviewLines = [
    `Scope: **${formationName ? "formation" : "faction"}**`,
    battlescroll ? `Battlescroll: **${battlescroll}**` : `Battlescroll: **All**`,
    `Min games per battleplan: **${minGames}**`,
  ].join("\n");

  if (!breakdown?.length) {
    embed.addFields(
      { name: "Overview", value: overviewLines },
      {
        name: "Results",
        value:
          "No battleplan data found (or everything was filtered out by min games / battlescroll).",
      }
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const top = breakdown.slice(0, limit);

  const lines = top.map((r) => `${r.battleplan}: **${pct(r.winRate)}** (${r.games} games)`);

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overviewLines },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };