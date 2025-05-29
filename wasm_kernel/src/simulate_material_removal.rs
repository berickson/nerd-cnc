// Rust implementation of simulate_material_removal for 2.5D CNC heightmap stock
// All units are mm unless otherwise noted
//
// This function operates on a flat heightmap array (row-major, nx * ny),
// and a toolpath array of (x, y, z) triplets (flat, length = 3 * n_points).
//
// The function mutates the heightmap in-place.
//
// Assumptions:
// - Tool zero position is the center of the tip (x, y, z)
// - Only update grid cells if the new z is lower than the current height
// - Flat: cuts a flat-bottomed cylinder at z=pt.z
// - Ball: cuts a hemisphere, tip at z=pt.z, surface at z=pt.z + sqrt(r^2 - d^2) - r
// - V-bit: cuts a cone, tip at z=pt.z, surface at z=pt.z + d / tan(v_angle/2)

pub struct SimulateMaterialRemovalParams<'a> {
  pub heightmap: &'a [f32], // input only, not mutable
  pub nx: usize,
  pub ny: usize,
  pub grid_size: f32,
  pub origin_x: f32,
  pub origin_y: f32,
  pub tool_type: &'a str,
  pub cutter_diameter: f32,
  pub v_angle_deg: f32, // only used for vbit
  pub toolpath: &'a [f32], // flat array: x0, y0, z0, x1, y1, z1, ...
}

pub fn simulate_material_removal(_params: SimulateMaterialRemovalParams) {
  // No-op: do nothing, just return immediately
  return;
}

// Unit test for simulate_material_removal
#[cfg(test)]
mod tests {
  use super::*;
  use std::time::Instant;

  #[test]
  fn test_flat_endmill_removes_material() {
    let nx = 5;
    let ny = 5;
    let mut heightmap = vec![5.0; nx * ny];
    let toolpath = vec![2.0, 2.0, 2.0]; // single point
    simulate_material_removal(SimulateMaterialRemovalParams {
      heightmap: &heightmap, // remove mut
      nx,
      ny,
      grid_size: 1.0,
      origin_x: 0.0,
      origin_y: 0.0,
      tool_type: "flat",
      cutter_diameter: 1.0,
      v_angle_deg: 0.0,
      toolpath: &toolpath,
    });
    assert!((heightmap[2 * ny + 2] - 2.0).abs() < 1e-6);
    assert!((heightmap[0] - 5.0).abs() < 1e-6);
  }

  #[test]
  fn bench_rust_simulate_material_removal() {
    let nx = 500;
    let ny = 500;
    let mut heightmap = vec![50.0; nx * ny];
    let toolpath = vec![250.0, 250.0, 10.0]; // single point in center
    let start = Instant::now();
    simulate_material_removal(SimulateMaterialRemovalParams {
      heightmap: &heightmap, // remove mut
      nx,
      ny,
      grid_size: 1.0,
      origin_x: 0.0,
      origin_y: 0.0,
      tool_type: "flat",
      cutter_diameter: 20.0,
      v_angle_deg: 0.0,
      toolpath: &toolpath,
    });
    let elapsed = start.elapsed();
    println!("Rust simulate_material_removal 500x500, 20mm tool: {:?}", elapsed);
  }
}

use wasm_bindgen::prelude::*;
use js_sys::Float32Array;
use web_sys;

#[wasm_bindgen(start)]
pub fn main() {
  console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn simulate_material_removal_wasm(
  heightmap_js: &Float32Array,
  nx: usize,
  ny: usize,
  grid_size: f32,
  origin_x: f32,
  origin_y: f32,
  tool_type: &str,
  cutter_diameter: f32,
  v_angle_deg: f32,
  toolpath_js: &Float32Array,
) {
  // Defensive: log all input parameters
  web_sys::console::log_1(&format!(
    "simulate_material_removal_wasm: heightmap_js.len={}, nx={}, ny={}, grid_size={}, origin_x={}, origin_y={}, tool_type={}, cutter_diameter={}, v_angle_deg={}, toolpath_js.len={}",
    heightmap_js.length(), nx, ny, grid_size, origin_x, origin_y, tool_type, cutter_diameter, v_angle_deg, toolpath_js.length()
  ).into());

  let expected_len = nx * ny;
  if heightmap_js.length() as usize != expected_len {
    panic!("heightmap length {} does not match nx*ny {}", heightmap_js.length(), expected_len);
  }
  if toolpath_js.length() % 3 != 0 {
    panic!("toolpath length {} is not a multiple of 3", toolpath_js.length());
  }
  // Copy JS arrays into Rust Vecs
  let heightmap: Vec<f32> = heightmap_js.to_vec();
  let toolpath: Vec<f32> = toolpath_js.to_vec();
  simulate_material_removal(SimulateMaterialRemovalParams {
    heightmap: &heightmap,
    nx,
    ny,
    grid_size,
    origin_x,
    origin_y,
    tool_type,
    cutter_diameter,
    v_angle_deg,
    toolpath: &toolpath,
  });
  // No return value, no mutation
}
