// ==================================================
// FILE: register-commands.js
// PURPOSE: Register Discord slash commands with the API
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { REST, Routes } from "discord.js";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

/**
 * @typedef {Object} RegisterCommandsOptions
 * @property {string} token
 * @property {string} clientId
 * @property {string} [guildId]
 * @property {Object} system
 */

// ==================================================
// INTERNAL STATE
// ==================================================

// ==================================================
// HELPERS
// ==================================================
function buildCommandPayload(system) {
  // Placeholder – later this will pull from system.commandDefinitions
  return [];
}

// ==================================================
// CORE LOGIC
// ==================================================
async function register({ token, clientId, guildId, system }) {
  if (!token) throw new Error("[registerCommands] token is required");
  if (!clientId) throw new Error("[registerCommands] clientId is required");

  const rest = new REST({ version: "10" }).setToken(token);
  const commands = buildCommandPayload(system);

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
}

// ==================================================
// PUBLIC API
// ==================================================
export async function registerCommands(options) {
  return register(options);
}

// ==================================================
// EXPORTS
// ==================================================