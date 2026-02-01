// ==================================================
// FILE: register-commands.js
// PURPOSE: Register Discord slash commands with the API
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { REST, Routes } from "discord.js";
import { COMMANDS } from "../src/bot/client.js";

// ==================================================
// HELPERS
// ==================================================
function buildCommandPayload() {
  return COMMANDS.map((cmd) => cmd.data.toJSON());
}

// ==================================================
// CORE LOGIC
// ==================================================
async function register({ token, clientId, guildId }) {
  if (!token) throw new Error("[registerCommands] token is required");
  if (!clientId) throw new Error("[registerCommands] clientId is required");

  const rest = new REST({ version: "10" }).setToken(token);
  const commands = buildCommandPayload();

  // Guard: duplicate command names = silent sadness
  const names = commands.map((c) => c.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) {
    throw new Error(`[registerCommands] duplicate command name(s): ${[
      ...new Set(dupes),
    ].join(", ")}`);
  }

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });

  console.log(
    `[registerCommands] registered ${commands.length} command(s) ${
      guildId ? "(guild)" : "(global)"
    }`
  );
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
export default { registerCommands };