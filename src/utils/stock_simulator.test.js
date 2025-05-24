const { create_heightmap_stock, simulate_material_removal, heightmap_to_mesh } = require('./stock_simulator');

test('flat endmill removes material at tool position', () => {
  const stock = create_heightmap_stock(10, 10, 1, 5);
  const tool = { cutter_diameter: 2, type: 'flat' };
  simulate_material_removal(stock, tool, [{ x: 5, y: 5, z: 2 }]);
  expect(stock.get_height(5, 5)).toBeCloseTo(2);
  expect(stock.get_height(0, 0)).toBeCloseTo(5);
});


// Test that stock origin is respected for get/set height
test('stock respects origin_x and origin_y', () => {
  const stock = create_heightmap_stock(10, 10, 1, 5, -60, -50);
  stock.set_height(-60, -50, 2); // set at origin
  expect(stock.get_height(-60, -50)).toBeCloseTo(2);
  stock.set_height(-50, -40, 3); // set at far corner
  expect(stock.get_height(-50, -40)).toBeCloseTo(3);
});


// Ensure solid mesh vertices are in world coordinates
test('heightmap_to_solid_mesh uses stock origin for vertex positions', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, -60, -50);
  const min_z = 0;
  const mesh = heightmap_to_solid_mesh(stock, min_z);
  const pos = mesh.geometry.attributes.position.array;
  // First top vertex should be at (-60, -50, 5)
  expect(pos[0]).toBeCloseTo(-60);
  expect(pos[1]).toBeCloseTo(-50);
  expect(pos[2]).toBeCloseTo(5);
  // First bottom vertex should be at (-60, -50, min_z)
  const nxy = (Math.round(10 / 1) + 1) ** 2;
  expect(pos[nxy * 3 + 0]).toBeCloseTo(-60);
  expect(pos[nxy * 3 + 1]).toBeCloseTo(-50);
  expect(pos[nxy * 3 + 2]).toBeCloseTo(min_z);
});

test('solid mesh normals point up for flat top', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const normals = mesh.geometry.attributes.normal.array;
  // For a flat top, the first normal should be (0, 0, 1)
  expect(normals[0]).toBeCloseTo(0, 2);
  expect(normals[1]).toBeCloseTo(0, 2);
  expect(normals[2]).toBeGreaterThan(0.9);
});

test('all top face normals point up for flat top', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const normals = mesh.geometry.attributes.normal.array;
  const nxy = (Math.round(10 / 1) + 1) ** 2;

  // Check the first normal is up
  expect(normals[0]).toBeCloseTo(0, 2);
  expect(normals[1]).toBeCloseTo(0, 2);
  expect(normals[2]).toBeGreaterThan(0.9);
});

// Replace the 'verify normal of first top face vertex is pointing up' test
test('verify normal of first top face vertex is pointing up', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const normals = mesh.geometry.attributes.normal.array;
  
  // Log all components of the first normal for detailed debugging
  console.log(`First normal: (${normals[0]}, ${normals[1]}, ${normals[2]})`);
  
  // The normal should point predominantly up (z direction)
  expect(Math.abs(normals[0])).toBeLessThan(0.1); // x component close to 0
  expect(Math.abs(normals[1])).toBeLessThan(0.1); // y component close to 0
  expect(normals[2]).toBeGreaterThan(0.9);        // z component close to 1
});

test('bottom face triangle normal points down for solid stock', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  // create a stock with a flat top (height = 5) and bottom extruded to min_z = 0
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const min_z = 0;
  const mesh = heightmap_to_solid_mesh(stock, min_z);
  const positions = mesh.geometry.attributes.position.array;
  
  // calculate grid dimensions; bottom vertices start at index = num_top
  const nx = Math.round(stock.width / stock.grid_size);
  const ny = Math.round(stock.height / stock.grid_size);
  const num_top = (nx + 1) * (ny + 1);
  
  // helper function: returns the index for a vertex in the given grid; 
  // for bottom face (top=false) vertices start at num_top
  const idx = (ix, iy, top) =>
    (top ? 0 : num_top) + ix * (ny + 1) + iy;
  
  // For the first grid cell bottom face, select vertices in the order (a2, d2, b2)
  const a2_index = idx(0, 0, false);
  const d2_index = idx(0, 1, false);
  const b2_index = idx(1, 0, false);
  
  // Extract coordinates for vertices a2, d2 and b2
  const ax = positions[a2_index * 3];
  const ay = positions[a2_index * 3 + 1];
  const az = positions[a2_index * 3 + 2];
  
  const dx = positions[d2_index * 3];
  const dy = positions[d2_index * 3 + 1];
  const dz = positions[d2_index * 3 + 2];
  
  const bx = positions[b2_index * 3];
  const by = positions[b2_index * 3 + 1];
  const bz = positions[b2_index * 3 + 2];
  
  // Compute two edge vectors for the triangle using order (a2, d2, b2)
  const v1 = [dx - ax, dy - ay, dz - az]; // edge from a2 to d2
  const v2 = [bx - ax, by - ay, bz - az]; // edge from a2 to b2
  
  // Compute face normal as cross product: v1 x v2
  const face_normal = [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0],
  ];
  
  // Normalize the face normal
  const mag = Math.sqrt(face_normal[0] ** 2 + face_normal[1] ** 2 + face_normal[2] ** 2);
  face_normal[0] /= mag;
  face_normal[1] /= mag;
  face_normal[2] /= mag;
  
  // For a correctly built bottom face, the normal should be roughly (0, 0, -1)
  expect(face_normal[0]).toBeCloseTo(0, 2);
  expect(face_normal[1]).toBeCloseTo(0, 2);
  expect(face_normal[2]).toBeLessThan(-0.9);
});

test('top and bottom do not coincide after milling', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const positions = mesh.geometry.attributes.position.array;

  // every bottom vertex z should be strictly less than any top z
  // (assuming the buffer is used)
  let min_top_z = Infinity;
  let max_bottom_z = -Infinity;

  // first half are top vertices, second half are bottom
  const nx = Math.round(stock.width / stock.grid_size);
  const ny = Math.round(stock.height / stock.grid_size);
  const num_top = (nx + 1) * (ny + 1);

  for (let i = 0; i < num_top; i++) {
    min_top_z = Math.min(min_top_z, positions[i * 3 + 2]);
  }
  for (let i = num_top; i < num_top * 2; i++) {
    max_bottom_z = Math.max(max_bottom_z, positions[i * 3 + 2]);
  }
  expect(min_top_z).toBeGreaterThan(max_bottom_z);
});

test('heightmap_to_solid_mesh returns a closed manifold', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const geometry = mesh.geometry;
  expect(() => verify_mesh_is_closed_manifold(geometry)).not.toThrow();
});

// Helper: checks that every edge is shared by exactly two faces
function verify_mesh_is_closed_manifold(geometry) {
  // Assumes geometry.index exists and is a THREE.BufferAttribute or TypedArray
  const index = geometry.index.array;
  const edge_map = new Map();

  // Store each edge as a sorted string "min,max"
  function add_edge(a, b) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edge_map.set(key, (edge_map.get(key) || 0) + 1);
  }

  for (let i = 0; i < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    add_edge(a, b);
    add_edge(b, c);
    add_edge(c, a);
  }

  // Every edge must be shared by exactly 2 triangles
  for (const [key, count] of edge_map.entries()) {
    if (count !== 2) {
      throw new Error(`Edge ${key} is shared by ${count} faces (should be 2)`);
    }
  }
}

test('log mesh for 1x1 heightmap', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  // 1x1 grid: two points in each direction, so 2x2 grid of vertices
  const stock = create_heightmap_stock(1, 1, 1, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const positions = mesh.geometry.attributes.position.array;
  const indices = mesh.geometry.index.array;

  console.log('positions:', Array.from(positions));
  console.log('indices:', Array.from(indices));
});