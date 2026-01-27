// ==================================================
// PARSER: LIST PARSING
// PURPOSE: Convert raw list text into structured output
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

// Lines we should ignore entirely
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

  // pipes sometimes include empty separators
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

  // Strip leading bullets and weird whitespace
  t = t.replace(/^•\s*/g, "").trim();

  // If it's "Name (123)" remove trailing points/cost bracket
  t = t.replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim();

  // Remove common reinforcement tags if they end up as standalone tokens
  if (normalise(t) === "reinforced") return "";

  return t;
}

/**
 * Parse a single row into __units and __unitCounts, using Refined List.
 */
function parseRowUnits(row, aliasIndex) {
  const refined = row?.["Refined List"] ?? row?.RefinedList ?? row?.refinedList ?? "";
  const raw = String(refined ?? "");

  // Your format is "|" delimited
  const tokens = raw.split("|").map((x) => x.trim()).filter(Boolean);

  /** @type {Record<string, number>} */
  const counts = {};

  for (const token of tokens) {
    if (isJunkLine(token)) continue;

    const candidate = extractName(token);
    if (!candidate) continue;

    // Try direct match via alias index
    const canonical = aliasIndex.get(normalise(candidate));
    if (!canonical) continue;

    counts[canonical] = (counts[canonical] ?? 0) + 1;
  }

  const units = Object.keys(counts);

  return { units, counts };
}

// ==================================================
// OUTPUT SHAPE
// ==================================================

/**
 * Returns a new array of rows with:
 * - __units: string[] (unique canonical warscrolls in the list)
 * - __unitCounts: Record<string, number> (canonical warscroll -> occurrences in that list)
 */
export function enrichRowsWithParsedLists(rows, system) {
  const aliasIndex = buildAliasIndex(system);

  return (rows ?? []).map((row) => {
    const { units, counts } = parseRowUnits(row, aliasIndex);

    return {
      ...row,
      __units: units,
      __unitCounts: counts,
    };
  });
}

// ==================================================
// EXPORTS
// ==================================================
export default { enrichRowsWithParsedLists };
