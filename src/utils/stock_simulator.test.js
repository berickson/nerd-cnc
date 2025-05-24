const { create_heightmap_stock, simulate_material_removal, heightmap_to_mesh } = require('./stock_simulator');

test('flat endmill removes material at tool position', () => {
  const stock = create_heightmap_stock(10, 10, 1, 5);
  const tool = { cutter_diameter: 2, type: 'flat' };
  simulate_material_removal(stock, tool, [{ x: 5, y: 5, z: 2 }]);
  expect(stock.get_height(5, 5)).toBeCloseTo(2);
  expect(stock.get_height(0, 0)).toBeCloseTo(5);
});


test('heightmap_to_mesh creates mesh with correct vertex count', () => {
  const stock = create_heightmap_stock(4, 4, 1, 2);
  const mesh = heightmap_to_mesh(stock);
  // For a 4x4 grid, expect (4+1)*(4+1) vertices if mesh is built as a regular grid
  expect(mesh.geometry.attributes.position.count).toBe(25);
});