// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll
//          (WITH/WITHOUT scoped to the warscroll's faction)
//          + Elo context for users of the warscroll
//          (TEXT ONLY – no images, no thumbnails)
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
    opt.setName("name").setDescription("Warscroll name").setRequired(true)
  );

// ==================================================
// HELPERS
// ==================================================
const HR = "────────────";

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

// --------------------------------------------------
// PLAYER FINISH DISTRIBUTION (warscroll rows)
// Uses 5-round no-draw as clean buckets.
// Returns: { considered, other, buckets, topKey, topShare }
// --------------------------------------------------
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

  // find dominant bucket
  let topKey = null;
  let topCount = -1;
  for (const [k, c] of buckets.entries()) {
    if (c > topCount) {
      topCount = c;
      topKey = k;
    }
  }

  const topShare = considered > 0 ? topCount / considered : 0;

  return { considered, other, buckets, topKey, topShare };
}

// --------------------------------------------------
// Bot analysis helpers (sane thresholds)
// --------------------------------------------------
function eloSkewText({ avg, med }) {
  const gap = Math.abs(avg - med);

  // IMPORTANT: don’t overclaim on tiny gaps
  if (gap < 10) return "Average and median Elo are close, suggesting a fairly typical spread of player skill.";
  if (avg > med) return "Average Elo is higher than the median, suggesting results are slightly lifted by stronger players (some skew).";
  return "Median Elo is higher than the average, suggesting a broader mid-skill base with fewer extreme outliers.";
}

function eloVsFactionText({ avgIncluded, avgFaction }) {
  const delta = avgIncluded - avgFaction;

  if (!Number.isFinite(avgIncluded) || !Number.isFinite(avgFaction)) return "";
  if (Math.abs(delta) < 10) {
    return "The Elo profile of players using this warscroll is very close to the faction’s overall Elo baseline.";
  }
  if (delta > 0) {
    return `Players using this warscroll skew stronger than the faction average by about **${Math.round(delta)}** Elo — performance may be influenced by pilot skill.`;
  }
  return `Players using this warscroll skew weaker than the faction average by about **${Math.round(Math.abs(delta))}** Elo — any positive impact may be especially meaningful.`;
}

function finishText({ topKey, topShare, considered }) {
  if (!considered) return "No clean 5-round results available to infer typical finishes for this warscroll.";
  // If the “top” bucket is only marginally top, avoid claiming “most”
  if (topShare < 0.35) {
    return `Finishes are spread out — no single result dominates across the **${considered}** clean 5-round results.`;
  }
  return `The most common finish is **${topKey}** (about **${pct(topShare)}** of clean 5-round results).`;
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

  // If lookup doesn't provide it, infer from warscroll rows
  const allWsRows = engine.indexes.warscrollRows(warscroll.name) || [];

  if (!factionName) {
    factionName = pickTopFactionNameFromRows(allWsRows);
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
  // ELO LAYER
  // --------------------------------------------------
  // Warscroll rows should already be "included" rows; we still filter to faction for safety.
  const wsFactionRows = allWsRows.filter(
    (r) => norm(r.Faction ?? r.faction) === norm(factionName)
  );

  const wsElo = closingEloSummary(wsFactionRows);

  // Faction Elo baseline (all rows for faction)
  const factionRows = engine.indexes.factionRows(factionName) || [];
  const factionElo = closingEloSummary(factionRows);

  // Finishes for warscroll users (not faction-wide)
  const perf = performanceBuckets(wsFactionRows);

  // --------------------------------------------------
  // EMBED (chunked fields to avoid 1024 limit)
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setFooter({ text: "Woehammer GT Database • Co-includes weighted by lists • Avg occurrences per list" });

  // Header / meta
  embed.addFields({
    name: "Overview",
    value: `Faction: **${factionName}**`,
  });

  // Included
  embed.addFields({
    name: "Included",
    value:
      `Games: **${includedGames}**\n` +
      `Win rate: **${pct(includedWR)}**\n` +
      `Avg occurrences (per list): **${fmt(avgOcc, 2)}**\n` +
      `Reinforced in: **${pct(reinforcedPct)}** of lists\n` +
      `${HR}`,
  });

  // Faction baseline
  embed.addFields({
    name: "Faction baseline",
    value:
      `Games: **${factionGames}**\n` +
      `Win rate: **${pct(factionWR)}**\n` +
      `Impact (vs faction): **${impactText}**\n` +
      `${HR}`,
  });

  // Without
  embed.addFields({
    name: "Without (same faction)",
    value:
      `Games: **${withoutGames}**\n` +
      `Win rate: **${pct(withoutWR)}**\n` +
      `${HR}`,
  });

  // Co-includes
  embed.addFields({
    name: "Commonly included with (Top 3)",
    value: `${coText}\n${HR}`,
  });

  // Elo block
  const eloBlock =
    (wsElo.count
      ? `Players using this warscroll (Closing Elo)\n` +
        `Average: **${fmt(wsElo.average, 1)}**\n` +
        `Median: **${fmt(wsElo.median, 1)}**\n` +
        `Gap: **${fmt(wsElo.gap, 1)}**\n\n`
      : `Players using this warscroll (Closing Elo)\n` +
        `No Elo values found for this warscroll slice.\n\n`) +
    (factionElo.count
      ? `Faction Elo baseline (Closing Elo)\n` +
        `Average: **${fmt(factionElo.average, 1)}**\n` +
        `Median: **${fmt(factionElo.median, 1)}**`
      : `Faction Elo baseline (Closing Elo)\nNo Elo values found for this faction.\n`) +
    `\n${HR}`;

  embed.addFields({
    name: "Player Elo Context",
    value: eloBlock,
  });

  // Bot analysis (short, sensible, finish-aware)
  const analysisParts = [];

  // Elo vs faction (only if we have both)
  const vsFaction = eloVsFactionText({
    avgIncluded: wsElo.average,
    avgFaction: factionElo.average,
  });
  if (vsFaction) analysisParts.push(vsFaction);

  // Skew (only if we have a warscroll slice)
  if (wsElo.count) analysisParts.push(eloSkewText({ avg: wsElo.average, med: wsElo.median }));

  // Finishes (dominant bucket)
  analysisParts.push(finishText({ topKey: perf.topKey, topShare: perf.topShare, considered: perf.considered }));

  // Wrap it
  if (analysisParts.length) {
    embed.addFields({
      name: "What this means",
      value: analysisParts.join("\n\n"),
    });
  }

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };