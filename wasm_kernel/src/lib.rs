use wasm_bindgen::prelude::*;

mod simulate_material_removal;
mod minimal;
mod heightmap_to_solid_mesh;
mod heightmap_from_mesh;

pub use simulate_material_removal::simulate_material_removal;
pub use simulate_material_removal::simulate_material_removal_wasm;
pub use minimal::double_array;
pub use heightmap_to_solid_mesh::heightmap_to_solid_mesh_wasm;

use heightmap_from_mesh::{MeshRust, HeightmapGridRust, heightmap_from_mesh_rust};
use js_sys::{Float32Array, Uint32Array};

#[wasm_bindgen]
pub fn heightmap_from_mesh_wasm(
  positions: &Float32Array,
  indices: Option<Uint32Array>,
  min_x: f32,
  max_x: f32,
  min_y: f32,
  max_y: f32,
  res_x: usize,
  res_y: usize
) -> Float32Array {
  let positions_vec = positions.to_vec();
  let indices_vec = indices.map(|arr| arr.to_vec());
  let mesh = MeshRust {
    positions: positions_vec,
    indices: indices_vec,
  };
  let grid = HeightmapGridRust {
    min_x, max_x, min_y, max_y, res_x, res_y
  };
  let heightmap = heightmap_from_mesh_rust(&mesh, &grid);
  Float32Array::from(heightmap.as_slice())
}
