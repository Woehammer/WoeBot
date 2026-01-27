// ==================================================
// COMMAND: /ping
// PURPOSE: Prove bot is alive and interactions route correctly
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder } from "discord.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Health check for WoeBot");

// ==================================================
// EXECUTION LOGIC
// ==================================================
export async function run(interaction) {
  await interaction.reply("pong 🏓");
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };