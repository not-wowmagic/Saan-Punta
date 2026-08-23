import { calculateLegFare } from './fares';

/**
 * Finds all simple paths from startNodeId to endNodeId using DFS.
 * Supports bidirectional legs (treating connections as two-way).
 * 
 * @param {import('./types.js').TransitLeg[]} legs Route legs from routes.json
 * @param {string} startNodeId Start node ID
 * @param {string} endNodeId Destination node ID
 * @returns {import('./types.js').LegacyPathStep[][]} List of simple paths
 */
export function findPaths(legs, startNodeId, endNodeId) {
  if (!startNodeId || !endNodeId || startNodeId === endNodeId) {
    return [];
  }

  // ponytail: Pre-build adjacency list once to achieve O(V + E) lookup rather than O(E * V) scanning
  /** @type {Map<string, import('./types.js').LegacyPathStep[]>} */
  const adj = new Map();
  for (const leg of legs) {
    const forwardBucket = adj.get(leg.from) ?? [];
    forwardBucket.push({ leg, nextNodeId: leg.to, isReversed: false });
    adj.set(leg.from, forwardBucket);
    const reverseBucket = adj.get(leg.to) ?? [];
    reverseBucket.push({ leg, nextNodeId: leg.from, isReversed: true });
    adj.set(leg.to, reverseBucket);
  }

  /** @type {import('./types.js').LegacyPathStep[][]} */
  const paths = [];
  const visited = new Set();

  /**
   * @param {string} currentNodeId
   * @param {import('./types.js').LegacyPathStep[]} currentPath
   */
  function dfs(currentNodeId, currentPath) {
    if (currentNodeId === endNodeId) {
      paths.push([...currentPath]);
      return;
    }

    // Limit exploration depth to 5 legs (max 4 transfers) to avoid lag/freeze
    if (currentPath.length >= 5) {
      return;
    }

    visited.add(currentNodeId);

    const neighbors = adj.get(currentNodeId) || [];
    for (const { leg, nextNodeId, isReversed } of neighbors) {
      if (!visited.has(nextNodeId)) {
        // Prevent using the same leg twice in one path
        if (!currentPath.some(step => step.leg.id === leg.id)) {
          currentPath.push({ leg, nextNodeId, isReversed });
          dfs(nextNodeId, currentPath);
          currentPath.pop();
        }
      }
    }

    visited.delete(currentNodeId);
  }

  dfs(startNodeId, []);
  return paths;
}

/**
 * Aggregates information for a path: total distance, total legs, and fare breakdown.
 * 
 * @param {import('./types.js').LegacyPathStep[]} path Single path from findPaths
 * @param {boolean} [isDiscounted] Whether senior/student/PWD discount is active
 * @param {import('./types.js').RoutingOptions} [options] Fare preferences (tricycleMode, busPreference, trainPreference)
 * @returns {import('./types.js').RouteResult} Calculated path details including costs and structured summary
 */
export function processPath(path, isDiscounted = false, options = {}) {
  let totalDistance = 0;
  let minTotalFare = 0;
  let maxTotalFare = 0;
  const legsBreakdown = [];

  for (const step of path) {
    const { leg, nextNodeId, isReversed } = step;
    totalDistance += leg.distance_km;

    const fareDetails = calculateLegFare(leg, isDiscounted, options);
    
    if (fareDetails.isRange) {
      // FareResult guarantees minFare/maxFare are set whenever isRange is true.
      minTotalFare += /** @type {number} */ (fareDetails.minFare);
      maxTotalFare += /** @type {number} */ (fareDetails.maxFare);
    } else {
      minTotalFare += fareDetails.fare;
      maxTotalFare += fareDetails.fare;
    }

    legsBreakdown.push({
      leg,
      fromNode: isReversed ? leg.to : leg.from,
      toNode: nextNodeId,
      isReversed,
      fareDetails,
      distance: leg.distance_km
    });
  }

  const isRange = minTotalFare !== maxTotalFare;

  return {
    legs: legsBreakdown,
    totalDistance: Math.round(totalDistance * 100) / 100,
    minTotalFare: Math.round(minTotalFare * 100) / 100,
    maxTotalFare: Math.round(maxTotalFare * 100) / 100,
    isRange,
    fareText: isRange 
      ? `₱${Math.round(minTotalFare)} - ₱${Math.round(maxTotalFare)}`
      : `₱${(Math.round(minTotalFare * 100) / 100).toFixed(2)}`,
    legCount: path.length
  };
}

/**
 * Finds and sorts all paths between two nodes.
 * Sorted by:
 * 1. Total minimum fare (lowest first)
 * 2. Number of transfers/legs (fewer first)
 * 
 * @param {import('./types.js').TransitLeg[]} legs Legs array
 * @param {string} startNodeId Start node
 * @param {string} endNodeId Destination node
 * @param {boolean} [isDiscounted] Discount flag
 * @param {import('./types.js').RoutingOptions} [options] Route options (tricycleMode, busPreference, trainPreference)
 * @returns {import('./types.js').RouteResult[]} Sorted list of processed routes
 */
export function getSortedRoutes(legs, startNodeId, endNodeId, isDiscounted = false, options = {}) {
  const rawPaths = findPaths(legs, startNodeId, endNodeId);
  const processedPaths = rawPaths.map(path => processPath(path, isDiscounted, options));

  return processedPaths.sort((a, b) => {
    // Sort by minimum fare first
    if (a.minTotalFare !== b.minTotalFare) {
      return a.minTotalFare - b.minTotalFare;
    }
    // Then sort by number of legs
    return a.legCount - b.legCount;
  });
}
