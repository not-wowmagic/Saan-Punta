import { describe, it, expect } from 'vitest';
import { buildRoutingGraph } from '../routing-graph';

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

describe('buildRoutingGraph', () => {
  it('creates adjacency buckets for every endpoint', () => {
    const g = buildRoutingGraph([mkLeg('l1', 'A', 'B')]);
    expect([...g.keys()].sort()).toEqual(['A', 'B']);
  });

  it('expands legacy legs into forward + reverse edges retaining full context', () => {
    const g = buildRoutingGraph([mkLeg('l1', 'A', 'B', { mode: 'bus', distance_km: 7 })]);

    expect(g.get('A')).toHaveLength(1);
    const fwd = g.get('A')[0];
    expect(fwd.from).toBe('A');
    expect(fwd.to).toBe('B');
    expect(fwd.direction).toBe('forward');
    expect(fwd.mode).toBe('bus');
    expect(fwd.distance).toBe(7);
    expect(fwd.leg.id).toBe('l1');

    expect(g.get('B')).toHaveLength(1);
    const rev = g.get('B')[0];
    expect(rev.from).toBe('B');
    expect(rev.to).toBe('A');
    expect(rev.direction).toBe('reverse');
    expect(rev.leg.id).toBe('l1');
  });

  it('produces a single forward edge when bidirectional === false', () => {
    const g = buildRoutingGraph([mkLeg('l1', 'A', 'B', { bidirectional: false })]);
    expect(g.get('A')).toHaveLength(1);
    expect(g.get('A')[0].direction).toBe('forward');
    expect(g.get('B')).toEqual([]);
  });

  it('keeps parallel legs as distinct edges in insertion order', () => {
    const g = buildRoutingGraph([mkLeg('j1', 'A', 'B'), mkLeg('j2', 'A', 'B')]);
    expect(g.get('A').map((e) => e.leg.id)).toEqual(['j1', 'j2']);
  });

  it('reuses the cached graph instance for identical legs arrays', () => {
    const legs = [mkLeg('l1', 'A', 'B')];
    expect(buildRoutingGraph(legs)).toBe(buildRoutingGraph(legs));
  });

  it('rebuilds when a structurally-equal but fresh array arrives', () => {
    const a = [mkLeg('l1', 'A', 'B')];
    const b = [mkLeg('l1', 'A', 'B')];
    expect(buildRoutingGraph(a)).not.toBe(buildRoutingGraph(b));
  });

  it('never mutates input legs', () => {
    const leg = mkLeg('l1', 'A', 'B');
    const snapshot = JSON.stringify(leg);
    buildRoutingGraph([leg]);
    expect(JSON.stringify(leg)).toBe(snapshot);
  });
});
