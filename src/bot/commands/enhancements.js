// ==================================================
// COMMAND: /enhancements
// PURPOSE: Manifestations / Heroic Traits / Artefacts usage
//          + win rate when included
//          (scoped to faction, optional formation)
//          (chunked safely like /impact)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js"; // adjust path if needed

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("enhancements")
  .setDescription("Shows top manifestations, heroic traits, and artefacts for a faction (used% + WR)")
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("formation")
      .setDescription("Optional battle formation")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("How many to show per category (default 5, max 25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
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

function fmtInt(x) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}`;
}

function getListText(row) {
  return (
    row["Refined List"] ??
    row.RefinedList ??
    row.refinedList ??
    row.List ??
    row.list ??
    ""
  );
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegexFragment(phrase) {
  const esc = escapeRegExp(String(phrase).toLowerCase().trim());
  return `(?<![a-z0-9])${esc}(?![a-z0-9])`;
}

function getRowGames(r) {
  return Number(r.Played ?? 0) || 0;
}

function getRowWins(r) {
  return Number(r.Won ?? 0) || 0;
}

// Try to get a reliable faction list for autocomplete (same style as impact.js)
function getFactionChoices({ system, engine }) {
  let choices = system?.lookups?.factions?.map((f) => f.name) ?? [];
  if (choices.length) return choices;

  const byFaction = engine?.indexes?.get?.()?.byFaction;
  if (byFaction instanceof Map) {
    return [...byFaction.values()]
      .map((rows) => rows?.[0]?.Faction ?? rows?.[0]?.faction)
      .filter(Boolean);
  }

  return [];
}

function findFactionName(system, engine, inputName) {
  const q = norm(inputName);

  const factions = system?.lookups?.factions ?? [];
  for (const f of factions) {
    if (norm(f.name) === q) return f.name;
    for (const a of f.aliases ?? []) {
      if (norm(a) === q) return f.name;
    }
  }

  const byFaction = engine?.indexes?.get?.()?.byFaction;
  if (byFaction instanceof Map) {
    if (byFaction.has(q)) {
      const rows = byFaction.get(q);
      const any = rows?.[0];
      return any?.Faction ?? any?.faction ?? inputName;
    }
    for (const rows of byFaction.values()) {
      const any = rows?.[0];
      const name = any?.Faction ?? any?.faction;
      if (name && norm(name) === q) return name;
    }
  }

  return null;
}

// --------------------------------------------------
// CORE: count usage + WR (wins/games) within rows that include item
// - usage is "rows/lists that include it at least once"
// - WR is computed from Played/Won for those rows
// --------------------------------------------------
function countLookupUsageWithWR(rows, lookupItems, { filterFaction = null } = {}) {
  const totalRows = (rows || []).length;
  const counts = new Map(); // key -> { name, rows, games, wins, usedPct, winRate }

  const compiled = (lookupItems ?? [])
    .filter(Boolean)
    .filter((it) => {
      if (!filterFaction) return true;
      if (!it.faction) return true;
      return norm(it.faction) === norm(filterFaction);
    })
    .map((it) => {
      const phrases = [it.name, ...(it.aliases ?? [])]
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean);

      if (!phrases.length) return null;

      const alts = phrases.map(phraseRegexFragment).join("|");
      const re = new RegExp(`(?:[•*\\-]\\s*)?(?:${alts})`, "i");

      return { key: norm(it.name), name: it.name, re };
    })
    .filter(Boolean);

  if (!compiled.length) return { totalRows, list: [] };

  for (const r of rows || []) {
    const text = String(getListText(r) ?? "");
    if (!text) continue;

    const rowGames = getRowGames(r);
    const rowWins = getRowWins(r);

    for (const it of compiled) {
      if (!it.re.test(text)) continue;

      const cur =
        counts.get(it.key) ?? { name: it.name, rows: 0, games: 0, wins: 0 };

      cur.rows += 1;
      cur.games += rowGames;
      cur.wins += rowWins;

      counts.set(it.key, cur);
    }
  }

  const list = [...counts.values()]
    .map((x) => ({
      name: x.name,
      rows: x.rows,
      usedPct: totalRows ? x.rows / totalRows : 0,
      games: x.games,
      wins: x.wins,
      winRate: x.games > 0 ? x.wins / x.games : null,
    }))
    .sort((a, b) => {
      // sort by usage desc, tie by win rate desc
      if (b.usedPct !== a.usedPct) return b.usedPct - a.usedPct;
      const aw = Number.isFinite(a.winRate) ? a.winRate : -Infinity;
      const bw = Number.isFinite(b.winRate) ? b.winRate : -Infinity;
      return bw - aw;
    });

  return { totalRows, list };
}

function buildCategoryLines(title, usage, limit) {
  const total = usage?.totalRows ?? 0;
  const items = (usage?.list ?? []).slice(0, limit);

  if (!total) {
    return [`**${title}**`, "—", HR];
  }
  if (!items.length) {
    return [`**${title}**`, "No matches found in list text for this scope.", HR];
  }

  const lines = [`**${title}**`];

  items.forEach((x, i) => {
    const used = pct(x.usedPct);
    const wr = Number.isFinite(x.winRate) ? pct(x.winRate) : "—";
    lines.push(
      `${i + 1}. **${x.name}**`,
      `Used: **${used}** (*${x.rows}/${total}*) | Games: **${fmtInt(x.games)}** | Win: **${wr}** (*${fmtInt(x.wins)}/${fmtInt(x.games)}*)`,
      HR
    );
  });

  return lines;
}

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  const q = norm(focused.value);

  // faction autocomplete
  if (focused.name === "faction") {
    const choices = getFactionChoices(ctx);
    await interaction.respond(
      choices
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
    return;
  }

  // formation autocomplete (scoped if possible)
  if (focused.name === "formation") {
    const { engine, system } = ctx;
    const factionInput = (interaction.options.getString("faction") ?? "").trim();
    const factionName = factionInput ? findFactionName(system, engine, factionInput) : null;

    let formations = [];
    if (factionName && engine?.indexes?.formationsForFaction) {
      formations = engine.indexes.formationsForFaction(factionName);
    } else if (engine?.indexes?.formationsAll) {
      formations = engine.indexes.formationsAll();
    }

    formations = (formations || []).filter(Boolean);

    await interaction.respond(
      formations
        .filter((n) => !q || norm(n).includes(q))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }))
    );
  }
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("faction", true).trim();
  const inputFormation = interaction.options.getString("formation", false)?.trim() || null;
  const limit = interaction.options.getInteger("limit", false) ?? 5;

  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // slice rows (formation optional)
  let rows = [];
  let scopeLabel = "Overall";

  if (inputFormation) {
    rows = engine.indexes.factionRowsInFormation(factionName, inputFormation);
    scopeLabel = inputFormation;

    if (!rows.length) {
      await interaction.reply({
        content: `No data found for **${factionName}** using formation **${inputFormation}**.`,
        ephemeral: true,
      });
      return;
    }
  } else {
    rows = engine.indexes.factionRows(factionName);
    if (!rows.length) {
      await interaction.reply({
        content: `No data found for **${factionName}**.`,
        ephemeral: true,
      });
      return;
    }
  }

  // Count + WR
  const manifestationsUsage = countLookupUsageWithWR(
    rows,
    system?.lookups?.manifestations ?? [],
    { filterFaction: null }
  );

  const traitsUsage = countLookupUsageWithWR(
    rows,
    system?.lookups?.heroicTraits ?? [],
    { filterFaction: factionName }
  );

  const artefactsUsage = countLookupUsageWithWR(
    rows,
    system?.lookups?.artefacts ?? [],
    { filterFaction: factionName }
  );

  // Build lines (then chunk into embed fields safely)
  const lines = [
    ...buildCategoryLines("Manifestations", manifestationsUsage, limit),
    ...buildCategoryLines("Heroic Traits", traitsUsage, limit),
    ...buildCategoryLines("Artefacts", artefactsUsage, limit),
  ];

  const embed = new EmbedBuilder()
    .setTitle(`${factionName} — Enhancements (${scopeLabel})`)
    .setFooter({ text: "Woehammer GT Database" });

  const header =
    inputFormation
      ? `Scope: **${factionName}** using **${inputFormation}**.\nShowing top **${limit}** per category (Used% of lists + win rate when included).`
      : `Scope: **${factionName}** overall.\nShowing top **${limit}** per category (Used% of lists + win rate when included).`;

  addChunkedSection(embed, {
    headerField: { name: "Overview", value: header },
    lines,
  });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };