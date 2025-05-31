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
  pub heightmap: &'a mut [f32],
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

pub fn simulate_material_removal(params: SimulateMaterialRemovalParams) {
  let SimulateMaterialRemovalParams {
    heightmap,
    nx,
    ny,
    grid_size,
    origin_x,
    origin_y,
    tool_type,
    cutter_diameter,
    v_angle_deg,
    toolpath,
  } = params;
  let r = cutter_diameter / 2.0;
  let step = grid_size;
  let tool_grid_radius = (r / step).ceil() as isize;
  let tool_grid_size = tool_grid_radius * 2 + 1;
  let tan_half_angle = if tool_type == "vbit" {
    let v_angle_rad = v_angle_deg * std::f32::consts::PI / 180.0;
    (v_angle_rad / 2.0).tan()
  } else {
    0.0
  };

  // Precompute tool elevation grid for a single tool position at (0,0,0)
  let mut tool_elevation_grid = vec![vec![None; tool_grid_size as usize]; tool_grid_size as usize];
  for ix in 0..tool_grid_size {
    for iy in 0..tool_grid_size {
      let x = (ix - tool_grid_radius) as f32 * step;
      let y = (iy - tool_grid_radius) as f32 * step;
      let distance = (x * x + y * y).sqrt();
      let dz = if distance > r + 1e-6 {
        None
      } else if tool_type == "flat" {
        Some(0.0)
      } else if tool_type == "ball" {
        Some(r - (r * r - distance * distance).max(0.0).sqrt())
      } else if tool_type == "vbit" {
        if tan_half_angle > 1e-8 {
          Some(distance / tan_half_angle)
        } else {
          None
        }
      } else {
        None
      };
      tool_elevation_grid[ix as usize][iy as usize] = dz;
    }
  }

  for pt in toolpath.chunks(3) {
    assert!(pt.len() == 3, "toolpath chunk is not length 3");
    let x0 = pt[0];
    let y0 = pt[1];
    let z0 = pt[2];
    if tool_type == "flat" && cutter_diameter <= step + 1e-6 {
      // Only cut the center cell
      let ix = ((x0 - origin_x) / step).round() as isize;
      let iy = ((y0 - origin_y) / step).round() as isize;
      if ix >= 0 && iy >= 0 && (ix as usize) < nx && (iy as usize) < ny {
        let idx = ix as usize * ny + iy as usize;
        if heightmap[idx] > z0 {
          heightmap[idx] = z0;
        }
      }
      continue;
    }
    let tool_cx = ((x0 - origin_x) / step).round() as isize;
    let tool_cy = ((y0 - origin_y) / step).round() as isize;
    for dx in -tool_grid_radius..=tool_grid_radius {
      for dy in -tool_grid_radius..=tool_grid_radius {
        let ix = tool_cx + dx;
        let iy = tool_cy + dy;
        if ix < 0 || iy < 0 || (ix as usize) >= nx || (iy as usize) >= ny {
          continue;
        }
        let grid_ix = (dx + tool_grid_radius) as usize;
        let grid_iy = (dy + tool_grid_radius) as usize;
        assert!(grid_ix < tool_elevation_grid.len(), "grid_ix {} out of bounds {}", grid_ix, tool_elevation_grid.len());
        assert!(grid_iy < tool_elevation_grid[grid_ix].len(), "grid_iy {} out of bounds {}", grid_iy, tool_elevation_grid[grid_ix].len());
        if let Some(dz) = tool_elevation_grid[grid_ix][grid_iy] {
          let z = z0 + dz;
          let idx = ix as usize * ny + iy as usize;
          // Defensive: check idx is in bounds
          assert!(idx < heightmap.len(), "heightmap idx {} out of bounds {}", idx, heightmap.len());
          if heightmap[idx] > z {
            heightmap[idx] = z;
          }
        }
      }
    }
  }
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
      heightmap: &mut heightmap, // remove mut
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
      heightmap: &mut heightmap, // remove mut
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

  #[test]
  fn test_tool_does_not_cut_below_heightmap() {
    // Tool: ball, diameter 2
    let nx = 5;
    let ny = 5;
    let mut heightmap = vec![1.0; nx * ny];
    // Create a bump at the center
    heightmap[2 * ny + 2] = 5.0;
    // Toolpath: pass over the bump at z = 0.0 (lower than bump)
    let toolpath = vec![2.0, 2.0, 0.0];
    simulate_material_removal(SimulateMaterialRemovalParams {
      heightmap: &mut heightmap,
      nx,
      ny,
      grid_size: 1.0,
      origin_x: 0.0,
      origin_y: 0.0,
      tool_type: "ball",
      cutter_diameter: 2.0,
      v_angle_deg: 0.0,
      toolpath: &toolpath,
    });
    // The bump should not be cut below its original height
    assert!(heightmap[2 * ny + 2] >= 5.0 - 1e-6, "Tool cut below the heightmap bump!");
  }

  #[test]
  fn test_generate_safe_toolpath_ball_over_bump() {
    // Ball tool, diameter 2, over a bump at center
    let nx = 5;
    let ny = 5;
    let mut heightmap = vec![1.0; nx * ny];
    heightmap[2 * ny + 2] = 5.0; // bump at center
    let grid_size = 1.0;
    let origin_x = 0.0;
    let origin_y = 0.0;
    let tool_type = "ball";
    let cutter_diameter = 2.0;
    let v_angle_deg = 0.0;
    // Toolpath: just one point at the bump
    let toolpath_xy = vec![(2.0, 2.0)];
    // Should return a Z such that the ball just touches the bump, not lower
    let safe_zs = generate_safe_toolpath(
      &heightmap,
      nx,
      ny,
      grid_size,
      origin_x,
      origin_y,
      tool_type,
      cutter_diameter,
      v_angle_deg,
      &toolpath_xy,
    );
    // The safe Z should be >= 5.0 - r (ball tip just touches bump)
    let r = cutter_diameter / 2.0;
    assert!(safe_zs.len() == 1);
    assert!(safe_zs[0] >= 5.0 - r - 1e-6, "Safe Z is too low: {}", safe_zs[0]);
  }
}

// Compute the highest Z for each (x, y) so the tool never dips below the heightmap
pub fn generate_safe_toolpath(
  heightmap: &[f32],
  nx: usize,
  ny: usize,
  grid_size: f32,
  origin_x: f32,
  origin_y: f32,
  tool_type: &str,
  cutter_diameter: f32,
  v_angle_deg: f32,
  toolpath_xy: &[(f32, f32)],
) -> Vec<f32> {
  let r = cutter_diameter / 2.0;
  let step = grid_size;
  let tool_grid_radius = (r / step).ceil() as isize;
  let tool_grid_size = tool_grid_radius * 2 + 1;
  let tan_half_angle = if tool_type == "vbit" {
    let v_angle_rad = v_angle_deg * std::f32::consts::PI / 180.0;
    (v_angle_rad / 2.0).tan()
  } else {
    0.0
  };
  let mut safe_zs = Vec::with_capacity(toolpath_xy.len());
  for &(x0, y0) in toolpath_xy.iter() {
    let tool_cx = ((x0 - origin_x) / step).round() as isize;
    let tool_cy = ((y0 - origin_y) / step).round() as isize;
    let mut max_required_z = std::f32::NEG_INFINITY;
    for dx in -tool_grid_radius..=tool_grid_radius {
      for dy in -tool_grid_radius..=tool_grid_radius {
        let ix = tool_cx + dx;
        let iy = tool_cy + dy;
        if ix < 0 || iy < 0 || (ix as usize) >= nx || (iy as usize) >= ny {
          continue;
        }
        let x = (dx as f32) * step;
        let y = (dy as f32) * step;
        let distance = (x * x + y * y).sqrt();
        if distance > r + 1e-6 {
          continue;
        }
        let dz = if tool_type == "flat" {
          0.0
        } else if tool_type == "ball" {
          r - (r * r - distance * distance).max(0.0).sqrt()
        } else if tool_type == "vbit" {
          if tan_half_angle > 1e-8 {
            distance / tan_half_angle
          } else {
            continue;
          }
        } else {
          continue;
        };
        let idx = ix as usize * ny + iy as usize;
        let required_z = heightmap[idx] - dz;
        if required_z > max_required_z {
          max_required_z = required_z;
        }
      }
    }
    safe_zs.push(max_required_z);
  }
  safe_zs
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
  let mut heightmap: Vec<f32> = heightmap_js.to_vec();
  let toolpath: Vec<f32> = toolpath_js.to_vec();
  simulate_material_removal(SimulateMaterialRemovalParams {
    heightmap: &mut heightmap,
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
  // Write back to JS array
  for (i, v) in heightmap.iter().enumerate() {
    // Defensive: check bounds
    if i < heightmap_js.length() as usize {
      heightmap_js.set_index(i as u32, *v);
    }
  }
}

#[wasm_bindgen]
pub fn generate_safe_toolpath_wasm(
  heightmap_js: &Float32Array,
  nx: usize,
  ny: usize,
  grid_size_x: f32,
  grid_size_y: f32,
  origin_x: f32,
  origin_y: f32,
  tool_type: &str,
  cutter_diameter: f32,
  v_angle_deg: f32,
  toolpath_xy_js: &Float32Array, // flat array: x0, y0, x1, y1, ...
) -> Float32Array {
  let heightmap: Vec<f32> = heightmap_js.to_vec();
  let toolpath_xy_vec: Vec<f32> = toolpath_xy_js.to_vec();
  let mut toolpath_xy = Vec::with_capacity(toolpath_xy_vec.len() / 2);
  for i in (0..toolpath_xy_vec.len()).step_by(2) {
    toolpath_xy.push((toolpath_xy_vec[i], toolpath_xy_vec[i + 1]));
  }
  let safe_zs = generate_safe_toolpath_grid(
    &heightmap,
    nx,
    ny,
    grid_size_x,
    grid_size_y,
    origin_x,
    origin_y,
    tool_type,
    cutter_diameter,
    v_angle_deg,
    &toolpath_xy,
  );
  Float32Array::from(safe_zs.as_slice())
}

// New: grid_size_x/y version for non-square grids
pub fn generate_safe_toolpath_grid(
  heightmap: &[f32],
  nx: usize,
  ny: usize,
  grid_size_x: f32,
  grid_size_y: f32,
  origin_x: f32,
  origin_y: f32,
  tool_type: &str,
  cutter_diameter: f32,
  v_angle_deg: f32,
  toolpath_xy: &[(f32, f32)],
) -> Vec<f32> {
  let r = cutter_diameter / 2.0;
  let tool_grid_radius_x = (r / grid_size_x).ceil() as isize;
  let tool_grid_radius_y = (r / grid_size_y).ceil() as isize;
  let tan_half_angle = if tool_type == "vbit" {
    let v_angle_rad = v_angle_deg * std::f32::consts::PI / 180.0;
    (v_angle_rad / 2.0).tan()
  } else {
    0.0
  };
  let mut safe_zs = Vec::with_capacity(toolpath_xy.len());
  for &(x0, y0) in toolpath_xy.iter() {
    let tool_cx = ((x0 - origin_x) / grid_size_x).round() as isize;
    let tool_cy = ((y0 - origin_y) / grid_size_y).round() as isize;
    let mut max_required_z = std::f32::NEG_INFINITY;
    for dx in -tool_grid_radius_x..=tool_grid_radius_x {
      for dy in -tool_grid_radius_y..=tool_grid_radius_y {
        let ix = tool_cx + dx;
        let iy = tool_cy + dy;
        if ix < 0 || iy < 0 || (ix as usize) >= nx || (iy as usize) >= ny {
          continue;
        }
        let x = (dx as f32) * grid_size_x;
        let y = (dy as f32) * grid_size_y;
        let distance = (x * x + y * y).sqrt();
        if distance > r + 1e-6 {
          continue;
        }
        let dz = if tool_type == "flat" {
          0.0
        } else if tool_type == "ball" {
          r - (r * r - distance * distance).max(0.0).sqrt()
        } else if tool_type == "vbit" {
          if tan_half_angle > 1e-8 {
            distance / tan_half_angle
          } else {
            continue;
          }
        } else {
          continue;
        };
        let idx = ix as usize * ny + iy as usize;
        let required_z = heightmap[idx] - dz;
        if required_z > max_required_z {
          max_required_z = required_z;
        }
      }
    }
    safe_zs.push(max_required_z);
  }
  safe_zs
}
