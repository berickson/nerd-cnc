use wasm_bindgen::prelude::*;

mod simulate_material_removal;
mod minimal;

pub use simulate_material_removal::simulate_material_removal;
pub use simulate_material_removal::simulate_material_removal_wasm;
pub use minimal::double_array;
