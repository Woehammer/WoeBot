// ==================================================
// COMMAND: /faction
// PURPOSE: Faction-level stats + top players (Closing Elo)
//          + player performance distribution (5-round results)
//          + deeper explanations (text-only, safe embed chunking)
//          + OPTIONAL: battle formation filter
//          + NEW: Manifestations / Heroic Traits / Artefacts usage
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
  )
  .addStringOption((opt) =>
    opt
      .setName("formation")
      .setDescription("Optional battle formation")
      .setRequired(false)
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
  const elos = (rows || []).map(getClosingElo).filter(Number.isFinite);
  if (!elos.length) return { average: 0, median: 0, gap: 0 };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);

  return { average: avg, median: med, gap: Math.abs(avg - med) };
}

// --------------------------------------------------
// LIST TEXT ACCESS (prefer Refined List)
// --------------------------------------------------
function getListText(row) {
  return (
    row["Refined List"] ??
    row.RefinedList ??
    row.refinedList ??
    row.List ??
    row.list ??
    ""
  );
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Count usage of lookup items in the faction rows.
 * - Counts "rows that include it at least once"
 * - Good for traits/artefacts/manifestation lores
 */
function countLookupUsage(rows, lookupItems, { filterFaction = null } = {}) {
  const counts = new Map(); // norm(name) -> { name, n }

  const compiled = (lookupItems ?? [])
    .filter(Boolean)
    .filter((it) => {
      if (!filterFaction) return true;
      if (!it.faction) return true; // allow unfactioned items
      return norm(it.faction) === norm(filterFaction);
    })
    .map((it) => {
      const phrases = [it.name, ...(it.aliases ?? [])]
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean);

      if (!phrases.length) return null;

      const pattern = phrases
        .map((p) => escapeRegExp(p.toLowerCase()))
        .join("|");

      // soft boundaries work well for your pipe-delimited refined lists
      const re = new RegExp(`(^|[|\\n\\r])\\s*(?:${pattern})\\b`, "i");

      return { key: norm(it.name), name: it.name, re };
    })
    .filter(Boolean);

  if (!compiled.length) return { totalRows: rows.length, list: [] };

  for (const r of rows || []) {
    const text = String(getListText(r) ?? "");
    if (!text) continue;

    for (const it of compiled) {
      if (it.re.test(text)) {
        const cur = counts.get(it.key);
        counts.set(it.key, { name: it.name, n: (cur?.n ?? 0) + 1 });
      }
    }
  }

  const list = [...counts.values()].sort((a, b) => b.n - a.n);
  return { totalRows: (rows || []).length, list };
}

function formatTopUsageField(title, usage, { topN = 5 } = {}) {
  const total = usage?.totalRows ?? 0;
  const items = usage?.list ?? [];

  if (!total) return { name: title, value: `—\n${HR}` };

  if (!items.length) {
    return {
      name: title,
      value: `No matches found in list text for this scope.\n${HR}`,
    };
  }

  const top = items.slice(0, topN);
  const lines = top.map((x, i) => {
    const share = total ? x.n / total : 0;
    return `${i + 1}) **${x.name}** — **${pct(share)}** (*${x.n}/${total}*)`;
  });

  return { name: title, value: `${lines.join("\n")}\n${HR}` };
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

  for (const r of rows || []) {
    const played = Number(r.Played ?? 0);
    const won = Number(r.Won ?? 0);
    const drawn = Number(r.Drawn ?? 0);
    const lost = played - won - drawn;

    if (played === 5 && drawn === 0) {
      const key = `${won}-${lost}`;
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
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
    const c = buckets.get(k) ?? 0;
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
  const q = norm(focused.value);

  // ------------------------------
  // Faction autocomplete
  // ------------------------------
  if (focused.name === "name") {
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
    return;
  }

  // ------------------------------
  // Formation autocomplete
  // ------------------------------
  if (focused.name === "formation") {
    // try to scope formations by the selected faction (if present)
    const factionInput = (interaction.options.getString("name") ?? "").trim();
    const factionObj = factionInput ? findFaction(system, factionInput) : null;
    const factionName =
      factionObj?.name ??
      (factionInput ? findFactionNameFromDataset(engine, factionInput) : null);

    let formations = [];

    if (factionName && engine?.indexes?.formationsForFaction) {
      formations = engine.indexes.formationsForFaction(factionName);
    } else if (engine?.indexes?.formationsAll) {
      formations = engine.indexes.formationsAll();
    }

    formations = (formations || []).filter(Boolean);

    await interaction.respond(
      formations
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
  }
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("name", true).trim();
  const inputFormation =
    interaction.options.getString("formation", false)?.trim() || null;

  const factionObj = findFaction(system, inputFaction);
  const factionName =
    factionObj?.name ?? findFactionNameFromDataset(engine, inputFaction);

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // ------------------------------
  // Slice rows (formation optional)
  // ------------------------------
  let rows = [];
  let summary = null;
  let scopeLabel = "Overall";

  if (inputFormation) {
    rows = engine.indexes.factionRowsInFormation(factionName, inputFormation);
    summary = engine.indexes.factionSummaryInFormation
      ? engine.indexes.factionSummaryInFormation(factionName, inputFormation)
      : null;
    scopeLabel = inputFormation;

    if (!rows.length) {
      await interaction.reply({
        content: `No data found for **${factionName}** using formation **${inputFormation}**.`,
        ephemeral: true,
      });
      return;
    }
  } else {
    rows = engine.indexes.factionRows(factionName);
    summary = engine.indexes.factionSummary(factionName);

    if (!rows.length) {
      await interaction.reply({
        content: `No data found for **${factionName}**.`,
        ephemeral: true,
      });
      return;
    }
  }

  // safety if summary helper missing
  if (!summary) {
    let games = 0;
    let wins = 0;
    for (const r of rows) {
      games += Number(r.Played ?? 0) || 0;
      wins += Number(r.Won ?? 0) || 0;
    }
    summary = { games, winRate: games > 0 ? wins / games : 0 };
  }

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
  // NEW: LIST-BASED LOADOUT USAGE (SCOPED TO THIS VIEW)
  // - uses already-sliced `rows`, so formation filter is respected
  // ==================================================
  const manifestationsUsage = countLookupUsage(
    rows,
    system?.lookups?.manifestations ?? [],
    { filterFaction: null } // manifestations not faction-scoped
  );

  const traitsUsage = countLookupUsage(
    rows,
    system?.lookups?.heroicTraits ?? [],
    { filterFaction: factionName }
  );

  const artefactsUsage = countLookupUsage(
    rows,
    system?.lookups?.artefacts ?? [],
    { filterFaction: factionName }
  );

  const manField = formatTopUsageField(
    "Manifestations (Top 5)",
    manifestationsUsage,
    { topN: 5 }
  );

  const traitField = formatTopUsageField(
    "Heroic Traits (Top 5)",
    traitsUsage,
    { topN: 5 }
  );

  const artField = formatTopUsageField(
    "Artefacts (Top 5)",
    artefactsUsage,
    { topN: 5 }
  );

  // ==================================================
  // BUILD EMBED (CHUNKED + DIVIDERS)
  // ==================================================
  const embed = new EmbedBuilder()
    .setTitle(`${factionName} — ${scopeLabel}`)
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
      },

      // ==================================================
      // NEW SECTIONS (DO NOT REMOVE EXISTING OUTPUT)
      // ==================================================
      manField,
      traitField,
      artField
    );

  // ==================================================
  // EXPLANATIONS (PARAGRAPHS)
  // ==================================================
  const explanations = [
    explainSampleSize({ games: summary.games, results: rows.length }),
    explainEloBaseline({ average: elo.average }),
    explainEloSkew({ average: elo.average, median: elo.median }),
    explainPlayerFinishes({
      considered: perf.considered,
    }),
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
      value:
        (inputFormation
          ? `This section applies **only** to **${factionName}** using **${inputFormation}**.\n\n`
          : "") + explanations.join("\n\n"),
    });
  }

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };