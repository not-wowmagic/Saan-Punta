import { describe, it, expect } from 'vitest';
import { findPaths, processPath, getSortedRoutes } from '../graph';

/**
 * Graph/routing regression tests.
 *
 * These document the behavior of the CURRENT bounded-DFS implementation
 * (findPaths + processPath + getSortedRoutes) BEFORE it is replaced by a
 * weighted Dijkstra engine in Phase 3. They act as the safety net: the new
 * engine must reproduce the observable contract documented here (sorted
 * cheapest-first results, bidirectional legs, depth cap, fare aggregation).
 *
 * Fixture convention: every leg is a traditional jeepney so that
 * fare(distance) is deterministic: ₱14 for ≤4km, +₱2/km beyond.
 */

/** Builds a jeepney leg with sane defaults for fixtures. */
function leg(id, from, to, distanceKm = 4, extra = {}) {
  return {
    id,
    from,
    to,
    mode: 'jeepney',
    route_name: `Line ${id}`,
    distance_km: distanceKm,
    fare_type: 'traditional',
    ...extra
  };
}

describe('findPaths', () => {
  const directLegs = [leg('l1', 'A', 'B')];

  it('finds a direct A→B route', () => {
    const paths = findPaths(directLegs, 'A', 'B');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveLength(1);
    expect(paths[0][0].leg.id).toBe('l1');
    expect(paths[0][0].isReversed).toBe(false);
    expect(paths[0][0].nextNodeId).toBe('B');
  });

  it('finds a transfer route A→B→C', () => {
    const legs = [leg('l1', 'A', 'B'), leg('l2', 'B', 'C')];
    const paths = findPaths(legs, 'A', 'C');
    expect(paths).toHaveLength(1);
    expect(paths[0].map((s) => s.leg.id)).toEqual(['l1', 'l2']);
  });

  it('returns [] when origin or destination is missing', () => {
    expect(findPaths(directLegs, '', 'B')).toEqual([]);
    expect(findPaths(directLegs, 'A', '')).toEqual([]);
  });

  it('returns [] when origin equals destination', () => {
    expect(findPaths(directLegs, 'A', 'A')).toEqual([]);
  });

  it('returns [] when no path exists (disconnected nodes)', () => {
    const legs = [leg('l1', 'A', 'B'), leg('l2', 'X', 'Y')];
    expect(findPaths(legs, 'A', 'Y')).toEqual([]);
  });

  it('returns [] when destination node does not exist at all', () => {
    expect(findPaths([], 'A', 'NOWHERE')).toEqual([]);
  });

  it('treats legs as bidirectional (reversed traversal supported)', () => {
    // Legs defined C→B and B→A; searching A→C walks both backwards.
    const legs = [leg('l1', 'C', 'B'), leg('l2', 'B', 'A')];
    const paths = findPaths(legs, 'A', 'C');
    expect(paths).toHaveLength(1);
    expect(paths[0].map((s) => s.leg.id)).toEqual(['l2', 'l1']);
    expect(paths[0][0].isReversed).toBe(true); // l2 defined B→A, walked A→B
    expect(paths[0][1].isReversed).toBe(true); // l1 defined C→B, walked B→C
  });

  it('enumerates multiple distinct simple paths', () => {
    const legs = [
      leg('direct', 'A', 'C'),
      leg('via-b-1', 'A', 'B'),
      leg('via-b-2', 'B', 'C')
    ];
    const paths = findPaths(legs, 'A', 'C');
    const shapes = paths.map((p) => p.map((s) => s.leg.id).join('>')).sort();
    expect(shapes).toEqual(['direct', 'via-b-1>via-b-2']);
  });

  it('allows parallel legs between the same node pair', () => {
    const legs = [
      leg('jeep-a', 'A', 'B'),
      leg('jeep-b', 'A', 'B')
    ];
    const paths = findPaths(legs, 'A', 'B');
    expect(paths).toHaveLength(2);
    expect(new Set(paths.map((p) => p[0].leg.id))).toEqual(new Set(['jeep-a', 'jeep-b']));
  });

  it('never reuses the same leg twice within one path', () => {
    // A single leg A↔B cannot be walked back and forth to reach... anything.
    // With only one A-B leg, path A→B exists but no A→B→A→B nonsense.
    const paths = findPaths(directLegs, 'A', 'B');
    const legIds = paths.flatMap((p) => p.map((s) => s.leg.id));
    expect(new Set(legIds).size).toBe(legIds.length);
  });

  it('does not revisit nodes within a path (simple paths only)', () => {
    // Triangle A-B-C-A: path from A to C must not go A→B→A→C.
    const legs = [
      leg('ab', 'A', 'B'),
      leg('bc', 'B', 'C'),
      leg('ac', 'A', 'C')
    ];
    const paths = findPaths(legs, 'A', 'C');
    const shapes = paths.map((p) => p.map((s) => s.leg.id).sort().join('+')).sort();
    expect(shapes).toEqual(['ab+bc', 'ac']);
  });

  it('enforces the 5-leg depth cap (max 4 transfers)', () => {
    // Chain of exactly 5 edges (6 nodes): reachable at the cap boundary.
    const fiveEdgeChain = [
      leg('e1', 'N1', 'N2'),
      leg('e2', 'N2', 'N3'),
      leg('e3', 'N3', 'N4'),
      leg('e4', 'N4', 'N5'),
      leg('e5', 'N5', 'N6')
    ];
    expect(findPaths(fiveEdgeChain, 'N1', 'N6')).toHaveLength(1);

    // Chain of 6 edges (7 nodes): requires 6 legs > cap → unreachable today.
    const sixEdgeChain = [...fiveEdgeChain, leg('e6', 'N6', 'N7')];
    expect(findPaths(sixEdgeChain, 'N1', 'N7')).toEqual([]);
  });
});

describe('processPath', () => {
  it('aggregates total distance and fare across legs', () => {
    const path = [
      { leg: leg('l1', 'A', 'B', 4), nextNodeId: 'B', isReversed: false },
      { leg: leg('l2', 'B', 'C', 5), nextNodeId: 'C', isReversed: false }
    ];
    const r = processPath(path);
    expect(r.totalDistance).toBe(9);
    // 4km = ₱14 base; 5km = ₱14 + 1×₱2 = ₱16 → total ₱30
    expect(r.minTotalFare).toBe(30);
    expect(r.maxTotalFare).toBe(30);
    expect(r.isRange).toBe(false);
    expect(r.fareText).toBe('₱30.00');
    expect(r.legCount).toBe(2);
    expect(r.legs[0].fromNode).toBe('A');
    expect(r.legs[0].toNode).toBe('B');
  });

  it('marks correct fromNode when a step is reversed', () => {
    // Reversed step over leg C→B: traveler starts at B (leg.to), arrives C.
    const path = [{ leg: leg('l1', 'C', 'B', 4), nextNodeId: 'C', isReversed: true }];
    const r = processPath(path);
    expect(r.legs[0].fromNode).toBe('B'); // processPath uses leg.to when reversed
    expect(r.legs[0].toNode).toBe('C');
  });

  it('produces a range when any leg has ranged pricing (moto_taxi)', () => {
    const motoLeg = leg('m1', 'A', 'B', 3, { mode: 'moto_taxi', fare_type: 'estimate' });
    const path = [{ leg: motoLeg, nextNodeId: 'B', isReversed: false }];
    const r = processPath(path);
    expect(r.isRange).toBe(true);
    expect(r.minTotalFare).toBe(80);
    expect(r.maxTotalFare).toBe(125);
    expect(r.fareText).toBe('₱80 - ₱125');
  });

  it('applies discount flag to eligible legs through fare dispatch', () => {
    const path = [{ leg: leg('l1', 'A', 'B', 4), nextNodeId: 'B', isDiscountedPlaceholder: false, isReversed: false }];
    const r = processPath(path, true);
    expect(r.minTotalFare).toBe(11.2); // discounted jeepney
  });
});

describe('getSortedRoutes', () => {
  const legs = [
    leg('cheap-long', 'A', 'C', 4), // ₱14 direct
    leg('hop-1', 'A', 'B', 4), // ₱14
    leg('hop-2', 'B', 'C', 4) // ₱14
  ];

  it('sorts by minimum fare ascending', () => {
    const routes = getSortedRoutes(legs, 'A', 'C');
    expect(routes).toHaveLength(2);
    expect(routes[0].minTotalFare).toBeLessThanOrEqual(routes[1].minTotalFare);
    expect(routes[0].legCount).toBe(1); // ₱14 direct wins over ₱28 transfer
  });

  it('breaks fare ties by number of legs', () => {
    // Fare math: direct 6km = 14 + 2×2 = ₱18 (1 leg); hops = ₱14+₱14 = ₱28.
    const shaped = [
      leg('long-direct', 'A', 'C', 6),
      leg('short-hop-1', 'A', 'B', 1),
      leg('short-hop-2', 'B', 'C', 1)
    ];
    const sortedShaped = getSortedRoutes(shaped, 'A', 'C');
    expect(sortedShaped[0].legCount).toBe(1);
    expect(sortedShaped[0].minTotalFare).toBe(18);

    // Equal-fare parallel edges tie; insertion order preserved under equal keys.
    const parallelTie = [
      leg('p1', 'A', 'C', 4),
      leg('p2', 'A', 'C', 4)
    ];
    const routes = getSortedRoutes(parallelTie, 'A', 'C');
    expect(routes).toHaveLength(2);
    expect(routes[0].minTotalFare).toBe(routes[1].minTotalFare);
    expect(routes[0].legs[0].leg.id).toBe('p1');
  });

  it('passes options through to fare calculations', () => {
    const busOnly = [
      {
        id: 'bus-1',
        from: 'A',
        to: 'B',
        mode: 'bus',
        route_name: 'Bus Line',
        distance_km: 10,
        fare_type: 'aircon'
      }
    ];
    const aircon = getSortedRoutes(busOnly, 'A', 'B', false, { busPreference: 'aircon' });
    const ordinary = getSortedRoutes(busOnly, 'A', 'B', false, { busPreference: 'ordinary' });
    expect(aircon[0].minTotalFare).toBe(32.9);
    expect(ordinary[0].minTotalFare).toBe(27.45);
  });

  it('returns [] for same origin/destination', () => {
    expect(getSortedRoutes(legs, 'A', 'A')).toEqual([]);
  });

  it('returns [] when disconnected', () => {
    expect(getSortedRoutes(legs, 'A', 'Z')).toEqual([]);
  });
});
