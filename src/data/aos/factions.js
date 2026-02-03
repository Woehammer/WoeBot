// ==================================================
// LOOKUP: AOS FACTIONS
// PURPOSE: Canonical faction names, keys, and metadata
// ==================================================

// ==================================================
// FACTION DEFINITIONS
// ==================================================
// Notes:
// - `key` is the stable identifier used internally.
// - `name` is the canonical display name.
// - `aliases` are for user input matching (commands/autocomplete), not list parsing.
// - `icon` is optional (emoji, unicode, or a key used by icons.js).
// ==================================================

export const FACTIONS_AOS = [
  {
    key: "blades_of_khorne",
    name: "Blades of Khorne",
    grandAlliance: "Chaos",
    aliases: [
      "blades of khorne",
    ],
    iconkey: "blades_of_khorne",
  },
  {
    key: "cities_of_sigmar",
    name: "Cities of Sigmar",
    grandAlliance: "Order",
    aliases: [
      "cities of sigmar",
    ],
    iconkey: "cities_of_sigmar",
  },
  {
    key: "daughters_of_khaine",
    name: "Daughters of Khaine",
    grandAlliance: "Order",
    aliases: [
      "daughters of khaine",
    ],
    iconkey: "daughters_of_khaine",
  },
{
    key: "disciples_of_tzeentch",
    name: "Disciples of Tzeentch",
    grandAlliance: "Chaos",
    aliases: [
      "disciples of tzeentch",
    ],
    iconkey: "disciples_of_tzeentch",
  },
{
    key: "gloomspite_gitz",
    name: "Gloomspite Gitz",
    grandAlliance: "Destruction",
    aliases: [
      "gloomspite gitz",
    ],
    iconkey: "gloomspite_gitz",
  },
];

// ==================================================
// HELPERS
// ==================================================
// Keep these tiny. No Discord imports. No engine logic.
// Only basic lookup convenience functions.
// ==================================================

export function getFactionByKey(key) {
  return FACTIONS_AOS.find((f) => f.key === key) || null;
}

export function matchFaction(input) {
  if (!input) return null;
  const q = String(input).trim().toLowerCase();
  return (
    FACTIONS_AOS.find((f) => f.key === q) ||
    FACTIONS_AOS.find((f) => f.name.toLowerCase() === q) ||
    FACTIONS_AOS.find((f) => (f.aliases || []).includes(q)) ||
    null
  );
}

// ==================================================
// EXPORTS
// ==================================================

export default FACTIONS_AOS;
