// Utility to call the WASM safe toolpath generator
// and return a new toolpath with safe Z values for each (x, y)

let wasm_mod = null;
let wasm_ready = false;
const is_jest = typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID !== undefined;
if (!is_jest) {
  (async () => {
    try {
      wasm_mod = await import('../../wasm_kernel/pkg/wasm_kernel.js');
      if (wasm_mod && wasm_mod.default) {
        await wasm_mod.default();
      }
      wasm_ready = true;
      console.log('[safe_toolpath] WASM kernel loaded');
    } catch (e) {
      console.warn('[safe_toolpath] Failed to load WASM kernel:', e);
      wasm_mod = null;
      wasm_ready = false;
    }
  })();
} else {
  try {
    wasm_mod = require('../../wasm_kernel/pkg/wasm_kernel.js');
    if (wasm_mod && wasm_mod.default) {
      wasm_mod.default();
    }
    wasm_ready = true;
  } catch (e) {
    console.warn('[safe_toolpath] Failed to load WASM kernel in Jest:', e);
    wasm_mod = null;
    wasm_ready = false;
  }
}

/**
 * Generate a safe toolpath (never dips below heightmap) for a given tool and toolpath XY.
 * @param {number[][]} heightmap - 2D array [iy][ix] of stock surface heights
 * @param {Object} grid - { nx, ny, grid_size_x, grid_size_y, origin_x, origin_y }
 * @param {Object} tool - { type, cutter_diameter, v_angle }
 * @param {Array<{x:number,y:number}>} toolpath_xy - array of {x, y} points (no z)
 * @returns {Promise<number[]>} - array of safe Z values, same length as toolpath_xy
 */
async function generate_safe_toolpath_js(heightmap, grid, tool, toolpath_xy) {
  if (!wasm_mod || !wasm_ready || !wasm_mod.generate_safe_toolpath_wasm) {
    throw new Error('WASM kernel not loaded');
  }
  // Flatten heightmap to Float32Array (X-major order: [ix][iy])
  // Rust/WASM expects: for ix in 0..nx, for iy in 0..ny: heightmap[ix][iy]
  const flat_heightmap = new Float32Array(grid.nx * grid.ny);
  for (let ix = 0; ix < grid.nx; ix++) {
    for (let iy = 0; iy < grid.ny; iy++) {
      flat_heightmap[ix * grid.ny + iy] = heightmap[iy][ix];
    }
  }
  // Flatten toolpath XY to Float32Array
  const flat_toolpath_xy = new Float32Array(toolpath_xy.length * 2);
  for (let i = 0; i < toolpath_xy.length; i++) {
    flat_toolpath_xy[i * 2 + 0] = toolpath_xy[i].x;
    flat_toolpath_xy[i * 2 + 1] = toolpath_xy[i].y;
  }
  // Pass both grid_size_x and grid_size_y for non-square grids
  const grid_size_x = grid.grid_size_x;
  const grid_size_y = grid.grid_size_y;
  const safe_zs = await wasm_mod.generate_safe_toolpath_wasm(
    flat_heightmap,
    grid.nx,
    grid.ny,
    grid_size_x,
    grid_size_y,
    grid.origin_x,
    grid.origin_y,
    tool.type,
    tool.cutter_diameter,
    tool.v_angle || 0,
    flat_toolpath_xy
  );
  // Return as JS array
  return Array.from(safe_zs);
}

module.exports = { generate_safe_toolpath_js };
