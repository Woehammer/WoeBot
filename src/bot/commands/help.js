// ==================================================
// COMMAND: /help
// PURPOSE: Explain what WoeBot commands do + quick examples
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

// --------------------------------------------------
// HELP CONTENT (edit freely)
// --------------------------------------------------
const HELP_TOPICS = [
  {
    id: "lookup",
    title: "/lookup",
    summary:
      "Lookup + analysis for list elements (warscrolls, artefacts, traits, lores, tactics, RoR) within a faction (and optional formation).",
    usage: [
      "/lookup faction:<Faction> type:<Type> name:<Name>",
      "/lookup faction:<Faction> type:<Type> name:<Name> formation:<Formation>",
    ],
    examples: [
      "/lookup faction:Blades of Khorne type:Warscroll name:Bloodthirster of Insensate Rage",
      "/lookup faction:Gloomspite Gitz type:Spell Lore name:Lore of the Clammy Dank",
      "/lookup faction:Stormcast Eternals type:Artefact name:Mirror Shield formation:Thunderhead Host",
    ],
    notes: [
      "Autocomplete is scoped to your chosen faction.",
      "For some types, autocomplete can be filtered to only items seen in lists (if enabled in lookup.js).",
    ],
    tags: ["analysis", "lists"],
  },

  {
    id: "warscroll",
    title: "/warscroll",
    summary:
      "Warscroll usage + win rate impact within a faction scope, usually with co-includes and contextual stats.",
    usage: ["/warscroll faction:<Faction> name:<Warscroll>"],
    examples: [
      "/warscroll faction:Cities of Sigmar name:Freeguild Fusiliers",
      "/warscroll faction:Ossiarch Bonereapers name:Mortek Guard",
    ],
    notes: ["If this exists, it’s the “gold standard” path for warscroll stats."],
    tags: ["analysis", "lists"],
  },

  {
    id: "faction",
    title: "/faction",
    summary:
      "Faction overview: games, win rate, Elo context, and breakdowns (may include formations / battleplans depending on your build).",
    usage: ["/faction faction:<Faction>", "/faction faction:<Faction> formation:<Formation>"],
    examples: [
      "/faction faction:Gloomspite Gitz",
      "/faction faction:Blades of Khorne formation:Gorechosen Champions",
    ],
    notes: ["Use this when you want the 'big picture' before drilling into specifics."],
    tags: ["analysis"],
  },

  {
    id: "topplayers",
    title: "/topplayers",
    summary:
      "Show top players by performance/Elo within a scope (depending on your implementation).",
    usage: ["/topplayers faction:<Faction>", "/topplayers faction:<Faction> limit:<N>"],
    examples: ["/topplayers faction:Stormcast Eternals", "/topplayers faction:Skaven limit:10"],
    notes: [],
    tags: ["analysis", "players"],
  },

  {
    id: "impact",
    title: "/impact",
    summary:
      "Show the most positively associated options (warscrolls/choices) for a faction scope.",
    usage: ["/impact faction:<Faction>", "/impact faction:<Faction> formation:<Formation>"],
    examples: [
      "/impact faction:Slaves to Darkness",
      "/impact faction:Cities of Sigmar formation:Castelite Host",
    ],
    notes: ["“Impact” is association, not proof of causation. Pilot skill + pairings matter."],
    tags: ["analysis"],
  },

  {
    id: "leastimpact",
    title: "/leastimpact",
    summary:
      "Show the most negatively associated options (warscrolls/choices) for a faction scope.",
    usage: ["/leastimpact faction:<Faction>", "/leastimpact faction:<Faction> formation:<Formation>"],
    examples: ["/leastimpact faction:Seraphon", "/leastimpact faction:Kharadron Overlords"],
    notes: ["Treat very small samples with caution."],
    tags: ["analysis"],
  },

  {
    id: "common",
    title: "/common",
    summary:
      "Show the most common warscrolls/options taken in the chosen scope.",
    usage: ["/common faction:<Faction>", "/common faction:<Faction> formation:<Formation>"],
    examples: ["/common faction:Fyreslayers", "/common faction:Kruleboyz"],
    notes: ["Good for “what are people actually bringing?”"],
    tags: ["analysis", "lists"],
  },

  {
    id: "leastcommon",
    title: "/leastcommon",
    summary:
      "Show the least common warscrolls/options taken in the chosen scope.",
    usage: ["/leastcommon faction:<Faction>", "/leastcommon faction:<Faction> formation:<Formation>"],
    examples: ["/leastcommon faction:Idoneth Deepkin"],
    notes: ["Low counts can also mean missing parsing coverage."],
    tags: ["analysis", "lists"],
  },

  {
    id: "ping",
    title: "/ping",
    summary: "Health check. Confirms the bot is alive and responding.",
    usage: ["/ping"],
    examples: ["/ping"],
    notes: [],
    tags: ["utility"],
  },
];

// quick lookup maps
const BY_ID = new Map(HELP_TOPICS.map((x) => [x.id, x]));
const TAGS = [...new Set(HELP_TOPICS.flatMap((x) => x.tags || []))].sort();

// --------------------------------------------------
// COMMAND DEF
// --------------------------------------------------
export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Explain WoeBot commands and how to use them")
  .addStringOption((opt) =>
    opt
      .setName("command")
      .setDescription("Show help for a specific command (e.g. lookup, faction)")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("topic")
      .setDescription("Filter by topic tag (analysis, lists, players, utility)")
      .setRequired(false)
      .setAutocomplete(true)
  );

// --------------------------------------------------
// AUTOCOMPLETE
// --------------------------------------------------
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const q = String(focused.value ?? "").toLowerCase().trim();

  if (focused.name === "command") {
    const choices = HELP_TOPICS.map((x) => x.id)
      .filter((id) => !q || id.includes(q))
      .slice(0, 25)
      .map((id) => ({ name: id, value: id }));
    await interaction.respond(choices);
    return;
  }

  if (focused.name === "topic") {
    const choices = TAGS.filter((t) => !q || t.includes(q))
      .slice(0, 25)
      .map((t) => ({ name: t, value: t }));
    await interaction.respond(choices);
    return;
  }
}

// --------------------------------------------------
// RENDER HELP
// --------------------------------------------------
function renderTopic(topic) {
  const lines = [];

  lines.push(`**What it does**`, topic.summary, "");

  if (topic.usage?.length) {
    lines.push(`**Usage**`);
    for (const u of topic.usage) lines.push(`• \`${u}\``);
    lines.push("");
  }

  if (topic.examples?.length) {
    lines.push(`**Examples**`);
    for (const e of topic.examples) lines.push(`• \`${e}\``);
    lines.push("");
  }

  if (topic.notes?.length) {
    lines.push(`**Notes**`);
    for (const n of topic.notes) lines.push(`• ${n}`);
    lines.push("");
  }

  if (topic.tags?.length) {
    lines.push(`**Tags**`, topic.tags.map((t) => `\`${t}\``).join(" "));
  }

  return lines.filter((x) => x !== undefined);
}

// --------------------------------------------------
// RUN
// --------------------------------------------------
export async function run(interaction) {
  const cmd = interaction.options.getString("command", false)?.toLowerCase().trim() || null;
  const tag = interaction.options.getString("topic", false)?.toLowerCase().trim() || null;

  let topics = HELP_TOPICS;

  if (cmd) {
    const t = BY_ID.get(cmd);
    if (!t) {
      await interaction.reply({
        content: `No help entry found for **${cmd}**. Try \`/help\` to see all commands.`,
        ephemeral: true,
      });
      return;
    }
    topics = [t];
  } else if (tag) {
    topics = HELP_TOPICS.filter((t) => (t.tags || []).includes(tag));
    if (!topics.length) {
      await interaction.reply({
        content: `No commands found for topic **${tag}**. Try one of: ${TAGS.map((x) => `\`${x}\``).join(" ")}`,
        ephemeral: true,
      });
      return;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("WoeBot Help")
    .setFooter({ text: "Woehammer GT Database" });

  // overview header
  const headerLines = [];
  headerLines.push(
    "Use `/help command:<name>` for a single command.",
    "Use `/help topic:<tag>` to filter.",
    "",
    `Available topics: ${TAGS.map((t) => `\`${t}\``).join(" ")}`
  );

  addChunkedSection(embed, {
    headerField: { name: "Quick Start", value: headerLines.join("\n") },
    lines: [],
  });

  // Each topic gets its own section
  for (const t of topics) {
    addChunkedSection(embed, {
      headerField: { name: t.title, value: `\`${t.id}\`` },
      lines: renderTopic(t),
    });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default { data, run, autocomplete };