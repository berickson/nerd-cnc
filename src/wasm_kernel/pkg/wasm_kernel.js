// Jest manual mock for WASM kernel
module.exports = {
  heightmap_from_mesh_wasm: (positions, indices, min_x, max_x, min_y, max_y, res_x, res_y) => {
    // Return a flat Float32Array filled with 1s for test shape (res_x * res_y)
    const arr = new Float32Array(res_x * res_y);
    arr.fill(1);
    return arr;
  },
  generate_safe_toolpath_wasm: (heightmap, nx, ny, grid_size, origin_x, origin_y, tool_type, cutter_diameter, v_angle_deg, toolpath_xy) => {
    // Return a flat Float32Array of zeros for test shape (toolpath_xy.length / 2)
    const arr = new Float32Array(toolpath_xy.length / 2);
    arr.fill(0);
    return arr;
  },
  default: () => {},
};
