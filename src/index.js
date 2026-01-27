// ==================================================
// WOEBOT ENTRYPOINT
// PURPOSE: Bootstrap application, load system config,
//          initialise Discord client, register commands
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

import { loadEnv } from "./config/env.js";
import { SYSTEMS } from "./systems/aos.js";

import { createDiscordClient } from "./bot/client.js";
import { registerCommands } from "../scripts/register-commands.js";

import { createDatasetService } from "./engine/fetch/dataset.js";
import { createIndexService } from "./engine/stats/indexes.js";

import { startHealthServer } from "./engine/fetch/health.js";

// ==================================================
// SYSTEM SELECTION
// ==================================================

function pickSystem() {
  // v1: hardcode AoS; later: env var like WOEBOT_SYSTEM=aos
  return SYSTEMS.aos;
}

// ==================================================
// ENGINE INITIALISATION
// ==================================================

async function initEngine(system, env) {
  // Dataset service handles CSV fetch + parse + cache
  const dataset = createDatasetService({
    csvUrl: env.AOS_DB_SHEET_CSV_URL,
    ttlSeconds: env.CACHE_TTL_SECONDS ?? 900,
  });

  // Prebuild indexes for fast queries (player/faction/event/etc.)
  const indexes = createIndexService({ dataset });

  // Warm cache at boot so first command isn't "loading... 💀"
  await dataset.refresh();
  await indexes.refresh();

  return { dataset, indexes };
}

// ==================================================
// DISCORD CLIENT INITIALISATION
// ==================================================

async function initDiscord(system, env, engine) {
  const client = createDiscordClient({
    token: env.DISCORD_TOKEN,
    system,
    engine,
  });

  return client;
}

// ==================================================
// COMMAND REGISTRATION
// ==================================================

async function initCommands(system, env) {
  // If you register via a separate script, you may not need this here.
  // Keeping it as an optional boot step.
  if (env.REGISTER_COMMANDS_ON_BOOT) {
    await registerCommands({
      token: env.DISCORD_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_GUILD_ID, // optional for dev
      system,
    });
  }
}

// ==================================================
// STARTUP / BOOT
// ==================================================

(async function boot() {
  const env = loadEnv();
  const system = pickSystem();

  const engine = await initEngine(system, env);
  const client = await initDiscord(system, env, engine);

  await initCommands(system, env);

  await client.login(env.DISCORD_TOKEN);
  console.log(`[WoeBot] online | system=${system.id}`);
})().catch((err) => {
  console.error("[WoeBot] boot failed:", err);
  process.exit(1);
});
