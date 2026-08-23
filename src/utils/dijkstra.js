/**
 * Weighted shortest-path search for Saan Punta.
 *
 * Dijkstra over the cached routing graph becomes the primary routing
 * primitive, replacing bounded-DFS enumeration:
 *   - non-negative edge costs are guaranteed by the calculateEdgeCost policy,
 *   - predecessor tracking reconstructs the winning path exactly once,
 *   - cost ties are broken by fewer legs (mirrors the legacy sort order),
 *   - unreachable targets resolve to null instead of throwing,
 *   - legs and graph structures are never mutated during search.
 */
import { calculateEdgeCost, getEdgeTransition } from './edge-cost';
import { buildRoutingGraph } from './routing-graph';
import { processPath } from './graph';
import { resolveProfile } from './profiles';

/** @typedef {{nodeId: string, serviceKey: import('./types.js').ServiceKey|null}} SearchState */
/** @typedef {{nodeId: string, cost: number, hops: number, state?: SearchState}} HeapEntry */

class MinHeap {
  constructor() {
    /** @type {HeapEntry[]} */
    this.items = [];
  }

  /** @param {HeapEntry} entry */
  push(entry) {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[i], items[parent]) >= 0) {
        break;
      }
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  /** @returns {HeapEntry|undefined} */
  pop() {
    const items = this.items;
    if (items.length === 0) {
      return undefined;
    }
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && this.compare(items[left], items[smallest]) < 0) {
          smallest = left;
        }
        if (right < items.length && this.compare(items[right], items[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }

  /**
   * @param {HeapEntry} a
   * @param {HeapEntry} b
   * @returns {number}
   */
  compare(a, b) {
    if (a.cost !== b.cost) {
      return a.cost - b.cost;
    }
    return a.hops - b.hops;
  }
}

/**
 * Runs Dijkstra from startNodeId to endNodeId over a prebuilt routing graph.
 *
 * @param {Map<string, import('./types.js').RoutingEdge[]>} graph Adjacency from buildRoutingGraph.
 * @param {string} startNodeId
 * @param {string} endNodeId
 * @param {import('./types.js').RoutingOptions} [options] Fare preferences + discount flag.
 * @param {{poppedNodes: number, relaxedEdges: number}} [stats] Caller-owned counters for observability.
 * @param {import('./types.js').ServiceKey|null} [initialServiceKey] Last service before a spur search.
 * @returns {{edges: import('./types.js').RoutingEdge[], totalCost: number}|null}
 *   Ordered edges origin→destination, or null when unreachable/invalid input.
 */
export function dijkstraSearch(
  graph,
  startNodeId,
  endNodeId,
  options = {},
  stats = undefined,
  initialServiceKey = null
) {
  const profile = resolveProfile(options.profileId);
  if (!startNodeId || !endNodeId || startNodeId === endNodeId) {
    return null;
  }
  if (!graph.has(startNodeId) || !graph.has(endNodeId)) {
    return null;
  }

  const { transferPenalty } = profile.weights;
  if (transferPenalty > 0) {
    /** @type {Map<string, Map<import('./types.js').ServiceKey|null, SearchState>>} */
    const statesByNode = new Map();
    /** @type {(nodeId: string, serviceKey: import('./types.js').ServiceKey|null) => SearchState} */
    const getState = (nodeId, serviceKey) => {
      let statesByService = statesByNode.get(nodeId);
      if (statesByService === undefined) {
        statesByService = new Map();
        statesByNode.set(nodeId, statesByService);
      }
      let state = statesByService.get(serviceKey);
      if (state === undefined) {
        state = { nodeId, serviceKey };
        statesByService.set(serviceKey, state);
      }
      return state;
    };

    /** @type {Map<SearchState, number>} */
    const bestStateCost = new Map();
    /** @type {Map<SearchState, number>} */
    const bestStateHops = new Map();
    /** @type {Map<SearchState, {state: SearchState, edge: import('./types.js').RoutingEdge}>} */
    const previousState = new Map();
    const stateHeap = new MinHeap();
    const startState = getState(startNodeId, initialServiceKey);
    bestStateCost.set(startState, 0);
    bestStateHops.set(startState, 0);
    stateHeap.push({ nodeId: startNodeId, cost: 0, hops: 0, state: startState });

    /** @type {SearchState|null} */
    let destinationState = null;
    while (stateHeap.size > 0) {
      const current = /** @type {HeapEntry} */ (stateHeap.pop());
      const currentState = /** @type {SearchState} */ (current.state);
      if (stats) {
        stats.poppedNodes += 1;
      }
      if (
        current.cost > (bestStateCost.get(currentState) ?? Infinity) ||
        current.hops > (bestStateHops.get(currentState) ?? Infinity)
      ) {
        continue;
      }
      if (currentState.nodeId === endNodeId) {
        destinationState = currentState;
        break;
      }

      const outgoing = graph.get(currentState.nodeId) ?? [];
      for (const edge of outgoing) {
        if (stats) {
          stats.relaxedEdges += 1;
        }
        const transition = getEdgeTransition(edge, currentState.serviceKey, transferPenalty);
        const nextState = getState(edge.to, transition.nextServiceKey);
        const nextCost =
          current.cost + calculateEdgeCost(edge, options, profile) + transition.transitionCost;
        const nextHops = current.hops + 1;
        const knownCost = bestStateCost.get(nextState);
        const knownHops = bestStateHops.get(nextState);
        const improves =
          knownCost === undefined ||
          nextCost < knownCost ||
          (nextCost === knownCost && nextHops < (knownHops ?? Infinity));
        if (improves) {
          bestStateCost.set(nextState, nextCost);
          bestStateHops.set(nextState, nextHops);
          previousState.set(nextState, { state: currentState, edge });
          stateHeap.push({ nodeId: edge.to, cost: nextCost, hops: nextHops, state: nextState });
        }
      }
    }

    if (destinationState === null) {
      return null;
    }
    const finalCost = /** @type {number} */ (bestStateCost.get(destinationState));
    /** @type {import('./types.js').RoutingEdge[]} */
    const edges = [];
    let cursorState = destinationState;
    while (cursorState !== startState) {
      const predecessor = previousState.get(cursorState);
      if (predecessor === undefined) {
        return null;
      }
      edges.push(predecessor.edge);
      cursorState = predecessor.state;
    }
    edges.reverse();
    return { edges, totalCost: finalCost };
  }

  /** @type {Map<string, number>} */
  const bestCost = new Map();
  /** @type {Map<string, number>} */
  const bestHops = new Map();
  /** @type {Map<string, import('./types.js').RoutingEdge>} */
  const prevEdge = new Map();
  const heap = new MinHeap();

  bestCost.set(startNodeId, 0);
  bestHops.set(startNodeId, 0);
  heap.push({ nodeId: startNodeId, cost: 0, hops: 0 });

  while (heap.size > 0) {
    const current = /** @type {HeapEntry} */ (heap.pop());
    if (stats) {
      stats.poppedNodes += 1;
    }
    // Lazy deletion: skip entries superseded by a cheaper/equal-cost-fewer-hop discovery.
    if (
      current.cost > (bestCost.get(current.nodeId) ?? Infinity) ||
      current.hops > (bestHops.get(current.nodeId) ?? Infinity)
    ) {
      continue;
    }
    if (current.nodeId === endNodeId) {
      break;
    }

    const outgoing = graph.get(current.nodeId) ?? [];
    for (const edge of outgoing) {
      if (stats) {
        stats.relaxedEdges += 1;
      }
      const stepCost = calculateEdgeCost(edge, options, profile);
      const nextCost = current.cost + stepCost;
      const nextHops = current.hops + 1;
      const knownCost = bestCost.get(edge.to);
      const knownHops = bestHops.get(edge.to);
      const improves =
        knownCost === undefined ||
        nextCost < knownCost ||
        (nextCost === knownCost && nextHops < (knownHops ?? Infinity));
      if (improves) {
        bestCost.set(edge.to, nextCost);
        bestHops.set(edge.to, nextHops);
        prevEdge.set(edge.to, edge);
        heap.push({ nodeId: edge.to, cost: nextCost, hops: nextHops });
      }
    }
  }

  const finalCost = bestCost.get(endNodeId);
  if (finalCost === undefined) {
    return null;
  }

  /** @type {import('./types.js').RoutingEdge[]} */
  const edges = [];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const edge = prevEdge.get(cursor);
    if (!edge) {
      return null;
    }
    edges.push(edge);
    cursor = edge.from;
  }
  edges.reverse();

  return { edges, totalCost: finalCost };
}

/**
 * Finds the single cheapest route between two nodes and prices it through the
 * shared aggregation pipeline, guaranteeing fare math and formatting identical
 * to the legacy engine's output shape.
 *
 * @param {import('./types.js').TransitLeg[]} legs Route legs from routes.json.
 * @param {string} startNodeId
 * @param {string} endNodeId
 * @param {import('./types.js').RoutingOptions} [options]
 * @param {{poppedNodes: number, relaxedEdges: number}} [stats]
 * @returns {import('./types.js').RouteResult|null}
 */
export function getCheapestRoute(legs, startNodeId, endNodeId, options = {}, stats = undefined) {
  const result = dijkstraSearch(buildRoutingGraph(legs), startNodeId, endNodeId, options, stats);
  if (!result) {
    return null;
  }
  const path = result.edges.map((edge) => ({
    leg: edge.leg,
    nextNodeId: edge.to,
    isReversed: edge.direction === 'reverse'
  }));
  return processPath(path, options.isDiscounted === true, options);
}
