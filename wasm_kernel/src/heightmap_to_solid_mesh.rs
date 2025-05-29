// Rust unit tests for heightmap_to_solid_mesh equivalent
// This test should parallel the JS tests in stock_simulator.test.js

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn mesh_vertices_are_in_world_coordinates() {
    // width, height, grid_cells_x, grid_cells_y, initial_height, origin_x, origin_y
    let stock = create_heightmap_stock(10.0, 10.0, 11, 11, 5.0, -60.0, -50.0);
    let min_z = 0.0;
    let mesh = heightmap_to_solid_mesh(&stock, min_z);
    // First top vertex should be at (-60, -50, 5)
    let pos = &mesh.positions;
    assert!((pos[0] - -60.0).abs() < 1e-6);
    assert!((pos[1] - -50.0).abs() < 1e-6);
    assert!((pos[2] - 5.0).abs() < 1e-6);
    // First bottom vertex should be at (-60, -50, min_z)
    let nxy = 11 * 11;
    assert!((pos[nxy * 3 + 0] - -60.0).abs() < 1e-6);
    assert!((pos[nxy * 3 + 1] - -50.0).abs() < 1e-6);
    assert!((pos[nxy * 3 + 2] - min_z).abs() < 1e-6);
  }

  #[test]
  fn mesh_normals_point_up_for_flat_top() {
    let stock = create_heightmap_stock(10.0, 10.0, 11, 11, 5.0, 0.0, 0.0);
    let mesh = heightmap_to_solid_mesh(&stock, 0.0);
    let normals = &mesh.normals;
    assert!(normals[2] > 0.9); // z component close to 1
    assert!(normals[0].abs() < 0.1); // x component close to 0
    assert!(normals[1].abs() < 0.1); // y component close to 0
  }

  #[test]
  fn mesh_large_grid_does_not_panic() {
    let width = 100.0;
    let height = 100.0;
    let grid_cells_x = 2001;
    let grid_cells_y = 2001;
    let stock = create_heightmap_stock(width, height, grid_cells_x, grid_cells_y, 5.0, 0.0, 0.0);
    let min_z = 0.0;
    let mesh = heightmap_to_solid_mesh(&stock, min_z);
    let n_vertices = mesh.positions.len() / 3;
    assert!(n_vertices > 1_000_000);
    assert!(n_vertices < 20_000_000);
  }
}

#[derive(Debug)]
pub struct Stock {
  pub width: f32,
  pub height: f32,
  pub grid_cells_x: usize,
  pub grid_cells_y: usize,
  pub grid_size_x: f32,
  pub grid_size_y: f32,
  pub origin_x: f32,
  pub origin_y: f32,
  pub heights: Vec<f32>, // row-major: ix * ny + iy
}

impl Stock {
  pub fn get_height(&self, x: f32, y: f32) -> f32 {
    let ix = ((x - self.origin_x) / self.grid_size_x).round() as isize;
    let iy = ((y - self.origin_y) / self.grid_size_y).round() as isize;
    if ix < 0 || iy < 0 || (ix as usize) >= self.grid_cells_x || (iy as usize) >= self.grid_cells_y {
      return 0.0;
    }
    self.heights[ix as usize * self.grid_cells_y + iy as usize]
  }
}

pub fn create_heightmap_stock(
  width: f32,
  height: f32,
  grid_cells_x: usize,
  grid_cells_y: usize,
  initial_height: f32,
  origin_x: f32,
  origin_y: f32,
) -> Stock {
  let grid_size_x = width / (grid_cells_x as f32 - 1.0);
  let grid_size_y = height / (grid_cells_y as f32 - 1.0);
  let heights = vec![initial_height; grid_cells_x * grid_cells_y];
  Stock {
    width,
    height,
    grid_cells_x,
    grid_cells_y,
    grid_size_x,
    grid_size_y,
    origin_x,
    origin_y,
    heights,
  }
}

pub struct Mesh {
  pub positions: Vec<f32>,
  pub indices: Vec<u32>,
  pub normals: Vec<f32>,
}

pub fn heightmap_to_solid_mesh(stock: &Stock, min_z: f32) -> Mesh {
  let nx = stock.grid_cells_x;
  let ny = stock.grid_cells_y;
  let grid_size_x = stock.grid_size_x;
  let grid_size_y = stock.grid_size_y;
  let num_top_vertices = nx * ny;
  let mut positions = Vec::with_capacity(num_top_vertices * 3 * 3); // top, bottom, duplicated top
  let mut indices = Vec::new();

  // Generate top vertices (z from heightmap)
  for ix in 0..nx {
    for iy in 0..ny {
      let x = stock.origin_x + ix as f32 * grid_size_x;
      let y = stock.origin_y + iy as f32 * grid_size_y;
      let z = stock.get_height(x, y);
      positions.push(x);
      positions.push(y);
      positions.push(z);
    }
  }
  // Generate bottom vertices (z = min_z)
  for ix in 0..nx {
    for iy in 0..ny {
      let x = stock.origin_x + ix as f32 * grid_size_x;
      let y = stock.origin_y + iy as f32 * grid_size_y;
      positions.push(x);
      positions.push(y);
      positions.push(min_z);
    }
  }
  // Helper: get vertex index
  let idx = |ix: usize, iy: usize, top: bool| -> usize {
    (if top { 0 } else { num_top_vertices }) + ix * ny + iy
  };
  // Top and bottom faces
  for ix in 0..(nx - 1) {
    for iy in 0..(ny - 1) {
      // Top face (upward normals)
      let a = idx(ix, iy, true) as u32;
      let b = idx(ix + 1, iy, true) as u32;
      let c = idx(ix + 1, iy + 1, true) as u32;
      let d = idx(ix, iy + 1, true) as u32;
      indices.extend_from_slice(&[a, b, d, b, c, d]);
      // Bottom face (downward normals, reverse winding)
      let a2 = idx(ix, iy, false) as u32;
      let b2 = idx(ix + 1, iy, false) as u32;
      let c2 = idx(ix + 1, iy + 1, false) as u32;
      let d2 = idx(ix, iy + 1, false) as u32;
      indices.extend_from_slice(&[a2, d2, b2, b2, d2, c2]);
    }
  }
  // Duplicate top vertices for use in side faces to get sharp normals
  let side_top_offset = positions.len() / 3;
  for ix in 0..nx {
    for iy in 0..ny {
      let x = stock.origin_x + ix as f32 * grid_size_x;
      let y = stock.origin_y + iy as f32 * grid_size_y;
      let z = stock.get_height(x, y);
      positions.push(x);
      positions.push(y);
      positions.push(z);
    }
  }
  // Side faces
  // Left edge (ix = 0)
  for iy in 0..(ny - 1) {
    let top_a = side_top_offset + idx(0, iy, true);
    let top_b = side_top_offset + idx(0, iy + 1, true);
    let bot_a = idx(0, iy, false);
    let bot_b = idx(0, iy + 1, false);
    indices.extend_from_slice(&[top_a as u32, top_b as u32, bot_a as u32, bot_a as u32, top_b as u32, bot_b as u32]);
  }
  // Right edge (ix = nx-1)
  for iy in 0..(ny - 1) {
    let top_a = side_top_offset + idx(nx - 1, iy, true);
    let top_b = side_top_offset + idx(nx - 1, iy + 1, true);
    let bot_a = idx(nx - 1, iy, false);
    let bot_b = idx(nx - 1, iy + 1, false);
    indices.extend_from_slice(&[top_a as u32, bot_a as u32, top_b as u32, top_b as u32, bot_a as u32, bot_b as u32]);
  }
  // Front edge (iy = 0)
  for ix in 0..(nx - 1) {
    let top_a = side_top_offset + idx(ix, 0, true);
    let top_b = side_top_offset + idx(ix + 1, 0, true);
    let bot_a = idx(ix, 0, false);
    let bot_b = idx(ix + 1, 0, false);
    indices.extend_from_slice(&[top_a as u32, bot_a as u32, top_b as u32, top_b as u32, bot_a as u32, bot_b as u32]);
  }
  // Back edge (iy = ny-1)
  for ix in 0..(nx - 1) {
    let top_a = side_top_offset + idx(ix, ny - 1, true);
    let top_b = side_top_offset + idx(ix + 1, ny - 1, true);
    let bot_a = idx(ix, ny - 1, false);
    let bot_b = idx(ix + 1, ny - 1, false);
    indices.extend_from_slice(&[top_a as u32, top_b as u32, bot_a as u32, bot_a as u32, top_b as u32, bot_b as u32]);
  }
  // Compute normals (per-vertex, averaged from faces)
  let n_verts = positions.len() / 3;
  let mut normals = vec![0.0f32; positions.len()];
  for tri in indices.chunks(3) {
    let ia = tri[0] as usize;
    let ib = tri[1] as usize;
    let ic = tri[2] as usize;
    let ax = positions[ia * 3];
    let ay = positions[ia * 3 + 1];
    let az = positions[ia * 3 + 2];
    let bx = positions[ib * 3];
    let by = positions[ib * 3 + 1];
    let bz = positions[ib * 3 + 2];
    let cx = positions[ic * 3];
    let cy = positions[ic * 3 + 1];
    let cz = positions[ic * 3 + 2];
    let v1 = [bx - ax, by - ay, bz - az];
    let v2 = [cx - ax, cy - ay, cz - az];
    let nx = v1[1] * v2[2] - v1[2] * v2[1];
    let ny = v1[2] * v2[0] - v1[0] * v2[2];
    let nz = v1[0] * v2[1] - v1[1] * v2[0];
    for &i in &[ia, ib, ic] {
      normals[i * 3] += nx;
      normals[i * 3 + 1] += ny;
      normals[i * 3 + 2] += nz;
    }
  }
  // Normalize normals
  for i in 0..n_verts {
    let nx = normals[i * 3];
    let ny = normals[i * 3 + 1];
    let nz = normals[i * 3 + 2];
    let mag = (nx * nx + ny * ny + nz * nz).sqrt();
    if mag > 1e-8 {
      normals[i * 3] /= mag;
      normals[i * 3 + 1] /= mag;
      normals[i * 3 + 2] /= mag;
    }
  }
  Mesh { positions, indices, normals }
}

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Uint32Array, Object, Array};

#[wasm_bindgen]
pub fn heightmap_to_solid_mesh_wasm(
  heights: &Float32Array,
  width: f32,
  height: f32,
  grid_cells_x: usize,
  grid_cells_y: usize,
  origin_x: f32,
  origin_y: f32,
  min_z: f32,
) -> Object {
  // Assumptions: heights is row-major, length = grid_cells_x * grid_cells_y
  let mut heights_vec = vec![0.0; heights.length() as usize];
  heights.copy_to(&mut heights_vec);
  let grid_size_x = width / (grid_cells_x as f32 - 1.0);
  let grid_size_y = height / (grid_cells_y as f32 - 1.0);
  let stock = Stock {
    width,
    height,
    grid_cells_x,
    grid_cells_y,
    grid_size_x,
    grid_size_y,
    origin_x,
    origin_y,
    heights: heights_vec,
  };
  let mesh = heightmap_to_solid_mesh(&stock, min_z);
  // Convert to JS arrays
  let positions = Float32Array::from(mesh.positions.as_slice());
  let indices = Uint32Array::from(mesh.indices.as_slice());
  let normals = Float32Array::from(mesh.normals.as_slice());
  let result = Object::new();
  js_sys::Reflect::set(&result, &"positions".into(), &positions).unwrap();
  js_sys::Reflect::set(&result, &"indices".into(), &indices).unwrap();
  js_sys::Reflect::set(&result, &"normals".into(), &normals).unwrap();
  result
}
