// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll (text-only)
//          - WITH / WITHOUT scoped to the warscroll's faction
//          - Co-includes (Top 3)
//          - Player Elo context (warscroll users vs faction baseline)
//          - Deeper analysis paragraph on: with vs without vs baseline (+ Elo caveat)
//          - Confidence paragraph (how much to trust the signal)
//          - Safe embed chunking + dividers between sections
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
  // Returns the most common faction *name* as it appears in rows
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
// PLAYER FINISH DISTRIBUTION (5–0, 4–1, etc.)
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
    const played = Number(r.Played ?? r.played ?? 0);
    const won = Number(r.Won ?? r.won ?? 0);
    const drawn = Number(r.Drawn ?? r.drawn ?? 0);
    const lost = Math.max(0, played - won - drawn);

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
    return { k, c, share };
  });

  return { considered, other, lines };
}

function topFinishLine(perf) {
  if (!perf?.considered) return "";
  const best = [...perf.lines].sort((a, b) => b.share - a.share)[0];
  if (!best || best.share <= 0) return "";
  return `The most common finish is **${best.k}** (about **${(best.share * 100).toFixed(
    1
  )}%** of clean 5-round results).`;
}

// --------------------------------------------------
// ANALYSIS: WITH / WITHOUT / BASELINE (+ ELO CAVEAT)
// --------------------------------------------------
function analyzeWithWithoutBaseline({
  withWR,
  withoutWR,
  factionWR,
  withGames = 0,
  withoutGames = 0,
  factionGames = 0,
  eloDelta = null, // avg warscroll-players Elo - avg faction Elo
} = {}) {
  if (
    !Number.isFinite(withWR) ||
    !Number.isFinite(withoutWR) ||
    !Number.isFinite(factionWR)
  ) {
    return "";
  }

  const pp = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}pp`;
  const withVsFaction = (withWR - factionWR) * 100;
  const withVsWithout = (withWR - withoutWR) * 100;

  const abs = Math.abs(withVsWithout);
  const weight =
    abs < 1.0
      ? "a small"
      : abs < 3.0
      ? "a modest"
      : abs < 6.0
      ? "a meaningful"
      : "a large";

  let line1 =
    `When included, this warscroll posts a **${pct(withWR)} win rate** ` +
    `versus the faction baseline of **${pct(factionWR)}** ` +
    `(${pp(withVsFaction)}).`;

  let line2 =
    `Compared to lists **without** it (**${pct(withoutWR)}**), that’s ${weight} shift ` +
    `(${pp(withVsWithout)}), which suggests it may be contributing to results.`;

  let line3 = "";
  if (Number.isFinite(eloDelta)) {
    const a = Math.abs(eloDelta);
    if (a >= 25) {
      line3 =
        `However, players using this warscroll average **${Math.round(
          a
        )} Elo ${eloDelta >= 0 ? "higher" : "lower"}** than the faction baseline, ` +
        `so some of the uplift may be driven by **pilot skill** rather than the warscroll alone.`;
    } else {
      line3 =
        `Player Elo for warscroll users is close to the faction baseline, so the win rate differences are **less likely** to be purely a pilot-skill effect.`;
    }
  }

  const warns = [];
  if (withGames > 0 && withGames < 20) warns.push("included sample is small");
  if (withoutGames > 0 && withoutGames < 20) warns.push("without sample is small");
  if (factionGames > 0 && factionGames < 30) warns.push("faction sample is small");

  const line4 = warns.length
    ? `Worth noting: ${warns.join(", ")}, so expect a bit more volatility.`
    : "";

  return [line1, line2, line3, line4].filter(Boolean).join("\n\n");
}

// --------------------------------------------------
// CONFIDENCE PARAGRAPH (HOW MUCH TO TRUST THE SIGNAL)
// --------------------------------------------------
function confidenceParagraph({
  withGames = 0,
  withoutGames = 0,
  factionGames = 0,
  effectPP = null,      // withWR - withoutWR, in percentage points
  eloDelta = null,      // avg warscroll Elo - avg faction Elo
} = {}) {
  if (!Number.isFinite(withGames) || !Number.isFinite(withoutGames)) return "";

  const minBucket = Math.min(withGames || 0, withoutGames || 0);

  // Base confidence from sample size
  // (This is deliberately blunt. Better blunt than lying.)
  let tier =
    minBucket < 15 ? "low" :
    minBucket < 35 ? "medium" :
    "high";

  // Effect size can bump/downshift slightly
  if (Number.isFinite(effectPP)) {
    const a = Math.abs(effectPP);
    if (a >= 6 && minBucket >= 20) tier = tier === "low" ? "medium" : "high";
    if (a < 1 && minBucket < 35) tier = "low";
  }

  // Elo confound can downshift (pilot skill risk)
  if (Number.isFinite(eloDelta) && Math.abs(eloDelta) >= 40 && tier === "high") {
    tier = "medium";
  } else if (Number.isFinite(eloDelta) && Math.abs(eloDelta) >= 40 && tier === "medium") {
    tier = "low";
  }

  const label =
    tier === "high" ? "**High confidence**" :
    tier === "medium" ? "**Medium confidence**" :
    "**Low confidence**";

  const reasons = [];

  reasons.push(
    `based on **${withGames}** included games vs **${withoutGames}** without`
  );

  if (Number.isFinite(effectPP)) {
    reasons.push(`effect size is **${effectPP >= 0 ? "+" : ""}${effectPP.toFixed(1)}pp**`);
  }

  if (Number.isFinite(eloDelta)) {
    const a = Math.round(Math.abs(eloDelta));
    if (a >= 25) {
      reasons.push(`warscroll users are ~**${a} Elo** ${eloDelta >= 0 ? "stronger" : "weaker"} than baseline`);
    }
  }

  if (Number.isFinite(factionGames) && factionGames > 0 && factionGames < 30) {
    reasons.push("overall faction sample is small");
  }

  return `${label}: this signal is ${reasons.join(", ")}. Treat it as a hint, not a verdict.`;
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
    const wsRowsAll = engine.indexes.warscrollRows(warscroll.name);
    factionName = pickTopFactionNameFromRows(wsRowsAll);
  }

  if (!factionName) {
    await interaction.reply({
      content: `Couldn't infer a faction for **${warscroll.name}**.`,
      ephemeral: true,
    });
    return;
  }

  // --------------------------------------------------
  // STATS (FACTION-SCOPED)
  // --------------------------------------------------
  const summary = engine.indexes.warscrollSummaryInFaction(
    warscroll.name,
    factionName,
    3
  );

  const faction = engine.indexes.factionSummary(factionName);

  const includedGames = summary?.included?.games ?? 0;
  const includedWR = summary?.included?.winRate ?? 0;

  const withoutGames = summary?.without?.games ?? 0;
  const withoutWR = summary?.without?.winRate ?? 0;

  const avgOcc = summary?.included?.avgOccurrencesPerList ?? 0;
  const reinforcedPct = summary?.included?.reinforcedPct ?? 0;

  const factionGames = faction?.games ?? 0;
  const factionWR = faction?.winRate ?? 0;

  // Impact in percentage points (pp)
  const impactPP = (includedWR - factionWR) * 100;
  const impactText = `${impactPP >= 0 ? "+" : ""}${impactPP.toFixed(1)} pp`;

  // --------------------------------------------------
  // CO-INCLUDES
  // --------------------------------------------------
  const co = summary?.included?.topCoIncludes || [];
  const coText =
    co.length > 0
      ? co
          .map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`)
          .join("\n")
      : "—";

  // --------------------------------------------------
  // ELO CONTEXT
  // --------------------------------------------------
  const wsRowsAll = engine.indexes.warscrollRows(warscroll.name) || [];
  const wsRowsFaction = wsRowsAll.filter(
    (r) => norm(r.Faction ?? r.faction) === norm(factionName)
  );

  const factionRows = engine.indexes.factionRows(factionName) || [];

  const wsElo = closingEloSummary(wsRowsFaction);
  const factionElo = closingEloSummary(factionRows);

  const eloDelta =
    Number.isFinite(wsElo.average) && Number.isFinite(factionElo.average)
      ? wsElo.average - factionElo.average
      : null;

  const wsPerf = performanceBuckets(wsRowsFaction);
  const wsTopFinish = topFinishLine(wsPerf);

  // ==================================================
  // BUILD EMBED (CHUNKED + DIVIDERS)
  // ==================================================
  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setFooter({
      text: "Woehammer GT Database • Co-includes weighted by lists • Avg occurrences per list",
    })
    .addFields(
      {
        name: "Overview",
        value: `Faction: **${factionName}**`,
        inline: false,
      },
      {
        name: "Included",
        value:
          `Games: **${includedGames}**\n` +
          `Win rate: **${pct(includedWR)}**\n` +
          `Avg occurrences (per list): **${fmt(avgOcc, 2)}**\n` +
          `Reinforced in: **${pct(reinforcedPct)}** of lists\n` +
          `${HR}`,
        inline: false,
      },
      {
        name: "Faction baseline",
        value:
          `Games: **${factionGames}**\n` +
          `Win rate: **${pct(factionWR)}**\n` +
          `Impact (vs faction): **${impactText}**\n` +
          `${HR}`,
        inline: false,
      },
      {
        name: "Without (same faction)",
        value:
          `Games: **${withoutGames}**\n` +
          `Win rate: **${pct(withoutWR)}**\n` +
          `${HR}`,
        inline: false,
      },
      {
        name: "Commonly included with (Top 3)",
        value: `${coText}\n${HR}`,
        inline: false,
      },
      {
        name: "Player Elo Context",
        value:
          `Players using this warscroll (Closing Elo)\n` +
          `Average: **${fmt(wsElo.average, 1)}**\n` +
          `Median: **${fmt(wsElo.median, 1)}**\n` +
          `Gap: **${fmt(wsElo.gap, 1)}**\n\n` +
          `Faction Elo baseline (Closing Elo)\n` +
          `Average: **${fmt(factionElo.average, 1)}**\n` +
          `Median: **${fmt(factionElo.median, 1)}**\n` +
          `${HR}`,
        inline: false,
      }
    );

  // ==================================================
  // WHAT THIS MEANS (PARAGRAPHS)
  // ==================================================
  const analysisA = analyzeWithWithoutBaseline({
    withWR: includedWR,
    withoutWR,
    factionWR,
    withGames: includedGames,
    withoutGames,
    factionGames,
    eloDelta,
  });

  // Elo-skew line (only if notable)
  let analysisB = "";
  if (Number.isFinite(wsElo.average) && Number.isFinite(wsElo.median)) {
    const gap = Math.abs(wsElo.average - wsElo.median);
    if (gap < 8) {
      analysisB =
        "Average and median Elo are close, suggesting a fairly typical spread of player skill rather than results being dominated by extreme outliers.";
    } else if (wsElo.average > wsElo.median) {
      analysisB =
        "Average Elo is meaningfully above the median, suggesting results may be pulled upward by a smaller group of higher-performing players.";
    } else {
      analysisB =
        "Median Elo is meaningfully above the average, suggesting a stronger mid-skill base with fewer extreme high-end outliers.";
    }
  }

  const analysisC = wsTopFinish || "";

  const conf = confidenceParagraph({
    withGames: includedGames,
    withoutGames,
    factionGames,
    effectPP: (includedWR - withoutWR) * 100,
    eloDelta,
  });

  const whatThisMeans = [analysisA, analysisB, analysisC, conf]
    .filter(Boolean)
    .join("\n\n");

  if (whatThisMeans) {
    embed.addFields({
      name: "What this means",
      value: whatThisMeans,
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };