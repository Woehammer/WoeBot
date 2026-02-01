// ==================================================
// COMMAND: /leastimpact
// PURPOSE: Top warscrolls pulling DOWN a faction's win rate
//          (Included win rate < faction baseline)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("leastimpact")
  .setDescription(
    "Top warscrolls pulling DOWN a faction's win rate (vs faction baseline)"
  )
  .addStringOption((opt) =>
    opt
      .setName("faction")
      .setDescription("Faction name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("How many warscrolls to show (default 10, max 25)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
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

function fmtPP(x) {
  if (!Number.isFinite(x)) return "—";
  const sign = x >= 0 ? "+" : "";
  return `${sign}${x.toFixed(1)}pp`;
}

function fmtInt(x) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}`;
}

function fmtNum(x, dp = 2) {
  if (!Number.isFinite(x)) return "—";
  return Number(x).toFixed(dp);
}

// Avg occurrences display rule:
// - show if avgOcc >= 1.05 (meaningful multiples)
// - OR if included games >= 10 (enough sample that "1.00" isn't just noise)
function shouldShowAvgOcc(avgOcc, includedGames) {
  if (!Number.isFinite(avgOcc)) return false;
  if (avgOcc >= 1.05) return true;
  if (Number.isFinite(includedGames) && includedGames >= 10) return true;
  return false;
}

// Try to get a reliable faction list for autocomplete
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

// Find canonical faction via lookup aliases (fallback: dataset names)
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
    for (const rows of byFaction.values()) {
      const any = rows?.[0];
      const name = any?.Faction ?? any?.faction;
      if (name && norm(name) === q) return name;
    }
  }

  return null;
}

// Get warscroll candidates for a faction from lookup
function getWarscrollCandidates(system, factionName) {
  const q = norm(factionName);
  const ws = system?.lookups?.warscrolls ?? [];
  return ws.filter((w) => norm(w.faction) === q).map((w) => w.name);
}

// Compute Used% as "share of faction games that include the warscroll"
function usedPctByGames(includedGames, factionGames) {
  if (
    !Number.isFinite(includedGames) ||
    !Number.isFinite(factionGames) ||
    factionGames <= 0
  )
    return null;
  return includedGames / factionGames;
}

// ==================================================
// AUTOCOMPLETE: FACTION
// ==================================================
export async function autocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "faction") return;

  const q = norm(focused.value);
  const choices = getFactionChoices(ctx);

  await interaction.respond(
    choices
      .filter((n) => !q || norm(n).includes(q))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }))
  );
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction, { system, engine }) {
  const inputFaction = interaction.options.getString("faction", true).trim();
  const limit = interaction.options.getInteger("limit", false) ?? 10;

  const factionName = findFactionName(system, engine, inputFaction);
  if (!factionName) {
    await interaction.reply({
      content: `Couldn't match **${inputFaction}** to a known faction.`,
      ephemeral: true,
    });
    return;
  }

  const factionSummary = engine.indexes.factionSummary(factionName);
  if (!factionSummary?.games) {
    await interaction.reply({
      content: `No data found for **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  const factionWR = Number(factionSummary.winRate ?? 0);
  const factionGames = Number(factionSummary.games ?? 0);

  const candidates = getWarscrollCandidates(system, factionName);
  if (!candidates.length) {
    await interaction.reply({
      content: `No warscroll lookup entries found for **${factionName}**.`,
      ephemeral: true,
    });
    return;
  }

  const rows = [];
  for (const wsName of candidates) {
    const s = engine.indexes.warscrollSummaryInFaction(wsName, factionName, 3);
    if (!s?.included) continue;

    const incGames = Number(s.included.games ?? 0);
    const incWR = Number(s.included.winRate ?? NaN);
    if (!incGames || !Number.isFinite(incWR)) continue;

    // Only "pulling DOWN"
    if (!(incWR < factionWR)) continue;

    const withoutWR = Number(s.without?.winRate ?? NaN);
    const used = usedPctByGames(incGames, factionGames);

    const avgOcc = Number(
      s.included.avgOccurrencesPerList ??
        s.included.avgOcc ??
        s.included.avg_occurrences ??
        NaN
    );

    rows.push({
      name: wsName,
      incWR,
      incGames,
      withoutWR,
      used,
      avgOcc,
      showAvgOcc: shouldShowAvgOcc(avgOcc, incGames),
      deltaPP: (incWR - factionWR) * 100, // will be negative
    });
  }

  // Most negative impact first
  rows.sort((a, b) => a.deltaPP - b.deltaPP);
  const top = rows.slice(0, limit);

  const header =
    `Baseline (faction overall win rate): **${pct(factionWR)}**.\n` +
    `Listed warscrolls have a **lower win rate** than this baseline.`;

  const body = top.length
    ? top
        .map((r, i) => {
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
        })
        .join("\n")
    : "—";

  const embed = new EmbedBuilder()
    .setTitle(
      `Top ${top.length || limit} warscrolls pulling DOWN — ${factionName}`
    )
    .addFields(
      { name: "Overview", value: header },
      { name: "Results", value: body }
    )
    .setFooter({ text: "Woehammer GT Database" });

  await interaction.reply({ embeds: [embed] });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run, autocomplete };