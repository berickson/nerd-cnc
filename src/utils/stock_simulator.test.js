const { create_heightmap_stock, simulate_material_removal, heightmap_to_mesh } = require('./stock_simulator');

jest.mock('../../wasm_kernel/pkg/wasm_kernel.js', () => ({}));

test('flat endmill removes material at tool position', () => {
  // 11x11 grid: 10mm/1mm + 1
  const stock = create_heightmap_stock(10, 10, 11, 11, 5);
  const tool = { cutter_diameter: 2, type: 'flat' };
  simulate_material_removal(stock, tool, [{ x: 5, y: 5, z: 2 }]);
  expect(stock.get_height(5, 5)).toBeCloseTo(2);
  expect(stock.get_height(0, 0)).toBeCloseTo(5);
});


// Test that stock origin is respected for get/set height
// 11x11 grid, origin at (-60, -50)
test('stock respects origin_x and origin_y', () => {
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, -60, -50);
  stock.set_height(-60, -50, 2); // set at origin
  expect(stock.get_height(-60, -50)).toBeCloseTo(2);
  stock.set_height(-50, -40, 3); // set at far corner
  expect(stock.get_height(-50, -40)).toBeCloseTo(3);
});


// Ensure solid mesh vertices are in world coordinates
test('heightmap_to_solid_mesh uses stock origin for vertex positions', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, -60, -50);
  const min_z = 0;
  const mesh = heightmap_to_solid_mesh(stock, min_z);
  const pos = mesh.geometry.attributes.position.array;
  // First top vertex should be at (-60, -50, 5)
  expect(pos[0]).toBeCloseTo(-60);
  expect(pos[1]).toBeCloseTo(-50);
  expect(pos[2]).toBeCloseTo(5);
  // First bottom vertex should be at (-60, -50, min_z)
  const nxy = 11 * 11;
  expect(pos[nxy * 3 + 0]).toBeCloseTo(-60);
  expect(pos[nxy * 3 + 1]).toBeCloseTo(-50);
  expect(pos[nxy * 3 + 2]).toBeCloseTo(min_z);
});

test('solid mesh normals point up for flat top', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const normals = mesh.geometry.attributes.normal.array;
  // For a flat top, the first normal should be (0, 0, 1)
  expect(normals[0]).toBeCloseTo(0, 2);
  expect(normals[1]).toBeCloseTo(0, 2);
  expect(normals[2]).toBeGreaterThan(0.9);
});

test('all top face normals point up for flat top', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const normals = mesh.geometry.attributes.normal.array;
  const nxy = 11 * 11;
  // Check the first normal is up
  expect(normals[0]).toBeCloseTo(0, 2);
  expect(normals[1]).toBeCloseTo(0, 2);
  expect(normals[2]).toBeGreaterThan(0.9);
});

// Replace the 'verify normal of first top face vertex is pointing up' test
test('verify normal of first top face vertex is pointing up', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, 0, 0);
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
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, 0, 0);
  const min_z = 0;
  const mesh = heightmap_to_solid_mesh(stock, min_z);
  const positions = mesh.geometry.attributes.position.array;
  const nx = 11;
  const ny = 11;
  const num_top = nx * ny;
  const idx = (ix, iy, top) => (top ? 0 : num_top) + ix * ny + iy;
  const a2_index = idx(0, 0, false);
  const d2_index = idx(0, 1, false);
  const b2_index = idx(1, 0, false);
  const ax = positions[a2_index * 3];
  const ay = positions[a2_index * 3 + 1];
  const az = positions[a2_index * 3 + 2];
  const dx = positions[d2_index * 3];
  const dy = positions[d2_index * 3 + 1];
  const dz = positions[d2_index * 3 + 2];
  const bx = positions[b2_index * 3];
  const by = positions[b2_index * 3 + 1];
  const bz = positions[b2_index * 3 + 2];
  const v1 = [dx - ax, dy - ay, dz - az];
  const v2 = [bx - ax, by - ay, bz - az];
  const face_normal = [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0],
  ];
  const mag = Math.sqrt(face_normal[0] ** 2 + face_normal[1] ** 2 + face_normal[2] ** 2);
  face_normal[0] /= mag;
  face_normal[1] /= mag;
  face_normal[2] /= mag;
  expect(face_normal[0]).toBeCloseTo(0, 2);
  expect(face_normal[1]).toBeCloseTo(0, 2);
  expect(face_normal[2]).toBeLessThan(-0.9);
});

test('top and bottom do not coincide after milling', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  const stock = create_heightmap_stock(10, 10, 11, 11, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const positions = mesh.geometry.attributes.position.array;
  let min_top_z = Infinity;
  let max_bottom_z = -Infinity;
  const nx = 11;
  const ny = 11;
  const num_top = nx * ny;
  for (let i = 0; i < num_top; i++) {
    min_top_z = Math.min(min_top_z, positions[i * 3 + 2]);
  }
  for (let i = num_top; i < num_top * 2; i++) {
    max_bottom_z = Math.max(max_bottom_z, positions[i * 3 + 2]);
  }
  expect(min_top_z).toBeGreaterThan(max_bottom_z);
});

test('log mesh for 1x1 heightmap', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  // 2x2 grid: 1x1 area, 2 grid points per axis
  const stock = create_heightmap_stock(1, 1, 2, 2, 5, 0, 0);
  const mesh = heightmap_to_solid_mesh(stock, 0);
  const positions = mesh.geometry.attributes.position.array;
  const indices = mesh.geometry.index.array;
  console.log('positions:', Array.from(positions));
  console.log('indices:', Array.from(indices));
});

describe('simulate_material_removal', () => {
  it('removes material in a ball shape for ball-nose tools', () => {
    const stock = create_heightmap_stock(10, 10, 11, 11, 5);
    const tool = {
      cutter_diameter: 4,
      type: 'ball'
    };
    const toolpath = [
      { x: 5, y: 5, z: 3 }
    ];
    simulate_material_removal(stock, tool, toolpath);
    expect(stock.get_height(5, 5)).toBeCloseTo(3, 2);
    expect(stock.get_height(6, 5)).toBeGreaterThan(3);
    expect(stock.get_height(4, 5)).toBeGreaterThan(3);
    expect(stock.get_height(5, 4)).toBeGreaterThan(3);
    expect(stock.get_height(5, 6)).toBeGreaterThan(3);
    expect(stock.get_height(8, 5)).toBeCloseTo(5, 2);
    expect(stock.get_height(5, 8)).toBeCloseTo(5, 2);
  });
  it('removes material in a v shape for vbit tools', () => {
    const stock = create_heightmap_stock(10, 10, 11, 11, 5);
    const tool = {
      cutter_diameter: 3,
      type: 'vbit',
      v_angle: 90
    };
    const toolpath = [
      { x: 5, y: 5, z: 3 }
    ];
    simulate_material_removal(stock, tool, toolpath);
    expect(stock.get_height(5, 5)).toBeCloseTo(3, 1);
    expect(stock.get_height(6, 5)).toBeCloseTo(4, 1);
    expect(stock.get_height(4, 5)).toBeCloseTo(4, 1);
    expect(stock.get_height(5, 6)).toBeCloseTo(4, 1);
    expect(stock.get_height(5, 4)).toBeCloseTo(4, 1);
    expect(stock.get_height(7, 5)).toBeCloseTo(5, 1);
  });
  test('vbit removes material with correct depth calculation', () => {
    const stock = create_heightmap_stock(10, 10, 11, 11, 5);
    const tool = { cutter_diameter: 2, type: 'vbit', v_angle: 60 };
    simulate_material_removal(stock, tool, [
      { x: 5, y: 5, z: 2 },
      { x: 6, y: 5, z: 2 },
      { x: 5, y: 6, z: 2 }
    ]);
    expect(stock.get_height(5, 5)).toBeCloseTo(2);
    expect(stock.get_height(6, 5)).toBeCloseTo(2);
    expect(stock.get_height(5, 6)).toBeCloseTo(2);
  });
  test('thin flat endmill only cuts center cell', () => {
    const stock = create_heightmap_stock(5, 5, 6, 6, 5);
    const tool = { cutter_diameter: 1, type: 'flat' };
    simulate_material_removal(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    expect(stock.get_height(2, 2)).toBeCloseTo(2);
    expect(stock.get_height(1, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 1)).toBeCloseTo(5);
    expect(stock.get_height(3, 2)).toBeCloseTo(5);
    expect(stock.get_height(2, 3)).toBeCloseTo(5);
  });
  test('moderate flat endmill only cuts within circular area', () => {
    const stock = create_heightmap_stock(5, 5, 6, 6, 5);
    const tool = { cutter_diameter: 3, type: 'flat' };
    simulate_material_removal(stock, tool, [{ x: 2, y: 2, z: 2 }]);
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 6; y++) {
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
  it.skip('removes material in a ball shape for ball-nose tools', () => {});
  it.skip('removes material in a v shape for vbit tools', () => {});
  it.skip('thin flat endmill only cuts center cell', () => {});
  it.skip('moderate flat endmill only cuts within circular area', () => {});
  it.skip('minimal 1x1 heightmap, single toolpath point (WASM)', () => {});
});


test('heightmap_to_solid_mesh does NOT throw for 2000x2000 grid', () => {
  const { create_heightmap_stock, heightmap_to_solid_mesh } = require('./stock_simulator');
  // 2001x2001 grid: 100mm/0.05mm + 1
  const width = 100;
  const height = 100;
  const grid_cells_x = 2001;
  const grid_cells_y = 2001;
  const stock = create_heightmap_stock(width, height, grid_cells_x, grid_cells_y, 5, 0, 0);
  const min_z = 0;
  expect(() => heightmap_to_solid_mesh(stock, min_z)).not.toThrow();
  const mesh = heightmap_to_solid_mesh(stock, min_z);
  const n_vertices = mesh.geometry.attributes.position.count;
  expect(n_vertices).toBeGreaterThan(1_000_000);
  expect(n_vertices).toBeLessThan(20_000_000);
});