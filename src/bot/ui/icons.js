// ==================================================
// UI: ICONS
// PURPOSE: Faction and symbol mapping
// ==================================================

import bladesOfKhorne from "../../assets/factions/blades_of_khorne.png";
import citiesOfSigmar from "../../assets/factions/cities_of_sigmar.png";

// ==================================================
// ICON DEFINITIONS
// ==================================================

export const FACTION_ICONS = {
  blades_of_khorne: bladesOfKhorne,
  cities_of_sigmar: citiesOfSigmar,
};

// ==================================================
// HELPERS
// ==================================================

export function getFactionIcon(iconKey) {
  if (!FACTION_ICONS[iconKey]) {
    console.warn(`Missing icon for faction key: ${iconKey}`);
  }
  return FACTION_ICONS[iconKey] || null;
}
