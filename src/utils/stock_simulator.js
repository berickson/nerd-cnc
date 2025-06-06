// Heightmap-based stock simulation for 2.5D CNC
// All units are mm unless otherwise noted

// Create a heightmap stock object
// width, height: mm, grid_cells_x: int, grid_cells_y: int, initial_height: mm
// origin_x, origin_y: world coordinates of the lower-left corner (default 0,0)
function create_heightmap_stock(width, height, grid_cells_x, grid_cells_y, initial_height, origin_x = 0, origin_y = 0) {
  // grid_cells_x/y are the number of grid points (not spacing)
  const nx = grid_cells_x;
  const ny = grid_cells_y;
  const grid_size_x = width / (nx - 1);
  const grid_size_y = height / (ny - 1);
  const heights = Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => initial_height)
  );

  // Get the height at world (x, y)
  function get_height(x, y) {
    // Map world x/y to grid indices using origin and per-axis spacing
    const ix = Math.round((x - origin_x) / grid_size_x);
    const iy = Math.round((y - origin_y) / grid_size_y);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return 0;
    // console.log(`Mapping world coordinates (${x}, ${y}) to grid indices (${ix}, ${iy})`);
    return heights[ix][iy];
  }

  // Set the height at world (x, y)
  function set_height(x, y, z) {
    const ix = Math.round((x - origin_x) / grid_size_x);
    const iy = Math.round((y - origin_y) / grid_size_y);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
    heights[ix][iy] = z;
  }

  return {
    get_height,
    set_height,
    width,
    height,
    grid_cells_x: nx,
    grid_cells_y: ny,
    grid_size_x,
    grid_size_y,
    origin_x,
    origin_y
  };
}

// WASM kernel import and async init
let wasm_mod = null;
let wasm_ready = false;
const is_jest = typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID !== undefined;
if (!is_jest) {
  (async () => {
    try {
      wasm_mod = await import('../../wasm_kernel/pkg/wasm_kernel.js');
      if (wasm_mod && wasm_mod.default) {
        await wasm_mod.default(); // ensure WASM is initialized
      }
      wasm_ready = true;
      console.log('[stock_simulator] WASM kernel loaded');
    } catch (e) {
      console.warn('[stock_simulator] Failed to load WASM kernel, falling back to JS:', e);
      wasm_mod = null;
      wasm_ready = false;
    }
  })();
}

// WASM-backed mesh generator
function heightmap_to_solid_mesh(stock, min_z) {
  // Use WASM if available and ready
  if (wasm_mod && wasm_ready && wasm_mod.heightmap_to_solid_mesh_wasm) {
    try {
      // Convert 2D heights to flat Float32Array (row-major)
      const nx = stock.grid_cells_x;
      const ny = stock.grid_cells_y;
      let heights = new Float32Array(nx * ny);
      for (let ix = 0; ix < nx; ix++) {
        for (let iy = 0; iy < ny; iy++) {
          heights[ix * ny + iy] = stock.get_height(
            stock.origin_x + ix * stock.grid_size_x,
            stock.origin_y + iy * stock.grid_size_y
          );
        }
      }
      const result = wasm_mod.heightmap_to_solid_mesh_wasm(
        heights,
        stock.width,
        stock.height,
        nx,
        ny,
        stock.origin_x,
        stock.origin_y,
        min_z
      );
      const THREE = require('three');
      const positions = result.positions;
      const indices = result.indices;
      const normals = result.normals;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      const material = new THREE.MeshPhongMaterial({
        color: 0x229922,
        shininess: 80,
        specular: 0xdddddd,
        side: THREE.DoubleSide,
        transparent: false
      });
      return new THREE.Mesh(geometry, material);
    } catch (e) {
      console.warn('[stock_simulator] WASM mesh generation failed, falling back to JS:', e);
      alert('[stock_simulator] WASM mesh generation failed, falling back to JS. Check console for details.');
    }
  }
  // Fallback: use JS version
  const THREE = require('three');
  // Use grid_cells_x/y and grid_size_x/y for clarity
  const nx = stock.grid_cells_x;
  const ny = stock.grid_cells_y;
  const grid_size_x = stock.grid_size_x;
  const grid_size_y = stock.grid_size_y;
  // Cap maximum allowed vertices/faces to avoid JS array overflow
  const max_vertices = 50_000_000;
  const max_faces = 160_000_000;
  const num_top_vertices = nx * ny;
  const num_total_vertices = num_top_vertices * 3; // top, bottom, duplicated top
  if (num_total_vertices > max_vertices) {
    throw new Error(`heightmap_to_solid_mesh: grid too fine, would create ${num_total_vertices} vertices (limit ${max_vertices}). Reduce grid resolution.`);
  }
  // Estimate faces: each cell = 12 triangles (top+bottom+4 sides)
  const num_faces = (nx - 1) * (ny - 1) * 12;
  if (num_faces > max_faces) {
    throw new Error(`heightmap_to_solid_mesh: grid too fine, would create ${num_faces} faces (limit ${max_faces}). Reduce grid resolution.`);
  }
  const positions = [];
  const indices = [];

  // Generate top vertices (z from heightmap)
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const x = stock.origin_x + ix * grid_size_x;
      const y = stock.origin_y + iy * grid_size_y;
      const z = stock.get_height(x, y);
      positions.push(x, y, z);
    }
  }

  // Generate bottom vertices (z = min_z)
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const x = stock.origin_x + ix * grid_size_x;
      const y = stock.origin_y + iy * grid_size_y;
      positions.push(x, y, min_z);
    }
  }

  // Helper: get vertex index
  // top: true for top plane, false for bottom plane
  // Vertex indexing: top plane vertices come first, then bottom plane vertices.
  function idx(ix, iy, top) {
    return (top ? 0 : num_top_vertices) + ix * ny + iy;
  }

  // Top and bottom faces
  for (let ix = 0; ix < nx - 1; ix++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      // Top face (upward normals)
      const a = idx(ix, iy, true);
      const b = idx(ix + 1, iy, true);
      const c = idx(ix + 1, iy + 1, true);
      const d = idx(ix, iy + 1, true);
      indices.push(a, b, d, b, c, d);

      // Bottom face (downward normals, reverse winding)
      const a2 = idx(ix, iy, false);
      const b2 = idx(ix + 1, iy, false);
      const c2 = idx(ix + 1, iy + 1, false);
      const d2 = idx(ix, iy + 1, false);
      indices.push(a2, d2, b2, b2, d2, c2);
    }
  }

  // Duplicate top vertices for use in side faces to get sharp normals
  const side_top_offset = positions.length / 3;
  for (let i = 0; i < num_top_vertices; i++) {
    positions.push(
      positions[i * 3 + 0],
      positions[i * 3 + 1],
      positions[i * 3 + 2]
    );
  }

  // Side faces:
  // Use duplicated top vertices (offset by side_top_offset) and original bottom vertices.

  // Left edge (ix = 0)
  for (let iy = 0; iy < ny - 1; iy++) {
    const top_a = side_top_offset + idx(0, iy, true);
    const top_b = side_top_offset + idx(0, iy + 1, true);
    const bot_a = idx(0, iy, false);
    const bot_b = idx(0, iy + 1, false);
    indices.push(top_a, top_b, bot_a, bot_a, top_b, bot_b);
  }
  // Right edge (ix = nx-1)
  for (let iy = 0; iy < ny - 1; iy++) {
    const top_a = side_top_offset + idx(nx - 1, iy, true);
    const top_b = side_top_offset + idx(nx - 1, iy + 1, true);
    const bot_a = idx(nx - 1, iy, false);
    const bot_b = idx(nx - 1, iy + 1, false);
    indices.push(top_a, bot_a, top_b, top_b, bot_a, bot_b);
  }
  // Front edge (iy = 0)
  for (let ix = 0; ix < nx - 1; ix++) {
    const top_a = side_top_offset + idx(ix, 0, true);
    const top_b = side_top_offset + idx(ix + 1, 0, true);
    const bot_a = idx(ix, 0, false);
    const bot_b = idx(ix + 1, 0, false);
    indices.push(top_a, bot_a, top_b, top_b, bot_a, bot_b);
  }
  // Back edge (iy = ny-1)
  for (let ix = 0; ix < nx - 1; ix++) {
    const top_a = side_top_offset + idx(ix, ny - 1, true);
    const top_b = side_top_offset + idx(ix + 1, ny - 1, true);
    const bot_a = idx(ix, ny - 1, false);
    const bot_b = idx(ix + 1, ny - 1, false);
    indices.push(top_a, top_b, bot_a, bot_a, top_b, bot_b);
  }

  const stock_geometry = new THREE.BufferGeometry();
  stock_geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  stock_geometry.setIndex(indices);
  stock_geometry.computeVertexNormals();

  const stock_material = new THREE.MeshPhongMaterial({
    color: 0x229922,
    shininess: 80,
    specular: 0xdddddd,
    side: THREE.DoubleSide,
    transparent: false
  });

  return new THREE.Mesh(stock_geometry, stock_material);
}

// WASM-backed simulation wrapper
function simulate_material_removal(stock, tool, toolpath) {
  // Use WASM if available and ready
  if (wasm_mod && wasm_ready && wasm_mod.simulate_material_removal_wasm) {
    try {
      // Convert stock heights to Float32Array if needed
      let heightmap = stock.heightmap;
      if (!heightmap) {
        // Convert 2D array to flat Float32Array (row-major)
        const nx = Math.round(stock.width / stock.grid_size_x) + 1;
        const ny = Math.round(stock.height / stock.grid_size_y) + 1;
        heightmap = new Float32Array(nx * ny);
        for (let ix = 0; ix < nx; ix++) {
          for (let iy = 0; iy < ny; iy++) {
            heightmap[ix * ny + iy] = stock.get_height(
              stock.origin_x + ix * stock.grid_size_x,
              stock.origin_y + iy * stock.grid_size_y
            );
          }
        }
        stock.heightmap = heightmap;
      }
      // Prepare toolpath as flat Float32Array
      let flat_toolpath;
      if (Array.isArray(toolpath) && toolpath.length > 0 && typeof toolpath[0] === 'object') {
        flat_toolpath = new Float32Array(toolpath.length * 3);
        for (let i = 0; i < toolpath.length; i++) {
          flat_toolpath[i * 3 + 0] = toolpath[i].x;
          flat_toolpath[i * 3 + 1] = toolpath[i].y;
          flat_toolpath[i * 3 + 2] = toolpath[i].z;
        }
      } else if (toolpath instanceof Float32Array) {
        flat_toolpath = toolpath;
      } else {
        flat_toolpath = new Float32Array(toolpath);
      }
      wasm_mod.simulate_material_removal_wasm(
        heightmap,
        Math.round(stock.width / stock.grid_size_x) + 1,
        Math.round(stock.height / stock.grid_size_y) + 1,
        stock.grid_size_x,
        stock.origin_x,
        stock.origin_y,
        tool.type,
        tool.cutter_diameter,
        tool.v_angle || 0,
        flat_toolpath
      );
      // WASM mutates heightmap in-place; update stock.get_height/set_height if needed
      stock.get_height = function(x, y) {
        const ix = Math.round((x - stock.origin_x) / stock.grid_size_x);
        const iy = Math.round((y - stock.origin_y) / stock.grid_size_y);
        const nx = Math.round(stock.width / stock.grid_size_x) + 1;
        const ny = Math.round(stock.height / stock.grid_size_y) + 1;
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return 0;
        return heightmap[ix * ny + iy];
      };
      stock.set_height = function(x, y, z) {
        const ix = Math.round((x - stock.origin_x) / stock.grid_size_x);
        const iy = Math.round((y - stock.origin_y) / stock.grid_size_y);
        const nx = Math.round(stock.width / stock.grid_size_x) + 1;
        const ny = Math.round(stock.height / stock.grid_size_y) + 1;
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
        heightmap[ix * ny + iy] = z;
      };
      return;
    } catch (e) {
      console.warn('[stock_simulator] WASM simulation failed, falling back to JS:', e);
    }
  }
  // Fallback: use JS version
  old__see_rust_version_simulate_material_removal(stock, tool, toolpath);
}

module.exports = {
  create_heightmap_stock,
  heightmap_to_solid_mesh,
  simulate_material_removal
};