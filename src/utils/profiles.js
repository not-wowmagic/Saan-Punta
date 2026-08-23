/**
 * Named routing profiles for Saan Punta.
 *
 * Each profile is a plain weight configuration consumed by calculateEdgeCost
 * and the Dijkstra engine — routing policy stays data-driven with no
 * hard-coded condition chains in the algorithms themselves.
 *
 * MODE_SPEED_KMH holds rough Metro-Manila city-planning averages used only to
 * convert distance into an ETA weight component. They are tunable policy
 * defaults, NOT surveyed transport data: fares, routes, and schedules in
 * routes.json are untouched by anything in this module.
 */

/** Average speeds (km/h) feeding the ETA term of the edge-cost formula. */
export const MODE_SPEED_KMH = {
  jeepney: 15,
  bus: 18,
  train: 30,
  taxi: 22,
  moto_taxi: 25,
  tricycle: 12,
  walk: 4.5
};

/** @type {Readonly<Record<import('./types.js').RoutingProfileId, import('./types.js').RoutingProfile>>} */
export const ROUTING_PROFILES = {
  recommended: {
    id: 'recommended',
    label: 'Recommended',
    weights: { fareWeight: 1.0, timeValuePerMinute: 0.5, walkPenaltyPerKm: 4, transferPenalty: 6 }
  },
  pinakamura: {
    id: 'pinakamura',
    label: 'Pinakamura',
    weights: { fareWeight: 1.0, timeValuePerMinute: 0, walkPenaltyPerKm: 0, transferPenalty: 0 }
  },
  pinakamabilis: {
    id: 'pinakamabilis',
    label: 'Pinakamabilis',
    weights: { fareWeight: 0.05, timeValuePerMinute: 10, walkPenaltyPerKm: 8, transferPenalty: 2 }
  },
  'kaunting-sakay': {
    id: 'kaunting-sakay',
    label: 'Kaunting Sakay',
    weights: { fareWeight: 0.6, timeValuePerMinute: 0.25, walkPenaltyPerKm: 3, transferPenalty: 30 }
  },
  'kaunting-lakad': {
    id: 'kaunting-lakad',
    label: 'Kaunting Lakad',
    weights: { fareWeight: 0.5, timeValuePerMinute: 0.25, walkPenaltyPerKm: 60, transferPenalty: 3 }
  }
};

/** @type {import('./types.js').RoutingProfileId} */
export const DEFAULT_PROFILE_ID = 'recommended';
export const PROFILE_LIST = Object.values(ROUTING_PROFILES).map(({ id, label }) => ({ id, label }));

/** @type {import('./types.js').RoutingProfile} */
const PURE_FARE_PROFILE = {
  id: 'legacy-pure-fare',
  label: 'Pure Fare',
  weights: { fareWeight: 1.0, timeValuePerMinute: 0, walkPenaltyPerKm: 0, transferPenalty: 0 }
};

/**
 * Resolves a profile id to its configuration. A missing id uses the private
 * pure-fare profile so library callers keep the exact legacy ranking.
 *
 * @param {import('./types.js').RoutingProfileId|undefined} [profileId]
 * @returns {import('./types.js').RoutingProfile}
 * @throws {RangeError} When profileId is not a known routing profile.
 */
export function resolveProfile(profileId) {
  if (profileId === undefined) {
    return PURE_FARE_PROFILE;
  }
  const profile = ROUTING_PROFILES[profileId];
  if (profile === undefined) {
    throw new RangeError(`Unknown routing profile: ${profileId}`);
  }
  return profile;
}
