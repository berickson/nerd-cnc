/**
 * Rasterizes a triangle onto a 2D grid and calls update_fn for each covered cell.
 *
 * @param {Array<{x: number, y: number, z: number}>} triangle - Array of 3 vertices, each with x, y, z.
 * @param {Object} grid - Grid definition:
 *   @param {number} grid.min_x - Minimum X of the grid.
 *   @param {number} grid.max_x - Maximum X of the grid.
 *   @param {number} grid.min_y - Minimum Y of the grid.
 *   @param {number} grid.max_y - Maximum Y of the grid.
 *   @param {number} grid.res_x - Number of cells in X direction.
 *   @param {number} grid.res_y - Number of cells in Y direction.
 * @param {function(ix: number, iy: number, z: number): void} update_fn - Called for each grid cell (ix, iy) covered by the triangle, with the interpolated z value at that cell.
 */
function point_in_triangle(px, py, v0, v1, v2, eps = 1e-8) {
  // Barycentric coordinates
  const dX = px - v2.x;
  const dY = py - v2.y;
  const dX21 = v2.x - v1.x;
  const dY12 = v1.y - v2.y;
  const D = dY12 * (v0.x - v2.x) + dX21 * (v0.y - v2.y);
  const s = dY12 * dX + dX21 * dY;
  const t = (v2.y - v0.y) * dX + (v0.x - v2.x) * dY;
  if (D < 0) return s <= eps && t <= eps && s + t >= D - eps;
  return s >= -eps && t >= -eps && s + t <= D + eps;
}

function cell_overlaps_triangle(ix, iy, grid, v0, v1, v2) {
  // Get cell corners
  const x0 = grid.min_x + ix * (grid.max_x - grid.min_x) / grid.res_x;
  const x1 = grid.min_x + (ix + 1) * (grid.max_x - grid.min_x) / grid.res_x;
  const y0 = grid.min_y + iy * (grid.max_y - grid.min_y) / grid.res_y;
  const y1 = grid.min_y + (iy + 1) * (grid.max_y - grid.min_y) / grid.res_y;

  // Check if any triangle vertex is inside the cell
  for (const v of [v0, v1, v2]) {
    if (v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1) return true;
  }
  // Check if any cell corner is inside the triangle
  for (const [cx, cy] of [
    [x0, y0], [x1, y0], [x0, y1], [x1, y1]
  ]) {
    if (point_in_triangle(cx, cy, v0, v1, v2)) return true;
  }
  return false;
}
function barycentric_z(px, py, v0, v1, v2) {
  // Compute barycentric coordinates for (px, py)
  const denom = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
  const w1 = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / denom;
  const w2 = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / denom;
  const w3 = 1 - w1 - w2;
  return w1 * v0.z + w2 * v1.z + w3 * v2.z;
}

/**
 * Rasterizes a triangle onto a 2D grid and calls update_fn for each covered cell.
 *
 * @param {Array<{x: number, y: number, z: number}>} triangle - Array of 3 vertices, each with x, y, z.
 * @param {Object} grid - Grid definition:
 *   @param {number} grid.min_x - Minimum X of the grid.
 *   @param {number} grid.max_x - Maximum X of the grid.
 *   @param {number} grid.min_y - Minimum Y of the grid.
 *   @param {number} grid.max_y - Maximum Y of the grid.
 *   @param {number} grid.res_x - Number of cells in X direction.
 *   @param {number} grid.res_y - Number of cells in Y direction.
 * @param {function(ix: number, iy: number, z: number): void} update_fn - Called for each grid cell (ix, iy) covered by the triangle, with the interpolated z value at that cell.
 */
function sample_triangle(triangle, grid, update_fn) {
  const [v0, v1, v2] = triangle;
  // Compute bounding box in grid coordinates
  const min_x = Math.max(0, Math.floor((Math.min(v0.x, v1.x, v2.x) - grid.min_x) / (grid.max_x - grid.min_x) * grid.res_x));
  const max_x = Math.min(grid.res_x - 1, Math.ceil((Math.max(v0.x, v1.x, v2.x) - grid.min_x) / (grid.max_x - grid.min_x) * grid.res_x));
  const min_y = Math.max(0, Math.floor((Math.min(v0.y, v1.y, v2.y) - grid.min_y) / (grid.max_y - grid.min_y) * grid.res_y));
  const max_y = Math.min(grid.res_y - 1, Math.ceil((Math.max(v0.y, v1.y, v2.y) - grid.min_y) / (grid.max_y - grid.min_y) * grid.res_y));

  for (let ix = min_x; ix <= max_x; ix++) {
    for (let iy = min_y; iy <= max_y; iy++) {
      // Use cell center for test
      const x = grid.min_x + (ix + 0.5) * (grid.max_x - grid.min_x) / grid.res_x;
      const y = grid.min_y + (iy + 0.5) * (grid.max_y - grid.min_y) / grid.res_y;
      // Use a slightly relaxed epsilon to include edge/vertex cases
      const eps = 1e-7;
      if (point_in_triangle(x, y, v0, v1, v2, eps)) {
        const z = barycentric_z(x, y, v0, v1, v2);
        update_fn(ix, iy, z);
      }
    }
  }
}

module.exports = { sample_triangle };