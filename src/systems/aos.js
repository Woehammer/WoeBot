// ==================================================
// FILE: aos.js
// PURPOSE: System config for Age of Sigmar (lookups + bindings)
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { WARSCROLLS_AOS } from "../src/data/aos/warscrolls.js";
import { FORMATIONS_AOS } from "../src/data/aos/formations.js";
import { MANIFESTATIONS_AOS } from "../src/data/aos/manifestations.js";
import { ARTEFACTS_AOS } from "../src/data/aos/artefacts.js";
import { HEROIC_TRAITS_AOS } from "../src/data/aos/heroic.js";
import { TERRAIN_AOS } from "../src/data/aos/terrain.js";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

// ==================================================
// INTERNAL STATE
// ==================================================

// ==================================================
// HELPERS
// ==================================================

// ==================================================
// CORE LOGIC
// ==================================================

// ==================================================
// PUBLIC API
// ==================================================
export const SYSTEMS = {
  aos: {
    id: "aos",
    name: "Age of Sigmar",
    lookups: {
      warscrolls: WARSCROLLS_AOS,
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
