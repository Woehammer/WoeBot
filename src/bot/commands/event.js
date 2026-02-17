// ==================================================
// COMMAND: /event
// PURPOSE: Show players at an event + faction + W/D/L + Elo change (paged)
// FORMAT:
// ---
// **Name** — Faction
// W-D-L Elo:pre→post (Δ)
// ---
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

// ==================================================
// HELPERS
// ==================================================
function norm(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function fmt(x, dp = 1) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(dp);
}

function getOpeningElo(row) {
  const candidates = [
    row["Opening Elo"],
    row.OpeningElo,
    row.openingElo,
    row["Starting Elo"],
    row.StartingElo,
    row.startingElo,
    row["Pre Elo"],
    row.PreElo,
    row.preElo,
  ];

  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
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

function getBestEloForPlayerEvent(p) {
  // Prefer values returned by indexes.playersForEvent()
  const pre = Number.isFinite(Number(p.openingElo)) ? Number(p.openingElo) : null;
  const post = Number.isFinite(Number(p.closingElo)) ? Number(p.closingElo) : null;

  // If indexes didn't supply, try reading raw row if present
  const rowPre =
    pre ?? (p.__row ? getOpeningElo(p.__row) : null);
  const rowPost =
    post ?? (p.__row ? getClosingElo(p.__row) : null);

  return { pre: rowPre, post: rowPost };
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("List players at an event with faction + W/D/L + Elo change (paged)")
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

  // EVENT AUTOCOMPLETE
  if (focused.name === "event") {
    const q = norm(focused.value);
    const events = ctx?.engine?.indexes?.eventsAll?.() ?? [];

    await interaction.respond(
      events
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // BATTLESCROLL AUTOCOMPLETE (prefer those present in chosen event)
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
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
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

  // Expect: [{ player, faction, won, drawn, lost, openingElo?, closingElo?, __row? }, ...]
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

  // Sort
  const sorted = [...rows];
  if (sort === "name") {
    sorted.sort((a, b) => (a.player ?? "").localeCompare(b.player ?? ""));
  } else {
    sorted.sort((a, b) => (b.won ?? 0) - (a.won ?? 0));
  }

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
    const player = p.player ?? "Unknown";
    const faction = p.faction ?? "Unknown";
    const w = p.won ?? 0;
    const d = p.drawn ?? 0;
    const l = p.lost ?? 0;

    const { pre, post } = getBestEloForPlayerEvent(p);
    let eloLine = "Elo: —";
    if (Number.isFinite(pre) && Number.isFinite(post)) {
      const delta = post - pre;
      eloLine = `Elo:${fmt(pre)}→${fmt(post)} (${fmt(delta)})`;
    } else if (Number.isFinite(post)) {
      eloLine = `Elo:→${fmt(post)}`;
    }

    lines.push("---");
    lines.push(`**${player}** — ${faction}`);
    lines.push(`**${w}-${d}-${l}** ${eloLine}`);
  }
  lines.push("---");

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };