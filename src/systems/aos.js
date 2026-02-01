// ==================================================
// SYSTEM CONFIG: AGE OF SIGMAR
// PURPOSE: Bind AoS lookups, parsers, and rules
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { WARSCROLLS_AOS } from "../data/aos/warscrolls.js";
import { FACTIONS_AOS } from "../data/aos/factions.js"; // ✅ add (used by /faction + autocomplete)

import { FORMATIONS_AOS } from "../data/aos/formations.js";
import { MANIFESTATIONS_AOS } from "../data/aos/manifestations.js";
import { ARTEFACTS_AOS } from "../data/aos/artefacts.js";
import { HEROIC_TRAITS_AOS } from "../data/aos/heroic.js";
import { TERRAIN_AOS } from "../data/aos/terrain.js";

// ==================================================
// LOOKUP REGISTRATION
// ==================================================
export const SYSTEMS = {
  aos: {
    id: "aos",
    name: "Age of Sigmar",
    lookups: {
      // Core
      warscrolls: WARSCROLLS_AOS,
      factions: FACTIONS_AOS, // ✅ add

      // Meta / army construction
      formations: FORMATIONS_AOS,
      manifestations: MANIFESTATIONS_AOS,
      artefacts: ARTEFACTS_AOS,
      heroicTraits: HEROIC_TRAITS_AOS,
      terrain: TERRAIN_AOS,
    },
  },
};

// ==================================================
// EXPORTS
// ==================================================
export default SYSTEMS;