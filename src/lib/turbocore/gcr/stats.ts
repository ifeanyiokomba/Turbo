// TurboCore GCR — Registry statistics

import { CAPABILITIES, CAPABILITY_GROUPS, getCapabilitiesByGroup } from "./capability-tree";
import { getKnowledgeGraph } from "./knowledge-graph";
import { getAllCountryProfiles } from "./country-matrix";
import { getProviderMatrix, getMappedProviders } from "./provider-matrix";
import { getFlagStats } from "./flags";
import { getCertificationStats } from "./certification";
import type { GcrStats, GroupStats } from "./types";

export function getGcrStats(): GcrStats {
  const graph = getKnowledgeGraph();
  const flagStats = getFlagStats();
  const certStats = getCertificationStats();
  const countries = getAllCountryProfiles();
  const providers = getMappedProviders();

  const countBy = (status: string) => CAPABILITIES.filter((c) => c.status === status).length;

  return {
    totalGroups: CAPABILITY_GROUPS.length,
    totalCapabilities: CAPABILITIES.length,
    stableCapabilities: countBy("STABLE"),
    betaCapabilities: countBy("BETA"),
    experimentalCapabilities: countBy("EXPERIMENTAL"),
    deprecatedCapabilities: countBy("DEPRECATED"),
    plannedCapabilities: countBy("PLANNED"),
    totalFeatures: CAPABILITIES.reduce((sum, c) => sum + c.features.length, 0),
    totalDependencies: graph.edges.length,
    totalVersions: CAPABILITIES.reduce((sum, c) => sum + c.versions.length, 0),
    totalCertificationTests: CAPABILITIES.reduce((sum, c) => sum + c.certification.length, 0),
    countriesProfiled: countries.length,
    providersMapped: providers.length,
    flagsConfigured: flagStats.total,
    flagsEnabled: flagStats.enabled,
  };
}

export function getGroupStats(): GroupStats[] {
  return CAPABILITY_GROUPS.map((g) => {
    const caps = getCapabilitiesByGroup(g.id);
    return {
      groupId: g.id,
      groupName: g.name,
      totalCapabilities: caps.length,
      stableCapabilities: caps.filter((c) => c.status === "STABLE").length,
      betaCapabilities: caps.filter((c) => c.status === "BETA").length,
      inbound: caps.filter((c) => c.direction === "INBOUND").length,
      outbound: caps.filter((c) => c.direction === "OUTBOUND").length,
      both: caps.filter((c) => c.direction === "BOTH").length,
      totalFeatures: caps.reduce((sum, c) => sum + c.features.length, 0),
      totalDependencies: caps.reduce((sum, c) => sum + c.dependencies.length, 0),
    };
  });
}

export function getProviderMatrixStats() {
  const matrix = getProviderMatrix();
  const byMaturity: Record<string, number> = {};
  for (const e of matrix) {
    byMaturity[e.maturity] = (byMaturity[e.maturity] ?? 0) + 1;
  }
  return {
    totalEntries: matrix.length,
    byMaturity,
    providersMapped: getMappedProviders().length,
  };
}
