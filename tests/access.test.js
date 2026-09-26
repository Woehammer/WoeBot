import test from "node:test";
import assert from "node:assert/strict";

import { ACCESS, checkAccess } from "../src/bot/access.js";

const premium = { access: ACCESS.PATREON };
const config = { woehammerGuildId: "guild-1", patreonRoleIds: ["role-1"] };

test("public commands work in every server", () => {
  assert.equal(checkAccess({ guildId: "elsewhere" }, {}, config).allowed, true);
});

test("premium commands are restricted to the Woehammer server", () => {
  const result = checkAccess({ guildId: "elsewhere", member: { roles: ["role-1"] } }, premium, config);
  assert.equal(result.allowed, false);
});

test("premium commands require a configured Patreon role", () => {
  const denied = checkAccess({ guildId: "guild-1", member: { roles: ["other"] } }, premium, config);
  const allowed = checkAccess({ guildId: "guild-1", member: { roles: ["role-1"] } }, premium, config);
  assert.equal(denied.allowed, false);
  assert.equal(allowed.allowed, true);
});
