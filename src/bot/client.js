// ==================================================
// FILE: client.js
// PURPOSE: Create and configure the Discord client instance
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { Client, GatewayIntentBits, Collection, Events } from "discord.js";

import ping from "./commands/ping.js";
import warscroll from "./commands/warscroll.js";
import faction from "./commands/faction.js";

// ==================================================
// COMMAND REGISTRY
// ==================================================
export const COMMANDS = [ping, warscroll, faction];

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
  // INTERACTION ROUTER (commands + autocomplete)
  // --------------------------------------------------
  client.on(Events.InteractionCreate, async (interaction) => {
    const cmd = client.commands.get(interaction.commandName);

    // ------------------------------------------------
    // AUTOCOMPLETE
    // ------------------------------------------------
    if (interaction.isAutocomplete()) {
      try {
        if (!cmd?.autocomplete) {
          // Discord expects a respond() call even if you have no suggestions
          await interaction.respond([]);
          return;
        }

        await cmd.autocomplete(interaction, client.woebot);
      } catch (err) {
        console.error(
          `[WoeBot] autocomplete failed: ${interaction.commandName}`,
          err
        );
        // Must respond or Discord will keep showing "no options"
        try {
          await interaction.respond([]);
        } catch {}
      }
      return;
    }

    // ------------------------------------------------
    // SLASH COMMANDS
    // ------------------------------------------------
    if (!interaction.isChatInputCommand()) return;

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