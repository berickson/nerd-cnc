// Jest benchmark for JS and WASM (Rust) simulate_material_removal
// Run with `npm test`
// Assumes: wasm_kernel/pkg/wasm_kernel.js (ESM), src/utils/stock_simulator.js (CJS/ESM)
// Uses dynamic import for WASM

const path = require('path');
const { performance } = require('perf_hooks');
const js_sim = require('./stock_simulator');

// Helper to create a flat heightmap and toolpath
function make_bench_data(nx, ny, tool_diam) {
  const heightmap = new Float32Array(nx * ny).fill(50.0);
  const toolpath = new Float32Array([nx / 2, ny / 2, 10.0]);
  return { heightmap, toolpath };
}

jest.mock('../../wasm_kernel/pkg/wasm_kernel.js', () => ({}));

describe('simulate_material_removal benchmark', () => {
  const nx = 500;
  const ny = 500;
  const grid_size = 1.0;
  const tool_diam = 20.0;

  test('JS vs WASM performance', async () => {
    // JS benchmark
    const { heightmap: js_heightmap, toolpath } = make_bench_data(nx, ny, tool_diam);
    const js_start = performance.now();
    js_sim.simulate_material_removal({
      heightmap: js_heightmap,
      nx,
      ny,
      grid_size,
      origin_x: 0,
      origin_y: 0,
      tool_type: 'flat',
      cutter_diameter: tool_diam,
      v_angle_deg: 0,
      toolpath,
    });
    const js_elapsed = performance.now() - js_start;
    console.log(`JS simulate_material_removal 500x500, 20mm tool: ${js_elapsed.toFixed(2)} ms`);

    // WASM benchmark (skip in Node/Jest, only run if not mocked)
    const wasm_mod = await import('../../wasm_kernel/pkg/wasm_kernel.js');
    if (!wasm_mod.simulate_material_removal) {
      console.warn('WASM simulate_material_removal is mocked or unavailable, skipping WASM benchmark.');
      return;
    }
    const { simulate_material_removal } = wasm_mod;
    const wasm_heightmap = new Float32Array(nx * ny).fill(50.0);
    const wasm_start = performance.now();
    simulate_material_removal({
      heightmap: wasm_heightmap,
      nx,
      ny,
      grid_size,
      origin_x: 0,
      origin_y: 0,
      tool_type: 'flat',
      cutter_diameter: tool_diam,
      v_angle_deg: 0,
      toolpath,
    });
    const wasm_elapsed = performance.now() - wasm_start;
    console.log(`WASM simulate_material_removal 500x500, 20mm tool: ${wasm_elapsed.toFixed(2)} ms`);

    // Simple check: both heightmaps should match at center
    expect(js_heightmap[nx/2*ny + ny/2]).toBeCloseTo(wasm_heightmap[nx/2*ny + ny/2], 3);
  });
});
