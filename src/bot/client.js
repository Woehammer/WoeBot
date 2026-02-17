// ==================================================
// FILE: client.js
// PURPOSE: Create and configure the Discord client instance
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { Client, GatewayIntentBits, Collection } from "discord.js";

import ping from "./commands/ping.js";
import warscroll from "./commands/warscroll.js";
import faction from "./commands/faction.js";
import topplayers from "./commands/topplayers.js";
import impact from "./commands/impact.js";
import leastimpact from "./commands/leastimpact.js";
import common from "./commands/common.js";
import leastcommon from "./commands/leastcommon.js";
import enhancements from "./commands/enhancements.js";
import joke from "./commands/joke.js";
import battleplan from "./commands/battleplan.js";
import event from "./commands/event.js";
import list from "./commands/list.js";
import lookup from "./commamds/lookup.js";

// ==================================================
// COMMAND REGISTRY
// ==================================================
export const COMMANDS = [
  ping,
  warscroll,
  faction,
  topplayers,
  impact,
  leastimpact,
  common,
  leastcommon,
  enhancements,
  joke,
  battleplan,
  event,
  list,
  lookup,
];

// ==================================================
// HELPERS
// ==================================================
function buildClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
  });
}

// ==================================================
// PUBLIC API
// ==================================================
export function createDiscordClient({ system, engine }) {
  const client = buildClient();

  // --------------------------------------------------
  // COMMAND COLLECTION
  // --------------------------------------------------
  client.commands = new Collection();
  for (const cmd of COMMANDS) {
    client.commands.set(cmd.data.name, cmd);
  }

  // --------------------------------------------------
  // SHARED CONTEXT
  // --------------------------------------------------
  client.woebot = { system, engine };

  // --------------------------------------------------
  // INTERACTION ROUTER
  // --------------------------------------------------
  client.on("interactionCreate", async (interaction) => {
    // ----------------------------
    // AUTOCOMPLETE ROUTING
    // ----------------------------
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd?.autocomplete) return;

      try {
        await cmd.autocomplete(interaction, client.woebot);
      } catch (err) {
        console.error(
          `[WoeBot] autocomplete failed: ${interaction.commandName}`,
          err
        );
      }
      return;
    }

    // ----------------------------
    // SLASH COMMAND ROUTING
    // ----------------------------
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    try {
      await cmd.run(interaction, client.woebot);
    } catch (err) {
      console.error(`[WoeBot] command failed: ${interaction.commandName}`, err);
      const msg = "Command crashed. It’s not you. It’s my JavaScript.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  });

  return client;
}

export default { createDiscordClient, COMMANDS };