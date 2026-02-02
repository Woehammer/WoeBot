// ==================================================
// LOOKUP: AOS WARSCROLLS (AGGREGATED)
// PURPOSE: Combine per-faction warscroll lists into one export
// ==================================================

import bladesOfKhorne from "./warscrolls/blades_of_khorne.js";
import citiesOfSigmar from "./warscrolls/cities_of_sigmar.js";
import daughtersOfKhaine from "./warscrolls/daughters_of_khaine.js";
import disciplesOfTzeentch from "./warscrolls/disciples_of_tzeentch.js";

// ==================================================
// WARSCROLL DEFINITIONS (MERGED)
// ==================================================

export const WARSCROLLS_AOS = [
  ...bladesOfKhorne,
  ...citiesOfSigmar,
  ...daughtersOfKhaine,
  ...disciplesOfTzeentch,
];

// ==================================================
// EXPORTS
// ==================================================

export default WARSCROLLS_AOS;
