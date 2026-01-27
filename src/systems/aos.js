// ==================================================
// FILE: aos.js
// PURPOSE: Bind AoS lookups, parsers, and rules
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { WARSCROLLS_AOS } from "../data/aos/warscrolls.js";
import { FORMATIONS_AOS } from "../data/aos/formations.js";
import { MANIFESTATIONS_AOS } from "../data/aos/manifestations.js";
import { ARTEFACTS_AOS } from "../data/aos/artefacts.js";
import { HEROIC_TRAITS_AOS } from "../data/aos/heroic.js";
import { TERRAIN_AOS } from "../data/aos/terrain.js";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

/**
 * @typedef {Object} AoSLookups
 * @property {Array} warscrolls
 * @property {Array} formations
 * @property {Array} manifestations
 * @property {Array} artefacts
 * @property {Array} heroicTraits
 * @property {Array} terrain
 */

/**
 * @typedef {Object} SystemConfig
 * @property {string} id
 * @property {string} name
 * @property {{ warscrolls: Array, formations: Array, manifestations: Array, artefacts: Array, heroicTraits: Array, terrain: Array }} lookups
 */

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

/** @type {SystemConfig} */
export const AOS_SYSTEM = {
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
};

// ==================================================
// EXPORTS
// ==================================================
