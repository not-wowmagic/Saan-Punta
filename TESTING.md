# Testing & Quality Assurance

This document describes how Saan Punta is tested and validated, and how to run
every quality gate locally.

## Quality gates

| Command | What it does |
| --- | --- |
| `npm run lint` | Static analysis via oxlint (React hooks rules enabled) |
| `npm run typecheck` | Strict JSDoc type checking (`tsc --noEmit`) over the `src/utils` routing layer |
| `npm run validate:data` | Schema + integrity validation of `src/data/routes.json` |
| `npm test` | Unit/regression tests via Vitest (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Production Vite build |

All six must pass before any change is merged. GitHub Actions runs them on
every push to `main` and every pull request targeting `main`.

## Type checking strategy

Routing utilities (`src/utils/*`) are checked with TypeScript's `checkJs`:
types are declared as JSDoc tags (see `src/utils/types.js`) and verified by
`tsc --noEmit` under `strict`. UI components are not yet in scope — widening
the checked surface is deliberate and incremental, so no `any`/`@ts-ignore`
escapes are needed or allowed in checked files.

## Unit tests (Vitest)

Tests live next to the code they cover under `src/**/__tests__/*.test.js`.
They are pure-logic tests: no DOM, no network, no localStorage.

### Fare regression tests (`src/utils/__tests__/fares.test.js`)

These **freeze current fare behavior** for every transport mode:

- traditional jeepney (base / excess / discounted)
- modern jeepney (base / excess / discounted)
- tricycle (shared rate, special/solo flat fare, estimate fallback)
- bus (ordinary, aircon, discounted)
- train LRT-1 (SVC/Beep rounding + clamps, Single Journey Ticket tiers, discounts)
- taxi (flagdown + distance; never discounted)
- motorcycle taxi (min/max estimate range)
- walking (free) and unsupported modes (fallback)

The expected values were derived from the implementation that existed when the
tests were written. If a real-world fare rule changes (e.g. an LTFRB matrix
update), update the production constants **and** these tests together in a
clearly-labeled commit — do not weaken a test to make a failure disappear.

Known quirks are intentionally asserted as-is:

- A leg with `fare_type: null` is always free, regardless of mode.
- A jeepney leg with an unrecognized fare type falls back to modern pricing.
- `flat_fare: 0` on a special tricycle leg falls back to the estimate formula.

### Graph & engine regression tests

`src/utils/__tests__/graph.test.js` documents the legacy bounded-DFS engine,
which now serves solely as a regression oracle — production routing no longer
enumerates every path. `src/utils/__tests__/dijkstra.test.js` covers the
weighted Dijkstra engine (`src/utils/dijkstra.js`), including real-dataset
parity against the legacy oracle for representative node pairs, exact
line-aware transfer penalties, walking between services, and reverse
traversal. `src/utils/__tests__/edge-cost.test.js` covers pure-fare and named
profile cost composition. Finally,
`src/utils/__tests__/k-shortest.test.js` covers Yen's bounded alternatives
with similarity de-duplication, transfer context across spur boundaries, and
profile-controlled ordering. Fixture graphs are small and deterministic,
covering: direct routes, transfers, no-path cases, same origin/destination,
multiple simple paths, parallel legs, bidirectional and one-way traversal,
depth caps, fare aggregation (including ranged moto-taxi fares), and route
sorting (fare ascending, then leg count).

## Routing engine

Production routing no longer enumerates every path:

1. `src/utils/routing-graph.js` builds a directed adjacency graph once from
   `routes.json` legs (cached by array identity). Legacy legs are two-way;
   only an explicit `"bidirectional": false` makes a leg one-way.
2. `src/utils/profiles.js` defines five named policies: Recommended,
   Pinakamura, Pinakamabilis, Kaunting Sakay, and Kaunting Lakad. Library calls
   that omit `profileId` retain the original pure-fare ranking exactly; an
   unknown explicit profile id is rejected.
3. `src/utils/edge-cost.js` composes fare, estimated travel time, and walking
   distance under the active profile. It also owns the shared service-transfer
   policy used by both single-route and alternative-route searches.
4. `src/utils/dijkstra.js` finds the single cheapest route via predecessor
   reconstruction. Profiles with transfer penalties expand search state to
   `(node, last transit service)`, so arriving at the same interchange on
   different lines remains distinct. Walking preserves the last transit
   service; first boarding and same-service continuation are not transfers.
   Zero-transfer and omitted profiles retain the original node-only search.
5. `src/utils/k-shortest.js` applies Yen's algorithm over repeated spur
   searches to return up to five meaningfully-different alternatives.
   Root-path service context is passed into each spur search, and the weighted
   candidate order is preserved when results are formatted for display.
   Candidates are de-duplicated by a similarity signature built from the
   ordered sequence of transit lines and modes, so equivalent parallel legs
   cannot flood the UI with near-identical routes.

The legacy DFS stays exported in `src/utils/graph.js` purely as the
regression oracle used by parity tests.

Benchmarks live in `benchmarks/` and run via `npm run bench:routing`. On the
real dataset (41 nodes / 316 legs) the single-best Dijkstra query is orders
of magnitude faster than full DFS enumeration, and it scales to synthetic
grids of 1600 nodes in about a millisecond.

## Dataset validation

`npm run validate:data` runs `scripts/validate-data.mjs`, which validates
`src/data/routes.json` with Zod:

**Nodes** must have: unique non-empty `id`, non-empty `name`,
`lat` ∈ [-90, 90], `lng` ∈ [-180, 180].

**Legs** must have: unique non-empty `id`, `from`/`to` referencing existing
nodes, a supported `mode`
(`jeepney | tricycle | taxi | moto_taxi | train | walk | bus`), a known
`fare_type` (`traditional | modern | tricycle | taxi | estimate | ordinary |
aircon`, or `null`), strictly positive `distance_km`, and no self-reference
(`from === to`). Unknown/typo'd fields are rejected on both nodes and legs.

CI fails when the dataset is invalid. To check a specific file:

```bash
node scripts/validate-data.mjs path/to/routes.json
```

The validator never mutates data.

## Adding new tests

1. Place the file at `src/<area>/__tests__/<name>.test.js`.
2. Keep tests deterministic — no network calls, no timers, no randomness.
3. Fixture transit graphs should be built inline with small helper functions.
4. When freezing existing behavior that looks odd, add a short comment
   explaining it is intentional so future maintainers don't "fix" it silently.

## Planned

- Playwright end-to-end tests against the production build with mocked OSRM
  responses (no live external APIs in CI).
