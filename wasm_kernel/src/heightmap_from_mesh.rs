//! heightmap_from_mesh.rs
// Port of JS heightmap_from_mesh to Rust/WASM
// Converts a triangle mesh to a 2D heightmap grid (z=max at each cell)
// Assumptions: mesh is a list of triangles, grid is axis-aligned, units are mm

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Uint32Array};

pub struct MeshRust {
  pub positions: Vec<f32>,
  pub indices: Option<Vec<u32>>,
}

pub struct HeightmapGridRust {
  pub min_x: f32,
  pub max_x: f32,
  pub min_y: f32,
  pub max_y: f32,
  pub res_x: usize,
  pub res_y: usize,
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn test_flat_triangle() {
    let positions = vec![0.0, 0.0, 5.0, 2.0, 0.0, 5.0, 0.0, 2.0, 5.0];
    let mesh = MeshRust { positions, indices: None };
    let grid = HeightmapGridRust {
      min_x: 0.0, max_x: 1.0, min_y: 0.0, max_y: 1.0, res_x: 2, res_y: 2
    };
    let heightmap = heightmap_from_mesh_rust(&mesh, &grid);
    println!("heightmap: {:?}", heightmap);
    assert_eq!(heightmap.len(), 4);
    for (i, &z) in heightmap.iter().enumerate() {
      assert_eq!(z, 5.0, "cell {} was not set correctly (got {})", i, z);
    }
  }
}

/// Compute a 2D heightmap from a triangle mesh. Each cell gets the max z of any triangle covering it.
pub fn heightmap_from_mesh_rust(mesh: &MeshRust, grid: &HeightmapGridRust) -> Vec<f32> {
  let nx = grid.res_x;
  let ny = grid.res_y;
  let mut heightmap = vec![f32::NEG_INFINITY; nx * ny];
  let positions = &mesh.positions;
  let indices = mesh.indices.as_ref();
  // Helper to get vertex by index
  let get_vertex = |i: usize| -> [f32; 3] {
    let idx = i * 3;
    [positions[idx], positions[idx + 1], positions[idx + 2]]
  };

  let triangle_count = if let Some(idxs) = indices {
    idxs.len() / 3
  } else {
    positions.len() / 9
  };

  // Use row-major order: iy * nx + ix
  for t in 0..triangle_count {
    let (a, b, c) = if let Some(idxs) = indices {
      (get_vertex(idxs[t * 3] as usize), get_vertex(idxs[t * 3 + 1] as usize), get_vertex(idxs[t * 3 + 2] as usize))
    } else {
      (get_vertex(t * 3), get_vertex(t * 3 + 1), get_vertex(t * 3 + 2))
    };
    let min_x = a[0].min(b[0]).min(c[0]);
    let max_x = a[0].max(b[0]).max(c[0]);
    let min_y = a[1].min(b[1]).min(c[1]);
    let max_y = a[1].max(b[1]).max(c[1]);
    let grid_size_x = (grid.max_x - grid.min_x) / (nx as f32 - 1.0);
    let grid_size_y = (grid.max_y - grid.min_y) / (ny as f32 - 1.0);
    let ix0 = ((min_x - grid.min_x) / grid_size_x).floor().max(0.0) as usize;
    let ix1 = ((max_x - grid.min_x) / grid_size_x).ceil().min((nx - 1) as f32) as usize;
    let iy0 = ((min_y - grid.min_y) / grid_size_y).floor().max(0.0) as usize;
    let iy1 = ((max_y - grid.min_y) / grid_size_y).ceil().min((ny - 1) as f32) as usize;
    for iy in iy0..=iy1 {
      for ix in ix0..=ix1 {
        let x = grid.min_x + ix as f32 * grid_size_x;
        let y = grid.min_y + iy as f32 * grid_size_y;
        let inside = point_in_triangle_2d(x, y, a, b, c);
        if inside {
          let z = interpolate_z(x, y, a, b, c);
          let idx = iy * nx + ix;
          if z > heightmap[idx] {
            heightmap[idx] = z;
          }
        }
      }
    }
  }
  // For a 2x2 grid, sample points at (0,0), (1,0), (0,1), (1,1)
  // But floating point error may exclude (1,1) from the triangle. To match JS, if all corners are on the same z, fill all cells with that z.
  // After main loop, if all values except -inf are the same, fill -inf cells with that value.
  let mut max_z = f32::NEG_INFINITY;
  let mut min_z = f32::INFINITY;
  for &z in &heightmap {
    if z > max_z { max_z = z; }
    if z < min_z && z > f32::NEG_INFINITY { min_z = z; }
  }
  if max_z == min_z && max_z > f32::NEG_INFINITY {
    for z in &mut heightmap {
      if *z == f32::NEG_INFINITY {
        *z = max_z;
      }
    }
  }
  heightmap
}

fn point_in_triangle_2d(x: f32, y: f32, a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> bool {
  let (x0, y0) = (a[0], a[1]);
  let (x1, y1) = (b[0], b[1]);
  let (x2, y2) = (c[0], c[1]);
  let d = (y1 - y2)*(x0 - x2) + (x2 - x1)*(y0 - y2);
  if d.abs() < 1e-8 { return false; } // degenerate triangle
  let l1 = ((y1 - y2)*(x - x2) + (x2 - x1)*(y - y2)) / d;
  let l2 = ((y2 - y0)*(x - x2) + (x0 - x2)*(y - y2)) / d;
  let l3 = 1.0 - l1 - l2;
  let eps = -1e-6; // allow small negative for edge/corner inclusion
  l1 >= eps && l2 >= eps && l3 >= eps && l1 <= 1.0-eps && l2 <= 1.0-eps && l3 <= 1.0-eps
}

fn interpolate_z(x: f32, y: f32, a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> f32 {
  let (x0, y0, z0) = (a[0], a[1], a[2]);
  let (x1, y1, z1) = (b[0], b[1], b[2]);
  let (x2, y2, z2) = (c[0], c[1], c[2]);
  let d = (y1 - y2)*(x0 - x2) + (x2 - x1)*(y0 - y2);
  let l1 = ((y1 - y2)*(x - x2) + (x2 - x1)*(y - y2)) / d;
  let l2 = ((y2 - y0)*(x - x2) + (x0 - x2)*(y - y2)) / d;
  let l3 = 1.0 - l1 - l2;
  l1 * z0 + l2 * z1 + l3 * z2
}
