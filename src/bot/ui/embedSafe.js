// ==================================================
// UI: EMBED SAFE RENDERER
// PURPOSE: Prevent Discord embed limits crashes by
//          chunking fields + keeping total length sane
// ==================================================

// Discord limits (v14):
// - Field value max: 1024
// - Field name max: 256
// - Fields per embed max: 25
// - Total embed chars max: 6000
const LIMITS = {
  FIELD_VALUE: 1024,
  FIELD_NAME: 256,
  FIELDS_PER_EMBED: 25,
  EMBED_TOTAL: 6000,
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function clampStr(s, max) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  // keep room for ellipsis
  return str.slice(0, Math.max(0, max - 1)) + "…";
}

function safeFieldName(name) {
  const n = String(name ?? "\u200B");
  return clampStr(n || "\u200B", LIMITS.FIELD_NAME);
}

function safeFieldValue(value) {
  const v = String(value ?? "\u200B");
  return clampStr(v || "\u200B", LIMITS.FIELD_VALUE);
}

function estimateEmbedSize({ title, description, footerText, fields }) {
  let total = 0;
  if (title) total += String(title).length;
  if (description) total += String(description).length;
  if (footerText) total += String(footerText).length;
  for (const f of fields || []) {
    total += String(f.name ?? "").length + String(f.value ?? "").length;
  }
  return total;
}

// --------------------------------------------------
// CORE: chunk lines into <= 1024 field values
// lines: array of strings (each string may contain newlines)
// --------------------------------------------------
export function chunkLinesToFields(
  lines,
  {
    fieldName = "Results",
    maxValueLen = LIMITS.FIELD_VALUE,
    continuationName = "Results (cont.)",
    hardMaxFields = LIMITS.FIELDS_PER_EMBED,
    reserveFields = 0, // how many fields you already used elsewhere
  } = {}
) {
  const chunks = [];
  let current = "";

  const safeLines = (lines || []).map((x) => String(x ?? ""));

  for (const line of safeLines) {
    const candidate = current ? current + "\n" + line : line;

    if (candidate.length > maxValueLen) {
      if (current) chunks.push(current);

      // If a single line is too big, hard-cut it
      if (line.length > maxValueLen) {
        chunks.push(clampStr(line, maxValueLen));
        current = "";
      } else {
        current = line;
      }
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);

  // Convert to field objects, respecting 25 fields limit
  const fieldsAllowed = Math.max(0, hardMaxFields - reserveFields);
  const trimmed = chunks.slice(0, fieldsAllowed);

  const fields = trimmed.map((value, i) => ({
    name: safeFieldName(i === 0 ? fieldName : continuationName),
    value: safeFieldValue(value),
    inline: false,
  }));

  // If we had to drop chunks due to field count, append a note
  const dropped = chunks.length - trimmed.length;
  if (dropped > 0 && fields.length > 0) {
    const last = fields[fields.length - 1];
    const note = `\n…plus **${dropped}** more chunk(s) not shown.`;
    last.value = safeFieldValue(last.value + note);
  }

  return fields;
}

// --------------------------------------------------
// SAFE: add a potentially-large list section to an embed
// embed: EmbedBuilder
// headerField: {name, value} optional
// listLines: array<string>
// --------------------------------------------------
export function addChunkedSection(embed, { headerField = null, listLines = [] } = {}) {
  // Track existing fields so we don’t exceed 25
  const existing = embed.data?.fields?.length ?? 0;

  if (headerField?.name && headerField?.value) {
    embed.addFields({
      name: safeFieldName(headerField.name),
      value: safeFieldValue(headerField.value),
      inline: false,
    });
  }

  const now = embed.data?.fields?.length ?? 0;
  const reserve = now; // fields already used

  const chunkFields = chunkLinesToFields(listLines, {
    reserveFields: reserve,
  });

  if (chunkFields.length) embed.addFields(...chunkFields);

  // Final guard: ensure total embed size stays under 6000-ish
  const size = estimateEmbedSize({
    title: embed.data?.title,
    description: embed.data?.description,
    footerText: embed.data?.footer?.text,
    fields: embed.data?.fields,
  });

  if (size > LIMITS.EMBED_TOTAL) {
    // If we’re over, trim the last field more aggressively
    const fields = embed.data?.fields ?? [];
    if (fields.length) {
      const last = fields[fields.length - 1];
      last.value = clampStr(last.value, Math.max(0, LIMITS.FIELD_VALUE - 60)) +
        "\n…(trimmed to fit Discord limits)";
    }
  }

  return embed;
}

// --------------------------------------------------
// PUBLIC LIMITS
// --------------------------------------------------
export const EMBED_LIMITS = LIMITS;