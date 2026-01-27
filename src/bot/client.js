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

// ==================================================
// COMMAND REGISTRY
// ==================================================

const COMMANDS = [ping, warscroll];

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

// ==================================================
// INTERNAL STATE
// ==================================================

// ==================================================
// HELPERS
// ==================================================

// ==================================================
// CORE LOGIC
// ==================================================

function buildClient() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.commands = new Collection();
  for (const cmd of COMMANDS) {
    client.commands.set(cmd.data.name, cmd);
  }

  return client;
}

// --------------------------------------------------
  // INTERACTION ROUTER
  // --------------------------------------------------

  client.on("interactionCreate", async (interaction) => {
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

// ==================================================
// PUBLIC API
// ==================================================

export function createDiscordClient({ system, engine }) {
  const client = buildClient();

  // Stash references so commands can access engine/system cleanly
  client.woebot = { system, engine };

// ==================================================
// EXPORTS
// ==================================================

export { COMMANDS };