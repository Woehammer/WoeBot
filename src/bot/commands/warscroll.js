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
import { computeWithWithout } from "../../engine/stats/withWithout.js";

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

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
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

// Discord embed spacing hack
const SPACER = { name: "\u200B", value: "\u200B", inline: false };

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
  // Prefer lookup faction, otherwise infer from rows that include it.
  const allRows = engine?.dataset?.getRows?.() ?? [];

  // NOTE: __unitCounts might be keyed by canonical name. If not, this still works because
  // computeWithWithout() uses case-insensitive matching later.
  const wsRows = allRows.filter((r) => {
    const c = r.__unitCounts || {};
    // direct key hit
    if (c[warscroll.name] > 0) return true;
    // fallback: scan keys case-insensitively
    const targetKey = norm(warscroll.name);
    for (const [k, v] of Object.entries(c)) {
      if (norm(k) === targetKey && n(v) > 0) return true;
    }
    return false;
  });

  const factionName = warscroll.faction ?? pickTopFactionNameFromRows(wsRows);

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't infer a faction for **${warscroll.name}** (lookup has none, and no rows include it).`,
      ephemeral: true,
    });
    return;
  }

  // Pull only rows for that faction via indexes (fast)
  const idx = engine.indexes.get();
  const factionRows = idx.byFaction.get(norm(factionName)) ?? [];

  // --------------------------------------------------
  // STATS (FACTION-SCOPED WITH/WITHOUT)
  // --------------------------------------------------
  const summary = computeWithWithout({
    rows: factionRows,
    warscrollName: warscroll.name,
    topN: 3,
  });

  const includedGames = summary.included.games;
  const includedWR = summary.included.winRate;
  const withoutGames = summary.without.games;
  const withoutWR = summary.without.winRate;
  const avgOcc = summary.included.avgOccurrencesPerList;

  // --------------------------------------------------
  // FACTION BASELINE + IMPACT (PP)
  // --------------------------------------------------
  let factionGames = 0;
  let factionWins = 0;

  for (const r of factionRows) {
    factionGames += n(r.Played);
    factionWins += n(r.Won);
  }

  const factionWR = factionGames > 0 ? factionWins / factionGames : 0;

  // Impact in percentage points (pp), NOT bps
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
  // EMBED
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setDescription(`Stats from Woehammer GT Database\nFaction: **${factionName}**`)
    .addFields(
      {
        name: "**Included**",
        value:
          `Games: **${includedGames}**\n` +
          `Win rate: **${pct(includedWR)}**\n` +
          `Avg occurrences (per list): **${fmt(avgOcc, 2)}**`,
        inline: false,
      },
      SPACER,
      {
        name: "**Faction baseline**",
        value:
          `Games: **${factionGames}**\n` +
          `Win rate: **${pct(factionWR)}**\n` +
          `Impact (vs faction): **${impactText}**`,
        inline: false,
      },
      SPACER,
      {
        name: "**Without (same faction)**",
        value: `Games: **${withoutGames}**\nWin rate: **${pct(withoutWR)}**`,
        inline: false,
      },
      SPACER,
      {
        name: "**Commonly included with (Top 3)**",
        value: coText,
        inline: false,
      }
    )
    .setFooter({ text: "Co-includes weighted by lists • Avg occurrences per list" });

  // Local thumbnail attachment
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