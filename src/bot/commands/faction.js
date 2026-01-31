// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players (Closing Elo)
//          + player performance distribution (5-round results)
//          + NO thumbnail/image in main embed (avoids layout slit)
//          + icon + faction image sent as follow-ups
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { getFactionIconPath } from "../ui/icons.js";
import { rankPlayersInFaction } from "../../engine/stats/playerRankings.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("faction")
  .setDescription("Shows stats for a faction")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Faction name")
      .setRequired(true)
      .setAutocomplete(true)
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

function fmt(x, dp = 0) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function getClosingElo(row) {
  const candidates = [
    row["Closing Elo"],
    row.ClosingElo,
    row.closingElo,
    row["ClosingElo"],
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function closingEloSummary(rows) {
  const elos = [];
  for (const r of rows || []) {
    const e = getClosingElo(r);
    if (e !== null) elos.push(e);
  }

  if (!elos.length) return { count: 0, average: 0, median: 0, gap: 0 };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);

  return {
    count: elos.length,
    average: avg,
    median: med,
    gap: Math.abs(avg - med),
  };
}

/**
 * Match a faction from lookup by name OR aliases.
 */
function findFaction(system, inputName) {
  const factions = system?.lookups?.factions ?? [];
  const q = norm(inputName);

  for (const f of factions) {
    if (norm(f.name) === q) return f;
    for (const a of f.aliases ?? []) {
      if (norm(a) === q) return f;
    }
  }
  return null;
}

/**
 * Fallback: try to find the best matching faction name from dataset keys.
 */
function findFactionNameFromDataset(engine, inputName) {
  const q = norm(inputName);
  const idx = engine?.indexes?.get?.();
  const byFaction = idx?.byFaction;

  if (!byFaction || !(byFaction instanceof Map)) return null;

  if (byFaction.has(q)) {
    const rows = byFaction.get(q) || [];
    const any = rows[0];
    const display = any?.Faction ?? any?.faction;
    return display ? String(display) : inputName.trim();
  }

  for (const rows of byFaction.values()) {
    const any = rows?.[0];
    const display = any?.Faction ?? any?.faction;
    if (display && norm(display) === q) return String(display);
  }

  return null;
}

/**
 * PLAYER PERFORMANCE DISTRIBUTION
 * % of faction players finishing 5-0, 4-1, ... 0-5.
 */
function performanceBuckets(rows) {
  const buckets = new Map([
    ["5-0", 0],
    ["4-1", 0],
    ["3-2", 0],
    ["2-3", 0],
    ["1-4", 0],
    ["0-5", 0],
  ]);

  let considered = 0;
  let other = 0;

  for (const r of rows || []) {
    const played = Number(r.Played ?? r.played ?? 0) || 0;
    const won = Number(r.Won ?? r.won ?? 0) || 0;
    const drawn = Number(r.Drawn ?? r.drawn ?? 0) || 0;
    const lost = Math.max(0, played - won - drawn);

    if (played === 5 && drawn === 0) {
      const key = `${won}-${lost}`;
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
        considered += 1;
      } else {
        other += 1;
      }
    } else {
      other += 1;
    }
  }

  const order = ["5-0", "4-1", "3-2", "2-3", "1-4", "0-5"];
  const lines = order.map((k) => {
    const c = buckets.get(k) ?? 0;
    const share = considered > 0 ? c / considered : 0;
    return `${k}: **${pct(share)}**`;
  });

  return { considered, other, text: lines.join("\n") };
}

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, { system, engine }) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") return;

  const q = norm(focused.value);

  const lookup = system?.lookups?.factions ?? [];
  let choices = lookup.map((f) => f.name);

  if (!choices.length) {
    const idx = engine?.indexes?.get?.();
    const byFaction = idx?.byFaction;
    if (byFaction instanceof Map) {
      choices = [];
      for (const rows of byFaction.values()) {
        const any = rows?.[0];
        const display = any?.Faction ?? any?.faction;
        if (display) choices.push(String(display));
      }
    }
  }

  const filtered = choices
    .filter((name) => !q || norm(name).includes(q))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));

  await interaction.respond(filtered);
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true).trim();

  const factionObj = findFaction(system, input);
  let factionName = factionObj?.name ?? null;

  if (!factionName) {
    factionName = findFactionNameFromDataset(engine, input);
  }

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${input}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  const rows = engine.indexes.factionRows(factionName);
  if (!rows.length) {
    await interaction.reply({
      content: `No data found for **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  const summary = engine.indexes.factionSummary(factionName);
  const elo = closingEloSummary(rows);
  const perf = performanceBuckets(rows);

  const topPlayers = rankPlayersInFaction({
    rows,
    topN: 3,
    minGames: 0,
    minEvents: 0,
    mode: "latest",
  });

  const playersText =
    topPlayers.length > 0
      ? topPlayers
          .map((p, i) => `${i + 1}) **${p.player}** — **${fmt(p.latestClosingElo, 0)}**`)
          .join("\n")
      : "—";

  const perfHeader =
    perf.considered > 0
      ? `Based on **${perf.considered}** 5-round results`
      : `No clean 5-round results found`;

  const perfNote = perf.other > 0 ? `\n*Other/unknown results: (${perf.other})*` : "";

  const statsText =
    `**Win Rate**\n` +
    `Games: **${summary.games}**\n` +
    `Win rate: **${pct(summary.winRate)}**\n\n` +
    `**Closing Elo**\n` +
    `Average: **${fmt(elo.average, 1)}**\n` +
    `Median: **${fmt(elo.median, 1)}**\n` +
    `Gap: **${fmt(elo.gap, 1)}**\n\n` +
    `**Player Performance**\n` +
    `${perfHeader}\n` +
    `${perf.text}` +
    `${perfNote}\n\n` +
    `**Top Players (Current Battlescroll)**\n` +
    `${playersText}`;

  // --------------------------------------------------
  // MAIN EMBED: TEXT ONLY (no thumbnail/image)
  // --------------------------------------------------
  const mainEmbed = new EmbedBuilder()
    .setTitle(`${factionName} — Overall`)
    .addFields({ name: "\u200B", value: statsText, inline: false })
    .setFooter({ text: "Woehammer GT Database" });

  await interaction.reply({ embeds: [mainEmbed] });

  // --------------------------------------------------
  // FOLLOW-UP 1: ICON (local PNG) as an IMAGE embed
  // --------------------------------------------------
  const factionKey = snake(factionName);
  const iconPath = getFactionIconPath(factionKey);

  if (iconPath) {
    const fileName = `${factionKey}.png`;
    const file = new AttachmentBuilder(iconPath, { name: fileName });

    const iconEmbed = new EmbedBuilder()
      .setTitle(`${factionName} — Icon`)
      .setImage(`attachment://${fileName}`);

    await interaction.followUp({ embeds: [iconEmbed], files: [file] });
  }

  // --------------------------------------------------
  // FOLLOW-UP 2: FACTION IMAGE (URL from lookup), if present
  // --------------------------------------------------
  if (factionObj?.image) {
    const imageEmbed = new EmbedBuilder()
      .setTitle(`${factionName} — Artwork`)
      .setImage(factionObj.image);

    await interaction.followUp({ embeds: [imageEmbed] });
  }
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };