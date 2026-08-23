import { describe, it, expect } from 'vitest';
import { getCheapestRoute, dijkstraSearch } from '../dijkstra';
import { buildRoutingGraph } from '../routing-graph';
import { getSortedRoutes } from '../graph';
import routesData from '../../data/routes.json';
import { makeGrid } from '../../../benchmarks/grid-fixture.js';

function mkLeg(id, from, to, extra = {}) {
  return {
    id,
    from,
    to,
    mode: 'jeepney',
    route_name: `Line ${id}`,
    distance_km: 3,
    fare_type: 'traditional',
    ...extra
  };
}

describe('getCheapestRoute', () => {
  it('finds the direct cheapest route', () => {
    const legs = [mkLeg('l1', 'A', 'B', { distance_km: 4 })];
    const r = getCheapestRoute(legs, 'A', 'B');
    expect(r).not.toBeNull();
    expect(r.legCount).toBe(1);
    expect(r.minTotalFare).toBe(14);
    expect(r.fareText).toBe('₱14.00');
  });

  it('prefers a cheaper transfer route over an expensive direct route', () => {
    const legs = [
      mkLeg('direct', 'A', 'C', { distance_km: 12 }), // 14 + 8*2 = ₱30
      mkLeg('h1', 'A', 'X', { distance_km: 1 }), // ₱14
      mkLeg('h2', 'X', 'C', { distance_km: 1 }) // ₱14 → ₱28 total
    ];
    const r = getCheapestRoute(legs, 'A', 'C');
    expect(r.legs.map((s) => s.leg.id)).toEqual(['h1', 'h2']);
    expect(r.minTotalFare).toBe(28);
  });

  it('wins against parallel jeep/bus/train edges by price', () => {
    const legs = [
      mkLeg('bus-edge', 'A', 'B', { mode: 'bus', fare_type: 'aircon', distance_km: 4 }),
      mkLeg('train-edge', 'A', 'B', { mode: 'train', fare_type: 'estimate', distance_km: 4 }),
      mkLeg('jeep-edge', 'A', 'B', { distance_km: 4 })
    ];
    // Jeep ₱14 vs bus ₱18 vs train SVC ₱22 (16.25+5.88 → 22).
    const r = getCheapestRoute(legs, 'A', 'B');
    expect(r.legs[0].leg.id).toBe('jeep-edge');
  });

  it('terminates on cyclic graphs', () => {
    const legs = [
      mkLeg('ab', 'A', 'B'),
      mkLeg('bc', 'B', 'C'),
      mkLeg('ca', 'C', 'A')
    ];
    // Reversed 'ca' leg reaches C directly for ₱14, beating A→B→C at ₱28.
    const r = getCheapestRoute(legs, 'A', 'C');
    expect(r).not.toBeNull();
    expect(r.legs.map((s) => s.leg.id)).toEqual(['ca']);
  });

  it('returns null on disconnected graphs', () => {
    const legs = [mkLeg('l1', 'A', 'B'), mkLeg('l2', 'X', 'Y')];
    expect(getCheapestRoute(legs, 'A', 'Y')).toBeNull();
  });

  it('returns null for missing nodes or same origin/destination', () => {
    const legs = [mkLeg('l1', 'A', 'B')];
    expect(getCheapestRoute(legs, 'A', '')).toBeNull();
    expect(getCheapestRoute(legs, '', 'B')).toBeNull();
    expect(getCheapestRoute(legs, 'A', 'NOWHERE')).toBeNull();
    expect(getCheapestRoute(legs, 'NOWHERE', 'A')).toBeNull();
    expect(getCheapestRoute(legs, 'A', 'A')).toBeNull();
  });

  it('respects one-way edges while keeping legacy legs two-way', () => {
    const oneWayOnly = [mkLeg('ow', 'X', 'Y', { bidirectional: false })];
    expect(getCheapestRoute(oneWayOnly, 'X', 'Y')).not.toBeNull();
    expect(getCheapestRoute(oneWayOnly, 'Y', 'X')).toBeNull();

    const legacyTwoWay = [mkLeg('tw', 'P', 'Q')];
    expect(getCheapestRoute(legacyTwoWay, 'Q', 'P')).not.toBeNull();
    expect(getCheapestRoute(legacyTwoWay, 'Q', 'P').legs[0].leg.id).toBe('tw');
  });

  it('breaks equal-cost shape ties with fewer hops (walking chain)', () => {
    const legs = [
      mkLeg('walk-direct', 'A', 'C', { mode: 'walk', fare_type: null, distance_km: 2 }),
      mkLeg('walk-a', 'A', 'X', { mode: 'walk', fare_type: null, distance_km: 1 }),
      mkLeg('walk-b', 'X', 'C', { mode: 'walk', fare_type: null, distance_km: 1 })
    ];
    // Both shapes cost ₱0; direct has fewer hops.
    const r = getCheapestRoute(legs, 'A', 'C');
    expect(r.legs.map((s) => s.leg.id)).toEqual(['walk-direct']);
  });

  it('selects deterministically among equal-cost parallel legs', () => {
    const legs = [mkLeg('p1', 'A', 'B'), mkLeg('p2', 'A', 'B')];
    const r = getCheapestRoute(legs, 'A', 'B');
    expect(r.legs[0].leg.id).toBe('p1');
  });

  it('applies concessionary discount to eligible modes only', () => {
    const jeepPair = [
      mkLeg('j', 'A', 'M', { distance_km: 4 }),
      mkLeg('m', 'M', 'B', { distance_km: 4 })
    ];
    const full = getCheapestRoute(jeepPair, 'A', 'B');
    const discounted = getCheapestRoute(jeepPair, 'A', 'B', { isDiscounted: true });
    expect(discounted.minTotalFare).toBeCloseTo(full.minTotalFare * 0.8, 2);

    const taxiOnly = [mkLeg('t', 'A', 'B', { mode: 'taxi', fare_type: 'taxi', distance_km: 3 })];
    const taxiFull = getCheapestRoute(taxiOnly, 'A', 'B');
    const taxiDiscounted = getCheapestRoute(taxiOnly, 'A', 'B', { isDiscounted: true });
    expect(taxiDiscounted.minTotalFare).toBe(taxiFull.minTotalFare);
  });

  it('changes the winning route when transport preferences change', () => {
    const legs = [
      mkLeg('bus-leg', 'A', 'B', { mode: 'bus', fare_type: 'aircon', distance_km: 10 }),
      mkLeg('hop-1', 'A', 'X', { distance_km: 4 }),
      mkLeg('hop-2', 'X', 'B', { distance_km: 4 })
    ];
    // Aircon bus ₱32.90 loses to jeeps ₱28; ordinary bus ₱27.45 wins.
    const aircon = getCheapestRoute(legs, 'A', 'B', { busPreference: 'aircon' });
    const ordinary = getCheapestRoute(legs, 'A', 'B', { busPreference: 'ordinary' });
    expect(aircon.legs.map((s) => s.leg.id)).toEqual(['hop-1', 'hop-2']);
    expect(ordinary.legs.map((s) => s.leg.id)).toEqual(['bus-leg']);
  });

  it('never mutates input legs during search', () => {
    const legs = [
      mkLeg('l1', 'A', 'B'),
      mkLeg('l2', 'B', 'C')
    ];
    const snapshot = JSON.stringify(legs);
    getCheapestRoute(legs, 'A', 'C', { isDiscounted: true, tricycleMode: 'special' });
    expect(JSON.stringify(legs)).toBe(snapshot);
  });

  it('reports exploration statistics when a collector is provided', () => {
    const legs = [mkLeg('l1', 'A', 'B'), mkLeg('l2', 'B', 'C')];
    const stats = { poppedNodes: 0, relaxedEdges: 0 };
    const r = getCheapestRoute(legs, 'A', 'C', {}, stats);
    expect(r).not.toBeNull();
    // A popped (+1 edge), B popped (+2 edges), C popped → early break.
    expect(stats.poppedNodes).toBe(3);
    expect(stats.relaxedEdges).toBe(3);

    // Unknown destinations bail out before any exploration happens.
    const idleStats = { poppedNodes: 0, relaxedEdges: 0 };
    getCheapestRoute(legs, 'A', 'NOWHERE', {}, idleStats);
    expect(idleStats.poppedNodes).toBe(0);
    expect(idleStats.relaxedEdges).toBe(0);
  });
});

describe('dijkstraSearch edge handling', () => {
  it('rejects an unknown explicit profile before invalid-input early returns', () => {
    const graph = buildRoutingGraph([mkLeg('l1', 'A', 'B')]);
    const invalidInputs = [
      ['', 'B'],
      ['A', ''],
      ['A', 'A'],
      ['A', 'NOWHERE'],
      ['NOWHERE', 'A'],
      ['X', 'Y']
    ];

    for (const [startNodeId, endNodeId] of invalidInputs) {
      expect(() => dijkstraSearch(graph, startNodeId, endNodeId, { profileId: 'typo' })).toThrow(
        RangeError
      );
    }
  });

  it('keeps omitted profiles returning null for invalid inputs', () => {
    const graph = buildRoutingGraph([mkLeg('l1', 'A', 'B')]);
    expect(dijkstraSearch(graph, '', 'B')).toBeNull();
    expect(dijkstraSearch(graph, 'A', 'NOWHERE')).toBeNull();
  });

  it('handles self-loop legs without harm', () => {
    const legs = [
      mkLeg('loop', 'A', 'A'),
      mkLeg('out', 'A', 'B')
    ];
    const result = dijkstraSearch(buildRoutingGraph(legs), 'A', 'B');
    expect(result).not.toBeNull();
    expect(result.edges.map((e) => e.leg.id)).toEqual(['out']);
  });

  it('reconstructs reversed traversal steps correctly', () => {
    const legs = [mkLeg('backwards', 'C', 'B')];
    const result = dijkstraSearch(buildRoutingGraph(legs), 'B', 'C');
    expect(result.edges[0].direction).toBe('reverse');
    expect(result.edges[0].to).toBe('C');
  });
});

describe('dijkstraSearch transfer-aware state', () => {
  it('preserves the service context of an equal-cost arrival after zero-cost walking', () => {
    const legs = [
      mkLeg('target-arrival', 'A', 'X', { route_name: 'Target Line', distance_km: 1 }),
      mkLeg('other-arrival', 'A', 'Z', { route_name: 'Other Line', distance_km: 1 }),
      mkLeg('target-walk', 'X', 'Y', { mode: 'walk', route_name: null, fare_type: null }),
      mkLeg('other-walk', 'Z', 'Y', { mode: 'walk', route_name: null, fare_type: null }),
      mkLeg('destination', 'Y', 'D', { route_name: 'Target Line', distance_km: 1 })
    ];

    const result = dijkstraSearch(buildRoutingGraph(legs), 'A', 'D', {
      profileId: 'recommended'
    });

    expect(result.edges.map((edge) => edge.leg.id)).toEqual([
      'target-arrival',
      'target-walk',
      'destination'
    ]);
  });

  it('keeps a costlier interchange arrival when it avoids a larger later transfer', () => {
    const legs = [
      mkLeg('cheap-arrival', 'A', 'X', { route_name: 'Line A', distance_km: 1 }),
      mkLeg('aligned-arrival', 'A', 'X', { route_name: 'Line B', distance_km: 1.1 }),
      mkLeg('destination', 'X', 'D', { route_name: 'Line B', distance_km: 1 })
    ];

    const result = dijkstraSearch(buildRoutingGraph(legs), 'A', 'D', {
      profileId: 'recommended'
    });

    expect(result.edges.map((edge) => edge.leg.id)).toEqual(['aligned-arrival', 'destination']);
    expect(result.totalCost).toBeCloseTo(32.2, 10);
  });

  it('applies the initial service context at a spur boundary', () => {
    const graph = buildRoutingGraph([
      mkLeg('next', 'X', 'D', { route_name: 'Line B', distance_km: 1 })
    ]);

    const sameService = dijkstraSearch(
      graph,
      'X',
      'D',
      { profileId: 'recommended' },
      undefined,
      'jeepney:Line B'
    );
    const changedService = dijkstraSearch(
      graph,
      'X',
      'D',
      { profileId: 'recommended' },
      undefined,
      'jeepney:Line A'
    );

    expect(sameService.totalCost).toBe(16);
    expect(changedService.totalCost).toBe(22);
  });

  it('retains legacy ties and stats for an explicit zero-transfer profile', () => {
    const graph = buildRoutingGraph([mkLeg('first', 'A', 'B'), mkLeg('second', 'A', 'B')]);
    const legacyStats = { poppedNodes: 0, relaxedEdges: 0 };
    const zeroTransferStats = { poppedNodes: 0, relaxedEdges: 0 };

    const legacy = dijkstraSearch(graph, 'A', 'B', {}, legacyStats);
    const zeroTransfer = dijkstraSearch(
      graph,
      'A',
      'B',
      { profileId: 'pinakamura' },
      zeroTransferStats,
      'jeepney:Unrelated Line'
    );

    expect(zeroTransfer).toEqual(legacy);
    expect(zeroTransferStats).toEqual(legacyStats);
  });
});

describe('parity with the legacy bounded-DFS engine (regression)', () => {
  const legs = routesData.legs;
  const REPRESENTATIVE_PAIRS = [
    ['plv', 'monumento'],
    ['plv', 'sm_north'],
    ['malanday_term', 'recto'],
    ['sm_fairview', 'intramuros']
  ];

  for (const [from, to] of REPRESENTATIVE_PAIRS) {
    it(`matches legacy top route for ${from} → ${to}`, () => {
      const legacyTop = getSortedRoutes(legs, from, to)[0];
      const engine = getCheapestRoute(legs, from, to);

      expect(engine).not.toBeNull();
      expect(engine.legs.map((s) => s.leg.id)).toEqual(legacyTop.legs.map((s) => s.leg.id));
      expect(engine.minTotalFare).toBe(legacyTop.minTotalFare);
      expect(engine.maxTotalFare).toBe(legacyTop.maxTotalFare);
      expect(engine.fareText).toBe(legacyTop.fareText);
    });
  }
});

describe('intentional divergence from the legacy depth cap', () => {
  it('finds optimal paths deeper than 5 legs where legacy returns nothing', () => {
    const chain = [];
    for (let i = 1; i <= 6; i++) {
      chain.push(mkLeg(`e${i}`, `N${i}`, `N${i + 1}`, { distance_km: 1 }));
    }
    expect(getSortedRoutes(chain, 'N1', 'N7')).toEqual([]);
    const r = getCheapestRoute(chain, 'N1', 'N7');
    expect(r).not.toBeNull();
    expect(r.legCount).toBe(6);
  });
});

describe('scale smoke test', () => {
  it('handles a 30x30 grid (900 nodes / ~1740 legs) well under a second-class budget', () => {
    const grid = makeGrid(30, 30);
    const startedAt = performance.now();
    const r = getCheapestRoute(grid, 'n0-0', 'n29-29');
    const elapsedMs = performance.now() - startedAt;
    expect(r).not.toBeNull();
    expect(elapsedMs).toBeLessThan(2000);
  });
});
