// TurboCore GCR — Capability Knowledge Graph
//
// Models relationships between capabilities so TurboCore can:
//   - automatically determine prerequisites for new products
//   - explain *why* a routing decision or feature is unavailable
//   - validate that all hard dependencies are satisfied before enabling
//
// Example:
//   Cross-border Payout
//     ↓ REQUIRES
//   FX Quote
//     ↓ REQUIRES
//   Destination Compliance
//     ↓ REQUIRES
//   Identity Verification
//
// The graph is built from the `dependencies` field on every Capability. Edges
// are read-only at runtime — the catalogue is the single source of truth.

import { CAPABILITIES, getCapability } from "./capability-tree";
import type {
  Capability,
  CapabilityDependency,
  DependencyPath,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "./types";

// ---------------------------------------------------------------------------
// Build the graph once (module singleton)
// ---------------------------------------------------------------------------

let graphCache: KnowledgeGraph | null = null;

export function getKnowledgeGraph(): KnowledgeGraph {
  if (graphCache) return graphCache;

  const nodes: KnowledgeGraphNode[] = CAPABILITIES.map((c) => ({
    id: c.id,
    label: c.name,
    group: c.groupId,
    status: c.status,
    direction: c.direction,
  }));

  const edges: KnowledgeGraphEdge[] = [];
  for (const cap of CAPABILITIES) {
    for (const dep of cap.dependencies) {
      // Skip dangling edges (dependency points at a non-existent capability)
      if (!getCapability(dep.capabilityId)) continue;
      edges.push({
        from: cap.id,
        to: dep.capabilityId,
        kind: dep.kind,
        reason: dep.reason,
      });
    }
  }

  graphCache = { nodes, edges };
  return graphCache;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Returns the direct dependencies declared by a capability. */
export function getDirectDependencies(capabilityId: string): CapabilityDependency[] {
  const cap = getCapability(capabilityId);
  return cap?.dependencies ?? [];
}

/** Returns the capabilities that directly depend on the given capability (reverse edges). */
export function getDependents(
  capabilityId: string
): Array<{ from: string; kind: CapabilityDependency["kind"] }> {
  const graph = getKnowledgeGraph();
  return graph.edges
    .filter((e) => e.to === capabilityId)
    .map((e) => ({ from: e.from, kind: e.kind }));
}

/** Whether all REQUIRES dependencies of a capability are STABLE. */
export function areHardDependenciesSatisfied(capabilityId: string): {
  satisfied: boolean;
  missing: string[];
} {
  const deps = getDirectDependencies(capabilityId).filter((d) => d.kind === "REQUIRES");
  const missing: string[] = [];
  for (const dep of deps) {
    const depCap = getCapability(dep.capabilityId);
    if (!depCap) {
      missing.push(dep.capabilityId);
      continue;
    }
    if (depCap.status === "PLANNED" || depCap.status === "DEPRECATED") {
      missing.push(depCap.id);
    }
  }
  return { satisfied: missing.length === 0, missing };
}

/**
 * BFS shortest path between two capabilities along REQUIRES edges.
 * Returns null if there is no path.
 */
export function findDependencyPath(from: string, to: string): DependencyPath | null {
  if (from === to) {
    return {
      from,
      to,
      path: [from],
      edges: [],
      satisfied: true,
      explanation: `${from} is the target capability.`,
    };
  }

  const queue: Array<{ id: string; path: string[]; edges: DependencyPath["edges"] }> = [
    { id: from, path: [from], edges: [] },
  ];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = getDirectDependencies(current.id);
    for (const dep of deps) {
      if (visited.has(dep.capabilityId)) continue;
      visited.add(dep.capabilityId);
      const nextPath = [...current.path, dep.capabilityId];
      const nextEdges: DependencyPath["edges"] = [
        ...current.edges,
        { from: current.id, to: dep.capabilityId, kind: dep.kind },
      ];
      if (dep.capabilityId === to) {
        // Walk the path checking hard deps
        let satisfied = true;
        const missing: string[] = [];
        for (const step of nextPath) {
          const check = areHardDependenciesSatisfied(step);
          if (!check.satisfied) {
            satisfied = false;
            missing.push(...check.missing);
          }
        }
        return {
          from,
          to,
          path: nextPath,
          edges: nextEdges,
          satisfied,
          explanation: satisfied
            ? `Path ${nextPath.join(" → ")} — all hard dependencies satisfied.`
            : `Path ${nextPath.join(" → ")} — blocked because: ${missing.join(", ")} not satisfied.`,
        };
      }
      queue.push({ id: dep.capabilityId, path: nextPath, edges: nextEdges });
    }
  }
  return null;
}

/**
 * Returns the full prerequisite tree (transitive closure of REQUIRES edges).
 * Useful for explaining "why is X unavailable?".
 */
export function getPrerequisiteTree(capabilityId: string): {
  tree: Array<{ capabilityId: string; depth: number; kind: CapabilityDependency["kind"] }>;
  hasUnsatisfied: boolean;
} {
  const tree: Array<{ capabilityId: string; depth: number; kind: CapabilityDependency["kind"] }> =
    [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number; kind: CapabilityDependency["kind"] }> = [
    { id: capabilityId, depth: 0, kind: "REQUIRES" },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.depth > 0) {
      tree.push({ capabilityId: current.id, depth: current.depth, kind: current.kind });
    }
    const deps = getDirectDependencies(current.id);
    for (const dep of deps) {
      queue.push({ id: dep.capabilityId, depth: current.depth + 1, kind: dep.kind });
    }
  }

  let hasUnsatisfied = false;
  for (const node of tree) {
    const check = areHardDependenciesSatisfied(node.capabilityId);
    if (!check.satisfied) {
      hasUnsatisfied = true;
      break;
    }
  }

  return { tree, hasUnsatisfied };
}

/** Returns capabilities that would be unlocked if the given capability became STABLE. */
export function getUnlockedByEnabling(capabilityId: string): string[] {
  const dependents = getDependents(capabilityId);
  return dependents
    .filter((d) => d.kind === "REQUIRES")
    .map((d) => d.from)
    .filter((id) => {
      const check = areHardDependenciesSatisfied(id);
      // After enabling `capabilityId`, would this dependent be satisfied?
      return check.missing.length === 1 && check.missing[0] === capabilityId;
    });
}

/** Convenience: returns the Capability object for a graph node. */
export function nodeToCapability(node: KnowledgeGraphNode): Capability | undefined {
  return getCapability(node.id);
}
