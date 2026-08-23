/**
 * Routing-graph construction for Saan Punta.
 *
 * Builds a directed adjacency structure once from the legs array so route
 * searches never rebuild the graph per call or per recursion level.
 * The cache is keyed by the legs ARRAY IDENTITY (WeakMap): the imported
 * routes.json object is stable for the app's lifetime, while passing a fresh
 * array (e.g. a filtered subset) transparently triggers a rebuild.
 *
 * Directionality contract: legacy legs are treated as bidirectional; only an
 * explicit `bidirectional === false` produces a single forward edge.
 */

/** @type {WeakMap<import('./types.js').TransitLeg[], Map<string, import('./types.js').RoutingEdge[]>>} */
const graphCache = new WeakMap();

/**
 * Builds (or retrieves from cache) the directed adjacency graph.
 *
 * @param {import('./types.js').TransitLeg[]} legs Route legs from routes.json.
 * @returns {Map<string, import('./types.js').RoutingEdge[]>} Node id → outgoing edges.
 */
export function buildRoutingGraph(legs) {
  const cached = graphCache.get(legs);
  if (cached) {
    return cached;
  }

  /** @type {Map<string, import('./types.js').RoutingEdge[]>} */
  const adjacency = new Map();

  /** @type {(id: string) => import('./types.js').RoutingEdge[]} */
  const ensureBucket = (id) => {
    let bucket = adjacency.get(id);
    if (!bucket) {
      bucket = [];
      adjacency.set(id, bucket);
    }
    return bucket;
  };

  for (const leg of legs) {
    ensureBucket(leg.from);
    ensureBucket(leg.to);

    ensureBucket(leg.from).push({
      leg,
      from: leg.from,
      to: leg.to,
      direction: 'forward',
      mode: leg.mode,
      distance: leg.distance_km
    });

    if (leg.bidirectional !== false) {
      ensureBucket(leg.to).push({
        leg,
        from: leg.to,
        to: leg.from,
        direction: 'reverse',
        mode: leg.mode,
        distance: leg.distance_km
      });
    }
  }

  graphCache.set(legs, adjacency);
  return adjacency;
}
