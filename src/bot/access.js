import { PermissionFlagsBits } from "discord.js";

export const ACCESS = Object.freeze({
  PUBLIC: "public",
  PATREON: "patreon",
});

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function memberRoleIds(interaction) {
  const roles = interaction?.member?.roles;
  if (Array.isArray(roles)) return new Set(roles);
  if (roles?.cache) return new Set(roles.cache.keys());
  return new Set();
}

function isAdministrator(interaction) {
  return Boolean(
    interaction?.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

export function buildAccessConfig(env) {
  return {
    woehammerGuildId: env.WOEHAMMER_GUILD_ID,
    patreonRoleIds: splitCsv(env.PATREON_ROLE_IDS),
  };
}

export function checkAccess(interaction, command, config) {
  if ((command?.access ?? ACCESS.PUBLIC) === ACCESS.PUBLIC) {
    return { allowed: true };
  }

  if (!config?.woehammerGuildId || !config?.patreonRoleIds?.length) {
    return {
      allowed: false,
      reason: "Premium access has not been configured yet. An administrator needs to set WOEHAMMER_GUILD_ID and PATREON_ROLE_IDS.",
    };
  }

  if (interaction.guildId !== config.woehammerGuildId) {
    return {
      allowed: false,
      reason: "This feature is available to Woehammer Patreon members in the official Woehammer Discord.",
    };
  }

  if (isAdministrator(interaction)) return { allowed: true };

  const roles = memberRoleIds(interaction);
  if (config.patreonRoleIds.some((roleId) => roles.has(roleId))) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "This feature is available to Patreon members in the Woehammer Discord.",
  };
}

export default { ACCESS, buildAccessConfig, checkAccess };
