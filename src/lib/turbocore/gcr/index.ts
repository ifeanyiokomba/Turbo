// TurboCore GCR — Barrel export
//
// The Global Capability Registry is the single source of truth for "what
// TurboCore knows". Import everything from here:
//
//   import { resolveCapability, getCapability, CAPABILITIES } from "@/lib/turbocore/gcr";

export * from "./types";
export {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  getCapability,
  getCapabilitiesByGroup,
  getGroup,
} from "./capability-tree";
export {
  getKnowledgeGraph,
  getDirectDependencies,
  getDependents,
  areHardDependenciesSatisfied,
  findDependencyPath,
  getPrerequisiteTree,
  getUnlockedByEnabling,
} from "./knowledge-graph";
export {
  getCountryProfile,
  getAllCountryProfiles,
  getCountryCapabilitySupport,
  listSupportedCountries,
} from "./country-matrix";
export {
  getProviderMatrix,
  getProviderCapabilities,
  getCapabilityProviders,
  getProvidersForCapabilityInCountry,
  getMappedProviders,
} from "./provider-matrix";
export { resolveCapability, explainResolution, resolveAllForCountry } from "./resolution-engine";
export {
  listFlags,
  getFlag,
  setFlag,
  deleteFlag,
  evaluateCapabilityFlags,
  getFlagStats,
  invalidateFlagStore,
} from "./flags";
export {
  listCertifications,
  getCertification,
  getCapabilityTests,
  runCapabilityCertification,
  getCertificationStats,
  getCertificationMatrix,
} from "./certification";
export { getGcrStats, getGroupStats, getProviderMatrixStats } from "./stats";
