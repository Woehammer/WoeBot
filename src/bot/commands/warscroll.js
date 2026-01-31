// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll
//          (WITH/WITHOUT scoped to the warscroll's faction)
//          + AUTOCOMPLETE
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("warscroll")
  .setDescription("Shows stats for a warscroll")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Warscroll name")
      .setRequired(true)
      .setAutocomplete(true)
  );

// ==================================================
// HELPERS
// ==================================================
const HR = "──────────────";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, dp = 1) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

function findWarscrollCanonical(system, inputName) {
  const ws = system?.lookups?.warscrolls ?? [];
  const q = norm(inputName);

  // Direct name match
  for (const w of ws) {
    if (norm(w.name) === q) return w;
  }

  // Alias match
  for (const w of ws) {
    for (const a of w.aliases ?? []) {
      if (norm(a) === q) return w;
    }
  }

  return null;
}

function pickTopFactionNameFromRows(rows) {
  // Returns the most common faction *name* as it appears in rows
  const counts = new Map();

  for (const r of rows || []) {
    const f = r.Faction ?? r.faction;
    if (!f) continue;

    const key = norm(f);
    const prev = counts.get(key);
    counts.set(key, { name: String(f), n: (prev?.n ?? 0) + 1 });
  }

  let best = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v;
  }

  return best?.name ?? null;
}

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, { system }) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") return;

  const q = norm(focused.value);
  const ws = system?.lookups?.warscrolls ?? [];

  if (!ws.length) {
    await interaction.respond([]);
    return;
  }

  // Collect matches by: name contains query OR any alias contains query.
  // Return canonical names only (no alias entries).
  const matches = [];
  for (const w of ws) {
    const name = String(w.name ?? "");
    const n = norm(name);

    let hit = !q || n.includes(q);

    if (!hit && q) {
      for (const a of w.aliases ?? []) {
        if (norm(a).includes(q)) {
          hit = true;
          break;
        }
      }
    }

    if (hit) matches.push(name);
  }

  // de-dupe + limit 25
  const unique = [...new Set(matches)].slice(0, 25);

  await interaction.respond(unique.map((name) => ({ name, value: name })));
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true);

  const warscroll = findWarscrollCanonical(system, input);
  if (!warscroll) {
    await interaction.reply({
      content: `Couldn't match **${input}** to a known warscroll in the current lookup.`,
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------
  // FACTION RESOLUTION
  // --------------------------------------------------
  let factionName = warscroll.faction ?? null;

  if (!factionName) {
    const wsRows = engine.indexes.warscrollRows(warscroll.name);
    factionName = pickTopFactionNameFromRows(wsRows);
  }

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't infer a faction for **${warscroll.name}** (lookup has none, and no rows include it).`,
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------
  // STATS (FACTION SCOPED)
  // --------------------------------------------------
  const summary = engine.indexes.warscrollSummaryInFaction(
    warscroll.name,
    factionName,
    3
  );

  const faction = engine.indexes.factionSummary(factionName);

  const includedGames = summary.included.games;
  const includedWR = summary.included.winRate;
  const withoutGames = summary.without.games;
  const withoutWR = summary.without.winRate;
  const avgOcc = summary.included.avgOccurrencesPerList;
  const reinforcedPct = summary.included.reinforcedPct ?? 0;

  const factionGames = faction?.games ?? 0;
  const factionWR = faction?.winRate ?? 0;

  // Impact in percentage points (pp)
  const impactPP = (includedWR - factionWR) * 100;
  const impactText = `${impactPP >= 0 ? "+" : ""}${impactPP.toFixed(1)} pp`;

  // --------------------------------------------------
  // CO-INCLUDES
  // --------------------------------------------------
  const co = summary.included.topCoIncludes || [];
  const coText =
    co.length > 0
      ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
      : "—";

  // --------------------------------------------------
  // EMBED (TEXT ONLY)
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setFooter({ text: "Woehammer GT Database • Co-includes weighted by lists • Avg occurrences per list" })
    .addFields({
      name: "Overview",
      value:
        `Faction: **${factionName}**\n\n` +

        `**Included**\n` +
        `Games: **${includedGames}**\n` +
        `Win rate: **${pct(includedWR)}**\n` +
        `Avg occurrences (per list): **${fmt(avgOcc, 2)}**\n` +
        `Reinforced in: **${pct(reinforcedPct)}** of lists\n` +
        `${HR}\n\n` +

        `**Faction baseline**\n` +
        `Games: **${factionGames}**\n` +
        `Win rate: **${pct(factionWR)}**\n` +
        `Impact (vs faction): **${impactText}**\n` +
        `${HR}\n\n` +

        `**Without (same faction)**\n` +
        `Games: **${withoutGames}**\n` +
        `Win rate: **${pct(withoutWR)}**\n` +
        `${HR}\n\n` +

        `**Commonly included with (Top 3)**\n` +
        `${coText}`,
      inline: false,
    });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };