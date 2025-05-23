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

// Simulate material removal for a flat endmill along a toolpath
// tool: { cutter_diameter: number, type: string }
// toolpath: array of { x, y, z }
function simulate_material_removal(stock, tool, toolpath) {

  // Log min and max x, y, z values from the toolpath for debugging alignment
  if (toolpath.length > 0) {
    let min_x = Infinity, max_x = -Infinity;
    let min_y = Infinity, max_y = -Infinity;
    let min_z = Infinity, max_z = -Infinity;
    for (const pt of toolpath) {
      if (pt.x < min_x) min_x = pt.x;
      if (pt.x > max_x) max_x = pt.x;
      if (pt.y < min_y) min_y = pt.y;
      if (pt.y > max_y) max_y = pt.y;
      if (pt.z < min_z) min_z = pt.z;
      if (pt.z > max_z) max_z = pt.z;
    }
    console.log('Toolpath extents:',
      'x:', min_x, 'to', max_x,
      'y:', min_y, 'to', max_y,
      'z:', min_z, 'to', max_z
    );
  } else {
    console.log('Toolpath is empty, no material removal simulated.');
  }
  // Only flat endmill supported for now
  if (tool.type !== 'flat') return;
  const r = tool.cutter_diameter / 2;
  const step = stock.grid_size;

  for (const pt of toolpath) {
    // For each grid cell within tool radius
    for (let dx = -r; dx <= r; dx += step) {
      for (let dy = -r; dy <= r; dy += step) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = pt.x + dx;
        const y = pt.y + dy;
        // Remove material only if tool is lower than current height
        if (stock.get_height(x, y) > pt.z) {
          stock.set_height(x, y, pt.z);
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