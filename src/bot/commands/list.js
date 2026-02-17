// ==================================================
// COMMAND: /list
// PURPOSE: Show a player's submitted list from a specific event
//          (with event + player autocompletes)
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
  return Number.isFinite(v) ? v : 0;
}

function safeKey(x) {
  return norm(x);
}

function getEventName(row) {
  return row["Event Name"] ?? row.eventName ?? row.Event ?? row.event ?? null;
}

function getPlayer(row) {
  return row.Player ?? row.player ?? row["Player Name"] ?? row.playerName ?? null;
}

function getBattlescroll(row) {
  return row.Battlescroll ?? row.battlescroll ?? null;
}

function getListText(row) {
  return (
    row.List ??
    row.list ??
    row["Army List"] ??
    row["Army"] ??
    row["List Text"] ??
    row.listText ??
    null
  );
}

function getFaction(row) {
  return row.Faction ?? row.faction ?? null;
}

function getRecord(row) {
  const w = n(row.Won ?? row.won);
  const d = n(row.Drawn ?? row.drawn);
  const l = n(row.Lost ?? row.lost);
  return { w, d, l, played: w + d + l };
}

function splitLines(text) {
  const raw = (text ?? "").toString().replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trimEnd())
    .filter((s) => s.trim().length);
}

function pickBestRow(rows) {
  // Prefer the row with the most games recorded (some scrapes duplicate partials)
  let best = null;
  let bestScore = -1;

  for (const r of rows || []) {
    const { played } = getRecord(r);
    const score = played || n(r.Played) || 0;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("Show a player's list from an event")
  .addStringOption((opt) =>
    opt
      .setName("event")
      .setDescription("Event name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("player")
      .setDescription("Player name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("battlescroll")
      .setDescription("Optional battlescroll filter (if event has multiple entries)")
      .setRequired(false)
      .setAutocomplete(true)
  );

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);

  // EVENT
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

  // PLAYER (prefer players within selected event)
  if (focused.name === "player") {
    const q = norm(focused.value);
    const eventName = interaction.options.getString("event", false)?.trim() ?? null;
    const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;

    let players = [];
    if (eventName && ctx?.engine?.indexes?.playersForEvent) {
      const rows = ctx.engine.indexes.playersForEvent(eventName, battlescroll) || [];
      players = rows.map((r) => r.player).filter(Boolean);
    } else if (ctx?.engine?.indexes?.playersAll) {
      players = ctx.engine.indexes.playersAll() || [];
    }

    const uniq = Array.from(new Set(players));

    await interaction.respond(
      uniq
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // BATTLESCROLL (prefer battlescrolls present IN the chosen event)
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
  const eventInput = interaction.options.getString("event", true).trim();
  const playerInput = interaction.options.getString("player", true).trim();
  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;

  // Pull event rows from indexes (raw map is fastest and avoids adding new helpers)
  const idx = engine?.indexes?.get?.();
  const byEvent = idx?.byEvent;

  if (!byEvent) {
    await interaction.reply({
      content: "Indexes not ready (missing byEvent). Try again in a moment.",
      ephemeral: true,
    });
    return;
  }

  // Resolve event name case-insensitively (use existing canonical list if available)
  const eventsAll = engine?.indexes?.eventsAll?.() ?? [];
  const eventKey = safeKey(eventInput);
  const canonicalEvent =
    (Array.isArray(eventsAll) ? eventsAll : []).find((e) => safeKey(e) === eventKey) ||
    (Array.isArray(eventsAll) ? eventsAll : []).find((e) => safeKey(e).includes(eventKey)) ||
    eventInput;

  const eventRows = byEvent.get(safeKey(canonicalEvent)) || byEvent.get(eventKey) || [];

  if (!eventRows.length) {
    const embed = new EmbedBuilder()
      .setTitle("List")
      .setFooter({ text: "Woehammer GT Database" })
      .addFields({
        name: "Results",
        value: `No data found for event **${canonicalEvent}**.`,
      });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // Filter rows for player (and battlescroll if given)
  const pKey = safeKey(playerInput);
  const bsKey = battlescroll ? safeKey(battlescroll) : null;

  const matches = eventRows.filter((r) => {
    const p = getPlayer(r);
    if (!p || safeKey(p) !== pKey) return false;

    if (bsKey) {
      const bs = getBattlescroll(r);
      if (safeKey(bs) !== bsKey) return false;
    }
    return true;
  });

  if (!matches.length) {
    const embed = new EmbedBuilder()
      .setTitle("List")
      .setFooter({ text: "Woehammer GT Database" })
      .addFields({
        name: "Results",
        value: bsKey
          ? `Couldn't find **${playerInput}** in **${canonicalEvent}** on **${battlescroll}**.`
          : `Couldn't find **${playerInput}** in **${canonicalEvent}**.`,
      });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  const row = pickBestRow(matches);

  const player = getPlayer(row) ?? playerInput;
  const eventName = getEventName(row) ?? canonicalEvent;
  const faction = getFaction(row) ?? "Unknown";

  const { w, d, l } = getRecord(row);
  const recordStr = `${w}-${d}-${l}`;

  const listText = getListText(row);

  const embed = new EmbedBuilder()
    .setTitle(`List — ${player}`)
    .setFooter({ text: "Woehammer GT Database" });

  const overview =
    `Player: **${player}**\n` +
    `Event: **${eventName}**\n` +
    `Faction: **${faction}**\n` +
    `Record: **${recordStr}**\n` +
    `Battlescroll: **${battlescroll ?? "All"}**`;

  if (!listText || !String(listText).trim()) {
    embed.addFields(
      { name: "Overview", value: overview },
      { name: "List", value: "No list text found for this entry." }
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const lines = splitLines(listText);

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    // This renders as a big “List” section (chunked safely)
    lines: ["**List**", ...lines],
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };