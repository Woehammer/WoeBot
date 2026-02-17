// ==================================================
// COMMAND: /event
// PURPOSE: Show players at an event + faction + W/D/L + (optional) pre/post Elo (paged)
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

// ==================================================
// HELPERS
// ==================================================
function norm(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function fmtElo(v) {
  const num = n(v);
  return num === null ? null : num.toFixed(1);
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && `${obj[k]}`.trim() !== "") return obj[k];
  }
  return null;
}

function extractPrePostElo(p) {
  // Be tolerant: your sheet field names WILL drift.
  const pre = pick(p, [
    "preElo",
    "eloPre",
    "openingElo",
    "startingElo",
    "elo_before",
    "eloBefore",
    "pre_tournament_elo",
    "preTournamentElo",
    "Elo Pre",
    "Pre Elo",
    "Opening Elo",
    "Starting Elo",
    "Elo Before",
    "Pre-tournament Elo",
  ]);

  const post = pick(p, [
    "postElo",
    "eloPost",
    "closingElo",
    "endingElo",
    "elo_after",
    "eloAfter",
    "post_tournament_elo",
    "postTournamentElo",
    "Elo Post",
    "Post Elo",
    "Closing Elo",
    "Ending Elo",
    "Elo After",
    "Post-tournament Elo",
  ]);

  const preN = n(pre);
  const postN = n(post);

  return {
    pre: preN,
    post: postN,
  };
}

function fmtDelta(pre, post) {
  if (pre === null || post === null) return null;
  const d = post - pre;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}`;
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("List players at an event with faction + W/D/L (+ optional Elo) (paged)")
  .addStringOption((opt) =>
    opt
      .setName("event")
      .setDescription("Event name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("battlescroll")
      .setDescription("Optional battlescroll filter for the event")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("sort")
      .setDescription("Sort order (default wins)")
      .setRequired(false)
      .addChoices(
        { name: "Wins (desc)", value: "wins" },
        { name: "Name (A→Z)", value: "name" }
      )
  )
  .addIntegerOption((opt) =>
    opt
      .setName("page")
      .setDescription("Page number (default 1)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("pagesize")
      .setDescription("Players per page (default 40, max 80)")
      .setRequired(false)
      .setMinValue(10)
      .setMaxValue(80)
  );

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);

  // ----------------------------
  // EVENT AUTOCOMPLETE
  // ----------------------------
  if (focused.name === "event") {
    const q = norm(focused.value);
    const events = ctx?.engine?.indexes?.eventsAll?.() ?? [];
    const choices = Array.isArray(events) ? events : [];

    await interaction.respond(
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // ----------------------------
  // BATTLESCROLL AUTOCOMPLETE
  // (prefers battlescrolls present IN the chosen event)
  // ----------------------------
  if (focused.name === "battlescroll") {
    const q = norm(focused.value);
    const eventName = interaction.options.getString("event", false)?.trim() ?? null;

    let choices = [];
    if (eventName && ctx?.engine?.indexes?.battlescrollsForEvent) {
      choices = ctx.engine.indexes.battlescrollsForEvent(eventName) || [];
    } else if (ctx?.engine?.indexes?.battlescrollsAll) {
      choices = ctx.engine.indexes.battlescrollsAll() || [];
    }

    await interaction.respond(
      (choices || [])
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }
}

// ==================================================
// RUN
// ==================================================
export async function run(interaction, { engine }) {
  const eventName = interaction.options.getString("event", true).trim();
  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;
  const sort = interaction.options.getString("sort", false) ?? "wins";
  const page = interaction.options.getInteger("page", false) ?? 1;
  const pageSize = interaction.options.getInteger("pagesize", false) ?? 40;

  // Expecting: [{ player, faction, won, drawn, lost, (optional) preElo/postElo }, ...]
  const rows = engine.indexes.playersForEvent(eventName, battlescroll);

  if (!rows?.length) {
    const embed = new EmbedBuilder()
      .setTitle(`Event — ${eventName}`)
      .setFooter({ text: "Woehammer GT Database" })
      .addFields({
        name: "Results",
        value: battlescroll
          ? `No players found for **${eventName}** on **${battlescroll}**.`
          : `No players found for **${eventName}**.`,
      });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // sort
  const sorted = [...rows];
  if (sort === "name") sorted.sort((a, b) => (a.player ?? "").localeCompare(b.player ?? ""));
  else sorted.sort((a, b) => (b.won ?? 0) - (a.won ?? 0)); // wins

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);

  const start = (clampedPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const slice = sorted.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle(`Event — ${eventName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overview =
    `Players: **${total}**\n` +
    `Page: **${clampedPage}/${totalPages}** (showing ${start + 1}-${end})\n` +
    `Sort: **${sort}**\n` +
    `Battlescroll: **${battlescroll ?? "All"}**`;

  const lines = [];
  for (const p of slice) {
    const w = p.won ?? 0;
    const d = p.drawn ?? 0;
    const l = p.lost ?? 0;
    const f = p.faction ?? "Unknown";

    const { pre, post } = extractPrePostElo(p);
    const preTxt = pre === null ? null : fmtElo(pre);
    const postTxt = post === null ? null : fmtElo(post);
    const deltaTxt = fmtDelta(pre, post);

    let eloPart = "";
    if (preTxt || postTxt) {
      const arrow = "→";
      const left = preTxt ?? "?";
      const right = postTxt ?? "?";
      eloPart = ` — Elo: **${left}${arrow}${right}**${deltaTxt ? ` (**${deltaTxt}**)` : ""}`;
    }

    lines.push(`**${p.player}** — ${f} — **${w}-${d}-${l}**${eloPart}`);
    lines.push("---");
  }
  if (lines.length) lines.pop(); // remove trailing separator

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };