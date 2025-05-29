// Jest manual mock for WASM kernel
module.exports = {
  heightmap_from_mesh_wasm: (positions, indices, min_x, max_x, min_y, max_y, res_x, res_y) => {
    // Return a flat Float32Array filled with 1s for test shape (res_x * res_y)
    const arr = new Float32Array(res_x * res_y);
    arr.fill(1);
    return arr;
  },
  default: () => {},
};
