// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll
//          (WITH/WITHOUT scoped to the warscroll's faction)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { getFactionIconPath } from "../ui/icons.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("warscroll")
  .setDescription("Shows stats for a warscroll")
  .addStringOption((opt) =>
    opt.setName("name").setDescription("Warscroll name").setRequired(true)
  );

// ==================================================
// HELPERS
// ==================================================
function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function snake(s) {
  return norm(s).replace(/\s+/g, "_");
}

function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, dp = 1) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(dp);
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
  // Returns the most common faction *name* as it appears in rows (e.g. "Blades of Khorne")
  const counts = new Map();

  for (const r of rows || []) {
    const f = r.Faction ?? r.faction;
    if (!f) continue;

    const key = norm(f);
    counts.set(key, { name: String(f), n: (counts.get(key)?.n ?? 0) + 1 });
  }

  let best = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v;
  }

  return best?.name ?? null;
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
  // ICON / THUMBNAIL
  // --------------------------------------------------
  const factionKey = snake(factionName);
  const iconPath = getFactionIconPath(factionKey);

// --------------------------------------------------
  // EMBED (single-field layout = predictable spacing)
  // --------------------------------------------------
  const divider = "────────────";

  const statsText =
    `Stats from Woehammer GT Database\n` +
    `Faction: **${factionName}**\n\n` +

    `**Included**\n` +
    `Games: **${includedGames}**\n` +
    `Win rate: **${pct(includedWR)}**\n` +
    `Avg occurrences (per list): **${fmt(avgOcc, 2)}**\n\n` +
`Reinforced in: **${pct(reinforcedPct)}** of lists\n\n` +

    `**Faction baseline**\n` +
    `Games: **${factionGames}**\n` +
    `Win rate: **${pct(factionWR)}**\n` +
    `Impact (vs faction): **${impactText}**\n\n` +

    `${divider}\n\n` +

    `**Without (same faction)**\n` +
    `Games: **${withoutGames}**\n` +
    `Win rate: **${pct(withoutWR)}**\n\n` +

    `**Commonly included with (Top 3)**\n` +
    `${coText || "—"}`;

  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .addFields({ name: "\u200B", value: statsText, inline: false })
    .setFooter({ text: "Co-includes weighted by lists • Avg occurrences per list" });

  // Add unit image if present
  if (warscroll.image) {
    embed.setImage(warscroll.image);
  }
  // --------------------------------------------------
  // THUMBNAIL ATTACHMENT (local PNG)
  // --------------------------------------------------

 const files = [];
if (iconPath) {
  const fileName = `${factionKey}.png`;
  files.push(new AttachmentBuilder(iconPath, { name: fileName }));
  embed.setThumbnail(`attachment://${fileName}`);
}

await interaction.reply({ embeds: [embed], files });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };