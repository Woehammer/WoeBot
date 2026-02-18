// ==================================================
// COMMAND: /lookup
// PURPOSE: Unified lookup + analysis for anything that appears in a list
//          (warscrolls, terrain, artefacts, heroic traits, manifestations,
//           spell lores, prayer lores, battle tactics, regiments of renown)
//          Output style: /warscroll-like stats + analysis blurb + Elo context
//
// REVISION NOTES (what changed):
// - Spell/Prayer Lore autocomplete now shows ONLY items actually USED in lists
//   for the selected faction (+ optional formation). Cached per scope.
// - Fixed "re.test" statefulness bug by compiling regex WITHOUT /g for checks.
// - Fixed /lookup warscroll path: included/without rows now derived via list text
//   so "Used in % (x/y lists)" is correct (no more 0/55 nonsense).
// - getLookupArray keys updated to match your aos.js registration
//   (manifestationLore, spellLore, prayerLore, battleTactics, regimentsOfRenown).
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

// ==================================================
// COMMAND DEFINITION
// NOTE: Discord requires required options before optional options.
// ALSO: option description max length is 100 chars.
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("lookup")
  .setDescription(
    "Lookup + analysis for list elements (warscrolls, traits, artefacts, lores, tactics, RoR)"
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
      .setDescription("How many co-includes to show (0-10, default 3)")
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

function median(nums) {
  const arr = (nums || []).filter(Number.isFinite);
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pp(deltaWinRate) {
  if (!Number.isFinite(deltaWinRate)) return "—";
  const v = deltaWinRate * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
}

function confidenceFromGames(games) {
  const g = Number(games ?? 0);
  if (g < 10) return "Very low confidence: tiny sample, likely noisy.";
  if (g < 30) return "Low confidence: small sample, treat as directional only.";
  if (g < 100) return "Medium confidence: decent sample, still some volatility.";
  return "High confidence: large sample, reasonably stable.";
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

function eloSummary(rows) {
  const elos = (rows || []).map(getClosingElo).filter(Number.isFinite);
  if (!elos.length) return { avg: null, med: null };
  const avg = elos.reduce((a, b) => a + b, 0) / elos.length;
  const med = median(elos);
  return { avg, med };
}

// --------------------------------------------------
// FACTION MATCHING
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
// IMPORTANT: these keys must match what you register in aos.js
// (you showed: battleTactics + regimentsOfRenown, plus your existing ones)
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
      return lookups.manifestations ?? lookups.manifestationLore ?? [];
    case "spellLore":
      return lookups.spellLore ?? lookups.spells ?? [];
    case "prayerLore":
      return lookups.prayerLore ?? lookups.prayers ?? [];
    case "battleTactic":
      return lookups.battleTactics ?? [];
    case "regimentOfRenown":
      return lookups.regimentsOfRenown ?? [];
    default:
      return [];
  }
}

function isFactionScopedType(type) {
  return (
    type === "warscroll" ||
    type === "terrain" ||
    type === "heroicTrait" ||
    type === "artefact"
  );
}

function findLookupItem(system, type, inputName, factionName = null) {
  const q = norm(inputName);
  const arr = getLookupArray(system, type);

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

// --------------------------------------------------
// Phrase regex
// - allow optional trailing "(...)" or ": ..." / "- ..." after phrase
// - IMPORTANT: returned regex MUST NOT be /g (stateful); use /gi only when counting.
// --------------------------------------------------
function buildAnyPhraseRegex(item) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return null;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");

  return new RegExp(
    `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?(?:${alts})` +
      `(?:\\s*\\([^|\\n\\r]*\\))?` +
      `(?:\\s*[:\\-]\\s*[^|\\n\\r]*)?` +
      `\\s*(?=$|[|\\n\\r])`,
    "i"
  );
}

function countOccurrencesInText(item, text) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return 0;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  const re = new RegExp(
    `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?(?:${alts})` +
      `(?:\\s*\\([^|\\n\\r]*\\))?` +
      `(?:\\s*[:\\-]\\s*[^|\\n\\r]*)?` +
      `\\s*(?=$|[|\\n\\r])`,
    "ig"
  );

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
    return { rows: rows ?? [], scopeLabel: formationName };
  }
  const rows = engine.indexes.factionRows(factionName);
  return { rows: rows ?? [], scopeLabel: "Overall" };
}

// --------------------------------------------------
// Compute included/without stats via regex-text matching (list-level)
// (This is the reliable way to get "Used in x/y lists" for EVERYTHING,
// including warscrolls, because it matches what is actually in Refined List.)
// --------------------------------------------------
function computeItemStats({ rows, item }) {
  const re = buildAnyPhraseRegex(item);

  const includedRows = [];
  const withoutRows = [];

  let incGames = 0;
  let incWins = 0;
  let incOccTotal = 0;

  let wGames = 0;
  let wWins = 0;

  for (const r of rows || []) {
    const text = String(getListText(r) ?? "");
    const has = re ? (text ? re.test(text) : false) : false;

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
      const re = new RegExp(
        `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?(?:${alts})` +
          `(?:\\s*\\([^|\\n\\r]*\\))?` +
          `(?:\\s*[:\\-]\\s*[^|\\n\\r]*)?` +
          `\\s*(?=$|[|\\n\\r])`,
        "i"
      );

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

// --------------------------------------------------
// /warscroll-like analysis blurb
// --------------------------------------------------
function analysisBlurbWarscroll({
  includedWR,
  withoutWR,
  factionWR,
  includedGames,
  wsEloAvg,
  factionEloAvg,
}) {
  const vsFaction = includedWR - factionWR;
  const vsWithout = includedWR - withoutWR;

  const p1 =
    `When included, this warscroll posts a **${pct(includedWR)}** win rate versus ` +
    `the faction baseline of **${pct(factionWR)}** (${pp(vsFaction)}).`;

  const p2 =
    `Compared to lists **without** it (${pct(withoutWR)}), that’s a shift of **${pp(vsWithout)}**, ` +
    `which suggests it may be contributing — *but sample size matters*.`;

  let p3 = "";
  if (Number.isFinite(wsEloAvg) && Number.isFinite(factionEloAvg)) {
    const eloDelta = wsEloAvg - factionEloAvg;
    const abs = Math.abs(eloDelta);

    if (abs < 10) {
      p3 =
        `Player skill looks broadly similar to the faction baseline (about **${fmt(abs, 0)} Elo** difference), ` +
        `so the uplift is less likely to be “just better pilots”.`;
    } else {
      p3 =
        `However, players using this average about **${fmt(abs, 0)} Elo** ` +
        `${eloDelta >= 0 ? "higher" : "lower"} than the faction baseline, ` +
        `so some of the uplift may be driven by pilot skill rather than the warscroll alone.`;
    }
  }

  const confidence = confidenceFromGames(includedGames);
  return [p1, p2, p3, `**Confidence:** ${confidence}`].filter(Boolean).join("\n\n");
}

function analysisBlurbGeneric({
  typeLabel,
  itemName,
  includedWR,
  withoutWR,
  factionWR,
  includedGames,
}) {
  const vsFaction = includedWR - factionWR;
  const vsWithout = includedWR - withoutWR;
  const confidence = confidenceFromGames(includedGames);

  const p1 =
    `When **${itemName}** is included (${typeLabel}), lists go **${pct(includedWR)}** versus ` +
    `the faction baseline of **${pct(factionWR)}** (${pp(vsFaction)}).`;

  const p2 =
    `Compared to lists without it (${pct(withoutWR)}), that’s **${pp(vsWithout)}** — ` +
    `suggestive, not proof.`;

  return [p1, p2, `**Confidence:** ${confidence}`].join("\n\n");
}

// ==================================================
// USED-ONLY AUTOCOMPLETE (Spell/Prayer)
// ==================================================
const USED_CACHE = new Map();
// key: `${type}|${faction}|${formation||""}` -> Set(norm(item.name))

function usedCacheKey(type, factionName, formationName) {
  return `${type}|${norm(factionName)}|${norm(formationName ?? "")}`;
}

function shouldFilterToUsedOnly(type) {
  return type === "spellLore" || type === "prayerLore";
}

function buildUsedSetForType({ system, engine, type, factionName, formationName }) {
  const key = usedCacheKey(type, factionName, formationName);
  const cached = USED_CACHE.get(key);
  if (cached) return cached;

  const arr = getLookupArray(system, type);
  if (!arr?.length) {
    const empty = new Set();
    USED_CACHE.set(key, empty);
    return empty;
  }

  const { rows } = sliceRows(engine, factionName, formationName);
  if (!rows?.length) {
    const empty = new Set();
    USED_CACHE.set(key, empty);
    return empty;
  }

  const compiled = arr
    .map((it) => {
      const re = buildAnyPhraseRegex(it);
      if (!re) return null;
      return { key: norm(it.name), re };
    })
    .filter(Boolean);

  const used = new Set();

  for (const r of rows) {
    const text = String(getListText(r) ?? "");
    if (!text) continue;

    for (const it of compiled) {
      if (used.has(it.key)) continue;
      if (it.re.test(text)) used.add(it.key);
    }

    if (used.size === compiled.length) break;
  }

  USED_CACHE.set(key, used);
  return used;
}

// ==================================================
// AUTOCOMPLETE
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  const q = norm(focused.value);

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

  if (focused.name === "name") {
    const { system, engine } = ctx;

    const type = interaction.options.getString("type", true);
    const factionInput = (interaction.options.getString("faction") ?? "").trim();
    const factionName = factionInput ? findFactionName(system, engine, factionInput) : null;

    const formationName =
      interaction.options.getString("formation", false)?.trim() || null;

    const arr = getLookupArray(system, type);

    // base filtering (faction-scoped types)
    let filtered =
      isFactionScopedType(type) && factionName
        ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
        : arr;

    // NEW: used-only filtering for Spell/Prayer Lore
    if (factionName && shouldFilterToUsedOnly(type)) {
      const usedSet = buildUsedSetForType({
        system,
        engine,
        type,
        factionName,
        formationName,
      });
      filtered = filtered.filter((it) => usedSet.has(norm(it?.name)));
    }

    const choices = filtered
      .map((it) => it?.name)
      .filter(Boolean)
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));

    await interaction.respond(choices);
    return;
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

  let item = findLookupItem(system, type, inputName, factionName);

  if (type === "regimentOfRenown" && item) {
    const allowed = item.allowedFactions ?? item.allowed_factions ?? null;
    if (Array.isArray(allowed) && allowed.length) {
      const ok = allowed.some((f) => norm(f) === norm(factionName));
      if (!ok) {
        await interaction.reply({
          content: `**${item.name}** isn't eligible for **${factionName}** (per allowedFactions).`,
          ephemeral: true,
        });
        return;
      }
    }
  }

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

  // --------------------------------------------------
  // Baseline
  // --------------------------------------------------
  let baselineGames = 0;
  let baselineWins = 0;

  for (const r of rows) {
    baselineGames += getRowGames(r);
    baselineWins += getRowWins(r);
  }
  const factionWinRate = baselineGames > 0 ? baselineWins / baselineGames : 0;

  // --------------------------------------------------
  // STATS
  // - warscroll: use engine for win rates (proven)
  // - BUT still compute list-level included/without via regex for "Used in x/y lists"
  // --------------------------------------------------
  let stats = null;
  let reinforcedPct = null;
  let engineCo = null;

  // Always compute list-level included/without rows (fixes the 0/55 bug)
  const listLevelStats = computeItemStats({ rows, item });

  if (type === "warscroll" && engine?.indexes?.warscrollSummaryInFaction) {
    const sum = engine.indexes.warscrollSummaryInFaction(item.name, factionName, coN);

    reinforcedPct = sum?.included?.reinforcedPct ?? null;
    engineCo = sum?.included?.topCoIncludes ?? null;

    // merge: use engine win rates/games, but keep list-level rows + avgOcc
    stats = {
      ...listLevelStats,
      included: {
        ...listLevelStats.included,
        games: sum?.included?.games ?? listLevelStats.included.games,
        winRate: sum?.included?.winRate ?? listLevelStats.included.winRate,
        avgOcc: sum?.included?.avgOccurrencesPerList ?? listLevelStats.included.avgOcc,
      },
      without: {
        ...listLevelStats.without,
        games: sum?.without?.games ?? listLevelStats.without.games,
        winRate: sum?.without?.winRate ?? listLevelStats.without.winRate,
      },
    };
  } else {
    stats = listLevelStats;
  }

  const includedWR = stats.included.winRate ?? null;
  const withoutWR = stats.without.winRate ?? null;

  const usedPct = stats.totalRows > 0 ? stats.included.rows / stats.totalRows : 0;

  // Elo layer
  const eloAll = eloSummary(rows);
  const eloInc = eloSummary(stats.includedRows);

  // Co-includes
  let coText = "—";
  if (coN > 0) {
    if (type === "warscroll" && Array.isArray(engineCo) && engineCo.length) {
      coText =
        engineCo
          .slice(0, coN)
          .map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`)
          .join("\n") || "—";
    } else {
      const co = coIncludesWarscrolls(system, stats.includedRows, {
        excludeName: type === "warscroll" ? item.name : null,
        topN: coN,
      });

      coText =
        co.length > 0
          ? co.map((x, i) => `${i + 1}) ${x.name} (${x.listsTogether} lists)`).join("\n")
          : "—";
    }
  }

  // Labels
  const typeLabel = (() => {
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
  })();

  const impactVsFaction =
    Number.isFinite(includedWR) ? includedWR - factionWinRate : null;

  // --------------------------------------------------
  // ANALYSIS BLURB
  // --------------------------------------------------
  let meaning = "";
  if (stats.included.games > 0 && Number.isFinite(includedWR) && Number.isFinite(withoutWR)) {
    if (type === "warscroll") {
      meaning = analysisBlurbWarscroll({
        includedWR,
        withoutWR,
        factionWR: factionWinRate,
        includedGames: stats.included.games,
        wsEloAvg: eloInc.avg,
        factionEloAvg: eloAll.avg,
      });
    } else {
      meaning = analysisBlurbGeneric({
        typeLabel,
        itemName: item.name,
        includedWR,
        withoutWR,
        factionWR: factionWinRate,
        includedGames: stats.included.games,
      });
    }
  } else {
    meaning =
      `No usable sample for **${item.name}** in this scope yet.\n\n` +
      `**Confidence:** Very low confidence: zero (or near-zero) sample.`;
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  const header =
    `Scope: **${factionName}** — **${scopeLabel}**\n` +
    `Lookup: **${typeLabel}** • **${item.name}**`;

  const lines = [];

  lines.push(
    `**Results**`,
    ``,
    `**Included**`,
    `Used in: **${pct(usedPct)}** (*${stats.included.rows}/${stats.totalRows} lists*)`,
    `Games: **${fmtInt(stats.included.games)}**`,
    `Win rate: **${pct(stats.included.winRate)}**`,
    `Avg occurrences (per list): **${
      Number.isFinite(stats.included.avgOcc) ? fmt(stats.included.avgOcc, 2) : "—"
    }**`,
    ...(type === "warscroll" && Number.isFinite(reinforcedPct)
      ? [`Reinforced in: **${pct(reinforcedPct)}** of lists`]
      : []),
    HR,
    `**Faction baseline (same scope)**`,
    `Games: **${fmtInt(baselineGames)}**`,
    `Win rate: **${pct(factionWinRate)}**`,
    `Impact (vs faction): **${Number.isFinite(impactVsFaction) ? pp(impactVsFaction) : "—"}**`,
    HR,
    `**Without (same scope)**`,
    `Games: **${fmtInt(stats.without.games)}**`,
    `Win rate: **${pct(stats.without.winRate)}**`,
    HR,
    `**Commonly included with (Top ${coN})**`,
    coText,
    HR,
    `**Player Elo Context**`,
    `Players using this (avg/med): **${
      Number.isFinite(eloInc.avg) ? fmt(eloInc.avg, 1) : "—"
    } / ${
      Number.isFinite(eloInc.med) ? fmt(eloInc.med, 1) : "—"
    }**`,
    `Faction baseline (avg/med): **${
      Number.isFinite(eloAll.avg) ? fmt(eloAll.avg, 1) : "—"
    } / ${
      Number.isFinite(eloAll.med) ? fmt(eloAll.med, 1) : "—"
    }**`,
    HR,
    `**What this means**`,
    meaning
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