// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getFactionIcon } from "../ui/icons.js";

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

function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, dp = 1) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(dp);
}

function pickTopFactionFromIncludedRows(rows) {
  const counts = new Map();
  for (const r of rows || []) {
    const f = r.Faction ?? r.faction;
    if (!f) continue;
    const key = norm(f);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [k, v] of counts.entries()) {
    if (v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return best; // normalised faction key
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

  // Stats
  const summary = engine.indexes.warscrollSummary(warscroll.name, 3);

  // Faction icon choice:
  // - prefer warscroll.faction if present
  // - else infer from included rows
  const factionKey =
    warscroll.faction
      ? norm(warscroll.faction).replace(/\s+/g, "_")
      : pickTopFactionFromIncludedRows(engine.indexes.warscrollRows(warscroll.name));

  const iconPath = factionKey ? getFactionIcon(factionKey) : null;

  const includedGames = summary.included.games;
  const includedWR = summary.included.winRate;

  const withoutGames = summary.without.games;
  const withoutWR = summary.without.winRate;

  const avgOcc = summary.included.avgOccurrencesPerList;

  const co = summary.included.topCoIncludes || [];
  const coText =
    co.length > 0
      ? co
          .map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`)
          .join("\n")
      : "—";

  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setDescription(`Stats from Woehammer GT Database`)
    .addFields(
      {
        name: "Included",
        value: `Games: **${includedGames}**\nWin rate: **${pct(includedWR)}**\nAvg occurrences (per list): **${fmt(avgOcc, 2)}**`,
        inline: true,
      },
      {
        name: "Without",
        value: `Games: **${withoutGames}**\nWin rate: **${pct(withoutWR)}**`,
        inline: true,
      },
      {
        name: "Commonly included with (Top 3)",
        value: coText,
        inline: false,
      }
    )
    .setFooter({ text: `Co-includes weighted by lists • Avg occurrences per list` });

  // Note: local file thumbnails in embeds can be awkward depending on how icons.js is implemented.
  // If getFactionIcon returns a URL, this is fine. If it returns a local path, we need attachments.
  if (iconPath && typeof iconPath === "string" && iconPath.startsWith("http")) {
    embed.setThumbnail(iconPath);
  }

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };
