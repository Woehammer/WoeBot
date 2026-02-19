// ==================================================
// UI: EMBED SAFE RENDERER
// PURPOSE: Prevent Discord embed limits crashes by chunking
// ==================================================

const LIMITS = {
  FIELD_VALUE: 1024,
  FIELD_NAME: 256,
  FIELDS_PER_EMBED: 25,
  EMBED_TOTAL: 6000,
};

// Discord "blank" that actually renders blank (can't be truly empty)
const BLANK = "\u200B";

function clampStr(s, max) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, Math.max(0, max - 1)) + "…";
}

function safeFieldName(name) {
  // Preserve BLANK exactly
  if (name === BLANK) return BLANK;

  const n = String(name ?? BLANK);
  if (!n.length) return BLANK;

  return clampStr(n, LIMITS.FIELD_NAME);
}

function safeFieldValue(value) {
  const v = String(value ?? BLANK) || BLANK;
  return clampStr(v, LIMITS.FIELD_VALUE);
}

function estimateEmbedSize(embed) {
  let total = 0;
  const data = embed.data ?? {};
  if (data.title) total += String(data.title).length;
  if (data.description) total += String(data.description).length;
  if (data.footer?.text) total += String(data.footer.text).length;

  for (const f of data.fields ?? []) {
    total += String(f.name ?? "").length + String(f.value ?? "").length;
  }
  return total;
}

// Split lines into <=1024 field values
export function chunkLinesToFields(lines, { fieldName = BLANK } = {}) {
  const out = [];
  let buf = "";

  const pushBuf = () => {
    if (!buf) return;
    out.push({
      name: safeFieldName(fieldName), // always blank by default
      value: safeFieldValue(buf),
      inline: false,
    });
    buf = "";
  };

  for (const raw of lines ?? []) {
    const line = String(raw ?? "");
    const candidate = buf ? `${buf}\n${line}` : line;

    if (candidate.length <= LIMITS.FIELD_VALUE) {
      buf = candidate;
      continue;
    }

    // flush existing buffer (blank header)
    pushBuf();

    // single line too big? hard cut
    if (line.length > LIMITS.FIELD_VALUE) {
      out.push({
        name: safeFieldName(fieldName), // blank header
        value: safeFieldValue(clampStr(line, LIMITS.FIELD_VALUE)),
        inline: false,
      });
    } else {
      buf = line;
    }
  }

  pushBuf();
  return out;
}

// Add a header + chunked results safely (handles 25 fields + total size)
export function addChunkedSection(embed, { headerField = null, lines = [] } = {}) {
  if (headerField?.name && headerField?.value) {
    embed.addFields({
      name: safeFieldName(headerField.name),
      value: safeFieldValue(headerField.value),
      inline: false,
    });
  }

  const existing = embed.data?.fields?.length ?? 0;
  const remainingFieldSlots = Math.max(0, LIMITS.FIELDS_PER_EMBED - existing);

  // force blank field headers for all chunks
  const fields = chunkLinesToFields(lines, { fieldName: BLANK }).slice(
    0,
    remainingFieldSlots
  );

  if (fields.length) embed.addFields(...fields);

  // final total-size guard
  const size = estimateEmbedSize(embed);
  if (size > LIMITS.EMBED_TOTAL) {
    const fs = embed.data?.fields ?? [];
    if (fs.length) {
      const last = fs[fs.length - 1];
      last.value = safeFieldValue(
        clampStr(last.value, Math.max(0, LIMITS.FIELD_VALUE - 80)) +
          "\n…(trimmed to fit Discord limits)"
      );
    }
  }

  return embed;
}

export const EMBED_LIMITS = LIMITS;