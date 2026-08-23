/**
 * Shared routing domain types for Saan Punta.
 *
 * This module exports no runtime values — it exists so every routing utility
 * shares one vocabulary. Reference these from JSDoc tags, e.g.
 * `@param {import('./types.js').TransitLeg} leg`.
 *
 * Types carry the `Transit`/`Routing` prefix to avoid shadowing DOM globals
 * such as `Node` once `checkJs` type checking is active.
 */

/**
 * A named location in the transit network (`routes.json` → `nodes[]`).
 *
 * @typedef {Object} TransitNode
 * @property {string} id Unique node identifier referenced by legs.
 * @property {string} name Display name used by search and map popups.
 * @property {number} lat Latitude in decimal degrees, [-90, 90].
 * @property {number} lng Longitude in decimal degrees, [-180, 180].
 */

/**
 * Supported transport modes.
 *
 * @typedef {'jeepney'|'tricycle'|'taxi'|'moto_taxi'|'train'|'walk'|'bus'} TransportMode
 */

/**
 * Known fare pricing bases. `null` fare_type on a leg means free passage.
 *
 * @typedef {'traditional'|'modern'|'tricycle'|'taxi'|'estimate'|'ordinary'|'aircon'} FareType
 */

/**
 * User-selectable routing profile identifiers.
 *
 * @typedef {'recommended'|'pinakamura'|'pinakamabilis'|'kaunting-sakay'|'kaunting-lakad'} RoutingProfileId
 */

/**
 * Identity of the last boarded non-walk service (`mode:route_name`).
 *
 * @typedef {string} ServiceKey
 */

/**
 * A connection between two nodes (`routes.json` → `legs[]`).
 *
 * Directionality contract: legacy legs omit `bidirectional` and are treated
 * as two-way. Only an explicit `"bidirectional": false` marks a leg as usable
 * exclusively along its declared from→to direction.
 *
 * @typedef {Object} TransitLeg
 * @property {string} id Unique leg identifier.
 * @property {string} from Origin node id.
 * @property {string} to Destination node id.
 * @property {TransportMode} mode Transport mode used for fare lookup and icons.
 * @property {string|null} [route_name] Jeepney line or train line name; null for taxi/moto/walk.
 * @property {number} distance_km Strictly positive distance in kilometers.
 * @property {FareType|null} [fare_type] Pricing basis; null means the leg is free.
 * @property {string} [notes] Commuter guidance rendered in route cards.
 * @property {number} [flat_fare] Tricycle-only negotiated flat fare.
 * @property {boolean} [bidirectional] Defaults to true for legacy data.
 */

/**
 * User-adjustable preferences threaded through fare calculation and routing.
 *
 * @typedef {Object} RoutingOptions
 * @property {'shared'|'special'} [tricycleMode] Tricycle pricing variant.
 * @property {'aircon'|'ordinary'} [busPreference] Bus class preference.
 * @property {'svc'|'sjt'} [trainPreference] Train ticket type.
 * @property {boolean} [isDiscounted] 20% concessionary discount eligibility.
 * @property {RoutingProfileId} [profileId] Routing profile id (see utils/profiles.js); omitted = pure-fare legacy ranking.
 */

/**
 * Priced result for a single leg.
 *
 * @typedef {Object} FareResult
 * @property {number} fare Canonical value used for sorting (minimum when ranged).
 * @property {number} [minFare] Lower bound; present only when isRange is true.
 * @property {number} [maxFare] Upper bound; present only when isRange is true.
 * @property {boolean} isRange Whether the fare is an estimate range.
 * @property {string} text Human-readable peso string shown in the UI.
 * @property {string} [note] Caveat text (e.g. surge pricing warning).
 */

/**
 * One directed traversal unit inside the routing graph.
 *
 * @typedef {Object} RoutingEdge
 * @property {TransitLeg} leg Backing leg data (never mutated during search).
 * @property {string} from Node the traveler departs from.
 * @property {string} to Node the traveler arrives at.
 * @property {'forward'|'reverse'} direction Traversal vs declared leg direction.
 * @property {TransportMode} mode Convenience copy of leg.mode.
 * @property {number} distance Convenience copy of leg.distance_km.
 */

/**
 * Adjacency representation consumed by the routing engine.
 *
 * @typedef {Object} RoutingGraph
 * @property {Map<string, RoutingEdge[]>} adjacency Node id → outgoing edges.
 */

/**
 * Step emitted by the CURRENT bounded-DFS pathfinder (legacy shape kept until
 * the Dijkstra engine lands in its place).
 *
 * @typedef {Object} LegacyPathStep
 * @property {TransitLeg} leg
 * @property {string} nextNodeId
 * @property {boolean} isReversed
 */

/**
 * Per-leg display/pricing breakdown inside a processed route (legacy shape
 * consumed by RouteList.jsx).
 *
 * @typedef {Object} RouteLegBreakdown
 * @property {TransitLeg} leg
 * @property {string} fromNode Resolved departure node id (accounts for reversal).
 * @property {string} toNode Resolved arrival node id.
 * @property {boolean} isReversed
 * @property {FareResult} fareDetails
 * @property {number} distance Copy of leg.distance_km.
 */

/**
 * Fully priced route ready for sorting and rendering.
 *
 * @typedef {Object} RouteResult
 * @property {RouteLegBreakdown[]} legs Ordered steps from origin to destination.
 * @property {number} totalDistance Rounded total kilometers.
 * @property {number} minTotalFare Cheapest plausible total (sum of leg minima).
 * @property {number} maxTotalFare Most expensive plausible total.
 * @property {boolean} isRange Whether min/max totals differ.
 * @property {string} fareText Formatted fare or fare-range string.
 * @property {number} legCount Number of legs (transfers = legCount - 1).
 */

/**
 * Weight configuration driving edge-cost composition and transfer handling.
 * All values are non-negative pesos or peso-equivalents.
 *
 * @typedef {Object} ProfileWeights
 * @property {number} fareWeight Multiplier on the canonical leg fare.
 * @property {number} timeValuePerMinute Peso-equivalent per minute of ride/walk time.
 * @property {number} walkPenaltyPerKm Extra peso cost per kilometer walked.
 * @property {number} transferPenalty Peso cost charged when boarding a different transit line.
 */

/**
 * A named, user-selectable routing strategy.
 *
 * @typedef {Object} RoutingProfile
 * @property {RoutingProfileId|'legacy-pure-fare'} id Stable profile identifier.
 * @property {string} label Tagalog-facing display name shown in the UI.
 * @property {ProfileWeights} weights
 */

export {};
