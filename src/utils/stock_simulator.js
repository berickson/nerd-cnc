// Heightmap-based stock simulation for 2.5D CNC
// All units are mm unless otherwise noted

// Create a heightmap stock object
// width, height: mm, grid_size: mm, initial_height: mm
// origin_x, origin_y: world coordinates of the lower-left corner (default 0,0)
function create_heightmap_stock(width, height, grid_size, initial_height, origin_x = 0, origin_y = 0) {
  // Ensure grid includes both origin and far corner
  // Assumption: width/height are the full extents, so we need (max - min) / grid_size + 1 cells
  const nx = Math.round(width / grid_size) + 1;
  const ny = Math.round(height / grid_size) + 1;
  const heights = Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => initial_height)
  );

  // Get the height at world (x, y)
  function get_height(x, y) {
    // Map world x/y to grid indices using origin
    const ix = Math.round((x - origin_x) / grid_size);
    const iy = Math.round((y - origin_y) / grid_size);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return 0;
    console.log(`Mapping world coordinates (${x}, ${y}) to grid indices (${ix}, ${iy})`);
    return heights[ix][iy];
  }

  // Set the height at world (x, y)
  function set_height(x, y, z) {
    const ix = Math.round((x - origin_x) / grid_size);
    const iy = Math.round((y - origin_y) / grid_size);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
    heights[ix][iy] = z;
  }

  return {
    get_height,
    set_height,
    width,
    height,
    grid_size,
    origin_x,
    origin_y
  };
}

// Simulate material removal for a flat, ball, or vbit endmill along a toolpath
// Assumptions:
// - Tool zero position is the center of the tip (x, y, z)
// - Only update grid cells if the new z is lower than the current height
// - Flat: cuts a flat-bottomed cylinder at z=pt.z
// - Ball: cuts a hemisphere, tip at z=pt.z, surface at z=pt.z + sqrt(r^2 - d^2) - r
// - V-bit: cuts a cone, tip at z=pt.z, surface at z=pt.z + d / tan(v_angle/2)
function simulate_material_removal(stock, tool, toolpath) {
  if (toolpath.length === 0) {
    console.log('Toolpath is empty, no material removal simulated.');
    return;
  }

  const r = tool.cutter_diameter / 2;
  const step = stock.grid_size;

  for (const pt of toolpath) {
    if (tool.type === 'flat' && tool.cutter_diameter <= step + 1e-6) {
      // Special case: very thin flat endmill, only cut the center cell
      if (stock.get_height(pt.x, pt.y) > pt.z) {
        stock.set_height(pt.x, pt.y, pt.z);
      }
      continue;
    }
    // For all other cases, loop over all grid cells
    const nx = Math.round(stock.width / stock.grid_size) + 1;
    const ny = Math.round(stock.height / stock.grid_size) + 1;
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        // Compute world coordinates of cell center
        const x = stock.origin_x + ix * stock.grid_size;
        const y = stock.origin_y + iy * stock.grid_size;
        const distance = Math.sqrt((x - pt.x) ** 2 + (y - pt.y) ** 2);
        if (distance > r + 1e-6) continue;
        let z;
        if (tool.type === 'flat') {
          z = pt.z;
        } else if (tool.type === 'ball') {
          z = pt.z + r - Math.sqrt(Math.max(0, r * r - distance * distance));
        } else if (tool.type === 'vbit') {
          const v_angle_rad = (tool.v_angle * Math.PI) / 180;
          const tan_half_angle = Math.tan(v_angle_rad / 2);
          if (tan_half_angle > 1e-8) {
            z = pt.z + distance / tan_half_angle;
          } else {
            continue;
          }
        } else {
          continue;
        }
        if (stock.get_height(x, y) > z) {
          stock.set_height(x, y, z);
        }
      }
    }
  }
}


// Extrude the heightmap down to min_z to create a closed solid mesh.
// Assumes stock is a heightmap object as created by create_heightmap_stock.
// min_z: number, the z value for the bottom of the solid.
function heightmap_to_solid_mesh(stock, min_z) {
  const THREE = require('three');
  const nx = Math.round(stock.width / stock.grid_size); // number of cells in x
  const ny = Math.round(stock.height / stock.grid_size); // number of cells in y
  const positions = [];
  const indices = [];

  // Generate top vertices (z from heightmap)
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = stock.origin_x + ix * stock.grid_size;
      const y = stock.origin_y + iy * stock.grid_size;
      const z = stock.get_height(x, y);
      positions.push(x, y, z);
    }
  }

  // Generate bottom vertices (z = min_z)
  // num_top_vertices is the count of vertices in the top plane
  const num_top_vertices = (nx + 1) * (ny + 1);
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = stock.origin_x + ix * stock.grid_size;
      const y = stock.origin_y + iy * stock.grid_size;
      positions.push(x, y, min_z);
    }
  }

  // Helper: get vertex index
  // top: true for top plane, false for bottom plane
  // Vertex indexing: top plane vertices come first, then bottom plane vertices.
  function idx(ix, iy, top) {
    // (ny + 1) is the number of vertices along the y-axis for a given ix
    return (top ? 0 : num_top_vertices) + ix * (ny + 1) + iy;
  }

  // Top and bottom faces
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
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
  // num_top_vertices is already (nx + 1) * (ny + 1)
  const side_top_offset = positions.length / 3; // Marks the start of duplicated top vertices
                                              // positions array currently holds original top + original bottom vertices

  for (let i = 0; i < num_top_vertices; i++) {
    // Original top vertices are at indices 0 to num_top_vertices - 1
    // Push a copy of each original top vertex
    positions.push(
      positions[i * 3 + 0], // x
      positions[i * 3 + 1], // y
      positions[i * 3 + 2]  // z
    );
  }

  // Side faces:
  // Use duplicated top vertices (offset by side_top_offset) and original bottom vertices.

  // Left edge (face at ix = 0, normal should be -X)
  // Strip runs along Y: top_a is (0, iy), top_b is (0, iy+1)
  for (let iy = 0; iy < ny; iy++) {
    const top_a = side_top_offset + idx(0, iy, true); // Duplicated top vertex
    const top_b = side_top_offset + idx(0, iy + 1, true); // Duplicated top vertex
    const bot_a = idx(0, iy, false); // Bottom vertex
    const bot_b = idx(0, iy + 1, false); // Bottom vertex
    // Winding for -X normal: (top_a, top_b, bot_a), (bot_a, top_b, bot_b)
    indices.push(top_a, top_b, bot_a, bot_a, top_b, bot_b);
  }

  // Right edge (face at ix = nx, normal should be +X)
  // Strip runs along Y: top_a is (nx, iy), top_b is (nx, iy+1)
  for (let iy = 0; iy < ny; iy++) {
    const top_a = side_top_offset + idx(nx, iy, true);
    const top_b = side_top_offset + idx(nx, iy + 1, true);
    const bot_a = idx(nx, iy, false);
    const bot_b = idx(nx, iy + 1, false);
    // Winding for +X normal: (top_a, bot_a, top_b), (top_b, bot_a, bot_b)
    indices.push(top_a, bot_a, top_b, top_b, bot_a, bot_b);
  }

  // Front edge (face at iy = 0, normal should be -Y)
  // Strip runs along X: top_a is (ix, 0), top_b is (ix+1, 0)
  for (let ix = 0; ix < nx; ix++) {
    const top_a = side_top_offset + idx(ix, 0, true);
    const top_b = side_top_offset + idx(ix + 1, 0, true);
    const bot_a = idx(ix, 0, false);
    const bot_b = idx(ix + 1, 0, false);
    // Winding for -Y normal: (top_a, bot_a, top_b), (top_b, bot_a, bot_b)
    // Note: This is the same pattern as Right face, but orientation of strip is different.
    indices.push(top_a, bot_a, top_b, top_b, bot_a, bot_b);
  }

  // Back edge (face at iy = ny, normal should be +Y)
  // Strip runs along X: top_a is (ix, ny), top_b is (ix+1, ny)
  for (let ix = 0; ix < nx; ix++) {
    const top_a = side_top_offset + idx(ix, ny, true);
    const top_b = side_top_offset + idx(ix + 1, ny, true);
    const bot_a = idx(ix, ny, false);
    const bot_b = idx(ix + 1, ny, false);
    // Winding for +Y normal: (top_a, top_b, bot_a), (bot_a, top_b, bot_b)
    // Note: This is the same pattern as Left face, but orientation of strip is different.
    indices.push(top_a, top_b, bot_a, bot_a, top_b, bot_b);
  }

  // Debugging: Verify edge sharing
  const edge_map = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const edges = [
      [a, b], [b, c], [c, a]
    ];
    edges.forEach(([v1, v2]) => {
      const key = v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
      edge_map.set(key, (edge_map.get(key) || 0) + 1);
    });
  }

  // Log edges shared by fewer or more than 2 faces
  edge_map.forEach((count, edge) => {
    if (count !== 2) {
      console.warn(`Edge ${edge} is shared by ${count} faces (should be 2).`);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); // Normals will now be averaged at shared edges

  const material = new THREE.MeshPhongMaterial({
    color: 0x229922,
    shininess: 80,
    specular: 0xdddddd,
    side: THREE.DoubleSide, // Still useful if any winding is accidentally wrong
    transparent: false
  });

  return new THREE.Mesh(geometry, material);
}
module.exports = {
  create_heightmap_stock,
  simulate_material_removal,
  heightmap_to_solid_mesh
};