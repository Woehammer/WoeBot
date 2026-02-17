// ==================================================
// COMMAND: /event
// PURPOSE: Show players at an event + faction + W/D/L (paged)
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

function norm(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function pct(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "0.0%";
  return `${(v * 100).toFixed(1)}%`;
}

export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("List players at an event with faction + W/D/L (paged)")
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
        { name: "Win rate (desc)", value: "wr" },
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

export async function run(interaction, { engine }) {
  const eventName = interaction.options.getString("event", true).trim();
  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;
  const sort = interaction.options.getString("sort", false) ?? "wins";
  const page = interaction.options.getInteger("page", false) ?? 1;
  const pageSize = interaction.options.getInteger("pagesize", false) ?? 40;

  const rows = engine.indexes.playersForEvent(eventName, battlescroll);

  if (!rows?.length) {
    const embed = new EmbedBuilder()
      .setTitle("Event")
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
  if (sort === "name") sorted.sort((a, b) => a.player.localeCompare(b.player));
  else if (sort === "wr") sorted.sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  else sorted.sort((a, b) => (b.won ?? 0) - (a.won ?? 0)); // wins

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);

  const start = (clampedPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  const slice = sorted.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle("Battleplans") // lol no. This is /event. Keep it simple.
    .setTitle(`Event — ${eventName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overview =
    `Players: **${total}**\n` +
    `Page: **${clampedPage}/${totalPages}** (showing ${start + 1}-${end})\n` +
    `Sort: **${sort}**\n` +
    `Battlescroll: **${battlescroll ?? "All"}**`;

  const lines = slice.map((p) => {
    const w = p.won ?? 0;
    const d = p.drawn ?? 0;
    const l = p.lost ?? 0;
    const g = p.played ?? (w + d + l);
    const f = p.faction ?? "Unknown";
    const wr = pct(p.winRate ?? (g ? (w + 0.5 * d) / g : 0));
    return `**${p.player}** — ${f} — **${w}-${d}-${l}** (${g}g, ${wr})`;
  });

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };