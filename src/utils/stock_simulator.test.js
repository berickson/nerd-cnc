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