// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players (Closing Elo)
//          + player performance distribution (5-round results)
//          (TEXT ONLY – no images, no thumbnails)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
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
  const elos = rows
    .map(getClosingElo)
    .filter((v) => Number.isFinite(v));

  if (!elos.length) return { average: 0, median: 0, gap: 0 };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);

  return {
    average: avg,
    median: med,
    gap: Math.abs(avg - med),
  };
}

// ==================================================
// FACTION MATCHING
// ==================================================
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

function findFactionNameFromDataset(engine, inputName) {
  const q = norm(inputName);
  const byFaction = engine?.indexes?.get?.()?.byFaction;

  if (!(byFaction instanceof Map)) return null;

  if (byFaction.has(q)) {
    const rows = byFaction.get(q);
    const any = rows?.[0];
    return any?.Faction ?? any?.faction ?? inputName;
  }

  for (const rows of byFaction.values()) {
    const any = rows?.[0];
    const name = any?.Faction ?? any?.faction;
    if (name && norm(name) === q) return name;
  }

  return null;
}

// ==================================================
// PLAYER PERFORMANCE DISTRIBUTION
// ==================================================
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

  for (const r of rows) {
    const played = Number(r.Played ?? 0);
    const won = Number(r.Won ?? 0);
    const drawn = Number(r.Drawn ?? 0);
    const lost = played - won - drawn;

    if (played === 5 && drawn === 0) {
      const key = `${won}-${lost}`;
      if (buckets.has(key)) {
        buckets.set(key, buckets.get(key) + 1);
        considered++;
      } else {
        other++;
      }
    } else {
      other++;
    }
  }

  const order = ["5-0", "4-1", "3-2", "2-3", "1-4", "0-5"];

  const lines = order.map((k) => {
    const c = buckets.get(k);
    const share = considered ? c / considered : 0;
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

  let choices = system?.lookups?.factions?.map((f) => f.name) ?? [];

  if (!choices.length) {
    const byFaction = engine?.indexes?.get?.()?.byFaction;
    if (byFaction instanceof Map) {
      choices = [...byFaction.values()]
        .map((rows) => rows?.[0]?.Faction ?? rows?.[0]?.faction)
        .filter(Boolean);
    }
  }

  await interaction.respond(
    choices
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }))
  );
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true).trim();

  const factionObj = findFaction(system, input);
  let factionName = factionObj?.name ?? findFactionNameFromDataset(engine, input);

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

  const playersText = topPlayers.length
    ? topPlayers
        .map(
          (p, i) => `${i + 1}) **${p.player}** — **${fmt(p.latestClosingElo)}**`
        )
        .join("\n")
    : "—";

  const perfHeader = perf.considered
    ? `Based on **${perf.considered}** 5-round results`
    : `No clean 5-round results found`;

  const perfNote = perf.other
    ? `\n*Other/unknown results: (${perf.other})*`
    : "";

  const text =
    `**Win Rate**\n` +
    `Games: **${summary.games}**\n` +
    `Win rate: **${pct(summary.winRate)}**\n\n` +
    `**Closing Elo**\n` +
    `Average: **${fmt(elo.average, 1)}**\n` +
    `Median: **${fmt(elo.median, 1)}**\n` +
    `Gap: **${fmt(elo.gap, 1)}**\n\n` +
    `**Player Performance**\n` +
    `${perfHeader}\n` +
    `${perf.text}${perfNote}\n\n` +
    `**Top Players (Current Battlescroll)**\n` +
    `${playersText}`;

  const embed = new EmbedBuilder()
    .setTitle(`${factionName} — Overall`)
    .addFields({ name: "\u200B", value: text })
    .setFooter({ text: "Woehammer GT Database" });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };