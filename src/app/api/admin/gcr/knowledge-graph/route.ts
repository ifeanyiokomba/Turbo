// TurboCore GCR — knowledge graph + dependency path endpoint
//
// GET /api/admin/gcr/knowledge-graph
//   Returns all nodes + edges for the capability dependency graph.
//
// GET /api/admin/gcr/knowledge-graph?from=X&to=Y
//   Returns the BFS shortest dependency path between two capabilities.
//
// GET /api/admin/gcr/knowledge-graph?from=X
//   Returns the full prerequisite tree for X (direct deps + dependents).

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (from) {
      const { findDependencyPath, getPrerequisiteTree, getDirectDependencies, getDependents } =
        await import("@/lib/turbocore/gcr");
      if (to) {
        const path = findDependencyPath(from, to);
        return json({ from, to, path });
      }
      const prereqTree = getPrerequisiteTree(from);
      const directDeps = getDirectDependencies(from);
      const dependents = getDependents(from);
      return json({
        from,
        prerequisiteTree: prereqTree,
        directDependencies: directDeps,
        dependents,
      });
    }

    const { getKnowledgeGraph, getPrerequisiteTree, areHardDependenciesSatisfied } =
      await import("@/lib/turbocore/gcr");
    const graph = getKnowledgeGraph();
    const nodes = graph.nodes.map((n) => {
      const check = areHardDependenciesSatisfied(n.id);
      const prereq = getPrerequisiteTree(n.id);
      return {
        ...n,
        hardDependenciesSatisfied: check.satisfied,
        missingDependencies: check.missing,
        hasUnsatisfiedPrerequisites: prereq.hasUnsatisfied,
        prerequisiteCount: prereq.tree.length,
      };
    });
    return json({
      nodes,
      edges: graph.edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: graph.edges.length,
        requiresEdges: graph.edges.filter((e) => e.kind === "REQUIRES").length,
        recommendsEdges: graph.edges.filter((e) => e.kind === "RECOMMENDS").length,
        optionalEdges: graph.edges.filter((e) => e.kind === "OPTIONAL").length,
        nodesWithUnsatisfiedDeps: nodes.filter((n) => !n.hardDependenciesSatisfied).length,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
