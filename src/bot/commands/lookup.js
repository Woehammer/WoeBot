// ==================================================
// COMMAND: /lookup
// PURPOSE: Unified lookup + analysis for anything that appears in a list
//          (warscrolls, terrain, artefacts, heroic traits, manifestations,
//           spell lores, prayer lores, battle tactics, regiments of renown)
//          Output style: /warscroll-like stats + richer analysis blurb + Elo context
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js"; // adjust if your path differs

// Use your existing shared prose helpers (keeps tone consistent across commands)
import {
  explainSampleSize,
  explainEloBaseline, // (kept imported in case you want it later)
  explainEloSkew,
  explainWinRateVsElo,
} from "../../engine/format/explain.js"; // <-- adjust path if your commands folder differs

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

function signLabel(x) {
  if (!Number.isFinite(x) || x === 0) return "neutral";
  return x > 0 ? "positive" : "negative";
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

// ==================================================
// FACTION MATCHING
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
// IMPORTANT: be tolerant of different key names in aos.js
// ==================================================
function getLookupArray(system, type) {
  const L = system?.lookups ?? {};

  const firstArr = (...keys) => {
    for (const k of keys) {
      const v = L?.[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  };

  switch (type) {
    case "warscroll":
      return firstArr("warscrolls");
    case "terrain":
      return firstArr("terrain");
    case "heroicTrait":
      return firstArr("heroicTraits", "heroic", "traits");
    case "artefact":
      return firstArr("artefacts", "artifacts");
    case "manifestation":
      return firstArr("manifestations", "manifestationLores", "manifestationLore");
    case "spellLore":
      return firstArr("spells", "spellLores", "spellLore");
    case "prayerLore":
      return firstArr("prayers", "prayerLores", "prayerLore");
    case "battleTactic":
      return firstArr("battleTactics", "battle_tactics");
    case "regimentOfRenown":
      return firstArr("regimentsOfRenown", "regiments_of_renown");
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

// ==================================================
// REGEX MATCHING
// - Generic item line matching (warscrolls/traits/etc)
// - Lore-aware matching (Prayer/Spell/Manifestation lore lines)
// ==================================================
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

// Lore formats we want to catch:
//  - "Prayer Lore - X"
//  - "Prayer Lore: X"
//  - "Prayer Lore – X" (en dash)
//  - "Prayer Lore — X" (em dash)
//  - "Spell Lore - X" etc
//  - "Manifestation Lore - X" etc
function buildLorePhraseRegex(type, item) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return null;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  const SEP = "[-:–—=]";

  const prefix =
    type === "prayerLore"
      ? `prayer\\s*lore\\s*${SEP}\\s*`
      : type === "spellLore"
      ? `spell\\s*lore\\s*${SEP}\\s*`
      : type === "manifestation"
      ? `manifestation\\s*lore\\s*${SEP}\\s*`
      : "";

  if (!prefix) return null;

  // Anchor to field boundaries the same way your refined-list matching works
  return new RegExp(
    `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?${prefix}(?:${alts})\\b`,
    "i"
  );
}

function buildRegexForType(type, item) {
  // Lore types: prefer lore-aware matching (fixes Prayer/Spell/Manifestation autocompletes)
  if (type === "prayerLore" || type === "spellLore" || type === "manifestation") {
    return buildLorePhraseRegex(type, item) || buildAnyPhraseRegex(item);
  }
  return buildAnyPhraseRegex(item);
}

function countOccurrencesInText(type, item, text) {
  const phrases = [item?.name, ...(item?.aliases ?? [])]
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!phrases.length) return 0;

  const alts = phrases.map((p) => escapeRegExp(p.toLowerCase())).join("|");
  const SEP = "[-:–—=]";

  // For lore types, count occurrences in lore-lines too (usually 0 or 1, but keep it honest)
  let re = null;
  if (type === "prayerLore" || type === "spellLore" || type === "manifestation") {
    const prefix =
      type === "prayerLore"
        ? `prayer\\s*lore\\s*${SEP}\\s*`
        : type === "spellLore"
        ? `spell\\s*lore\\s*${SEP}\\s*`
        : `manifestation\\s*lore\\s*${SEP}\\s*`;

    re = new RegExp(
      `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?${prefix}(?:${alts})\\b`,
      "ig"
    );
  } else {
    re = new RegExp(
      `(^|[|\\n\\r])\\s*(?:[•*\\-]\\s*)?(?:${alts})` +
        `(?:\\s*\\([^|\\n\\r]*\\))?` +
        `(?:\\s*[:\\-]\\s*[^|\\n\\r]*)?` +
        `\\s*(?=$|[|\\n\\r])`,
      "ig"
    );
  }

  let n = 0;
  const s = String(text ?? "");
  while (re.exec(s)) n++;
  return n;
}

// ==================================================
// Slice rows for faction (+ optional formation)
// ==================================================
function sliceRows(engine, factionName, formationName = null) {
  if (formationName && engine?.indexes?.factionRowsInFormation) {
    const rows = engine.indexes.factionRowsInFormation(factionName, formationName);
    return { rows: rows ?? [], scopeLabel: formationName };
  }
  const rows = engine?.indexes?.factionRows
    ? engine.indexes.factionRows(factionName)
    : [];
  return { rows: rows ?? [], scopeLabel: "Overall" };
}

// ==================================================
// Compute included/without stats via regex-text matching
// ==================================================
function computeItemStats({ rows, type, item }) {
  const re = buildRegexForType(type, item);

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
      incOccTotal += countOccurrencesInText(type, item, text);
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

// ==================================================
// Co-includes (warscrolls only, from included rows)
// ==================================================
function coIncludesWarscrolls(
  system,
  includedRows,
  { excludeName = null, topN = 3 } = {}
) {
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

// ==================================================
// Deeper analysis blurb (correct prose + Elo context like /warscroll)
// ==================================================
function buildLookupBlurb({
  typeLabel,
  itemName,

  includedGames,
  includedWR,
  baselineWR,
  withoutWR,

  incEloAvg,
  incEloMed,
  baseEloAvg,
  baseEloMed,
}) {
  const paragraphs = [];

  // Guard: no usable sample
  if (
    !Number.isFinite(includedGames) ||
    includedGames <= 0 ||
    !Number.isFinite(includedWR)
  ) {
    paragraphs.push(
      `There isn’t a usable sample for **${itemName}** in this scope yet, so any “signal” here is basically vibes.`
    );
    paragraphs.push(`**Confidence:** Very low confidence: zero (or near-zero) sample.`);
    return paragraphs.join("\n\n");
  }

  const vsBase = Number.isFinite(baselineWR) ? includedWR - baselineWR : null;
  const vsWithout = Number.isFinite(withoutWR) ? includedWR - withoutWR : null;

  // Paragraph 1: results summary (sign-aware)
  let p1 =
    `Based on **${fmtInt(includedGames)} games** where **${itemName}** is included (${typeLabel}), ` +
    `those lists are winning **${pct(includedWR)}**.`;

  if (Number.isFinite(vsBase)) {
    const d = signLabel(vsBase);
    p1 += ` That’s **${pp(vsBase)}** versus the faction baseline (**${pct(baselineWR)}**).`;
    if (d === "negative") p1 += " (So: below baseline.)";
    else if (d === "positive") p1 += " (So: above baseline.)";
  }

  if (Number.isFinite(vsWithout)) {
    p1 += ` Compared to lists without it (**${pct(withoutWR)}**), that’s **${pp(vsWithout)}**.`;
  }

  paragraphs.push(p1);

  // sample-size context (shared wording)
  const sampleTxt = explainSampleSize({ games: includedGames });
  if (sampleTxt) paragraphs.push(sampleTxt);

  // Paragraph 2: Elo context
  const haveElo =
    Number.isFinite(incEloAvg) &&
    Number.isFinite(incEloMed) &&
    Number.isFinite(baseEloAvg) &&
    Number.isFinite(baseEloMed);

  let avgDelta = null;

  if (haveElo) {
    avgDelta = incEloAvg - baseEloAvg;
    const medDelta = incEloMed - baseEloMed;
    const incGap = incEloAvg - incEloMed;

    let pilotBand = "about the same as";
    if (avgDelta >= 40) pilotBand = "well above";
    else if (avgDelta >= 20) pilotBand = "above";
    else if (avgDelta >= 8) pilotBand = "a little above";
    else if (avgDelta <= -40) pilotBand = "well below";
    else if (avgDelta <= -20) pilotBand = "below";
    else if (avgDelta <= -8) pilotBand = "a little below";

    let p2 =
      `Pilot skill looks **${pilotBand}** the faction baseline: ` +
      `included avg/med **${fmt(incEloAvg, 1)} / ${fmt(incEloMed, 1)}** ` +
      `vs baseline **${fmt(baseEloAvg, 1)} / ${fmt(baseEloMed, 1)}** ` +
      `(≈${fmtInt(avgDelta)} / ${fmtInt(medDelta)} Elo).`;

    // IMPORTANT: soften “well above median” for tiny gaps (10–14 is not dramatic)
    if (Number.isFinite(incGap) && Math.abs(incGap) < 15) {
      p2 +=
        " The average and median are **pretty close**, so this doesn’t look heavily skewed by a tiny elite subset.";
    } else {
      const skewTxt = explainEloSkew({ average: incEloAvg, median: incEloMed });
      if (skewTxt) p2 += ` ${skewTxt}`;
    }

    paragraphs.push(p2);

    const wrEloTxt = explainWinRateVsElo({
      winRate: includedWR,
      avgElo: incEloAvg,
      medianElo: incEloMed,
      games: includedGames,
    });
    if (wrEloTxt) paragraphs.push(wrEloTxt);
  }

  // Paragraph 3: diagnosis (SIGN-AWARE, fixes the uplift/downtick contradiction)
  const bigWR = (x) => Number.isFinite(x) && Math.abs(x) >= 0.03; // 3pp+
  const bigElo = (x) => Number.isFinite(x) && Math.abs(x) >= 20;

  const primaryDelta =
    Number.isFinite(vsWithout) ? vsWithout : Number.isFinite(vsBase) ? vsBase : null;

  let diagnosis = "";

  if (includedGames < 30) {
    diagnosis = "Small sample — treat this as a hint, not a verdict.";
  } else if (!Number.isFinite(primaryDelta) || !bigWR(primaryDelta)) {
    diagnosis =
      "Net effect looks modest — more “nice in a plan” than “this wins or loses games by itself”.";
  } else {
    const dirUp = primaryDelta > 0;

    if (haveElo && bigElo(avgDelta)) {
      if (dirUp && avgDelta > 0) {
        diagnosis =
          "Results are up, but pilots are also stronger — this could be **good players choosing good tools**, not pure item power.";
      } else if (!dirUp && avgDelta < 0) {
        diagnosis =
          "Results are down, and pilots are weaker — this could be more about **who is taking it** than the item being a trap.";
      } else if (dirUp && avgDelta <= 0) {
        diagnosis =
          "The uplift shows up without a big pilot-skill advantage, which is a stronger hint the choice is genuinely helping performance.";
      } else if (!dirUp && avgDelta >= 0) {
        diagnosis =
          "The drop shows up even without a pilot-skill disadvantage — that’s a stronger hint this choice may be costing wins (or signals a suboptimal plan).";
      } else {
        diagnosis =
          "There’s a clear shift, but the pilot profile is mixed — treat this as directional and sanity-check matchups/formation context.";
      }
    } else {
      diagnosis = dirUp
        ? "There’s a meaningful uplift versus comparable lists — likely a real performance driver (or a strong signal of a good sub-package)."
        : "There’s a meaningful drop versus comparable lists — could be a trap pick, or it’s chosen into harder games / worse matchups.";
    }
  }

  if (diagnosis) paragraphs.push(diagnosis);

  paragraphs.push(`**Confidence:** ${confidenceFromGames(includedGames)}`);

  return paragraphs.join("\n\n");
}

// ==================================================
// Autocomplete filtering: only show items that appear in lists (for lores etc)
// ==================================================
function shouldOnlySuggestUsed(type) {
  return (
    type === "spellLore" ||
    type === "prayerLore" ||
    type === "manifestation" ||
    type === "battleTactic" ||
    type === "regimentOfRenown"
  );
}

// cache: faction|type -> Set of used item keys (norm(name))
const USED_CACHE = new Map();
const USED_CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(factionName, type) {
  return `${norm(factionName)}|${type}`;
}

function getUsedCache(factionName, type) {
  const k = cacheKey(factionName, type);
  const v = USED_CACHE.get(k);
  if (!v) return null;
  if (Date.now() - v.at > USED_CACHE_TTL_MS) {
    USED_CACHE.delete(k);
    return null;
  }
  return v;
}

function setUsedCache(factionName, type, set) {
  const k = cacheKey(factionName, type);
  USED_CACHE.set(k, { at: Date.now(), set });
}

function computeUsedSetForType({ system, engine, factionName, type }) {
  const arr = getLookupArray(system, type);
  const { rows } = sliceRows(engine, factionName, null);
  const used = new Set();

  if (!arr.length || !rows.length) return used;

  const compiled = arr
    .filter(Boolean)
    .map((it) => {
      const re = buildRegexForType(type, it);
      if (!re) return null;
      return { key: norm(it.name), re };
    })
    .filter(Boolean);

  for (const r of rows) {
    const text = String(getListText(r) ?? "");
    if (!text) continue;

    for (const it of compiled) {
      if (used.has(it.key)) continue;
      if (it.re.test(text)) used.add(it.key);
    }
  }

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

  if (focused.name === "name") {
    const { system, engine } = ctx;

    const type = interaction.options.getString("type", true);
    const factionInput = (interaction.options.getString("faction") ?? "").trim();
    const factionName = factionInput
      ? findFactionName(system, engine, factionInput)
      : null;

    if (!factionName) {
      await interaction.respond([]);
      return;
    }

    const arr = getLookupArray(system, type);

    const scoped =
      isFactionScopedType(type) && factionName
        ? arr.filter((it) => !it?.faction || norm(it.faction) === norm(factionName))
        : arr;

    const fast = scoped.filter((it) => {
      const name = String(it?.name ?? "");
      if (!q) return true;
      if (norm(name).includes(q)) return true;
      for (const a of it?.aliases ?? []) {
        if (norm(a).includes(q)) return true;
      }
      return false;
    });

    let usedSet = null;
    if (shouldOnlySuggestUsed(type)) {
      const cached = getUsedCache(factionName, type);
      if (cached) {
        usedSet = cached.set;
      } else {
        const set = computeUsedSetForType({ system, engine, factionName, type });
        setUsedCache(factionName, type, set);
        usedSet = set;
      }
    }

    const filtered = usedSet ? fast.filter((it) => usedSet.has(norm(it?.name))) : fast;

    const choices = filtered
      .map((it) => it?.name)
      .filter(Boolean)
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
  // Baseline (same scope)
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
  // Warscroll: use engine indexes (matches /warscroll)
  // Other types: regex match in refined list text
  // --------------------------------------------------
  let stats = null;
  let reinforcedPct = null;
  let engineCo = null;

  if (type === "warscroll" && engine?.indexes?.warscrollSummaryInFaction) {
    const sum = engine.indexes.warscrollSummaryInFaction(item.name, factionName, coN);

    const wsRowsAll = engine.indexes.warscrollRows
      ? engine.indexes.warscrollRows(item.name)
      : [];
    const wsRowsFaction = (wsRowsAll ?? []).filter(
      (r) => norm(r.Faction ?? r.faction) === norm(factionName)
    );

    stats = {
      totalRows: (rows || []).length,
      includedRows: wsRowsFaction ?? [],
      withoutRows: [],
      included: {
        rows: sum?.included?.lists ?? sum?.included?.rows ?? (wsRowsFaction?.length ?? 0),
        games: sum?.included?.games ?? 0,
        wins: sum?.included?.wins ?? null,
        winRate: sum?.included?.winRate ?? null,
        avgOcc: sum?.included?.avgOccurrencesPerList ?? null,
      },
      without: {
        rows: sum?.without?.lists ?? sum?.without?.rows ?? null,
        games: sum?.without?.games ?? 0,
        wins: sum?.without?.wins ?? null,
        winRate: sum?.without?.winRate ?? null,
      },
    };

    reinforcedPct = sum?.included?.reinforcedPct ?? null;
    engineCo = sum?.included?.topCoIncludes ?? null;
  } else {
    stats = computeItemStats({ rows, type, item }); // <-- type-aware now
  }

  const includedWR = stats?.included?.winRate ?? null;
  const withoutWR = stats?.without?.winRate ?? null;

  const usedPct =
    stats?.totalRows > 0 && Number.isFinite(stats?.included?.rows)
      ? stats.included.rows / stats.totalRows
      : stats?.totalRows > 0
      ? (stats.includedRows?.length ?? 0) / stats.totalRows
      : 0;

  // Elo layer
  const eloAll = eloSummary(rows);
  const eloInc = eloSummary(stats.includedRows);

  // Co-includes (warscrolls only; prefer engine co-includes)
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

  const impactVsFaction = Number.isFinite(includedWR) ? includedWR - factionWinRate : null;

  // --------------------------------------------------
  // ANALYSIS BLURB
  // --------------------------------------------------
  const meaning = buildLookupBlurb({
    typeLabel,
    itemName: item.name,
    includedGames: stats?.included?.games ?? 0,
    includedWR,
    baselineWR: factionWinRate,
    withoutWR,
    incEloAvg: eloInc.avg,
    incEloMed: eloInc.med,
    baseEloAvg: eloAll.avg,
    baseEloMed: eloAll.med,
  });

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  const header =
    `Scope: **${factionName}** — **${scopeLabel}**\n` +
    `Lookup: **${typeLabel}** • **${item.name}**`;

  const lines = [];

  lines.push(
    `**Included**`,
    `Used in: **${pct(usedPct)}** (*${fmtInt(
      stats?.included?.rows ?? stats?.includedRows?.length ?? 0
    )}/${fmtInt(stats?.totalRows ?? rows.length)} lists*)`,
    `Games: **${fmtInt(stats?.included?.games ?? 0)}**`,
    `Win rate: **${pct(includedWR)}**`,
    `Avg occurrences (per list): **${
      Number.isFinite(stats?.included?.avgOcc) ? fmt(stats.included.avgOcc, 2) : "—"
    }**`,
    ...(Number.isFinite(reinforcedPct)
      ? [`Reinforced in: **${pct(reinforcedPct)}** of lists`]
      : []),
    HR,
    `**Faction baseline (same scope)**`,
    `Games: **${fmtInt(baselineGames)}**`,
    `Win rate: **${pct(factionWinRate)}**`,
    `Impact (vs faction): **${Number.isFinite(impactVsFaction) ? pp(impactVsFaction) : "—"}**`,
    HR,
    `**Without (same scope)**`,
    `Games: **${fmtInt(stats?.without?.games ?? 0)}**`,
    `Win rate: **${pct(withoutWR)}**`,
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