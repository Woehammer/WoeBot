// ==================================================
// COMMAND: /warscroll
// PURPOSE: Stats for a single warscroll (v0: wiring test)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

import { SlashCommandBuilder } from "discord.js";

// ==================================================
// COMMAND DEFINITION
// ==================================================

export const data = new SlashCommandBuilder()
  .setName("warscroll")
  .setDescription("Shows stats for a warscroll (wiring test)")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Warscroll name")
      .setRequired(true)
  );

// ==================================================
// EXECUTION LOGIC
// ==================================================

export async function run(interaction) {
  const name = interaction.options.getString("name", true);
  await interaction.reply(`warscroll received: **${name}**`);
}

// ==================================================
// EXPORTS
// ==================================================

export default { data, run };
