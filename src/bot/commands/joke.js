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
  "Why do treelords hate riddles? They're too easily stumped.",
  "What did Mannfred say when he looked in the mirror? Long time no see.",
  "There's a feud between Mannfred and  Belladamma  Volga.... it's bad blood.",
  "Why doesn't Radukar get invited to parties? He's a pain in the neck.",
  "Why didn't Katakros go to the party? He had no body to go with.",
  "Why can't Bonereapers play the piano? They don't have any organs.",
  "What do gobbos sing to their squigs? Mush little squiggy, don't you cry....",
  "Why does Teclis hate mirrors?
Because even his reflection thinks it knows better.",
  "Why doesn’t Teclis have any friends?
Because you can only be told you’re wrong so many times before you stab a god.",
  "Teclis once created an entire race of aelves…
…and still couldn’t make one that liked him.",
  "An Imperial Guardsman, a Space Marine and an Inquisitor walk into a bar. The Guardsman says "ow!". The marine breaks right through with his reinforced skull. The Inquisior accuses the bar of heresy. When the bar refuses to confess or even move, despite sustained torture, the Inquisior executes the Guardsman for failing tk defeat the bar in combat.",
  "What do you call a Lasgun with a laser-sight? Twin-linked.",
  "What does the Tzeentchian restaurant manager do when no one is being seated? Change hosts.",
  "What does a Megaboss say after a nasty mirror match? Et tu Brutes?",
  "What's long brown and sticky? Durthu",
  "What do Bloodthirsters eat at the cinema? PopKhorne.",
  "Everyone hates necromancers, but they are just trying to raise a family.",
  "One necromancer in particular was overly invested in Bitcoin, it was a Cryptocurrency. This necromancer cared nothing for those around him, or even his meagre wound count, his only concern was curing his terrible breath. You see he was a super callous fragile mystic vexed by halitosis.",
  "Two enemy Sylvaneth wargroves wanted peace, they entered into a Tree-ty.",
  "Why didn’t the Great Unclean one like the Bloodthirsters jokes? They were too Khorney.",
  "Once at a tomb king cocktail party, Khalifa turned to Settra and asked "Great Settra, can thou hand me a metropolitan?" Settra: Settra. Does. Not. Serve. Khatep: *in admiration* Settra rules!!!",
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