// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll
//          (WITH/WITHOUT scoped to the warscroll's faction)
//          + Player Elo context
//          + Text-only analysis + confidence
//          + Autocomplete
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

function eloSummary(rows) {
  const elos = (rows || []).map(getClosingElo).filter(Number.isFinite);
  if (!elos.length) return { n: 0, average: null, median: null, gap: null };

  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);
  const gap = Math.abs(avg - med);

  return { n: elos.length, average: avg, median: med, gap };
}

function findWarscrollCanonical(system, inputName) {
  const ws = system?.lookups?.warscrolls ?? [];
  const q = norm(inputName);

  for (const w of ws) {
    if (norm(w.name) === q) return w;
  }

  for (const w of ws) {
    for (const a of w.aliases ?? []) {
      if (norm(a) === q) return w;
    }
  }

  return null;
}

function pickTopFactionNameFromRows(rows) {
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

function confidenceFromGames(games) {
  const g = Number(games ?? 0);
  if (g < 10) return "Very low confidence: tiny sample, likely noisy.";
  if (g < 30) return "Low confidence: small sample, treat as directional only.";
  if (g < 100) return "Medium confidence: decent sample, still some volatility.";
  return "High confidence: large sample, trends should be fairly stable.";
}

function pp(deltaWinRate) {
  if (!Number.isFinite(deltaWinRate)) return "—";
  const v = deltaWinRate * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
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

  // --------------------------------------------------
  // CO-INCLUDES
  // --------------------------------------------------
  const co = summary.included.topCoIncludes || [];
  const coText =
    co.length > 0
      ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
      : "—";

  // --------------------------------------------------
  // ELO CONTEXT
  // --------------------------------------------------
  // Players using this warscroll (rows where the warscroll appears, then faction-filter)
  const wsRowsAll = engine.indexes.warscrollRows(warscroll.name) ?? [];
  const wsRowsFaction = wsRowsAll.filter(
    (r) => norm(r.Faction ?? r.faction) === norm(factionName)
  );

  const wsElo = eloSummary(wsRowsFaction);

  // Faction baseline Elo (all rows for that faction)
  const factionRows = engine.indexes.factionRows(factionName) ?? [];
  const factionElo = eloSummary(factionRows);

  // --------------------------------------------------
  // ANALYSIS PARAGRAPHS
  // --------------------------------------------------
  const vsFaction = includedWR - factionWR;
  const vsWithout = includedWR - withoutWR;

  const eloDelta =
    Number.isFinite(wsElo.average) && Number.isFinite(factionElo.average)
      ? wsElo.average - factionElo.average
      : null;

  const p1 =
    `When included, this warscroll posts a **${pct(includedWR)}** win rate versus the faction baseline of **${pct(
      factionWR
    )}** (${pp(vsFaction)}).`;

  const p2 =
    `Compared to lists **without** it (${pct(withoutWR)}), that’s a shift of **${pp(
      vsWithout
    )}**, which suggests it may be contributing — *but sample size matters*.`;

  let p3 = "";
  if (Number.isFinite(eloDelta)) {
    const abs = Math.abs(eloDelta);
    if (abs < 10) {
      p3 =
        `Player skill looks broadly similar to the faction baseline (about **${fmt(
          abs,
          0
        )} Elo** difference), so the uplift is less likely to be “just better pilots”.`;
    } else {
      p3 =
        `However, players using this warscroll average about **${fmt(
          abs,
          0
        )} Elo** ${eloDelta >= 0 ? "higher" : "lower"} than the faction baseline, so some of the uplift may be driven by pilot skill rather than the warscroll alone.`;
    }
  }

  const confidence = confidenceFromGames(includedGames);

  // --------------------------------------------------
  // BUILD EMBED (TEXT ONLY)
  // --------------------------------------------------
  const embed = new EmbedBuilder()
    .setTitle(warscroll.name)
    .setDescription("Stats from Woehammer GT Database") // <-- the “missing description”
    .setFooter({
      text: "Woehammer GT Database • Co-includes weighted by lists • Avg occurrences per list",
    });

  // Overview block (with separators)
  embed.addFields({
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
      `Impact (vs faction): **${pp(vsFaction)}**\n` +
      `${HR}\n\n` +
      `**Without (same faction)**\n` +
      `Games: **${withoutGames}**\n` +
      `Win rate: **${pct(withoutWR)}**\n` +
      `${HR}\n\n` +
      `**Commonly included with (Top 3)**\n` +
      `${coText}\n` +
      `${HR}`,
    inline: false,
  });

  // Elo block
  embed.addFields({
    name: "Player Elo Context",
    value:
      `Players using this warscroll (Closing Elo)\n` +
      `Average: **${Number.isFinite(wsElo.average) ? fmt(wsElo.average, 1) : "—"}**\n` +
      `Median: **${Number.isFinite(wsElo.median) ? fmt(wsElo.median, 1) : "—"}**\n` +
      `Gap: **${Number.isFinite(wsElo.gap) ? fmt(wsElo.gap, 1) : "—"}**\n\n` +
      `Faction Elo baseline (Closing Elo)\n` +
      `Average: **${
        Number.isFinite(factionElo.average) ? fmt(factionElo.average, 1) : "—"
      }**\n` +
      `Median: **${
        Number.isFinite(factionElo.median) ? fmt(factionElo.median, 1) : "—"
      }**\n` +
      `${HR}`,
    inline: false,
  });

  // What this means
  const meaningParas = [p1, p2, p3, `**Confidence:** ${confidence}`].filter(Boolean);

  embed.addFields({
    name: "What this means",
    value: meaningParas.join("\n\n"),
    inline: false,
  });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };