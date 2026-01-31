// ==================================================
// PARSER: LIST PARSING
// PURPOSE: Convert raw list text into structured output
//          + tag reinforced occurrences per warscroll
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

// none (pure string + lookup logic)

// ==================================================
// PARSE PIPELINE
// ==================================================

/**
 * Build an alias -> canonical index from system lookups.
 * Expects system.lookups.warscrolls to be:
 * [{ name: "Blood Warriors", aliases: ["blood warriors", ...], faction: "..." }, ...]
 */
function buildAliasIndex(system) {
  const warscrolls = system?.lookups?.warscrolls ?? [];
  const index = new Map();

  for (const w of warscrolls) {
    if (!w?.name) continue;

    const canonical = w.name.trim();
    index.set(normalise(canonical), canonical);

    const aliases = w.aliases ?? [];
    for (const a of aliases) {
      const key = normalise(a);
      if (key) index.set(key, canonical);
    }
  }

  return index;
}

function normalise(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Lines we should ignore entirely (for unit detection)
function isJunkLine(line) {
  const s = normalise(line);

  if (!s) return true;
  if (s.startsWith("•")) return true;

  // common AoS list structure headers
  const junkStarts = [
    "general's regiment",
    "regiment",
    "faction terrain",
    "battle tactic cards",
    "drops:",
    "spell lore",
    "prayer lore",
    "manifestation lore",
    "general's handbook",
    "created with warhammer",
    "app:",
    "data:",
    "-----",
  ];

  for (const j of junkStarts) {
    if (s.startsWith(j)) return true;
  }

  if (s === "|") return true;

  return false;
}

/**
 * Extract a candidate unit name from a refined list token.
 * Examples:
 * "Blood Warriors (380)" -> "Blood Warriors"
 * "Wrath of Khorne Bloodthirster (400)" -> "Wrath of Khorne Bloodthirster"
 */
function extractName(token) {
  let t = String(token ?? "").trim();
  if (!t) return "";

  t = t.replace(/^•\s*/g, "").trim();

  // Strip trailing points/cost "(123)"
  t = t.replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim();

  // Strip common tags if they end up as standalone tokens
  if (normalise(t) === "reinforced") return "";

  return t;
}

function isReinforcedToken(token) {
  // Your refined list uses "• Reinforced"
  const s = normalise(token);
  return s === "• reinforced" || s === "reinforced" || s.endsWith("• reinforced");
}

/**
 * Parse a single row into:
 * - __units: unique canonical warscroll names in the list
 * - __unitCounts: canonical warscroll -> occurrences in that list
 * - __unitReinforcedCounts: canonical warscroll -> reinforced occurrences in that list
 *
 * Reinforced rule:
 * - If a unit token is immediately followed by a "• Reinforced" token,
 *   we count THAT occurrence as reinforced.
 */
function parseRowUnits(row, aliasIndex) {
  const refined =
    row?.["Refined List"] ?? row?.RefinedList ?? row?.refinedList ?? "";
  const raw = String(refined ?? "");

  // Your format is "|" delimited
  const tokens = raw
    .split("|")
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);

  /** @type {Record<string, number>} */
  const counts = {};

  /** @type {Record<string, number>} */
  const reinforcedCounts = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (isJunkLine(token)) continue;

    const candidate = extractName(token);
    if (!candidate) continue;

    const canonical = aliasIndex.get(normalise(candidate));
    if (!canonical) continue;

    // base occurrence
    counts[canonical] = (counts[canonical] ?? 0) + 1;

    // reinforced occurrence if NEXT token is reinforced
    const next = tokens[i + 1];
    if (next && isReinforcedToken(next)) {
      reinforcedCounts[canonical] = (reinforcedCounts[canonical] ?? 0) + 1;
    }
  }

  const units = Object.keys(counts);

  return { units, counts, reinforcedCounts };
}

// ==================================================
// OUTPUT SHAPE
// ==================================================

/**
 * Returns a new array of rows with:
 * - __units: string[] (unique canonical warscrolls in the list)
 * - __unitCounts: Record<string, number> (warscroll -> occurrences)
 * - __unitReinforcedCounts: Record<string, number> (warscroll -> reinforced occurrences)
 */
export function enrichRowsWithParsedLists(rows, system) {
  const aliasIndex = buildAliasIndex(system);

  return (rows ?? []).map((row) => {
    const { units, counts, reinforcedCounts } = parseRowUnits(row, aliasIndex);

    return {
      ...row,
      __units: units,
      __unitCounts: counts,
      __unitReinforcedCounts: reinforcedCounts,
    };
  });
}

// ==================================================
// EXPORTS
// ==================================================
export default { enrichRowsWithParsedLists };