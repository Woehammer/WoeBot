// ==================================================
// SYSTEM CONFIG: AGE OF SIGMAR
// PURPOSE: Bind AoS lookups, parsers, and rules
// ==================================================

// ==================================================
// IMPORTS
// ==================================================
import { WARSCROLLS_AOS } from "../data/aos/warscrolls.js";
import { FACTIONS_AOS } from "../data/aos/factions.js";
import { FORMATIONS_AOS } from "../data/aos/formations.js";
import { MANIFESTATIONS_AOS } from "../data/aos/manifestations.js";
import { ARTEFACTS_AOS } from "../data/aos/artefacts.js";
import { HEROIC_TRAITS_AOS } from "../data/aos/heroic.js";
import { TERRAIN_AOS } from "../data/aos/terrain.js";
import { SPELLS_AOS } from "../data/aos/spells.js";
import { PRAYERS_AOS } from "../data/aos/prayers.js";
import BATTLE_TACTICS from "../data/aos/battle_tactics.js";
import REGIMENTS_OF_RENOWN from "../data/aos/regiments_of_renown.js";

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
      factions: FACTIONS_AOS,

      // Meta / army construction
      formations: FORMATIONS_AOS,
      manifestations: MANIFESTATIONS_AOS,
      artefacts: ARTEFACTS_AOS,
      heroicTraits: HEROIC_TRAITS_AOS,
      terrain: TERRAIN_AOS,
      spells: SPELLS_AOS
      prayers: PRAYERS_AOS
      battleTactics: BATTLE_TACTICS,
      regimentsOfRenown: REGIMENTS_OF_RENOWN,
    },
  },
};

// ==================================================
// EXPORTS
// ==================================================
export default SYSTEMS;