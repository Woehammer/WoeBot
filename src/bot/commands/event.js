// ==================================================
// COMMAND: /event
// PURPOSE: Show players at an event + faction + W/D/L + Elo (paged)
// FORMAT (per player):
// ---
// **Name** — Faction
// **W-D-L** Elo:Start→Close (Δ)
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

function buildEloLine(p) {
  const s = Number(p?.startingElo);
  const c = Number(p?.closingElo);

  // if either missing, keep it clean
  if (!Number.isFinite(s) || !Number.isFinite(c)) return "Elo: —";

  const changeRaw = Number(p?.change);
  const delta = Number.isFinite(changeRaw) ? changeRaw : c - s;

  return `Elo:${fmt(s)}→${fmt(c)} (${fmt(delta)})`;
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("List players at an event with faction + W/D/L + Elo (paged)")
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
        { name: "Elo change (desc)", value: "elo" },
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

  if (!engine?.indexes?.playersForEvent) {
    await interaction.reply({
      content: "Missing indexes.playersForEvent(). Update indexes.js first.",
      ephemeral: true,
    });
    return;
  }

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

  // ----------------------------
  // SORT
  // ----------------------------
  const sorted = [...rows];

  if (sort === "name") {
    sorted.sort((a, b) => String(a.player ?? "").localeCompare(String(b.player ?? "")));
  } else if (sort === "elo") {
    // sort by Elo change desc (falls back to computed delta)
    sorted.sort((a, b) => {
      const as = Number(a?.startingElo);
      const ac = Number(a?.closingElo);
      const bs = Number(b?.startingElo);
      const bc = Number(b?.closingElo);

      const aDelta = Number.isFinite(Number(a?.change))
        ? Number(a.change)
        : (Number.isFinite(ac) && Number.isFinite(as) ? ac - as : -Infinity);

      const bDelta = Number.isFinite(Number(b?.change))
        ? Number(b.change)
        : (Number.isFinite(bc) && Number.isFinite(bs) ? bc - bs : -Infinity);

      return bDelta - aDelta;
    });
  } else {
    // wins desc (default)
    sorted.sort((a, b) => (Number(b.won) || 0) - (Number(a.won) || 0));
  }

  // ----------------------------
  // PAGINATION
  // ----------------------------
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);

  const start = (clampedPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const slice = sorted.slice(start, end);

  // ----------------------------
  // EMBED
  // ----------------------------
  const embed = new EmbedBuilder()
    .setTitle(`Event — ${eventName}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overview =
    `Players: **${total}**\n` +
    `Page: **${clampedPage}/${totalPages}** (showing ${start + 1}-${end})\n` +
    `Sort: **${sort}**\n` +
    `Battlescroll: **${battlescroll ?? "All"}**`;

  // Build lines in the exact style requested
  const lines = [];

  for (const p of slice) {
    const player = p.player ?? "Unknown";
    const faction = p.faction ?? "Unknown";
    const w = Number(p.won) || 0;
    const d = Number(p.drawn) || 0;
    const l = Number(p.lost) || 0;

    lines.push("---");
    lines.push(`**${player}** — ${faction}`);
    lines.push(`**${w}-${d}-${l}** ${buildEloLine(p)}`);
  }
  lines.push("---");

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORT
// ==================================================
export default { data, run, autocomplete };