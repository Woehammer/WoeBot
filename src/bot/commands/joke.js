// ==================================================
// COMMAND: /joke
// PURPOSE: Tell a random Warhammer/Woehammer joke
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { SlashCommandBuilder } from "discord.js";

// ==================================================
// JOKES (EDIT THIS LIST)
// ==================================================
const JOKES = [
  "Why don't Soulblight eat cows? They don't like stakes.",
  "Why did Nagash take a nap? He was dead tired.",
  "Why do Bonereapers stay so calm? Nothing gets under their skin.",
  "Why did the Tidecaster cross the road? To get to the other tide.",
  "Idoneth are always gambling — they're real card sharks.",
  // Add loads more...
];

// ==================================================
// COMMAND DEFINITION
// ==================================================
export const data = new SlashCommandBuilder()
  .setName("joke")
  .setDescription("Tells a random joke")
  .addBooleanOption((opt) =>
    opt
      .setName("public")
      .setDescription("Show to everyone (default: true)")
      .setRequired(false)
  );

// ==================================================
// HELPERS
// ==================================================
function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

// ==================================================
// EXECUTION
// ==================================================
export async function run(interaction) {
  const isPublic = interaction.options.getBoolean("public") ?? true;

  const joke = pickRandom(JOKES);
  if (!joke) {
    await interaction.reply({
      content: "I’m out of jokes. Which is tragic, because I’m also out of dignity.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `🃏 ${joke}`,
    ephemeral: !isPublic,
  });
}

// ==================================================
// EXPORTS
// ==================================================
export default { data, run };