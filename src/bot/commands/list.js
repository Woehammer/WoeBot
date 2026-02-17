// ==================================================
// COMMAND: /list
// PURPOSE: Pull a player's list from a chosen event (with optional battlescroll)
//          + show record + Elo (Starting/Closing/Change)
//          + format list with dividers before key sections
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

// ==================================================
// HELPERS
// ==================================================
function norm(x) {
  return (x ?? "").toString().trim().toLowerCase();
}

function fmtNum(x, dp = 1) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(dp);
}

function fmtEloLine(startingElo, closingElo, change) {
  // If CSV provides Change use it. Otherwise compute if possible.
  const s = Number(startingElo);
  const c = Number(closingElo);

  const hasS = Number.isFinite(s);
  const hasC = Number.isFinite(c);
  const hasChg = Number.isFinite(Number(change));

  const chg =
    hasChg ? Number(change) : hasS && hasC ? c - s : null;

  if (!hasS && !hasC && !Number.isFinite(chg)) return "Elo: —";

  // Use arrow like you asked
  const left = hasS ? fmtNum(s, 1) : "—";
  const right = hasC ? fmtNum(c, 1) : "—";
  const delta = Number.isFinite(chg) ? fmtNum(chg, 1) : "—";

  return `Elo: ${left}→${right} (${delta})`;
}

// Insert a divider BEFORE any line that contains certain section words.
// You asked: regiment, battle tactics, faction terrains
function prettifyListText(raw) {
  if (!raw) return "No list text found for this row.";

  const HR = "──────────────";

  const lines = String(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const out = [];
  for (const line of lines) {
    const t = line.trim();

    // Skip totally empty lines (keeps it tighter)
    if (!t) continue;

    // trigger divider before these sections
    const trigger =
      /\bregiment\b/i.test(t) ||
      /\bbattle tactic/i.test(t) ||
      /\bbattle tactics/i.test(t) ||
      /\bfaction terrain/i.test(t) ||
      /\bfaction terrains/i.test(t);

    if (trigger) {
      // avoid stacking dividers
      const prev = out[out.length - 1];
      if (prev !== HR) out.push(HR);
    }

    out.push(t);
  }

  return out.join("\n");
}

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription("Show a player's list from a specific event")
  .addStringOption((opt) =>
    opt
      .setName("player")
      .setDescription("Player name")
      .setRequired(true)
      .setAutocomplete(true)
  )
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
      .setDescription("Optional battlescroll filter (defaults to All)")
      .setRequired(false)
      .setAutocomplete(true)
  );

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  const q = norm(focused.value);

  // Player autocomplete (global list of players)
  if (focused.name === "player") {
    const players = ctx?.engine?.indexes?.playersAll?.() ?? [];
    const choices = Array.isArray(players) ? players : [];

    await interaction.respond(
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // Event autocomplete
  if (focused.name === "event") {
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

  // Battlescroll autocomplete (prefer battlescrolls for selected event)
  if (focused.name === "battlescroll") {
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
  const playerInput = interaction.options.getString("player", true).trim();
  const eventName = interaction.options.getString("event", true).trim();
  const battlescroll = interaction.options.getString("battlescroll", false)?.trim() ?? null;

  if (!engine?.indexes?.listForPlayerAtEvent) {
    await interaction.reply({
      content: "listForPlayerAtEvent() is missing in indexes.js.",
      ephemeral: true,
    });
    return;
  }

  const data = engine.indexes.listForPlayerAtEvent(playerInput, eventName, battlescroll);

  if (!data) {
    await interaction.reply({
      content: `No list found for **${playerInput}** at **${eventName}**${battlescroll ? ` on **${battlescroll}**` : ""}.`,
      ephemeral: true,
    });
    return;
  }

  const w = data.record?.won ?? 0;
  const d = data.record?.drawn ?? 0;
  const l = data.record?.lost ?? 0;

  const eloLine = fmtEloLine(data.startingElo, data.closingElo, data.change);

  const overview =
    `Player: **${data.player}**\n` +
    `Event: **${data.event}**\n` +
    `Faction: **${data.faction ?? "Unknown"}**\n` +
    `Record: **${w}-${d}-${l}**\n` +
    `${eloLine}\n` +
    `Battlescroll: **${data.battlescroll ?? battlescroll ?? "All"}**`;

  const listText = prettifyListText(data.list);

  const embed = new EmbedBuilder()
    .setTitle(`List — ${data.player}`)
    .setFooter({ text: "Woehammer GT Database" });

  // Put list into chunked section so it doesn't explode embeds
  addChunkedSection(embed, {
    headerField: { name: "Overview", value: overview },
    lines: listText.split("\n"),
  });

  await interaction.reply({ embeds: [embed] });
}

export default { data, run, autocomplete };