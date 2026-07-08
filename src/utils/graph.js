import { calculateLegFare } from './fares';

/**
 * Finds all simple paths from startNodeId to endNodeId using DFS.
 * Supports bidirectional legs (treating connections as two-way).
 * 
 * @param {Array} legs - Array of leg objects from routes.json
 * @param {string} startNodeId - Start node ID
 * @param {string} endNodeId - Destination node ID
 * @returns {Array} List of paths, where each path is an array of objects: { leg, nextNodeId, isReversed }
 */
export function findPaths(legs, startNodeId, endNodeId) {
  if (!startNodeId || !endNodeId || startNodeId === endNodeId) {
    return [];
  }

  const paths = [];
  const visited = new Set();

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

    for (const leg of legs) {
      let nextNodeId = null;
      let isReversed = false;

      if (leg.from === currentNodeId) {
        nextNodeId = leg.to;
        isReversed = false;
      } else if (leg.to === currentNodeId) {
        nextNodeId = leg.from;
        isReversed = true;
      }

      if (nextNodeId && !visited.has(nextNodeId)) {
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
 * @param {Array} path - Single path from findPaths
 * @param {boolean} isDiscounted - Whether senior/student/PWD discount is active
 * @returns {Object} Calculated path details including costs and structured summary
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
      minTotalFare += fareDetails.minFare;
      maxTotalFare += fareDetails.maxFare;
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
 * @param {Array} legs - Legs array
 * @param {string} startNodeId - Start node
 * @param {string} endNodeId - Destination node
 * @param {boolean} isDiscounted - Discount flag
 * @param {Object} options - Route options (tricycleMode, busPreference, trainPreference)
 * @returns {Array} Sorted list of processed path objects
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
