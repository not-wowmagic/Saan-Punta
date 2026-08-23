/**
 * Deterministic synthetic transit grids for benchmarks and scale tests.
 *
 * Node ids follow `n{row}-{col}`. Each cell connects to its right and lower
 * neighbours with a traditional-jeepney leg whose distance comes from a
 * seeded LCG, so every run produces byte-identical graphs.
 */

/**
 * @param {number} rows Grid height.
 * @param {number} cols Grid width.
 * @param {number} [seed] LCG seed (default 42).
 * @returns {import('../src/utils/types.js').TransitLeg[]}
 */
export function makeGrid(rows, cols, seed = 42) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  /** @type {import('../src/utils/types.js').TransitLeg[]} */
  const legs = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) {
        legs.push({
          id: `g-${r}-${c}-h`,
          from: `n${r}-${c}`,
          to: `n${r}-${c + 1}`,
          mode: 'jeepney',
          route_name: 'Grid Line',
          distance_km: Number((0.5 + rnd() * 4.5).toFixed(1)),
          fare_type: 'traditional'
        });
      }
      if (r + 1 < rows) {
        legs.push({
          id: `g-${r}-${c}-v`,
          from: `n${r}-${c}`,
          to: `n${r + 1}-${c}`,
          mode: 'jeepney',
          route_name: 'Grid Line',
          distance_km: Number((0.5 + rnd() * 4.5).toFixed(1)),
          fare_type: 'traditional'
        });
      }
    }
  }

  return legs;
}
