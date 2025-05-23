const { sample_triangle } = require('./sample_triangle');

/**
 * Builds a heightmap from a mesh's triangles.
 * @param {Object} geometry - THREE.BufferGeometry or similar with .attributes.position.
 * @param {Object} grid - { min_x, max_x, min_y, max_y, res_x, res_y }
 * @returns {number[][]} heightmap[y][x] = max z at that cell
 */
function heightmap_from_mesh(geometry, grid) {
  // Initialize heightmap with -Infinity
  const heightmap = [];
  for (let iy = 0; iy < grid.res_y; iy++) {
    heightmap[iy] = [];
    for (let ix = 0; ix < grid.res_x; ix++) {
      heightmap[iy][ix] = -Infinity;
    }
  }

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const triangle = [
      { x: pos.getX(i),     y: pos.getY(i),     z: pos.getZ(i) },
      { x: pos.getX(i + 1), y: pos.getY(i + 1), z: pos.getZ(i + 1) },
      { x: pos.getX(i + 2), y: pos.getY(i + 2), z: pos.getZ(i + 2) }
    ];
    sample_triangle(triangle, grid, (ix, iy, z) => {
      if (z > heightmap[iy][ix]) {
        heightmap[iy][ix] = z;
      }
    });
  }
  // log unset cells
//   for (let iy = 0; iy < grid.res_y; iy++) {
//   for (let ix = 0; ix < grid.res_x; ix++) {
//     if (heightmap[iy][ix] === -Infinity) {
//       console.log(`Unset cell: (${ix},${iy})`);
//     }
//   }
// }

  return heightmap;
}

module.exports = { heightmap_from_mesh };