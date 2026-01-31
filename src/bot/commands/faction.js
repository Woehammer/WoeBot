// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players (Closing Elo)
//          + player performance distribution (5-round results)
//          + deeper explanations (text-only, safe embed chunking)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { rankPlayersInFaction } from "../../engine/stats/playerRankings.js";

import {
  explainSampleSize,
  explainEloBaseline,
  explainEloSkew,
  explainPlayerFinishes,
  explainWinRateVsElo,
} from "../../engine/format/explain.js";

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
const HR = "──────────────";

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
  const elos = rows.map(getClosingElo).filter(Number.isFinite);
  if (!elos.length) return { average: 0, median: 0, gap: 0 };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);

  return { average: avg, median: med, gap: Math.abs(avg - med) };
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
  const order = ["5-0", "4-1", "3-2", "2-3", "1-4", "0-5"];

  const buckets = new Map(order.map((k) => [k, 0]));

  let considered = 0;
  let other = 0;

  for (const r of rows) {
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

  // Shares + lines
  const shares = {};
  const lines = order.map((k) => {
    const c = buckets.get(k) ?? 0;
    const share = considered ? c / considered : 0;
    shares[k] = share;
    return `${k}: **${pct(share)}**`;
  });

  // Identify dominant bucket(s) for better explanations
  const ranked = order
    .map((k) => [k, shares[k]])
    .sort((a, b) => b[1] - a[1]);

  const top = {
    first: ranked[0]?.[0] ?? null,
    firstShare: ranked[0]?.[1] ?? 0,
    second: ranked[1]?.[0] ?? null,
    secondShare: ranked[1]?.[1] ?? 0,
  };

  return {
    considered,
    other,
    text: lines.join("\n"),
    shares,
    top,
  };
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
  const factionName =
    factionObj?.name ?? findFactionNameFromDataset(engine, input);

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

  // ==================================================
  // BUILD EMBED
  // ==================================================
  const embed = new EmbedBuilder()
    .setTitle(`${factionName} — Overall`)
    .setFooter({ text: "Woehammer GT Database" })
    .addFields(
      {
        name: "Win Rate",
        value:
          `Games: **${summary.games}**\n` +
          `Win rate: **${pct(summary.winRate)}**\n` +
          `${HR}`,
      },
      {
        name: "Closing Elo",
        value:
          `Average: **${fmt(elo.average, 1)}**\n` +
          `Median: **${fmt(elo.median, 1)}**\n` +
          `Gap: **${fmt(elo.gap, 1)}**\n` +
          `${HR}`,
      },
      {
        name: "Player Performance",
        value:
          (perf.considered
            ? `Based on **${perf.considered}** 5-round results\n`
            : `No clean 5-round results found\n`) +
          `${perf.text}` +
          (perf.other ? `\n*Other/unknown results: (${perf.other})*` : "") +
          `\n${HR}`,
      },
      {
        name: "Top Players (Current Battlescroll)",
        value: topPlayers.length
          ? topPlayers
              .map(
                (p, i) =>
                  `${i + 1}) **${p.player}** — **${fmt(p.latestClosingElo)}**`
              )
              .join("\n") + `\n${HR}`
          : `—\n${HR}`,
      }
    );

  // ==================================================
  // EXPLANATIONS (PARAGRAPHS)
  // ==================================================
  const explanations = [
    explainSampleSize({ games: summary.games, results: rows.length }),
    explainEloBaseline({ average: elo.average }),
    explainEloSkew({ average: elo.average, median: elo.median }),
    explainPlayerFinishes({ considered: perf.considered, shares: perf.shares }),
    explainWinRateVsElo({
      winRate: summary.winRate,
      avgElo: elo.average,
      medianElo: elo.median,
      games: summary.games,
    }),
  ].filter(Boolean);

  if (explanations.length) {
    embed.addFields({
      name: "What this means",
      value: explanations.join("\n\n"),
    });
  }

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };
