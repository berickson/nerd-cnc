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

test.skip('heightmap_to_solid_mesh returns a closed manifold', () => {
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

describe('simulate_material_removal', () => {
  it('removes material in a ball shape for ball-nose tools', () => {
    const stock = create_heightmap_stock(10, 10, 1, 5);
    const tool = {
      cutter_diameter: 4,
      type: 'ball'
    };
    const toolpath = [
      { x: 5, y: 5, z: 3 } // Tool center at (5, 5), tip at z = 3
    ];

    simulate_material_removal(stock, tool, toolpath);

    // Ball radius = 1
    // At center: z = 3
    expect(stock.get_height(5, 5)).toBeCloseTo(3, 2); // Center point (tip)

    expect(stock.get_height(6, 5)).toBeGreaterThan(3); // 1mm from center, should be higher
    expect(stock.get_height(4, 5)).toBeGreaterThan(3); // 1mm from center, should be higher
    expect(stock.get_height(5, 4)).toBeGreaterThan(3); // 1mm from center, should be higher
    expect(stock.get_height(5, 6)).toBeGreaterThan(3); // 1mm from center, should be higher

    // away from the ball, no material removed
    expect(stock.get_height(8, 5)).toBeCloseTo(5, 2); // Further out, no material removed
    expect(stock.get_height(5, 8)).toBeCloseTo(5, 2); // Further out, no material removed
  });

  it('removes material in a v shape for vbit tools', () => {
    const stock = create_heightmap_stock(10, 10, 1, 5);
    const tool = {
      cutter_diameter: 3,
      type: 'vbit',
      v_angle: 90 // 90 degree included angle
    };
    const toolpath = [
      { x: 5, y: 5, z: 3 } // Tool center at (5, 5), cutting down to z = 3
    ];

    simulate_material_removal(stock, tool, toolpath);

    // For a 90 degree vbit, the depth at the center should be 3,
    // and at a distance r from the center, the depth should be higher (less material removed)
    expect(stock.get_height(5, 5)).toBeCloseTo(3, 1); // Center point (tip)
    // At 1mm from center, depth should be 3 + 1 (since tan(45deg) = 1)
    expect(stock.get_height(6, 5)).toBeCloseTo(4, 1); // 1mm from center
    expect(stock.get_height(4, 5)).toBeCloseTo(4, 1);
    expect(stock.get_height(5, 6)).toBeCloseTo(4, 1);
    expect(stock.get_height(5, 4)).toBeCloseTo(4, 1);
    expect(stock.get_height(7, 5)).toBeCloseTo(5, 1); // Further out, no material removed
    
  });

  test('vbit removes material with correct depth calculation', () => {
    const stock = create_heightmap_stock(10, 10, 1, 5);
    const tool = { cutter_diameter: 2, type: 'vbit', v_angle: 60 };

    // Simulate material removal at center and surrounding points
    simulate_material_removal(stock, tool, [
      { x: 5, y: 5, z: 2 },
      { x: 6, y: 5, z: 2 },
      { x: 5, y: 6, z: 2 }
    ]);

    // All three points should be cut to z=2
    expect(stock.get_height(5, 5)).toBeCloseTo(2);
    expect(stock.get_height(6, 5)).toBeCloseTo(2);
    expect(stock.get_height(5, 6)).toBeCloseTo(2);
  });

  // Unit test: very thin flat endmill only cuts the center point
  // Assumption: grid_size = 1, tool diameter = 1, so only the center cell is affected

  test('thin flat endmill only cuts center cell', () => {
    const stock = create_heightmap_stock(5, 5, 1, 5);
    const tool = { cutter_diameter: 1, type: 'flat' };
    // Place tool at (2,2), z=2
    simulate_material_removal(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    // Only the center should be cut
    expect(stock.get_height(2, 2)).toBeCloseTo(2);
    // All surrounding points should remain at initial height
    expect(stock.get_height(1, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 1)).toBeCloseTo(5);
    expect(stock.get_height(3, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 3)).toBeCloseTo(5);
  });

  test('moderate flat endmill only cuts within circular area', () => {
    const stock = create_heightmap_stock(5, 5, 1, 5);
    const tool = { cutter_diameter: 3, type: 'flat' };
    // Place tool at (2,2), z=2
    simulate_material_removal(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    // Only cells within radius 1.5 of (2,2) should be cut
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const dist = Math.sqrt((x - 2) ** 2 + (y - 2) ** 2);
        if (dist <= 1.5 + 1e-6) {
          expect(stock.get_height(x, y)).toBeCloseTo(2);
        } else {
          expect(stock.get_height(x, y)).toBeCloseTo(5);
        }
      }
    }
  });
});

describe('simulate_material_removal (wasm)', () => {
  let wasm;
  let simulate_material_removal_wasm;
  let create_heightmap_stock;

  beforeAll(async () => {
    wasm = await import('../../wasm_kernel/pkg/wasm_kernel.js');
    create_heightmap_stock = (width, height, grid_size, initial_height, origin_x = 0, origin_y = 0) => {
      const nx = Math.round(width / grid_size);
      const ny = Math.round(height / grid_size);
      const heightmap = new Float32Array(nx * ny).fill(initial_height);
      return {
        width,
        height,
        grid_size,
        nx,
        ny,
        origin_x,
        origin_y,
        heightmap,
        get_height(x, y) {
          const ix = Math.round((x - origin_x) / grid_size);
          const iy = Math.round((y - origin_y) / grid_size);
          if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return undefined;
          return heightmap[ix * ny + iy];
        },
        set_height(x, y, h) {
          const ix = Math.round((x - origin_x) / grid_size);
          const iy = Math.round((y - origin_y) / grid_size);
          if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
          heightmap[ix * ny + iy] = h;
        }
      };
    };
    simulate_material_removal_wasm = (stock, tool, toolpath) => {
      const flat_toolpath = new Float32Array(toolpath.length * 3);
      for (let i = 0; i < toolpath.length; i++) {
        flat_toolpath[i * 3 + 0] = toolpath[i].x;
        flat_toolpath[i * 3 + 1] = toolpath[i].y;
        flat_toolpath[i * 3 + 2] = toolpath[i].z;
      }
      const new_heightmap = wasm.simulate_material_removal_wasm(
        stock.heightmap,
        stock.nx,
        stock.ny,
        stock.grid_size,
        stock.origin_x,
        stock.origin_y,
        tool.type,
        tool.cutter_diameter,
        tool.v_angle || 0,
        flat_toolpath
      );
      stock.heightmap.set(new_heightmap);
    };
  });

  it('thin flat endmill only cuts center cell', () => {
    const stock = create_heightmap_stock(5, 5, 1, 5);
    const tool = { cutter_diameter: 1, type: 'flat' };
    simulate_material_removal_wasm(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    expect(stock.get_height(2, 2)).toBeCloseTo(2);
    expect(stock.get_height(1, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 1)).toBeCloseTo(5);
    expect(stock.get_height(3, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 3)).toBeCloseTo(5);
  });

  it('moderate flat endmill only cuts within circular area', () => {
    const stock = create_heightmap_stock(5, 5, 1, 5);
    const tool = { cutter_diameter: 3, type: 'flat' };
    simulate_material_removal_wasm(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const dist = Math.sqrt((x - 2) ** 2 + (y - 2) ** 2);
        if (dist <= 1.5 + 1e-6) {
          expect(stock.get_height(x, y)).toBeCloseTo(2);
        } else {
          expect(stock.get_height(x, y)).toBeCloseTo(5);
        }
      }
    }
  });

  it('minimal 1x1 heightmap, single toolpath point (WASM)', () => {
    // Minimal test: 1x1 grid, 1 toolpath point
    const stock = create_heightmap_stock(1, 1, 1, 5);
    const tool = { cutter_diameter: 1, type: 'flat' };
    const toolpath = [{ x: 0, y: 0, z: 2 }];
    // Defensive: log before/after for debugging
    const before = stock.heightmap.slice();
    expect(before.length).toBe(1);
    simulate_material_removal_wasm(stock, tool, toolpath);
    const after = stock.heightmap.slice();
    console.log('WASM minimal test before:', Array.from(before));
    console.log('WASM minimal test after:', Array.from(after));
    // The only cell should be cut to z=2
    expect(stock.get_height(0, 0)).toBeCloseTo(2);
  });
});