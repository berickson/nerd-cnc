use wasm_bindgen::prelude::*;
use js_sys::Float32Array;

#[wasm_bindgen]
pub fn double_array(input: &Float32Array) -> Float32Array {
  let mut v = input.to_vec();
  for x in &mut v {
    *x *= 2.0;
  }
  Float32Array::from(v.as_slice())
}

#[wasm_bindgen]
pub fn add_one(n: i32) -> i32 {
  // Simple test: add one to integer
  n + 1
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
  // Simple test: return greeting string
  format!("Hello, {}!", name)
}
