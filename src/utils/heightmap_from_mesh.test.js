const { heightmap_from_mesh } = require('./heightmap_from_mesh');

function make_geometry(triangles) {
  // Fake minimal BufferGeometry-like object for testing
  const positions = [];
  for (const tri of triangles) {
    for (const v of tri) {
      positions.push(v.x, v.y, v.z);
    }
  }
  return {
    attributes: {
      position: {
        count: positions.length / 3,
        getX: i => positions[i * 3],
        getY: i => positions[i * 3 + 1],
        getZ: i => positions[i * 3 + 2],
      }
    }
  };
}

test('heightmap_from_mesh covers a single triangle', () => {
  const triangle = [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 2 },
    { x: 0, y: 1, z: 3 }
  ];
  const geometry = make_geometry([triangle]);
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const heightmap = heightmap_from_mesh(geometry, grid);

  // At least some grid cells should be updated from -Infinity
  const flat = heightmap.flat();
  expect(flat.some(z => z > -Infinity)).toBe(true);
});

test('heightmap_from_mesh sets all grid cells for a covering triangle', () => {
  // This triangle covers the whole grid
  const triangle = [
  { x: -1, y: -1, z: 1 },
  { x: 3, y: -1, z: 2 },
  { x: -1, y: 3, z: 3 }
  ];
  const geometry = make_geometry([triangle]);
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const heightmap = heightmap_from_mesh(geometry, grid);

  // All grid cells should be set (none should be -Infinity)
  const flat = heightmap.flat();
  flat.forEach((z, i) => {
    if (z === -Infinity) {
      console.log('Unset cell:', i, 'coords:', [i % grid.res_x, Math.floor(i / grid.res_x)]);
    }
  });
  expect(flat.every(z => z > -Infinity)).toBe(true);
});