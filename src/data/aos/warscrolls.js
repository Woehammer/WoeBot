// ==================================================
// LOOKUP: AOS WARSCROLLS (AGGREGATED)
// PURPOSE: Combine per-faction warscroll lists into one export
// ==================================================

import bladesOfKhorne from "./warscrolls/blades_of_khorne.js";
import citiesOfSigmar from "./warscrolls/cities_of_sigmar.js";
import daughtersOfKhaine from "./warscrolls/daughters_of_khaine.js";
import disciplesOfTzeentch from "./warscrolls/disciples_of_tzeentch.js";
import fleshEaterCourts from "./warscrolls/flesh_eater_courts.js";
import fyreslayers from "./warscrolls/fyreslayers.js";
import gloomspiteGitz from "./warscrolls/gloomspite_gitz.js";
import hedonitesOfSlaanesh from "./warscrolls/hedonites_of_slaanesh.js";
import helsmithsOfHashut from "./warscrolls/helsmiths_of_hashut.js";
import idonethDeepkin from "./warscrolls/idoneth_deepkin.js";
import kharadronOverlords from "./warscrolls/kharadron_overlords.js";
import luminethRealmlords from "./warscrolls/lumineth_realmlords.js";
import maggotkinOfNurgle from "./warscrolls/maggotkin_of_nurgle.js";
import nighthaunt from "./warscrolls/nighthaunt.js";
import ogorMawtribes from "./warscrolls/ogor_mawtribes.js";
import kruleboyz from "./warscrolls/kruleboyz.js";
import ironjawz from "./warscrolls/ironjawz.js";
import bigWaaagh from "./warscrolls/big_waaagh.js";
import ossiarchBonereapers from "./warscrolls/ossiarch_bonereapers.js";
import seraphon from "./warscrolls/seraphon.js";
import skaven from "./warscrolls/skaven.js";

// ==================================================
// WARSCROLL DEFINITIONS (MERGED)
// ==================================================

export const WARSCROLLS_AOS = [
  ...bladesOfKhorne,
  ...citiesOfSigmar,
  ...daughtersOfKhaine,
  ...disciplesOfTzeentch,
  ...fleshEaterCourts,
  ...fyreslayers,
  ...gloomspiteGitz,
  ...hedonitesOfSlaanesh,
  ...helsmithsOfHashut,
  ...idonethDeepkin,
  ...kharadronOverlords,
  ...luminethRealmlords,
  ...maggotkinOfNurgle,
  ...nighthaunt,
  ...ogorMawtribes,
  ...kruleboyz,
  ...ironjawz,
  ...bigWaaagh,
  ...ossiarchBonereapers,
  ...seraphon,
  ...skaven,
];

// ==================================================
// EXPORTS
// ==================================================

export default WARSCROLLS_AOS;
