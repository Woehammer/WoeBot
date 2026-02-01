// ==================================================
// COMMAND SHARED: warscroll list builders
// PURPOSE: Shared logic for /impact /leastimpact /common /leastcommon
// ==================================================

export const HR = "──────────────";

export function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

export function pct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

export function fmtPP(x) {
  if (!Number.isFinite(x)) return "—";
  const sign = x >= 0 ? "+" : "";
  return `${sign}${x.toFixed(1)}pp`;
}

export function fmtInt(x) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}`;
}

export function fmtNum(x, dp = 2) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

// Avg occurrences display rule:
// - show if avgOcc >= 1.05 (meaningful multiples)
// - OR if included games >= 10 (enough sample that "1.00" isn't just noise)
export function shouldShowAvgOcc(avgOcc, includedGames) {
  if (!Number.isFinite(avgOcc)) return false;
  if (avgOcc >= 1.05) return true;
  if (Number.isFinite(includedGames) && includedGames >= 10) return true;
  return false;
}

// Try to get a reliable faction list for autocomplete
export function getFactionChoices({ system, engine }) {
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

// Find canonical faction via lookup aliases (fallback: dataset names)
export function findFactionName(system, engine, inputName) {
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

// Get warscroll candidates for a faction from lookup
export function getWarscrollCandidates(system, factionName) {
  const q = norm(factionName);
  const ws = system?.lookups?.warscrolls ?? [];
  return ws.filter((w) => norm(w.faction) === q).map((w) => w.name);
}

// Compute Used% as "share of faction games that include the warscroll"
export function usedPctByGames(includedGames, factionGames) {
  if (
    !Number.isFinite(includedGames) ||
    !Number.isFinite(factionGames) ||
    factionGames <= 0
  )
    return null;
  return includedGames / factionGames;
}

// Build the formatted line blocks (each block becomes one “item”)
export function buildWarscrollBlocks(rows) {
  return rows.map((r, i) => {
    const line1 = `${i + 1}. **${r.name}**`;

    const parts = [
      `Win: **${pct(r.incWR)}** (${fmtPP(r.deltaPP)} vs faction)`,
      `Win w/o: **${pct(r.withoutWR)}**`,
      `Used: **${pct(r.used)}**`,
      `Games: **${fmtInt(r.incGames)}**`,
    ];

    if (r.showAvgOcc) {
      parts.push(`Avg occ: **${fmtNum(r.avgOcc, 2)}**`);
    }

    const line2 = parts.join(" | ");
    return `${line1}\n${line2}\n${HR}`;
  });
}