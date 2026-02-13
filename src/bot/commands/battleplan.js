// ==================================================
// COMMAND: /battleplan
// PURPOSE: Battleplan win rates for a chosen faction or formation
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

import {
  norm,
  pct,
  getFactionChoices,
  findFactionName,
} from "./_warscrollListBase.js";

import { BATTLEPLANS } from "../../data/battleplans.js";

// ==================================================
// HELPERS
// ==================================================
function unique(arr) {
  return Array.from(new Set(arr));
}

function battleplanChoicesFromLookup() {
  // Useful if you later want autocomplete for battleplan names
  return (BATTLEPLANS || []).map((b) => b.name);
}

function getFormationChoices(ctx) {
  // Uses the index service we added: formationsAll()
  const all = ctx?.engine?.indexes?.formationsAll?.();
  return Array.isArray(all) ? all : [];
}

function findFormationName(ctx, input) {
  const q = norm(input);
  const choices = getFormationChoices(ctx);

  // exact match (case-insensitive)
  const exact = choices.find((x) => norm(x) === q);
  if (exact) return exact;

  // contains match
  const partial = choices.find((x) => norm(x).includes(q));
  return partial || null;
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("battleplan")
  .setDescription("Battleplan win rates for a faction or a formation")
  .addStringOption((opt) =>
    opt
      .setName("scope")
      .setDescription("Calculate for a faction or a battle formation")
      .setRequired(true)
      .addChoices(
        { name: "Faction", value: "faction" },
        { name: "Formation", value: "formation" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Faction or Formation name")
      .setRequired(true)
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
  if (focused.name !== "name") return;

  const scope = interaction.options.getString("scope", true);
  const q = norm(focused.value);

  const choices =
    scope === "formation" ? getFormationChoices({ engine: ctx.engine }) : getFactionChoices(ctx);

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
  const minGames = interaction.options.getInteger("mingames", false) ?? 5;
  const limit = interaction.options.getInteger("limit", false) ?? 12;

  // Resolve scope name to canonical display
  let displayName = null;

  if (scope === "faction") {
    displayName = findFactionName(system, engine, inputName);
    if (!displayName) {
      await interaction.reply({ content: `Couldn't match **${inputName}** to a known faction.`, ephemeral: true });
      return;
    }
  } else if (scope === "formation") {
    displayName = findFormationName({ engine }, inputName);
    if (!displayName) {
      await interaction.reply({ content: `Couldn't match **${inputName}** to a known formation.`, ephemeral: true });
      return;
    }
  } else {
    await interaction.reply({ content: "Invalid scope.", ephemeral: true });
    return;
  }

  // Pull stats from indexes.js
  const rows = engine.indexes.battleplanBreakdown({
    scope,
    name: displayName,
    battlescroll,
    minGames,
  });

  const embed = new EmbedBuilder()
    .setTitle(`/battleplan — ${displayName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overviewLines = [
    `Scope: **${scope}**`,
    battlescroll ? `Battlescroll: **${battlescroll}**` : `Battlescroll: **All**`,
    `Min games per battleplan: **${minGames}**`,
  ].join("\n");

  if (!rows?.length) {
    embed.addFields(
      { name: "Overview", value: overviewLines },
      { name: "Results", value: "No battleplan data found (or everything was filtered out by min games / battlescroll)." }
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const top = rows.slice(0, limit);

  const lines = top.map((r) => {
    // Example format: Passing Seasons: 52% (21 games)
    return `${r.battleplan}: **${pct(r.winRate)}** (${r.games} games)`;
  });

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overviewLines },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };