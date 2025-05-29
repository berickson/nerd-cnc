const { sample_triangle } = require('./sample_triangle');

/**
 * Builds a heightmap from a mesh's triangles.
 * @param {Object} geometry - THREE.BufferGeometry or similar with .attributes.position.
 * @param {Object} grid - { min_x, max_x, min_y, max_y, res_x, res_y }
 * @returns {number[][]} heightmap[y][x] = max z at that cell
 */

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
      console.log('[heightmap_from_mesh] WASM kernel loaded');
    } catch (e) {
      console.warn('[heightmap_from_mesh] Failed to load WASM kernel, heightmap_from_mesh will be unavailable:', e);
      wasm_mod = null;
      wasm_ready = false;
    }
  })();
} else {
  // In Jest, load WASM synchronously for tests
  try {
    wasm_mod = require('../../wasm_kernel/pkg/wasm_kernel.js');
    if (wasm_mod && wasm_mod.default) {
      wasm_mod.default();
    }
    wasm_ready = true;
  } catch (e) {
    console.warn('[heightmap_from_mesh] Failed to load WASM kernel in Jest:', e);
    wasm_mod = null;
    wasm_ready = false;
  }
}

function heightmap_from_mesh(geometry, grid) {
  // WASM path: only if available and ready
  if (wasm_mod && wasm_ready && wasm_mod.heightmap_from_mesh_wasm) {
    try {
      const pos = geometry.attributes.position;
      const positions = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; ++i) {
        positions[i * 3 + 0] = pos.getX(i);
        positions[i * 3 + 1] = pos.getY(i);
        positions[i * 3 + 2] = pos.getZ(i);
      }
      // No indices for now (non-indexed geometry)
      const result = wasm_mod.heightmap_from_mesh_wasm(
        positions,
        undefined,
        grid.min_x,
        grid.max_x,
        grid.min_y,
        grid.max_y,
        grid.res_x,
        grid.res_y
      );
      // Convert flat Float32Array to 2D JS array [iy][ix]
      const heightmap = [];
      for (let iy = 0; iy < grid.res_y; iy++) {
        heightmap[iy] = [];
        for (let ix = 0; ix < grid.res_x; ix++) {
          heightmap[iy][ix] = result[iy * grid.res_x + ix];
        }
      }
      return heightmap;
    } catch (e) {
      console.warn('[heightmap_from_mesh] WASM call failed:', e);
      throw new Error('heightmap_from_mesh unavailable: WASM call failed');
    }
  }
  // If WASM is not available, throw error (JS fallback removed)
  throw new Error('heightmap_from_mesh unavailable: WASM kernel not loaded');
}

module.exports = { heightmap_from_mesh };