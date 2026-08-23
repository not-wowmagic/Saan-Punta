import { describe, it, expect } from 'vitest';
import { calculateEdgeCost, getEdgeTransition, scoreEdgeSequence } from '../edge-cost';
import { buildRoutingGraph } from '../routing-graph';

function routingEdgeFor(legOverrides = {}) {
  const leg = {
    id: 'l1',
    from: 'A',
    to: 'B',
    mode: 'jeepney',
    route_name: 'Line l1',
    distance_km: 4,
    fare_type: 'traditional',
    ...legOverrides
  };
  return buildRoutingGraph([leg]).get(leg.from)[0];
}

function edgeFor(legOverrides = {}, opts = {}) {
  return calculateEdgeCost(routingEdgeFor(legOverrides), opts);
}

describe('calculateEdgeCost', () => {
  it('prices a traditional jeepney edge at its base fare', () => {
    expect(edgeFor({ distance_km: 4 })).toBe(14);
  });

  it('adds excess fare beyond the base distance', () => {
    expect(edgeFor({ distance_km: 6 })).toBe(18);
  });

  it('charges walking edges zero', () => {
    expect(edgeFor({ mode: 'walk', fare_type: null })).toBe(0);
  });

  it('composes fare and travel time under the recommended profile', () => {
    expect(edgeFor({ distance_km: 4 }, { profileId: 'recommended' })).toBe(22);
  });

  it('rejects an unknown profile id', () => {
    expect(() => edgeFor({}, { profileId: 'typo' })).toThrow(RangeError);
  });

  it('uses the minimum fare for ranged moto-taxi edges (matches legacy sort basis)', () => {
    expect(edgeFor({ mode: 'moto_taxi', fare_type: 'estimate', distance_km: 3 })).toBe(80);
  });

  it('lowers jeepney cost under the discount flag', () => {
    expect(edgeFor({}, { isDiscounted: true })).toBe(11.2);
  });

  it('responds to bus class preference', () => {
    const overrides = { mode: 'bus', fare_type: 'aircon', distance_km: 10 };
    expect(edgeFor(overrides, { busPreference: 'aircon' })).toBe(32.9);
    expect(edgeFor(overrides, { busPreference: 'ordinary' })).toBe(27.45);
  });

  it('responds to train ticket preference', () => {
    const overrides = { mode: 'train', fare_type: 'estimate', distance_km: 10 };
    expect(edgeFor(overrides, { trainPreference: 'svc' })).toBe(31);
    expect(edgeFor(overrides, { trainPreference: 'sjt' })).toBe(30);
  });

  it('responds to tricycle mode preference', () => {
    const shared = edgeFor(
      { mode: 'tricycle', fare_type: 'tricycle', distance_km: 2 },
      { tricycleMode: 'shared' }
    );
    const special = edgeFor(
      { mode: 'tricycle', fare_type: 'tricycle', distance_km: 2, flat_fare: 50 },
      { tricycleMode: 'special' }
    );
    expect(shared).toBe(12.5);
    expect(special).toBe(50);
  });

  it('is independent of traversal direction', () => {
    const leg = {
      id: 'l1',
      from: 'C',
      to: 'B',
      mode: 'jeepney',
      route_name: 'Line l1',
      distance_km: 6,
      fare_type: 'traditional'
    };
    const g = buildRoutingGraph([leg]);
    expect(calculateEdgeCost(g.get('C')[0])).toBe(calculateEdgeCost(g.get('B')[0]));
  });

  it('never returns negative costs across modes', () => {
    const cases = [
      { mode: 'jeepney', fare_type: 'traditional', distance_km: 12 },
      { mode: 'taxi', fare_type: 'taxi', distance_km: 2 },
      { mode: 'train', fare_type: 'estimate', distance_km: 30 },
      { mode: 'moto_taxi', fare_type: 'estimate', distance_km: 1 },
      { mode: 'walk', fare_type: null, distance_km: 0.5 }
    ];
    for (const c of cases) {
      expect(edgeFor(c)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('getEdgeTransition', () => {
  it('does not charge the first boarding', () => {
    expect(getEdgeTransition(routingEdgeFor(), null, 6)).toEqual({
      transitionCost: 0,
      nextServiceKey: 'jeepney:Line l1'
    });
  });

  it('does not charge continuation on the same service', () => {
    expect(getEdgeTransition(routingEdgeFor(), 'jeepney:Line l1', 6)).toEqual({
      transitionCost: 0,
      nextServiceKey: 'jeepney:Line l1'
    });
  });

  it('charges exactly one penalty when changing non-walk services', () => {
    expect(getEdgeTransition(routingEdgeFor(), 'jeepney:Other Line', 6)).toEqual({
      transitionCost: 6,
      nextServiceKey: 'jeepney:Line l1'
    });
  });

  it('preserves the prior service while walking and charges the next line change', () => {
    const walk = routingEdgeFor({ mode: 'walk', route_name: null, fare_type: null });
    const afterWalk = getEdgeTransition(walk, 'jeepney:First Line', 6);
    const nextRide = getEdgeTransition(routingEdgeFor(), afterWalk.nextServiceKey, 6);

    expect(afterWalk).toEqual({ transitionCost: 0, nextServiceKey: 'jeepney:First Line' });
    expect(nextRide).toEqual({ transitionCost: 6, nextServiceKey: 'jeepney:Line l1' });
  });

  it('uses the same service identity for reverse traversal', () => {
    const leg = routingEdgeFor({ from: 'B', to: 'A' }).leg;
    const reverseEdge = buildRoutingGraph([leg]).get('A')[0];

    expect(getEdgeTransition(reverseEdge, 'jeepney:Line l1', 6)).toEqual({
      transitionCost: 0,
      nextServiceKey: 'jeepney:Line l1'
    });
  });
});

describe('scoreEdgeSequence', () => {
  it('charges each service change once across root, boundary, and spur edges', () => {
    const graph = buildRoutingGraph([
      routingEdgeFor({ id: 'root', from: 'A', to: 'X', route_name: 'Line A', distance_km: 1 }).leg,
      routingEdgeFor({ id: 'boundary', from: 'X', to: 'Y', route_name: 'Line B', distance_km: 1 }).leg,
      routingEdgeFor({ id: 'spur', from: 'Y', to: 'D', route_name: 'Line C', distance_km: 1 }).leg
    ]);
    const edges = [graph.get('A')[0], graph.get('X')[1], graph.get('Y')[1]];

    expect(scoreEdgeSequence(edges, { profileId: 'recommended' })).toEqual({
      totalCost: 60,
      lastServiceKey: 'jeepney:Line C'
    });
  });

  it('does not charge a root-to-spur boundary that continues the same service', () => {
    const graph = buildRoutingGraph([
      routingEdgeFor({ id: 'root', from: 'A', to: 'X', route_name: 'Main Line', distance_km: 1 }).leg,
      routingEdgeFor({ id: 'spur', from: 'X', to: 'D', route_name: 'Main Line', distance_km: 1 }).leg
    ]);
    const edges = [graph.get('A')[0], graph.get('X')[1]];

    expect(scoreEdgeSequence(edges, { profileId: 'recommended' })).toEqual({
      totalCost: 32,
      lastServiceKey: 'jeepney:Main Line'
    });
  });
});
