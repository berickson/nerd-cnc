// Heightmap-based stock simulation for 2.5D CNC
// All units are mm unless otherwise noted

// Create a heightmap stock object
// width, height: mm, grid_size: mm, initial_height: mm
function create_heightmap_stock(width, height, grid_size, initial_height) {
  const nx = Math.ceil(width / grid_size);
  const ny = Math.ceil(height / grid_size);
  // 2D array of heights, initialized to initial_height
  const heights = Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => initial_height)
  );

  // Get the height at (x, y) in mm. Returns 0 if out of bounds.
  function get_height(x, y) {
    const ix = Math.floor(x / grid_size);
    const iy = Math.floor(y / grid_size);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return 0;
    return heights[ix][iy];
  }

  // Set the height at (x, y) in mm. No-op if out of bounds.
  function set_height(x, y, z) {
    const ix = Math.floor(x / grid_size);
    const iy = Math.floor(y / grid_size);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
    heights[ix][iy] = z;
  }

  return {
    get_height,
    set_height,
    width,
    height,
    grid_size
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

// Convert heightmap stock to a THREE.js mesh for visualization
// Assumes THREE is available in the environment
function heightmap_to_mesh(stock) {
  const THREE = require('three'); // Assumes three is installed as a dependency
  const nx = Math.ceil(stock.width / stock.grid_size);
  const ny = Math.ceil(stock.height / stock.grid_size);
  const geometry = new THREE.BufferGeometry();
  const positions = [];

  // Build grid of vertices
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = ix * stock.grid_size;
      const y = iy * stock.grid_size;
      const z = stock.get_height(x, y);
      positions.push(x, y, z);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Optionally, add faces (indices) for rendering as a surface

  const material = new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide, wireframe: false });
  return new THREE.Mesh(geometry, material);
}

// Extrude the heightmap down to min_z to create a solid mesh
function heightmap_to_solid_mesh(stock, min_z) {
  const THREE = require('three');
  const nx = Math.ceil(stock.width / stock.grid_size);
  const ny = Math.ceil(stock.height / stock.grid_size);
  const positions = [];
  const indices = [];

  // Top vertices
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = ix * stock.grid_size;
      const y = iy * stock.grid_size;
      const z = stock.get_height(x, y);
      positions.push(x, y, z);
    }
  }
  // Bottom vertices
  for (let ix = 0; ix <= nx; ix++) {
    for (let iy = 0; iy <= ny; iy++) {
      const x = ix * stock.grid_size;
      const y = iy * stock.grid_size;
      positions.push(x, y, min_z);
    }
  }

  // Helper to get vertex index
  const idx = (ix, iy, top) => (top ? 0 : (nx + 1) * (ny + 1)) + ix * (ny + 1) + iy;

  // Top and bottom faces, and sides
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      // Top face
      const a = idx(ix, iy, true);
      const b = idx(ix + 1, iy, true);
      const c = idx(ix + 1, iy + 1, true);
      const d = idx(ix, iy + 1, true);
      indices.push(a, b, d, b, c, d);

      // Bottom face
      const a2 = idx(ix, iy, false);
      const b2 = idx(ix + 1, iy, false);
      const c2 = idx(ix + 1, iy + 1, false);
      const d2 = idx(ix, iy + 1, false);
      indices.push(a2, d2, b2, b2, d2, c2);

      // Sides
      indices.push(a, a2, b, b, a2, b2); // side 1
      indices.push(b, b2, c, c, b2, c2); // side 2
      indices.push(c, c2, d, d, c2, d2); // side 3
      indices.push(d, d2, a, a, d2, a2); // side 4
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide // <-- add this line
  });
  return new THREE.Mesh(geometry, material);
}

module.exports = {
  create_heightmap_stock,
  simulate_material_removal,
  heightmap_to_mesh,
  heightmap_to_solid_mesh
};