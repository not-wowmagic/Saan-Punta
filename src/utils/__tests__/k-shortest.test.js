import { describe, it, expect } from 'vitest';
import { findRouteAlternatives } from '../k-shortest';
import { getCheapestRoute } from '../dijkstra';
import { getSortedRoutes } from '../graph';
import routesData from '../../data/routes.json';

function mkLeg(id, from, to, extra = {}) {
  return {
    id,
    from,
    to,
    mode: 'jeepney',
    route_name: `Line ${id}`,
    distance_km: 4,
    fare_type: 'traditional',
    ...extra
  };
}

describe('findRouteAlternatives', () => {
  it('rejects an unknown explicit profile before invalid-input early returns', () => {
    const legs = [mkLeg('l1', 'A', 'B'), mkLeg('l2', 'X', 'Y')];
    const invalidInputs = [
      ['', 'B'],
      ['A', ''],
      ['A', 'A'],
      ['A', 'NOWHERE'],
      ['NOWHERE', 'A'],
      ['A', 'B', false, 0]
    ];

    for (const [startNodeId, endNodeId, isDiscounted, maxRoutes] of invalidInputs) {
      expect(() =>
        findRouteAlternatives(legs, startNodeId, endNodeId, isDiscounted, { profileId: 'typo' }, maxRoutes)
      ).toThrow(RangeError);
    }
  });

  it('keeps omitted profiles returning [] for invalid inputs', () => {
    const legs = [mkLeg('l1', 'A', 'B')];
    expect(findRouteAlternatives(legs, '', 'B')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', 'NOWHERE')).toEqual([]);
  });

  it('returns [] for invalid inputs', () => {
    const legs = [mkLeg('l1', 'A', 'B'), mkLeg('l2', 'X', 'Y')];
    expect(findRouteAlternatives(legs, '', 'B')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', '')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', 'A')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', 'NOWHERE')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', 'Y')).toEqual([]);
    expect(findRouteAlternatives(legs, 'A', 'B', false, {}, 0)).toEqual([]);
  });

  it('orders alternatives cheapest-first with single-best parity on top', () => {
    const legs = [
      mkLeg('direct', 'A', 'C', { distance_km: 12 }), // ₱30
      mkLeg('h1', 'A', 'X', { distance_km: 1 }), // ₱14
      mkLeg('h2', 'X', 'C', { distance_km: 1 }) // ₱14 → ₱28
    ];
    const routes = findRouteAlternatives(legs, 'A', 'C');
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].legs.map((s) => s.leg.id)).toEqual(['h1', 'h2']);
    expect(routes[0].minTotalFare).toBe(28);
    for (let i = 1; i < routes.length; i++) {
      expect(routes[i].minTotalFare).toBeGreaterThanOrEqual(routes[i - 1].minTotalFare);
    }

    const best = getCheapestRoute(legs, 'A', 'C');
    expect(routes[0].legs.map((s) => s.leg.id)).toEqual(best.legs.map((s) => s.leg.id));
    expect(routes[0].fareText).toBe(best.fareText);
  });

  it('keeps named-profile order when the fastest route has a higher displayed fare', () => {
    const legs = [
      mkLeg('cheap-slow', 'A', 'B', { distance_km: 4 }),
      mkLeg('costly-fast', 'A', 'B', {
        mode: 'taxi',
        route_name: null,
        fare_type: 'taxi',
        distance_km: 1
      })
    ];

    const routes = findRouteAlternatives(legs, 'A', 'B', false, {
      profileId: 'pinakamabilis'
    });

    expect(routes.map((route) => route.legs[0].leg.id)).toEqual(['costly-fast', 'cheap-slow']);
    expect(routes[0].minTotalFare).toBeGreaterThan(routes[1].minTotalFare);
  });

  it('scores root edges and the spur boundary with the same transfer semantics as Dijkstra', () => {
    const legs = [
      mkLeg('root', 'A', 'X', { route_name: 'Main Line', distance_km: 1 }),
      mkLeg('same-service', 'X', 'D', { route_name: 'Main Line', distance_km: 1 }),
      mkLeg('changed-service', 'X', 'D', { route_name: 'Other Line', distance_km: 0.1 }),
      mkLeg('direct', 'A', 'D', { route_name: 'Direct Line', distance_km: 7 })
    ];

    const routes = findRouteAlternatives(legs, 'A', 'D', false, {
      profileId: 'recommended'
    });

    expect(routes.map((route) => route.legs.map((step) => step.leg.id).join('>'))).toEqual([
      'root>same-service',
      'direct',
      'root>changed-service'
    ]);
  });

  it('keeps omitted-profile fare ordering and deterministic tie order', () => {
    const legs = [
      mkLeg('first-tie', 'A', 'B', { route_name: 'First Line', distance_km: 4 }),
      mkLeg('second-tie', 'A', 'B', { route_name: 'Second Line', distance_km: 4 }),
      mkLeg('costlier', 'A', 'B', { route_name: 'Costlier Line', distance_km: 5 })
    ];

    const routes = findRouteAlternatives(legs, 'A', 'B');

    expect(routes.map((route) => route.legs[0].leg.id)).toEqual([
      'first-tie',
      'second-tie',
      'costlier'
    ]);
  });

  it('collapses equivalent parallel legs sharing one line into a single alternative', () => {
    const legs = [
      mkLeg('jeep-a', 'A', 'B', { route_name: 'Line 1' }),
      mkLeg('jeep-b', 'A', 'B', { route_name: 'Line 1' }),
      mkLeg('bus-x', 'A', 'B', { mode: 'bus', fare_type: 'aircon' })
    ];
    const routes = findRouteAlternatives(legs, 'A', 'B');
    expect(routes).toHaveLength(2);
    expect(routes[0].legs[0].leg.id).toBe('jeep-a');
    expect(routes[1].legs[0].leg.mode).toBe('bus');
  });

  it('keeps same-mode alternatives when their lines genuinely differ', () => {
    const legs = [
      mkLeg('jx', 'A', 'B', { route_name: 'Line X' }),
      mkLeg('jy', 'A', 'B', { route_name: 'Line Y' })
    ];
    const routes = findRouteAlternatives(legs, 'A', 'B');
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.legs[0].leg.route_name)).toEqual(['Line X', 'Line Y']);
  });

  it('preserves genuinely different journey shapes (direct vs transfer)', () => {
    const legs = [
      mkLeg('direct', 'A', 'C'),
      mkLeg('hop-1', 'A', 'X'),
      mkLeg('hop-2', 'X', 'C')
    ];
    const routes = findRouteAlternatives(legs, 'A', 'C');
    const shapes = routes.map((r) => r.legs.map((s) => s.leg.id).join('>'));
    expect(shapes).toContain('direct');
    expect(shapes).toContain('hop-1>hop-2');
  });

  it('respects the maxRoutes cap across many distinct modes', () => {
    const legs = [
      mkLeg('w', 'A', 'B', { mode: 'walk', fare_type: null }),
      mkLeg('j', 'A', 'B'),
      mkLeg('b', 'A', 'B', { mode: 'bus', fare_type: 'aircon' }),
      mkLeg('t', 'A', 'B', { mode: 'train', fare_type: 'estimate' }),
      mkLeg('m', 'A', 'B', { mode: 'moto_taxi', fare_type: 'estimate' }),
      mkLeg('x', 'A', 'B', { mode: 'taxi', fare_type: 'taxi' })
    ];
    const routes = findRouteAlternatives(legs, 'A', 'B', false, {}, 3);
    expect(routes).toHaveLength(3);
    // ₱0 walk < ₱14 jeep < ₱18 aircon bus < ₱22 SVC train < ₱90 moto < ₱99 taxi.
    const modes = routes.map((r) => r.legs[0].leg.mode);
    expect(modes).toEqual(['walk', 'jeepney', 'bus']);
  });

  it('flows the discount flag through to pricing', () => {
    const legs = [mkLeg('l1', 'A', 'B')];
    const full = findRouteAlternatives(legs, 'A', 'B');
    const discounted = findRouteAlternatives(legs, 'A', 'B', true);
    expect(discounted[0].minTotalFare).toBeCloseTo(full[0].minTotalFare * 0.8, 2);
  });

  it('never mutates input legs', () => {
    const legs = [mkLeg('l1', 'A', 'B'), mkLeg('l2', 'B', 'C')];
    const snapshot = JSON.stringify(legs);
    findRouteAlternatives(legs, 'A', 'C', true, { tricycleMode: 'special' });
    expect(JSON.stringify(legs)).toBe(snapshot);
  });

  it('is deterministic across repeated runs', () => {
    const legs = [
      mkLeg('direct', 'A', 'C'),
      mkLeg('hop-1', 'A', 'X'),
      mkLeg('hop-2', 'X', 'C')
    ];
    const first = findRouteAlternatives(legs, 'A', 'C').map((r) =>
      r.legs.map((s) => s.leg.id).join('>')
    );
    const second = findRouteAlternatives(legs, 'A', 'C').map((r) =>
      r.legs.map((s) => s.leg.id).join('>')
    );
    expect(first).toEqual(second);
  });
});

describe('production parity against the legacy enumeration oracle', () => {
  const legs = routesData.legs;

  it('returns a bounded list whose top entry matches the legacy best for plv → monumento', () => {
    const legacyTop = getSortedRoutes(legs, 'plv', 'monumento')[0];
    const routes = findRouteAlternatives(legs, 'plv', 'monumento');

    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes.length).toBeLessThanOrEqual(5);
    expect(routes[0].legs.map((s) => s.leg.id)).toEqual(legacyTop.legs.map((s) => s.leg.id));
    expect(routes[0].fareText).toBe(legacyTop.fareText);
  });

  it('returns multiple meaningful alternatives for a long cross-city trip', () => {
    const routes = findRouteAlternatives(legs, 'plv', 'sm_north');
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.length).toBeLessThanOrEqual(5);

    const signatures = new Set(
      routes.map((r) => r.legs.map((s) => `${s.leg.mode}:${s.leg.route_name ?? ''}`).join('>'))
    );
    expect(signatures.size).toBe(routes.length);
  });
});
