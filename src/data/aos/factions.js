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
    key: "flesh_eater_courts",
    name: "Flesh-eater Courts",
    grandAlliance: "Death",
    aliases: [
      "flesh-eater courts",
    ],
    iconkey: "flesh_eater_courts",
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
{
    key: "hedonites_of_slaanesh",
    name: "Hedonites of Slaanesh",
    grandAlliance: "Chaos",
    aliases: [
      "hedonites of slaanesh",
    ],
    iconkey: "hedonites_of_slaanesh",
  },
{
    key: "helsmiths_of_hashut",
    name: "Helsmiths of Hashut",
    grandAlliance: "Chaos",
    aliases: [
      "helsmiths of hashut",
    ],
    iconkey: "helsmiths_of_hashut",
  },
{
    key: "idoneth_deepkin",
    name: "Idoneth Deepkin",
    grandAlliance: "Order",
    aliases: [
      "idoneth deepkin",
    ],
    iconkey: "idoneth_deepkin",
  },
{
    key: "kharadron_overlords",
    name: "Kharadron Overlords",
    grandAlliance: "Order",
    aliases: [
      "kharadron overlords",
    ],
    iconkey: "kharadron_overlords",
  },
{
    key: "lumineth_realmlords",
    name: "Lumineth Realm-lords",
    grandAlliance: "Order",
    aliases: [
      "lumineth realm-lords",
    ],
    iconkey: "lumineth_realmlords",
  },
{
    key: "maggotkin_of_nurgle",
    name: "Maggotkin of Nurgle",
    grandAlliance: "Chaos",
    aliases: [
      "maggotkin of nurgle",
    ],
    iconkey: "maggotkin_of_nurgle",
  },
  {
    key: "nighthaunt",
    name: "Nighthaunt",
    grandAlliance: "Death",
    aliases: [
      "nighthaunt",
    ],
    iconkey: "nighthaunt",
  },
   {
    key: "ogor_mawtribes",
    name: "Ogor Mawtribes",
    grandAlliance: "Destruction",
    aliases: [
      "ogor mawtribes",
    ],
    iconkey: "ogor_mawtribes",
  },
  {
    key: "kruleboyz",
    name: "Kruleboyz",
    grandAlliance: "Destruction",
    aliases: [
      "kruleboyz",
    ],
    iconkey: "kruleboyz",
  },
  {
    key: "ironjawz",
    name: "Ironjawz",
    grandAlliance: "Destruction",
    aliases: [
      "ironjawz",
    ],
    iconkey: "ironjawz",
  },
  {
    key: "big_waaagh",
    name: "Big Waaagh!",
    grandAlliance: "Destruction",
    aliases: [
      "big waaagh",
    ],
    iconkey: "big_waaagh",
  },
  {
    key: "ossiarch_bonereapers",
    name: "Ossiarch Bonereapers",
    grandAlliance: "Death",
    aliases: [
      "ossiarch bonereapers",
    ],
    iconkey: "ossiarch_bonereapers",
  },
  {
    key: "seraphon",
    name: "Seraphon",
    grandAlliance: "Order",
    aliases: [
      "seraphon",
    ],
    iconkey: "seraphon",
  },
  {
    key: "skaven",
    name: "Skaven",
    grandAlliance: "Chaos",
    aliases: [
      "skaven",
    ],
    iconkey: "skaven",
  },
{
    key: "slaves_to_darkness",
    name: "Slaves to Darkness",
    grandAlliance: "Chaos",
    aliases: [
      "slaves to darkness",
    ],
    iconkey: "slaves_to_darkness",
  },
{
    key: "sons_of_behemat",
    name: "Sons of Behemat",
    grandAlliance: "Destruction",
    aliases: [
      "sons of behemat",
    ],
    iconkey: "sons_of_behemat",
  },
{
    key: "soulblight_gravelords",
    name: "Soulblight Gravelords",
    grandAlliance: "Death",
    aliases: [
      "soulblight gravelords",
    ],
    iconkey: "soulblight_gravelords",
  },
{
    key: "stormcast_eternals",
    name: "Stormcast Eternals",
    grandAlliance: "Order",
    aliases: [
      "stormcast eternals",
    ],
    iconkey: "stormcast_eternals",
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
