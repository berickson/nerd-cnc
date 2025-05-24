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


// Extrude the heightmap down to min_z to create a solid mesh
function heightmap_to_solid_mesh(stock, min_z) {
  const THREE = require('three');
  const nx = Math.round(stock.width / stock.grid_size);
  const ny = Math.round(stock.height / stock.grid_size);
  const positions = [];
  const indices = [];

  // Generate top vertices (world coordinates)
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = stock.origin_x + ix * stock.grid_size;
      const y = stock.origin_y + iy * stock.grid_size;
      const z = stock.get_height(x, y);
      positions.push(x, y, z);
    }
  }
  // Generate bottom vertices (world coordinates)
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = stock.origin_x + ix * stock.grid_size;
      const y = stock.origin_y + iy * stock.grid_size;
      positions.push(x, y, min_z);
    }
  }

  // Helper: get vertex index; top vertices start at 0; bottom follow immediately
  const idx = (ix, iy, top) =>
    (top ? 0 : (nx + 1) * (ny + 1)) + ix * (ny + 1) + iy;

  // Top and bottom faces
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      // Top face - use order (a, b, d) and (b, c, d) for upward normals
      const a = idx(ix, iy, true);
      const b = idx(ix + 1, iy, true);
      const c = idx(ix + 1, iy + 1, true);
      const d = idx(ix, iy + 1, true);
      indices.push(a, b, d, b, c, d);

      // Bottom face - keep current winding (downward normals)
      const a2 = idx(ix, iy, false);
      const b2 = idx(ix + 1, iy, false);
      const c2 = idx(ix + 1, iy + 1, false);
      const d2 = idx(ix, iy + 1, false);
      indices.push(a2, b2, d2, b2, c2, d2);
    }
  }

  // Duplicate top vertices for use in sides to prevent normal averaging
  const num_top = (nx + 1) * (ny + 1);
  // positions currently has 2*num_top vertices (top and bottom)
  const side_top_offset = positions.length / 3; // new offset for duplicate top vertices
  for (let i = 0; i < num_top; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    positions.push(x, y, z);
  }

  // Sides - use duplicated top vertices for the top edge of sides
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      // Original top indices (from top face)
      const a = idx(ix, iy, true);
      const b = idx(ix + 1, iy, true);
      const c = idx(ix + 1, iy + 1, true);
      const d = idx(ix, iy + 1, true);
      // Duplicated top vertex indices for sides
      const a_dup = a + side_top_offset;
      const b_dup = b + side_top_offset;
      const c_dup = c + side_top_offset;
      const d_dup = d + side_top_offset;
      // Bottom face indices remain unchanged
      const a2 = idx(ix, iy, false);
      const b2 = idx(ix + 1, iy, false);
      const c2 = idx(ix + 1, iy + 1, false);
      const d2 = idx(ix, iy + 1, false);

      // Side 1
      indices.push(a_dup, b_dup, a2, b_dup, b2, a2);
      // Side 2
      indices.push(b_dup, c_dup, b2, c_dup, c2, b2);
      // Side 3
      indices.push(c_dup, d_dup, c2, d_dup, d2, c2);
      // Side 4
      indices.push(d_dup, a_dup, d2, a_dup, a2, d2);
    }
  }

  // Create buffer geometry and set position attribute
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );

  // Set indices and compute vertex normals
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Create material (remove unsupported flat_shading property)
  const material = new THREE.MeshPhongMaterial({
    color: 0x229922, // rich green for contrast
    shininess: 80,   // strong specular highlights
    specular: 0xdddddd,
    side: THREE.DoubleSide,
    transparent: false
  });

  return new THREE.Mesh(geometry, material);
}


module.exports = {
  create_heightmap_stock,
  simulate_material_removal,
  heightmap_to_solid_mesh
};