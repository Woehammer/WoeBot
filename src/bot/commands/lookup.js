// ==================================================
// COMMAND: /lookup
// PURPOSE: Unified lookup + analysis for list elements
//          Uses engine indexes for warscrolls (reliable)
//          Uses list-text matching for other lookups
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js"; // adjust if your path differs

// ==================================================
// COMMAND DEFINITION
// NOTE: Required options MUST come before optional options
// NOTE: Descriptions must be <= 100 chars
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription("Lookup stats for warscrolls and list options")
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction scope")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("What are you looking up?")
      .setRequired(true)
      .addChoices(
        { name: "Warscroll", value: "warscroll" },
        { name: "Faction Terrain", value: "terrain" },
        { name: "Heroic Trait", value: "heroicTrait" },
        { name: "Artefact", value: "artefact" },
        { name: "Manifestation", value: "manifestation" },
        { name: "Spell Lore", value: "spellLore" },
        { name: "Prayer Lore", value: "prayerLore" },
        { name: "Battle Tactic", value: "battleTactic" },
        { name: "Regiment of Renown", value: "regimentOfRenown" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Name (autocomplete)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("formation")
      .setDescription("Optional battle formation scope")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("co")
      .setDescription("Co-includes to show (default 3)")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(10)
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

function fmtInt(x) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}`;
}

function pp(deltaWinRate) {
  if (!Number.isFinite(deltaWinRate)) return "—";
  const v = deltaWinRate * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
}

function escapeRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// “word-ish” boundaries that work inside sentences like:
// "Battle Tactic Cards: Master the Paths, Intercept and Recover"
function phraseRegexFragment(phrase) {
  const esc = escapeRegExp(String(phrase).toLowerCase().trim());
  return `(?<![a-z0-9])${esc}(?![a-z0-9])`;
}

// ==================================================
// DATA ACCESS
// ==================================================
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

function getRowGames(r) {
  return Number(r.Played ?? 0) || 0;
}

function getRowWins(r) {
  return Number(r.Won ?? 0) || 0;
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

function median(arr) {
  const nums = (arr || []).filter(Number.isFinite);
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function eloSummary(rows) {
  const elos = (rows || []).map(getClosingElo).filter(Number.isFinite);
  if (!elos.length) return { avg: null, med: null };
  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);
  return { avg, med };
}

function confidenceFromGames(games) {
  const g = Number(games ?? 0);
  if (g < 10) return "Very low confidence: tiny sample, likely noisy.";
  if (g < 30) return "Low confidence: small sample, directional only.";
  if (g < 100) return "Medium confidence: decent sample, still volatile.";
  return "High confidence: large sample, reasonably stable.";
}

// ==================================================
// FACTION MATCHING (same pattern as your other commands)
// ==================================================
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

// ==================================================
// TYPE -> LOOKUP ARRAY
// (must match keys in SYSTEMS.aos.lookups)
// ==================================================
function getLookupArray(system, type) {
  const lookups = system?.lookups ?? {};
  switch (type) {
    case "warscroll":
      return lookups.warscrolls ?? [];
    case "terrain":
      return lookups.terrain ?? [];
    case "heroicTrait":
      return lookups.heroicTraits ?? [];
    case "artefact":
      return lookups.artefacts ?? [];
    case "manifestation":
      return lookups.manifestations ?? [];
    case "spellLore":
      return lookups.spells ?? [];
    case "prayerLore":
      return lookups.prayers ?? [];
    case "battleTactic":
      return lookups.battleTactics ?? [];
    case "regimentOfRenown":
      return lookups.regimentsOfRenown ?? [];
    default:
      return [];
  }
}

function isFactionScopedType(type) {
  return type === "warscroll" || type === "terrain" || type === "heroicTrait" || type === "artefact";
}

// Regiments aren’t “owned” by a single faction but have eligibility.
function regimentAllowedForFaction(item, factionName) {
  const allowed = item?.allowedFactions ?? [];
  if (!Array.isArray(allowed) || !allowed.length) return true;
  return allowed.some((f) => norm(f) === norm(factionName));
}

// Find canonical item by name/alias within a lookup (with scoping rules)
function findLookupItem(system, type, inputName, factionName = null) {
  const q = norm(inputName);
  const arr = getLookupArray(system, type);

  let candidates = arr;

  if (isFactionScopedType(type) && factionName) {
    candidates = arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName));
  }

  if (type === "regimentOfRenown" && factionName) {
    candidates = arr.filter((it) => regimentAllowedForFaction(it, factionName));
  }

  for (const it of candidates) {
    if (norm(it?.name) === q) return it;
  }
  for (const it of candidates) {
    for (const a of it?.aliases ?? []) {
      if (norm(a) === q) return it;
    }
  }
  return null;
}

// Build regex that matches item name/aliases anywhere in the list text (not just pipe lines)
function buildAnyPhraseRegex(item) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return null;

  const alts = phrases.map(phraseRegexFragment).join("|");
  return new RegExp(alts, "i");
}

// Count occurrences (rough) for avg occurrences per list
function countOccurrencesInText(item, text) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return 0;

  const alts = phrases.map(phraseRegexFragment).join("|");
  const re = new RegExp(alts, "ig");

  let n = 0;
  const s = String(text ?? "").toLowerCase();
  while (re.exec(s)) n++;
  return n;
}

// Slice rows for faction (+ optional formation)
function sliceRows(engine, factionName, formationName = null) {
  if (formationName) {
    const rows = engine.indexes.factionRowsInFormation(factionName, formationName);
    return { rows, scopeLabel: formationName };
  }
  const rows = engine.indexes.factionRows(factionName);
  return { rows, scopeLabel: "Overall" };
}

// Compute included/without via list text matching (for non-warscroll types)
function computeItemStatsByText({ rows, item }) {
  const re = buildAnyPhraseRegex(item);
  if (!re) {
    return {
      totalRows: rows.length,
      includedRows: [],
      withoutRows: rows,
      included: { rows: 0, games: 0, wins: 0, winRate: null, avgOcc: null },
      without: { rows: rows.length, games: 0, wins: 0, winRate: null },
    };
  }

  const includedRows = [];
  const withoutRows = [];

  let incGames = 0;
  let incWins = 0;
  let incOccTotal = 0;

  let wGames = 0;
  let wWins = 0;

  for (const r of rows || []) {
    const text = String(getListText(r) ?? "");
    const has = text ? re.test(text.toLowerCase()) : false;

    const g = getRowGames(r);
    const w = getRowWins(r);

    if (has) {
      includedRows.push(r);
      incGames += g;
      incWins += w;
      incOccTotal += countOccurrencesInText(item, text);
    } else {
      withoutRows.push(r);
      wGames += g;
      wWins += w;
    }
  }

  const incWR = incGames > 0 ? incWins / incGames : null;
  const wWR = wGames > 0 ? wWins / wGames : null;

  const includedCount = includedRows.length;
  const avgOcc = includedCount > 0 ? incOccTotal / includedCount : null;

  return {
    totalRows: (rows || []).length,
    includedRows,
    withoutRows,
    included: {
      rows: includedCount,
      games: incGames,
      wins: incWins,
      winRate: incWR,
      avgOcc,
    },
    without: {
      rows: withoutRows.length,
      games: wGames,
      wins: wWins,
      winRate: wWR,
    },
  };
}

// Co-includes warscrolls (from included rows, by list text)
function coIncludesWarscrolls(system, includedRows, { excludeName = null, topN = 3 } = {}) {
  const ws = system?.lookups?.warscrolls ?? [];
  if (!ws.length) return [];

  const compiled = ws
    .filter(Boolean)
    .map((w) => {
      const phrases = [w.name, ...(w.aliases ?? [])].filter(Boolean);
      if (!phrases.length) return null;
      const alts = phrases.map(phraseRegexFragment).join("|");
      const re = new RegExp(alts, "i");
      return { name: w.name, key: norm(w.name), re };
    })
    .filter(Boolean);

  const excludeKey = excludeName ? norm(excludeName) : null;
  const counts = new Map();

  for (const r of includedRows || []) {
    const text = String(getListText(r) ?? "");
    if (!text) continue;

    for (const it of compiled) {
      if (excludeKey && it.key === excludeKey) continue;
      if (it.re.test(text.toLowerCase())) {
        const cur = counts.get(it.key);
        counts.set(it.key, {
          name: it.name,
          listsTogether: (cur?.listsTogether ?? 0) + 1,
        });
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.listsTogether - a.listsTogether)
    .slice(0, topN);
}

function typeLabel(type) {
  switch (type) {
    case "warscroll": return "Warscroll";
    case "terrain": return "Faction Terrain";
    case "heroicTrait": return "Heroic Trait";
    case "artefact": return "Artefact";
    case "manifestation": return "Manifestation";
    case "spellLore": return "Spell Lore";
    case "prayerLore": return "Prayer Lore";
    case "battleTactic": return "Battle Tactic";
    case "regimentOfRenown": return "Regiment of Renown";
    default: return type;
  }
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
    return;
  }

  // name autocomplete (depends on type + faction)
  if (focused.name === "name") {
    const { system, engine } = ctx;
    const type = interaction.options.getString("type", true);
    const factionInput = (interaction.options.getString("faction") ?? "").trim();
    const factionName = factionInput ? findFactionName(system, engine, factionInput) : null;

    let arr = getLookupArray(system, type);

    if (isFactionScopedType(type) && factionName) {
      arr = arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName));
    }

    if (type === "regimentOfRenown" && factionName) {
      arr = arr.filter((it) => regimentAllowedForFaction(it, factionName));
    }

    const choices = arr
      .map((it) => it?.name)
      .filter(Boolean)
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));

    await interaction.respond(choices);
  }
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("faction", true).trim();
  const type = interaction.options.getString("type", true);
  const inputName = interaction.options.getString("name", true).trim();
  const inputFormation = interaction.options.getString("formation", false)?.trim() || null;
  const coN = interaction.options.getInteger("co", false) ?? 3;

  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  const item = findLookupItem(system, type, inputName, factionName);
  if (!item) {
    await interaction.reply({
      content: `Couldn't match **${inputName}** for **${typeLabel(type)}** in **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  const { rows, scopeLabel } = sliceRows(engine, factionName, inputFormation);
  if (!rows.length) {
    await interaction.reply({
      content: inputFormation
        ? `No data found for **${factionName}** using formation **${inputFormation}**.`
        : `No data found for **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  // Faction baseline (same scope)
  let baselineGames = 0;
  let baselineWins = 0;
  for (const r of rows) {
    baselineGames += getRowGames(r);
    baselineWins += getRowWins(r);
  }
  const factionWinRate = baselineGames > 0 ? baselineWins / baselineGames : 0;

  const embed = new EmbedBuilder()
    .setTitle(`/lookup — ${item.name}`)
    .setFooter({ text: "Woehammer GT Database" });

  const header =
    `Scope: **${factionName}** — **${scopeLabel}**\n` +
    `Lookup: **${typeLabel(type)}** • **${item.name}**`;

  // ==================================================
  // SPECIAL CASE: WARSCROLLS USE INDEXES (LIKE /WARSCR0LL)
  // ==================================================
  if (type === "warscroll") {
    const summary = engine.indexes.warscrollSummaryInFaction(item.name, factionName, coN);

    const includedGames = summary.included.games;
    const includedWR = summary.included.winRate;
    const withoutGames = summary.without.games;
    const withoutWR = summary.without.winRate;
    const avgOcc = summary.included.avgOccurrencesPerList;
    const reinforcedPct = summary.included.reinforcedPct ?? 0;

    const vsFaction = includedWR - factionWinRate;
    const vsWithout = includedWR - withoutWR;

    const co = summary.included.topCoIncludes || [];
    const coText =
      co.length > 0
        ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
        : "—";

    // Elo context (same as warscroll.js style)
    const wsRowsAll = engine.indexes.warscrollRows(item.name) ?? [];
    const wsRowsScope = wsRowsAll.filter((r) => norm(r.Faction ?? r.faction) === norm(factionName));
    const wsElo = eloSummary(wsRowsScope);
    const factionRows = engine.indexes.factionRows(factionName) ?? [];
    const factionElo = eloSummary(factionRows);

    const meaning = [
      `When included, this posts **${pct(includedWR)}** versus faction baseline **${pct(factionWinRate)}** (${pp(vsFaction)}).`,
      `Compared to lists without it (**${pct(withoutWR)}**), that’s **${pp(vsWithout)}** — *sample size matters*.`,
      `**Confidence:** ${confidenceFromGames(includedGames)}`,
    ].join("\n\n");

    const lines = [
      `**Included**`,
      `Games: **${fmtInt(includedGames)}**`,
      `Win rate: **${pct(includedWR)}**`,
      `Avg occurrences (per list): **${fmt(avgOcc, 2)}**`,
      `Reinforced in: **${pct(reinforcedPct)}** of lists`,
      HR,
      `**Faction baseline (same scope)**`,
      `Games: **${fmtInt(baselineGames)}**`,
      `Win rate: **${pct(factionWinRate)}**`,
      `Impact (vs faction): **${pp(vsFaction)}**`,
      HR,
      `**Without (same scope)**`,
      `Games: **${fmtInt(withoutGames)}**`,
      `Win rate: **${pct(withoutWR)}**`,
      HR,
      `**Commonly included with (Top ${coN})**`,
      coText,
      HR,
      `**Player Elo Context**`,
      `Players using this (avg/med): **${fmt(wsElo.avg ?? NaN, 1)} / ${fmt(wsElo.med ?? NaN, 1)}**`,
      `Faction baseline (avg/med): **${fmt(factionElo.avg ?? NaN, 1)} / ${fmt(factionElo.med ?? NaN, 1)}**`,
      HR,
      `**What this means**`,
      meaning,
    ];

    addChunkedSection(embed, {
      headerField: { name: "Overview", value: header },
      lines,
    });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ==================================================
  // DEFAULT: NON-WARSCROLL TYPES USE TEXT MATCHING
  // ==================================================
  const stats = computeItemStatsByText({ rows, item });

  const includedWR = stats.included.winRate ?? null;
  const withoutWR = stats.without.winRate ?? null;

  const vsFaction = Number.isFinite(includedWR) ? includedWR - factionWinRate : null;
  const usedPct = stats.totalRows > 0 ? stats.included.rows / stats.totalRows : 0;

  // Elo layer (scope vs included)
  const eloAll = eloSummary(rows);
  const eloInc = eloSummary(stats.includedRows);

  // Co-includes warscrolls from included rows
  const co = coN > 0
    ? coIncludesWarscrolls(system, stats.includedRows, { topN: coN })
    : [];

  const coText =
    co.length > 0
      ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
      : "—";

  const lines = [
    `**Included**`,
    `Used in: **${pct(usedPct)}** (*${stats.included.rows}/${stats.totalRows} lists*)`,
    `Games: **${fmtInt(stats.included.games)}**`,
    `Win rate: **${Number.isFinite(includedWR) ? pct(includedWR) : "—"}**`,
    `Avg occurrences (per list): **${Number.isFinite(stats.included.avgOcc) ? fmt(stats.included.avgOcc, 2) : "—"}**`,
    HR,
    `**Faction baseline (same scope)**`,
    `Games: **${fmtInt(baselineGames)}**`,
    `Win rate: **${pct(factionWinRate)}**`,
    `Impact (vs faction): **${Number.isFinite(vsFaction) ? pp(vsFaction) : "—"}**`,
    HR,
    `**Without (same scope)**`,
    `Games: **${fmtInt(stats.without.games)}**`,
    `Win rate: **${Number.isFinite(withoutWR) ? pct(withoutWR) : "—"}**`,
    HR,
    `**Closing Elo (scope vs included)**`,
    `Scope avg/med: **${fmt(eloAll.avg ?? NaN, 1)} / ${fmt(eloAll.med ?? NaN, 1)}**`,
    `Included avg/med: **${fmt(eloInc.avg ?? NaN, 1)} / ${fmt(eloInc.med ?? NaN, 1)}**`,
    HR,
    `**Commonly included with (Top ${coN})**`,
    coText,
    HR,
    `**Confidence**`,
    confidenceFromGames(stats.included.games),
  ];

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