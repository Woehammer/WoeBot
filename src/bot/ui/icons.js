// ==================================================
// UI: ICONS
// PURPOSE: Faction and symbol mapping (Node-safe file paths)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import path from "node:path";
import { fileURLToPath } from "node:url";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// icons live at: src/assets/factions/*.png
const FACTIONS_DIR = path.resolve(__dirname, "../../assets/factions");

// ==================================================
// ICON DEFINITIONS
// ==================================================
export const FACTION_ICONS = {
  blades_of_khorne: path.join(FACTIONS_DIR, "blades_of_khorne.png"),
  cities_of_sigmar: path.join(FACTIONS_DIR, "cities_of_sigmar.png"),
};

// ==================================================
// HELPERS
// ==================================================
export function getFactionIconPath(iconKey) {
  const p = FACTION_ICONS[iconKey] || null;
  if (!p) console.warn(`[icons] Missing icon for faction key: ${iconKey}`);
  return p;
}