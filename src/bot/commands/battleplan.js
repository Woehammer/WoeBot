// ==================================================
// COMMAND: /battleplan
// PURPOSE: Show battleplan win rates for a faction OR formation
// SOURCE: Woehammer GT CSV (Railway)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import BATTLEPLANS from "../../data/battleplans.js";

// If you already have these lookups, import them.
// If not, you can remove these and rely on raw string matching.
import { FACTIONS_AOS } from "../../data/factions.js"; // adjust path if needed
import { FORMATIONS_AOS } from "../../data/formations.js"; // adjust path if needed

// If you already have fetchCSV helper, import it.
// Otherwise this file includes a lightweight fetchCSV below.
import { fetchCSV } from "../utils/fetchCSV.js"; // adjust path if needed

// ==================================================
// ENV
// ==================================================
const GT_CSV_URL = process.env.GT_CSV_URL; // <- set this in Railway

// ==================================================
// CACHE
// ==================================================
let gtCache = [];
let gtCachedAt = null;

async function loadGT(force = false) {
  if (!GT_CSV_URL) throw new Error("Missing GT_CSV_URL env var");
  if (!force && gtCache.length) return;

  gtCache = await fetchCSV(GT_CSV_URL, { cacheBust: force });
  gtCachedAt = new Date();
}

async function ensureGT() {
  try {
    await loadGT(false);
  } catch (e) {
    if (!gtCache.length) throw e;
    console.warn("GT CSV fetch failed; using cached:", e?.message ?? e);
  }
}

// ==================================================
// HELPERS: NORMALISATION
// ==================================================
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

function resolveBattleplanName(input) {
  const q = norm(input);
  if (!q) return null;

  for (const bp of BATTLEPLANS) {
    if (norm(bp.name) === q) return bp.name;
    if ((bp.aliases ?? []).some((a) => norm(a) === q)) return bp.name;
  }
  return null;
}

function resolveFactionName(input) {
  const q = norm(input);
  if (!q) return null;

  // Try lookup
  if (Array.isArray(FACTIONS_AOS)) {
    for (const f of FACTIONS_AOS) {
      if (norm(f.name) === q) return f.name;
      if ((f.aliases ?? []).some((a) => norm(a) === q)) return f.name;
    }
  }
  // Fallback: return raw input (still works if CSV uses same naming)
  return input.trim();
}

function resolveFormationName(input) {
  const q = norm(input);
  if (!q) return null;

  if (Array.isArray(FORMATIONS_AOS)) {
    for (const f of FORMATIONS_AOS) {
      if (norm(f.name) === q) return f.name;
      if ((f.aliases ?? []).some((a) => norm(a) === q)) return f.name;
    }
  }
  return input.trim();
}

// ==================================================
// HELPERS: ROUND UNPIVOT (BP1..BP8 + R1..R8)
// ==================================================
function parseRoundResult(raw) {
  // Your sheet looks like 1/0 for win/loss.
  // If you later add draws, handle them here (e.g. "0.5" or "D").
  const v = norm(raw);

  if (v === "1") return "W";
  if (v === "0") return "L";
  if (v === "d" || v === "draw" || v === "0.5") return "D";

  // Unknown / blank / weird exports -> ignore
  return null;
}

function getRowBattleplanGameResults(row) {
  // Returns array of { battleplan, result }
  const out = [];
  for (let i = 1; i <= 8; i++) {
    const bpRaw = row[`BP${i}`];
    const resRaw = row[`R${i}`];

    if (!bpRaw) continue;

    // Canonicalise battleplan if possible, else keep raw
    const canon = resolveBattleplanName(bpRaw) ?? bpRaw.toString().trim();
    const result = parseRoundResult(resRaw);

    if (!result) continue;

    out.push({ battleplan: canon, result });
  }
  return out;
}

// ==================================================
// CORE: AGGREGATE BATTLEPLAN STATS
// ==================================================
function computeBattleplanStats(rows, { scope, name, battlescroll, minGames }) {
  const nameNorm = norm(name);
  const bsNorm = battlescroll ? norm(battlescroll) : null;

  // Map: battleplan -> { played,w,d,l }
  const map = new Map();

  for (const row of rows) {
    if (bsNorm && norm(row.Battlescroll) !== bsNorm) continue;

    if (scope === "faction") {
      if (norm(row.Faction) !== nameNorm) continue;
    } else if (scope === "formation") {
      // Your column is "Battle Formation"
      if (norm(row["Battle Formation"]) !== nameNorm) continue;
    } else {
      continue;
    }

    const games = getRowBattleplanGameResults(row);
    for (const g of games) {
      const key = g.battleplan;
      const cur = map.get(key) ?? { played: 0, w: 0, d: 0, l: 0 };

      cur.played += 1;
      if (g.result === "W") cur.w += 1;
      else if (g.result === "D") cur.d += 1;
      else if (g.result === "L") cur.l += 1;

      map.set(key, cur);
    }
  }

  // Convert to list with winrate
  const list = [...map.entries()].map(([battleplan, s]) => {
    const wr = s.played ? (s.w + 0.5 * s.d) / s.played : 0;
    return { battleplan, ...s, winrate: wr };
  });

  // Filter min games
  const mg = Number.isFinite(minGames) ? minGames : 5;
  const filtered = list.filter((x) => x.played >= mg);

  // Sort by games desc, then winrate desc
  filtered.sort((a, b) => b.played - a.played || b.winrate - a.winrate);

  return { list: filtered, minGames: mg };
}

// ==================================================
// DISCORD COMMAND
// ==================================================
const battleplan = {
  data: new SlashCommandBuilder()
    .setName("battleplan")
    .setDescription("Show battleplan win rates for a faction or formation.")
    .addStringOption((opt) =>
      opt
        .setName("scope")
        .setDescription("What are we analysing?")
        .setRequired(true)
        .addChoices(
          { name: "Faction", value: "faction" },
          { name: "Formation", value: "formation" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Faction or formation name")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("battlescroll")
        .setDescription("Optional Battlescroll filter (e.g. 2025-12)")
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("min_games")
        .setDescription("Hide battleplans with fewer games than this (default 5)")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const scope = interaction.options.getString("scope", true);
    const rawName = interaction.options.getString("name", true);
    const battlescroll = interaction.options.getString("battlescroll", false);
    const minGames = interaction.options.getInteger("min_games", false) ?? 5;

    await ensureGT();

    const resolvedName =
      scope === "faction"
        ? resolveFactionName(rawName)
        : resolveFormationName(rawName);

    const { list, minGames: mg } = computeBattleplanStats(gtCache, {
      scope,
      name: resolvedName,
      battlescroll,
      minGames,
    });

    if (!list.length) {
      const msg = [
        `No battleplan data found for **${resolvedName}**.`,
        battlescroll ? `Battlescroll filter: **${battlescroll}**` : null,
        `Min games: **${mg}**`,
        `Tip: some events don’t publish round battleplans (BP1..BP8).`,
      ]
        .filter(Boolean)
        .join("\n");
      return interaction.editReply({ content: msg });
    }

    const lines = list
      .slice(0, 15) // keep embed readable
      .map((x) => {
        const pct = (x.winrate * 100).toFixed(1);
        return `**${x.battleplan}**: ${pct}% (${x.played} games)`;
      })
      .join("\n");

    const title =
      scope === "faction"
        ? `Battleplans — ${resolvedName}`
        : `Battleplans — ${resolvedName}`;

    const subtitleParts = [];
    if (battlescroll) subtitleParts.push(`Battlescroll: ${battlescroll}`);
    subtitleParts.push(`Min games: ${mg}`);
    if (gtCachedAt) subtitleParts.push(`Cached: ${gtCachedAt.toISOString().slice(0, 10)}`);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(lines)
      .setFooter({ text: subtitleParts.join(" | ") });

    return interaction.editReply({ embeds: [embed] });
  },
};

export default battleplan;