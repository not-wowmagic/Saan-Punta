import { bench, describe } from 'vitest';
import routes from '../src/data/routes.json';
import { getSortedRoutes } from '../src/utils/graph';
import { getCheapestRoute } from '../src/utils/dijkstra';
import { makeGrid } from './grid-fixture';

const legs = /** @type {{nodes: any[], legs: any[]}} */ (routes).legs;

describe('routing engines on the real dataset (41 nodes / 316 legs)', () => {
  bench('legacy bounded DFS enumeration', () => {
    getSortedRoutes(legs, 'plv', 'intramuros');
  });

  bench('dijkstra single best route', () => {
    getCheapestRoute(legs, 'plv', 'intramuros');
  });
});

describe('routing engines on a synthetic 15x15 grid (225 nodes)', () => {
  const grid = makeGrid(15, 15);

  // Fair comparison: 4 hops, inside the legacy 5-leg depth cap.
  describe('near pair (4 hops, within legacy depth cap)', () => {
    bench('legacy bounded DFS enumeration', () => {
      getSortedRoutes(grid, 'n0-0', 'n2-2');
    });

    bench('dijkstra single best route', () => {
      getCheapestRoute(grid, 'n0-0', 'n2-2');
    });
  });

  // Deep query: unreachable for legacy (needs ~28 hops > depth cap);
  // documents why the cap exists rather than a speed contest.
  describe('deep pair (~28 hops, exceeds legacy depth cap)', () => {
    bench('legacy bounded DFS enumeration', () => {
      getSortedRoutes(grid, 'n0-0', 'n14-14');
    });

    bench('dijkstra single best route', () => {
      getCheapestRoute(grid, 'n0-0', 'n14-14');
    });
  });
});

describe('dijkstra scalability on a 40x40 grid (1600 nodes)', () => {
  const big = makeGrid(40, 40);

  bench('dijkstra single best route', () => {
    getCheapestRoute(big, 'n0-0', 'n39-39');
  });
});
