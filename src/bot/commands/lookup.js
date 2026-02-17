// ==================================================
// COMMAND: /lookup
// PURPOSE: Unified lookup + analysis for anything that appears in a list
//          (warscrolls, terrain, artefacts, heroic traits, manifestations,
//           spell lores, prayer lores, battle tactics, regiments of renown)
//          Same style output as /warscroll (included/without/baseline/co-includes/elo)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js"; // adjust if your path differs

// ==================================================
// COMMAND DEFINITION
// NOTE: REQUIRED options MUST come before OPTIONAL ones.
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription(
    "Lookup + analysis for warscrolls, terrain, traits, artefacts, lores, manifestations, battle tactics, regiments"
  )
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
      .setDescription("What kind of thing are you looking up?")
      .setRequired(true)
      .addChoices(
        { name: "Warscroll", value: "warscroll" },
        { name: "Faction Terrain", value: "terrain" },
        { name: "Heroic Trait", value: "heroicTrait" },
        { name: "Artefact", value: "artefact" },
        { name: "Manifestation Lore", value: "manifestation" },
        { name: "Spell Lore", value: "spellLore" },
        { name: "Prayer Lore", value: "prayerLore" },

        // NEW
        { name: "Battle Tactic", value: "battleTactic" },
        { name: "Regiment of Renown", value: "regimentOfRenown" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Name of the thing (autocomplete)")
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
      .setDescription("How many co-includes to show (default 3, max 10)")
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

function escapeRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --------------------------------------------------
// DATA ACCESS
// --------------------------------------------------
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

function getClosingElo(r) {
  const candidates = [
    r["Closing Elo"],
    r.ClosingElo,
    r.closingElo,
    r["ClosingElo"],
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function median(nums) {
  const arr = (nums || []).filter(Number.isFinite);
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
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

// --------------------------------------------------
// FACTION MATCHING (same pattern you use elsewhere)
// --------------------------------------------------
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
// TYPE -> LOOKUP ARRAY
// --------------------------------------------------
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

    // NEW
    case "battleTactic":
      return lookups.battleTactics ?? [];
    case "regimentOfRenown":
      return lookups.regimentsOfRenown ?? [];

    default:
      return [];
  }
}

// These are faction-scoped by “belongs to faction”
function isFactionScopedType(type) {
  return (
    type === "warscroll" ||
    type === "terrain" ||
    type === "heroicTrait" ||
    type === "artefact"
  );
}

// RoR: not “belongs to faction”, but eligibility list
function filterEligibleRegiments(items, factionName) {
  if (!factionName) return items ?? [];
  const fq = norm(factionName);
  return (items ?? []).filter((it) => {
    const allowed = it?.allowedFactions ?? it?.allowed_factions ?? null;
    if (!Array.isArray(allowed) || !allowed.length) return true;
    return allowed.some((x) => norm(x) === fq);
  });
}

// --------------------------------------------------
// Find canonical item by name/alias within a lookup
// (optionally faction-scoped / eligibility-scoped)
// --------------------------------------------------
function findLookupItem(system, type, inputName, factionName = null) {
  const q = norm(inputName);
  let arr = getLookupArray(system, type);

  if (type === "regimentOfRenown") {
    arr = filterEligibleRegiments(arr, factionName);
  }

  const candidates =
    isFactionScopedType(type) && factionName
      ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
      : arr;

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

// Build a regex that matches any of the phrases (name + aliases)
function buildAnyPhraseRegex(item) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return null;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  return new RegExp(`(^|[|\\n\\r])\\s*(?:${alts})(?=$|[|\\n\\r])`, "i");
}

function countOccurrencesInText(item, text) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return 0;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  const re = new RegExp(`(^|[|\\n\\r])\\s*(?:${alts})(?=$|[|\\n\\r])`, "ig");

  let n = 0;
  const s = String(text ?? "");
  while (re.exec(s)) n++;
  return n;
}

// --------------------------------------------------
// Slice rows for faction (+ optional formation)
// --------------------------------------------------
function sliceRows(engine, factionName, formationName = null) {
  if (formationName) {
    const rows = engine.indexes.factionRowsInFormation(factionName, formationName);
    return { rows, scopeLabel: formationName };
  }
  const rows = engine.indexes.factionRows(factionName);
  return { rows, scopeLabel: "Overall" };
}

// --------------------------------------------------
// Compute included/without stats for arbitrary “item matched in list text”
// --------------------------------------------------
function computeItemStats({ rows, item }) {
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
    const has = text ? re.test(text) : false;

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

// --------------------------------------------------
// Co-includes (warscrolls only, from included rows)
// --------------------------------------------------
function coIncludesWarscrolls(system, includedRows, { excludeName = null, topN = 3 } = {}) {
  const ws = system?.lookups?.warscrolls ?? [];
  if (!ws.length) return [];

  const compiled = ws
    .filter(Boolean)
    .map((w) => {
      const phrases = [w.name, ...(w.aliases ?? [])].filter(Boolean);
      if (!phrases.length) return null;
      const alts = phrases.map((p) => escapeRegExp(String(p).toLowerCase())).join("|");
      const re = new RegExp(`(^|[|\\n\\r])\\s*(?:${alts})(?=$|[|\\n\\r])`, "i");
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
      if (it.re.test(text)) {
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

    if (type === "regimentOfRenown") {
      arr = filterEligibleRegiments(arr, factionName);
    }

    const filtered =
      isFactionScopedType(type) && factionName
        ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
        : arr;

    const choices = filtered
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
  const inputFormation = interaction.options.getString("formation", false)?.trim() || null;
  const type = interaction.options.getString("type", true);
  const inputName = interaction.options.getString("name", true).trim();
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
      content: `Couldn't match **${inputName}** for type **${type}** in scope **${factionName}**.`,
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

  // Faction baseline (same scope as rows)
  let baselineGames = 0;
  let baselineWins = 0;

  for (const r of rows) {
    baselineGames += getRowGames(r);
    baselineWins += getRowWins(r);
  }
  const factionWinRate = baselineGames > 0 ? baselineWins / baselineGames : 0;

  // Item stats
  const stats = computeItemStats({ rows, item });

  const usedPct = stats.totalRows > 0 ? stats.included.rows / stats.totalRows : 0;

  const includedWR = stats.included.winRate ?? 0;
  const impactPP = (includedWR - factionWinRate) * 100;
  const impactText = `${impactPP >= 0 ? "+" : ""}${impactPP.toFixed(1)} pp`;

  // Elo layer
  const eloAll = eloSummary(rows);
  const eloInc = eloSummary(stats.includedRows);

  // Co-includes (warscrolls only)
  const co =
    coN > 0
      ? coIncludesWarscrolls(system, stats.includedRows, {
          excludeName: type === "warscroll" ? item.name : null,
          topN: coN,
        })
      : [];

  const coText =
    co.length > 0
      ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
      : "—";

  const typeLabel = (() => {
    switch (type) {
      case "warscroll": return "Warscroll";
      case "terrain": return "Faction Terrain";
      case "heroicTrait": return "Heroic Trait";
      case "artefact": return "Artefact";
      case "manifestation": return "Manifestation Lore";
      case "spellLore": return "Spell Lore";
      case "prayerLore": return "Prayer Lore";
      case "battleTactic": return "Battle Tactic";
      case "regimentOfRenown": return "Regiment of Renown";
      default: return type;
    }
  })();

  const header =
    `Scope: **${factionName}** — **${scopeLabel}**\n` +
    `Lookup: **${typeLabel}** • **${item.name}**`;

  const lines = [
    `**Included**`,
    `Used in: **${pct(usedPct)}** (*${stats.included.rows}/${stats.totalRows} lists*)`,
    `Games: **${fmtInt(stats.included.games)}**`,
    `Win rate: **${pct(stats.included.winRate)}**`,
    `Avg occurrences (per list): **${fmt(stats.included.avgOcc ?? NaN, 2)}**`,
    HR,
    `**Faction baseline (same scope)**`,
    `Games: **${fmtInt(baselineGames)}**`,
    `Win rate: **${pct(factionWinRate)}**`,
    `Impact (vs faction): **${impactText}**`,
    HR,
    `**Without (same scope)**`,
    `Games: **${fmtInt(stats.without.games)}**`,
    `Win rate: **${pct(stats.without.winRate)}**`,
    HR,
    `**Closing Elo (scope vs included)**`,
    `Scope avg/med: **${fmt(eloAll.avg ?? NaN, 1)}** / **${fmt(eloAll.med ?? NaN, 1)}**`,
    `Included avg/med: **${fmt(eloInc.avg ?? NaN, 1)}** / **${fmt(eloInc.med ?? NaN, 1)}**`,
    HR,
    `**Commonly included with (Top ${coN})**`,
    coText,
  ];

  const embed = new EmbedBuilder()
    .setTitle(`/lookup — ${item.name}`)
    .setFooter({ text: "Woehammer GT Database" });

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