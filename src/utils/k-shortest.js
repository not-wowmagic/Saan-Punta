/**
 * Bounded k-shortest-route discovery (Yen's algorithm) backed by repeated
 * Dijkstra spur searches over the cached routing graph.
 *
 * Replaces full simple-path enumeration as the production route list source
 * while preserving the observable contract the UI depends on:
 *   - active-profile ordering (legacy fare-first when no profile is selected),
 *   - identical pricing/formatting via processPath,
 *   - empty array for unreachable/invalid inputs,
 *   - no mutation of legs or graph structures.
 *
 * Alternatives are de-duplicated by a commuter-facing similarity signature
 * built from the ordered sequence of transit lines (route_name) and modes,
 * so equivalent parallel legs cannot flood the results with near-identical
 * routes. Two routes sharing the same line/mode journey read identically to
 * a commuter even when their leg ids differ.
 */
import { scoreEdgeSequence } from './edge-cost';
import { buildRoutingGraph } from './routing-graph';
import { processPath } from './graph';
import { dijkstraSearch } from './dijkstra';
import { resolveProfile } from './profiles';

const DEFAULT_MAX_ROUTES = 5;

// Termination bound for Yen exploration rounds: signature-duplicates still
// count as explored paths (they unlock further spurs), so an explicit cap
// guarantees termination on dense duplicate-heavy networks.
const MAX_EXPLORED_PATHS = 25;

/**
 * Stable identity of an edge sequence (leg id + traversal direction).
 *
 * @param {import('./types.js').RoutingEdge[]} edges
 * @returns {string}
 */
function edgeSeqKey(edges) {
  return edges.map((e) => `${e.leg.id}:${e.direction}`).join('>');
}

/**
 * Commuter-facing similarity signature: line/mode journey sequence.
 *
 * @param {import('./types.js').RoutingEdge[]} edges
 * @returns {string}
 */
function signature(edges) {
  return edges
    .map((e) => `${e.direction === 'reverse' ? '<' : ''}${e.leg.route_name ?? e.mode}|${e.mode}`)
    .join('>');
}

/**
 * Clones adjacency buckets (reusing the original edge objects so references
 * stay comparable) while excluding banned nodes and edges entirely.
 *
 * @param {Map<string, import('./types.js').RoutingEdge[]>} graph
 * @param {Set<string>} bannedNodes Node ids removed from the search space.
 * @param {Set<import('./types.js').RoutingEdge>} bannedEdges Edges removed by reference.
 * @returns {Map<string, import('./types.js').RoutingEdge[]>}
 */
function cloneGraphWithout(graph, bannedNodes, bannedEdges) {
  /** @type {Map<string, import('./types.js').RoutingEdge[]>} */
  const clone = new Map();
  for (const [nodeId, bucket] of graph) {
    if (bannedNodes.has(nodeId)) {
      continue;
    }
    clone.set(
      nodeId,
      bucket.filter((edge) => !bannedEdges.has(edge) && !bannedNodes.has(edge.to))
    );
  }
  return clone;
}

/**
 * Finds up to `maxRoutes` meaningfully-different routes between two nodes,
 * ordered by the active profile's score, with legacy fare-first behavior when
 * no profile is selected.
 *
 * @param {import('./types.js').TransitLeg[]} legs Route legs from routes.json.
 * @param {string} startNodeId
 * @param {string} endNodeId
 * @param {boolean} [isDiscounted] Concessionary discount eligibility.
 * @param {import('./types.js').RoutingOptions} [options] Fare preferences.
 * @param {number} [maxRoutes] Upper bound of alternatives returned (default 5).
 * @returns {import('./types.js').RouteResult[]}
 */
export function findRouteAlternatives(
  legs,
  startNodeId,
  endNodeId,
  isDiscounted = false,
  options = {},
  maxRoutes = DEFAULT_MAX_ROUTES
) {
  resolveProfile(options.profileId);
  const limit = Number.isFinite(maxRoutes) ? Math.floor(maxRoutes) : DEFAULT_MAX_ROUTES;
  if (!startNodeId || !endNodeId || startNodeId === endNodeId || limit < 1) {
    return [];
  }

  const baseGraph = buildRoutingGraph(legs);
  /** @type {import('./types.js').RoutingOptions} */
  const searchOptions = { ...options, isDiscounted };

  const first = dijkstraSearch(baseGraph, startNodeId, endNodeId, searchOptions);
  if (!first) {
    return [];
  }

  /** @typedef {{edges: import('./types.js').RoutingEdge[], totalCost: number, hops: number}} AcceptedPath */
  // explored drives spur generation (signature duplicates included);
  // results holds only signature-unique paths and is what gets returned.
  /** @type {AcceptedPath[]} */
  const explored = [{ edges: first.edges, totalCost: first.totalCost, hops: first.edges.length }];
  /** @type {AcceptedPath[]} */
  const results = [explored[0]];
  const seenSignatures = new Set([signature(first.edges)]);
  const seenCandidates = new Set([edgeSeqKey(first.edges)]);

  /**
   * Yen candidate pool. `seq` preserves generation order under equal keys.
   *
   * @typedef {{edges: import('./types.js').RoutingEdge[], totalCost: number, hops: number, seq: number}} Candidate
   * @type {Candidate[]}
   */
  let candidates = [];
  let seqCounter = 0;

  while (results.length < limit && explored.length < MAX_EXPLORED_PATHS) {
    const basePath = explored[explored.length - 1].edges;

    for (let j = 0; j < basePath.length; j++) {
      const spurNode = basePath[j].from;
      const rootEdges = basePath.slice(0, j);
      const rootKey = edgeSeqKey(rootEdges);

      const bannedEdges = new Set([basePath[j]]);
      /** @type {Set<string>} */
      const bannedNodes = new Set(rootEdges.map((e) => e.from));

      // Deviations: ban the spur-edge of every explored route sharing this root.
      for (const prior of explored) {
        const p = prior.edges;
        if (p.length > j && edgeSeqKey(p.slice(0, j)) === rootKey && p[j] !== basePath[j]) {
          bannedEdges.add(p[j]);
        }
      }

      const spurGraph = cloneGraphWithout(baseGraph, bannedNodes, bannedEdges);
      const rootScore = scoreEdgeSequence(rootEdges, searchOptions);
      const spur = dijkstraSearch(
        spurGraph,
        spurNode,
        endNodeId,
        searchOptions,
        undefined,
        rootScore.lastServiceKey
      );
      if (!spur) {
        continue;
      }

      const candEdges = [...rootEdges, ...spur.edges];
      const candKey = edgeSeqKey(candEdges);
      if (seenCandidates.has(candKey)) {
        continue;
      }
      seenCandidates.add(candKey);
      candidates.push({
        edges: candEdges,
        totalCost: rootScore.totalCost + spur.totalCost,
        hops: candEdges.length,
        seq: seqCounter++
      });
    }

    candidates.sort(
      (a, b) => a.totalCost - b.totalCost || a.hops - b.hops || a.seq - b.seq
    );

    if (candidates.length === 0) {
      break;
    }

    const best = /** @type {Candidate} */ (candidates.shift());
    explored.push({ edges: best.edges, totalCost: best.totalCost, hops: best.hops });

    const sig = signature(best.edges);
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      results.push({ edges: best.edges, totalCost: best.totalCost, hops: best.hops });
    }
  }

  return results.map((path) => {
    const steps = path.edges.map((edge) => ({
      leg: edge.leg,
      nextNodeId: edge.to,
      isReversed: edge.direction === 'reverse'
    }));
    return processPath(steps, isDiscounted, options);
  });
}
