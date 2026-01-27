// ==================================================
// FILE: client.js
// PURPOSE: Create and configure the Discord client instance
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { Client, GatewayIntentBits, Collection } from "discord.js";

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

  // Optional: command collection (handy later)
  client.commands = new Collection();

  return client;
}

// ==================================================
// PUBLIC API
// ==================================================
export function createDiscordClient({ system, engine }) {
  const client = buildClient();

  // Stash references so commands can access engine/system cleanly
  client.woebot = { system, engine };

  return client;
}

// ==================================================
// EXPORTS
// ==================================================