// ==================================================
// COMMAND: /faction
// PURPOSE: Stats for factions
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import { getFactionIconPath } from "../ui/icons.js";

import { eloSummary, topEloPlayers } from "../engine/stats/elo.js";

// If you already have these stats helpers, keep these imports.
// If not, delete them and the code will fallback gracefully anyway.
import { factionRecordSummary } from "../engine/stats/aggregate.js"; // optional
import { topImpactWarscrollsForFaction } from "../engine/stats/impact.js"; // optional

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("faction")
  .setDescription("Shows stats for a faction")
  .addStringOption((opt) =>
    opt.setName("name").setDescription("Faction name").setRequired(true)
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

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(x, dp = 1) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(dp);
}

function safeRate(num, den) {
  return den > 0 ? num / den : 0;
}

function findFactionCanonical(system, inputName) {
  const factions = system?.lookups?.factions ?? system?.lookups?.faction ?? [];
  const q = norm(inputName);

  // direct match
  for (const f of factions) {
    if (norm(f.name) === q) return f;
  }

  // alias match
  for (const f of factions) {
    for (const a of f.aliases ?? []) {
      if (norm(a) === q) return f;
    }
  }

  // if no lookup exists, just return raw name
  if (!factions?.length) return { name: inputName };

  return null;
}

function computeWLDFromRows(rows) {
  // Uses Played/Won/Drawn/Lost if present; otherwise derive Lost.
  let games = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const r of rows || []) {
    const p = n(r.Played);
    const w = n(r.Won);
    const d = n(r.Drawn);
    const l = n(r.Lost);

    games += p;
    wins += w;
    draws += d;

    if (Number.isFinite(Number(r.Lost))) {
      losses += l;
    } else {
      losses += Math.max(0, p - w - d);
    }
  }

  // effective wins treating draws as half
  const effWins = wins + 0.5 * draws;
  const winRate = safeRate(effWins, games);

  return { games, wins, draws, losses, winRate };
}

function computeRecordBuckets(rows) {
  // Returns % of players finishing X–Y (like screenshot)
  // Requires some per-event record fields; we’ll try common ones.
  // If you already calculate this elsewhere, swap it in.
  //
  // Expected per-row = one player at one event with fields:
  // WinsAtEvent / LossesAtEvent OR Record e.g. "3-2"
  const counts = new Map([
    ["5-0", 0],
    ["4-1", 0],
    ["3-2", 0],
    ["2-3", 0],
    ["1-4", 0],
    ["0-5", 0],
  ]);

  let total = 0;

  for (const r of rows || []) {
    // try "Record" like "3-2"
    let rec = String(r.Record ?? r.record ?? "").trim();
    if (!rec) {
      // try wins/losses
      const ew = r.EventWins ?? r.eventWins ?? r.WinsAtEvent ?? r.winsAtEvent;
      const el = r.EventLosses ?? r.eventLosses ?? r.LossesAtEvent ?? r.lossesAtEvent;
      if (ew != null && el != null) rec = `${n(ew)}-${n(el)}`;
    }

    if (!counts.has(rec)) continue;
    counts.set(rec, (counts.get(rec) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) {
    return {
      total: 0,
      lines: [
        "5-0: —",
        "4-1: —",
        "3-2: —",
        "2-3: —",
        "1-4: —",
        "0-5: —",
      ].join("\n"),
      bestGuess: null,
    };
  }

  const lines = Array.from(counts.entries())
    .map(([k, v]) => `${k}: ${((v / total) * 100).toFixed(1)}%`)
    .join("\n");

  // find most common
  let best = null;
  for (const [k, v] of counts.entries()) {
    if (!best || v > best.v) best = { k, v };
  }

  return { total, lines, bestGuess: best?.k ?? null };
}

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction, { system, engine }) {
  const input = interaction.options.getString("name", true);

  const factionObj = findFactionCanonical(system, input);
  if (!factionObj?.name) {
    await interaction.reply({
      content: `Couldn't match **${input}** to a known faction in the current lookup.`,
      ephemeral: true,
    });
    return;
  }

  const factionName = factionObj.name;

  // rows for faction
  const rows = engine?.indexes?.factionRows
    ? engine.indexes.factionRows(factionName)
    : (engine?.dataset?.getRows?.() ?? []).filter(
        (r) => norm(r.Faction ?? r.faction) === norm(factionName)
      );

  // overall totals for share
  const allRows = engine?.dataset?.getRows?.() ?? [];
  const allGames = allRows.reduce((acc, r) => acc + n(r.Played), 0);

  // Win rate summary
  const wld = computeWLDFromRows(rows);
  const share = allGames > 0 ? wld.games / allGames : 0;

  // Elo summary (uses your existing engine/stats/elo.js)
  const elo = eloSummary ? eloSummary(rows) : null;

  // Top 3 Elo players (new)
  const topPlayers = topEloPlayers ? topEloPlayers(rows, 3) : [];
  const topPlayersText =
    topPlayers.length > 0
      ? topPlayers
          .map((p, i) => `${i + 1}. ${p.player} — **${fmt(p.elo, 1)}** (${p.lists} lists)`)
          .join("\n")
      : "—";

  // Player performance (5-0 etc.)
  const perf = computeRecordBuckets(rows);

  // Most-used warscrolls (Top 3)
  // If you already have a proper helper, use it. Otherwise fallback to "—".
  let mostUsedText = "—";
  try {
    const idx = engine?.indexes?.get?.();
    // You *might* have usage data already elsewhere. If not, keep as "—".
    // Placeholder: if you have a function, replace this block with it.
    if (topImpactWarscrollsForFaction) {
      const top = topImpactWarscrollsForFaction(engine, factionName, 3);
      if (top?.length) {
        mostUsedText = top
          .map(
            (x, i) =>
              `${i + 1}. ${x.name} — Used ${x.usedPct?.toFixed?.(0) ?? "—"}%, Win ${
                x.winPct?.toFixed?.(0) ?? "—"
              }%, Impact ${x.impactPP >= 0 ? "+" : ""}${x.impactPP?.toFixed?.(0) ?? "—"}pp`
          )
          .join("\n");
      }
    }
  } catch {
    // swallow, keep "—"
  }

  // Summary paragraph (similar to screenshot)
  const avgElo = elo?.average ?? elo?.avg ?? null;
  const medElo = elo?.median ?? null;
  const gapElo = elo?.gap ?? (avgElo != null && medElo != null ? avgElo - medElo : null);

  const summaryLines = [];
  summaryLines.push(
    `Based on **${wld.games} games**, this faction is currently winning **${pct(wld.winRate)}** of the time.`
  );

  if (avgElo != null && medElo != null) {
    summaryLines.push("");
    summaryLines.push(
      `Comparing Elo to the **400 baseline**, this faction has ${
        avgElo >= 400 ? "a well above average" : "a below average"
      } player base: average Elo **${fmt(avgElo, 1)}** (≈${Math.round(avgElo - 400)} over 400) and median **${fmt(
        medElo,
        1
      )}** (≈${Math.round(medElo - 400)} over 400). The gap is **${fmt(gapElo, 1)}**, which suggests: Results are being pulled ${
        gapElo > 20 ? "up by a smaller group of strong players" : "fairly evenly by the player base"
      }.`
    );
  }

  if (perf.bestGuess) {
    summaryLines.push("");
    summaryLines.push(
      `Most players are finishing events around **${perf.bestGuess}** (about ${
        perf.total ? perf.lines.split("\n").find((l) => l.startsWith(`${perf.bestGuess}:`))?.split(": ")[1] : "—"
      }).`
    );
  }

  // --------------------------------------------------
  // ICON / THUMBNAIL
  // --------------------------------------------------
  const factionKey = snake(factionName);
  const iconPath = getFactionIconPath(factionKey);

  // --------------------------------------------------
  // EMBED (single-field layout like your /warscroll)
  // --------------------------------------------------
  const divider = "────────────";

  const text =
    `**${factionName} — Overall**\n\n` +
    `**Win Rate**\n` +
    `Games: **${wld.games}** (${pct(share)} share)\n` +
    `Win rate: **${pct(wld.winRate)}**\n\n` +
    `**Elo**\n` +
    `Average: **${avgElo != null ? fmt(avgElo, 1) : "—"}**\n` +
    `Median: **${medElo != null ? fmt(medElo, 1) : "—"}**\n` +
    `Gap: **${gapElo != null ? fmt(gapElo, 1) : "—"}**\n\n` +
    `**Top Elo players (Top 3)**\n` +
    `${topPlayersText}\n\n` +
    `**Player Performance**\n` +
    `${perf.lines}\n\n` +
    `**Summary**\n` +
    `${summaryLines.join("\n")}\n\n` +
    `${divider}\n\n` +
    `**Most-used warscrolls**\n` +
    `${mostUsedText}`;

  const embed = new EmbedBuilder()
    .addFields({ name: "\u200B", value: text, inline: false })
    .setFooter({ text: "Source: Woehammer GT Database" });

  // Thumbnail attachment (local PNG)
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