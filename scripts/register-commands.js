// ==================================================
// FILE: register-commands.js
// PURPOSE: Register Discord slash commands with the API
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { REST, Routes } from "discord.js";

// ==================================================
// COMMAND IMPORTS
// NOTE: Keep this list in sync with src/bot/client.js
// ==================================================
import ping from "../src/bot/commands/ping.js";
import warscroll from "../src/bot/commands/warscroll.js";
import faction from "../src/bot/commands/faction.js";
import topplayers from "../src/bot/commands/topplayers.js"; // ✅ add

// ==================================================
// HELPERS
// ==================================================
function buildCommandPayload(system) {
  return [
    ping.data.toJSON(),
    warscroll.data.toJSON(),
    faction.data.toJSON(),
    topplayers.data.toJSON(), // ✅ add
  ];
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