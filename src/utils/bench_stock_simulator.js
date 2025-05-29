// Benchmark JS vs WASM (Rust) simulate_material_removal for a 500x500 workspace with a 20mm tool
const { create_heightmap_stock, simulate_material_removal: js_simulate_material_removal } = require('./stock_simulator');
const path = require('path');
const wasm = require('../../wasm_kernel/pkg/wasm_kernel.js'); // fixed path

const nx = 500, ny = 500, grid_size = 1, initial_height = 50;
const tool = { cutter_diameter: 20, type: 'flat' };
const toolpath = [{ x: 250, y: 250, z: 10 }];

// JS benchmark
const stock_js = create_heightmap_stock(nx, ny, grid_size, initial_height, 0, 0);
console.time('js_simulate_material_removal');
js_simulate_material_removal(stock_js, tool, toolpath);
console.timeEnd('js_simulate_material_removal');

// WASM benchmark
// Prepare flat Float32Array for WASM
const heightmap = new Float32Array(nx * ny).fill(initial_height);
const toolpath_flat = new Float32Array([250, 250, 10]);
console.time('wasm_simulate_material_removal');
wasm.simulate_material_removal_wasm(
  heightmap,
  nx,
  ny,
  grid_size,
  0.0,
  0.0,
  tool.type,
  tool.cutter_diameter,
  0.0, // v_angle_deg (not used for flat)
  toolpath_flat
);
console.timeEnd('wasm_simulate_material_removal');
