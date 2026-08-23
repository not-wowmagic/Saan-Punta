/**
 * Edge-cost policy for Saan Punta routing.
 *
 * Routing policy lives HERE, deliberately separate from graph traversal:
 * the Dijkstra engine (Phase 3) must stay ignorant of WHY an edge costs what
 * it costs, so future profiles (fare / time / walking penalty / transfer
 * penalty) can change weights without touching search logic.
 *
 * With no profile selected the composition reduces EXACTLY to the legacy
 * bounded-DFS ranking basis:
 *   - cost = the leg's canonical fare (MINIMUM for ranged fares),
 *   - discount flag flows through,
 *   - walking legs cost 0.
 *
 * Named profiles (see ./profiles.js) layer time/walk terms on top. This module
 * also owns the path-level service transition policy used by Dijkstra.
 */
import { calculateLegFare } from './fares';
import { MODE_SPEED_KMH, resolveProfile } from './profiles';

/**
 * Computes the traversal weight of one directed edge under the active profile.
 *
 * @param {import('./types.js').RoutingEdge} edge Directed edge from buildRoutingGraph.
 * @param {import('./types.js').RoutingOptions} [options] Fare preferences, discount, profileId.
 * @param {import('./types.js').RoutingProfile} [profile] Already-resolved profile for search loops.
 * @returns {number} Non-negative cost.
 */
export function calculateEdgeCost(edge, options = {}, profile = undefined) {
  const { weights } = profile ?? resolveProfile(options.profileId);
  const fareDetails = calculateLegFare(edge.leg, options.isDiscounted === true, {
    tricycleMode: options.tricycleMode ?? 'shared',
    busPreference: options.busPreference ?? 'aircon',
    trainPreference: options.trainPreference ?? 'svc'
  });

  const speed = MODE_SPEED_KMH[edge.mode] ?? 15;
  const minutes = (edge.distance / speed) * 60;
  const cost =
    weights.fareWeight * Math.max(0, fareDetails.fare) +
    weights.timeValuePerMinute * minutes +
    (edge.mode === 'walk' ? weights.walkPenaltyPerKm * edge.distance : 0);

  return Math.max(0, cost);
}

/**
 * Prices a service transition and carries the last boarded service over walks.
 *
 * @param {import('./types.js').RoutingEdge} edge
 * @param {import('./types.js').ServiceKey|null} [previousServiceKey]
 * @param {number} [transferPenalty]
 * @returns {{transitionCost: number, nextServiceKey: import('./types.js').ServiceKey|null}}
 */
export function getEdgeTransition(edge, previousServiceKey = null, transferPenalty = 0) {
  if (edge.mode === 'walk') {
    return { transitionCost: 0, nextServiceKey: previousServiceKey };
  }

  const nextServiceKey = `${edge.mode}:${edge.leg.route_name ?? edge.mode}`;
  return {
    transitionCost:
      previousServiceKey === null || previousServiceKey === nextServiceKey ? 0 : transferPenalty,
    nextServiceKey
  };
}

/**
 * Scores an ordered edge sequence with the same service-transition policy as Dijkstra.
 *
 * @param {import('./types.js').RoutingEdge[]} edges
 * @param {import('./types.js').RoutingOptions} [options]
 * @param {import('./types.js').ServiceKey|null} [initialServiceKey]
 * @returns {{totalCost: number, lastServiceKey: import('./types.js').ServiceKey|null}}
 */
export function scoreEdgeSequence(edges, options = {}, initialServiceKey = null) {
  const profile = resolveProfile(options.profileId);
  let totalCost = 0;
  let lastServiceKey = initialServiceKey;

  for (const edge of edges) {
    const transition = getEdgeTransition(
      edge,
      lastServiceKey,
      profile.weights.transferPenalty
    );
    totalCost += calculateEdgeCost(edge, options, profile) + transition.transitionCost;
    lastServiceKey = transition.nextServiceKey;
  }

  return { totalCost, lastServiceKey };
}
