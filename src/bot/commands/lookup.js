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
// IMPORTANT: Discord requires REQUIRED options to come before OPTIONAL ones.
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription(
    "Lookup + analysis for warscrolls, terrain, traits, artefacts, lores, tactics, regiments of renown"
  )
  // ---- REQUIRED first ----
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
  // ---- OPTIONAL after ----
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
// NOTE: Your data arrays do NOT need item.type fields.
// This command uses the selected option "type" to pick the right lookup list.
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
      // You must expose lookups.spells in your system config if you want this.
      return lookups.spells ?? [];
    case "prayerLore":
      // You must expose lookups.prayers in your system config if you want this.
      return lookups.prayers ?? [];
    case "battleTactic":
      return lookups.battleTactics ?? lookups.battle_tactics ?? [];
    case "regimentOfRenown":
      return lookups.regimentsOfRenown ?? lookups.regiments_of_renown ?? [];
    default:
      return [];
  }
}

// Some lookups are faction-scoped, some aren't.
function isFactionScopedType(type) {
  return (
    type === "warscroll" ||
    type === "terrain" ||
    type === "heroicTrait" ||
    type === "artefact"
  );
}

function isEligibilityScopedType(type) {
  return type === "regimentOfRenown";
}

function typeLabel(type) {
  switch (type) {
    case "warscroll":
      return "Warscroll";
    case "terrain":
      return "Faction Terrain";
    case "heroicTrait":
      return "Heroic Trait";
    case "artefact":
      return "Artefact";
    case "manifestation":
      return "Manifestation Lore";
    case "spellLore":
      return "Spell Lore";
    case "prayerLore":
      return "Prayer Lore";
    case "battleTactic":
      return "Battle Tactic";
    case "regimentOfRenown":
      return "Regiment of Renown";
    default:
      return type;
  }
}

// --------------------------------------------------
// Determine which types actually have entries for a faction
// (used for friendly error messaging)
// --------------------------------------------------
function getAvailableTypesForFaction(system, factionName) {
  const all = [
    { value: "warscroll", label: "Warscroll" },
    { value: "terrain", label: "Faction Terrain" },
    { value: "heroicTrait", label: "Heroic Trait" },
    { value: "artefact", label: "Artefact" },
    { value: "manifestation", label: "Manifestation Lore" },
    { value: "spellLore", label: "Spell Lore" },
    { value: "prayerLore", label: "Prayer Lore" },
    { value: "battleTactic", label: "Battle Tactic" },
    { value: "regimentOfRenown", label: "Regiment of Renown" },
  ];

  return all.filter((t) => {
    const arr = getLookupArray(system, t.value);

    const filtered =
      isFactionScopedType(t.value) && factionName
        ? arr.filter(
            (it) => !it?.faction || norm(it.faction) === norm(factionName)
          )
        : arr;

    if (t.value === "regimentOfRenown") {
      return filtered.some((it) =>
        (it?.allowedFactions ?? []).some((f) => norm(f) === norm(factionName))
      );
    }

    return filtered.length > 0;
  });
}

function validateTypeAvailable(system, factionName, type) {
  const available = getAvailableTypesForFaction(system, factionName).map(
    (x) => x.value
  );
  return available.includes(type);
}

// --------------------------------------------------
// Find canonical item by name/alias within a lookup
// - faction-scoped: optional faction filter
// - RoR: eligibility filter via allowedFactions
// --------------------------------------------------
function findLookupItem(system, type, inputName, factionName = null) {
  const q = norm(inputName);
  const arr = getLookupArray(system, type);

  // Special: Regiment of Renown eligibility
  if (type === "regimentOfRenown" && factionName) {
    for (const it of arr) {
      const eligible = (it?.allowedFactions ?? []).some(
        (f) => norm(f) === norm(factionName)
      );
      if (!eligible) continue;

      if (norm(it?.name) === q) return it;
      for (const a of it?.aliases ?? []) {
        if (norm(a) === q) return it;
      }
    }
    return null;
  }

  // Filter by faction if this type is faction-scoped and items have faction fields
  const candidates =
    isFactionScopedType(type) && factionName
      ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
      : arr;

  // direct name
  for (const it of candidates) {
    if (norm(it?.name) === q) return it;
  }
  // alias
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

  // “soft boundary” approach works well with your |Refined List| format
  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  // match at start or after a pipe/newline, then phrase, then end/pipe/newline
  return new RegExp(`(^|[|\\n\\r])\\s*(?:${alts})(?=$|[|\\n\\r])`, "i");
}

// Count occurrences of this item in the list text (for avg occurrences per list)
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
// Co-includes
// - For warscroll: co-includes warscrolls
// - For tactic: co-includes battle tactics
// - For RoR: co-includes RoR
// - Otherwise: default to warscroll co-includes (still useful)
// --------------------------------------------------
function compileRegexesFromLookup(arr, { factionName = null, eligibilityFaction = null } = {}) {
  const compiled = (arr || [])
    .filter(Boolean)
    .filter((it) => {
      // faction scoped items
      if (factionName && it?.faction) {
        if (norm(it.faction) !== norm(factionName)) return false;
      }
      // eligibility scoped items (RoR)
      if (eligibilityFaction && Array.isArray(it?.allowedFactions)) {
        const ok = it.allowedFactions.some((f) => norm(f) === norm(eligibilityFaction));
        if (!ok) return false;
      }
      return true;
    })
    .map((it) => {
      const phrases = [it?.name, ...(it?.aliases ?? [])].filter(Boolean);
      if (!phrases.length) return null;
      const alts = phrases.map((p) => escapeRegExp(String(p).toLowerCase())).join("|");
      const re = new RegExp(`(^|[|\\n\\r])\\s*(?:${alts})(?=$|[|\\n\\r])`, "i");
      return { name: it.name, key: norm(it.name), re };
    })
    .filter(Boolean);

  return compiled;
}

function coIncludes(system, includedRows, {
  type,
  excludeName = null,
  topN = 3,
  factionName = null,
} = {}) {
  let arr = [];
  let eligibilityFaction = null;

  if (type === "warscroll") arr = system?.lookups?.warscrolls ?? [];
  else if (type === "battleTactic") arr = getLookupArray(system, "battleTactic");
  else if (type === "regimentOfRenown") {
    arr = getLookupArray(system, "regimentOfRenown");
    eligibilityFaction = factionName;
  } else {
    // default: co-includes warscrolls
    arr = system?.lookups?.warscrolls ?? [];
  }

  if (!arr.length) return [];

  const compiled = compileRegexesFromLookup(arr, {
    factionName: type === "warscroll" ? factionName : null,
    eligibilityFaction,
  });

  const excludeKey = excludeName ? norm(excludeName) : null;
  const counts = new Map(); // key -> { name, listsTogether }

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
    const factionName = factionInput
      ? findFactionName(system, engine, factionInput)
      : null;

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
    const factionName = factionInput
      ? findFactionName(system, engine, factionInput)
      : null;

    const arr = getLookupArray(system, type);

    // faction-scoped filter
    let filtered =
      isFactionScopedType(type) && factionName
        ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
        : arr;

    // RoR eligibility filter
    if (type === "regimentOfRenown" && factionName) {
      filtered = filtered.filter((it) =>
        (it?.allowedFactions ?? []).some((f) => norm(f) === norm(factionName))
      );
    }

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
  const type = interaction.options.getString("type", true);
  const inputName = interaction.options.getString("name", true).trim();

  const inputFormation =
    interaction.options.getString("formation", false)?.trim() || null;

  const coN = interaction.options.getInteger("co", false) ?? 3;

  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  // Friendly error if user picked a type that has nothing for that faction
  if (!validateTypeAvailable(system, factionName, type)) {
    const availableLabels = getAvailableTypesForFaction(system, factionName)
      .map((x) => x.label)
      .join(", ");

    await interaction.reply({
      content:
        `No **${typeLabel(type)}** entries are available for **${factionName}**.\n` +
        `Try: ${availableLabels || "another faction"}.`,
      ephemeral: true,
    });
    return;
  }

  const item = findLookupItem(system, type, inputName, factionName);
  if (!item) {
    await interaction.reply({
      content: `Couldn't match **${inputName}** for **${typeLabel(type)}** in scope **${factionName}**.`,
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

  const usedPct =
    stats.totalRows > 0 ? stats.included.rows / stats.totalRows : 0;

  const includedWR = stats.included.winRate ?? null;
  const impactPP =
    Number.isFinite(includedWR) ? (includedWR - factionWinRate) * 100 : null;

  const impactText =
    Number.isFinite(impactPP)
      ? `${impactPP >= 0 ? "+" : ""}${impactPP.toFixed(1)} pp`
      : "—";

  // Elo layer
  const eloAll = eloSummary(rows);
  const eloInc = eloSummary(stats.includedRows);

  // Co-includes (type-aware)
  const co =
    coN > 0
      ? coIncludes(system, stats.includedRows, {
          type,
          excludeName: item.name,
          topN: coN,
          factionName,
        })
      : [];

  const coText =
    co.length > 0
      ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
      : "—";

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  const header =
    `Scope: **${factionName}** — **${scopeLabel}**\n` +
    `Lookup: **${typeLabel(type)}** • **${item.name}**`;

  const lines = [];

  lines.push(
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
    coText
  );

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