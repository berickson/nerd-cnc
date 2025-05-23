const { sample_triangle } = require('./sample_triangle');

test('sample_triangle covers grid cells inside triangle', () => {
  const triangle = [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 2 },
    { x: 0, y: 1, z: 3 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });
  expect(hits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ix: 0, iy: 0 }),
      expect.objectContaining({ ix: 1, iy: 0 }),
      expect.objectContaining({ ix: 0, iy: 1 }),
    ])
  );
});

test('sample_triangle ignores triangles outside the grid', () => {
  const triangle = [
    { x: 2, y: 2, z: 1 },
    { x: 3, y: 2, z: 2 },
    { x: 2, y: 3, z: 3 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });
  expect(hits.length).toBe(0);
});

test('sample_triangle handles degenerate (zero area) triangle', () => {
  const triangle = [
    { x: 0.5, y: 0.5, z: 1 },
    { x: 0.5, y: 0.5, z: 1 },
    { x: 0.5, y: 0.5, z: 1 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });
  // Should cover at most one cell
  expect(hits.length).toBeLessThanOrEqual(1);
});

test('sample_triangle covers the whole grid for a large triangle', () => {
  const triangle = [
    { x: -1, y: -1, z: 1 },
    { x: 2, y: -1, z: 2 },
    { x: 0.5, y: 2, z: 3 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });

    // Debug output
  console.log('Hits:', hits.map(({ ix, iy }) => `(${ix},${iy})`).join(' '));


  // Should cover all grid cells
  expect(hits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ix: 0, iy: 0 }),
      expect.objectContaining({ ix: 1, iy: 0 }),
      expect.objectContaining({ ix: 0, iy: 1 }),
      expect.objectContaining({ ix: 1, iy: 1 }),
    ])
  );
});

test('sample_triangle works with negative coordinates', () => {
  const triangle = [
    { x: -1, y: -1, z: 1 },
    { x: 0, y: 0, z: 2 },
    { x: -1, y: 0, z: 3 }
  ];
  const grid = { min_x: -1, max_x: 0, min_y: -1, max_y: 0, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });
  expect(hits.length).toBeGreaterThan(0);
});

test('sample_triangle does not update cells outside a small triangle', () => {
  const triangle = [
    { x: 0.49, y: 0.49, z: 1 },
    { x: 0.51, y: 0.49, z: 2 },
    { x: 0.50, y: 0.51, z: 3 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 10, res_y: 10 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
    // z should be within the triangle's z range
    expect(z).toBeGreaterThanOrEqual(1);
    expect(z).toBeLessThanOrEqual(3);
  });
  // Should only hit at most a few cells
  expect(hits.length).toBeLessThanOrEqual(3);
});

test('sample_triangle does not update cells outside a thin, angled triangle', () => {
  const triangle = [
    { x: 0.1, y: 0.1, z: 1 },
    { x: 0.9, y: 0.15, z: 2 },
    { x: 0.5, y: 0.12, z: 3 }
  ];
  const grid = { min_x: 0, max_x: 1, min_y: 0, max_y: 1, res_x: 10, res_y: 10 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
    expect(z).toBeGreaterThanOrEqual(1);
    expect(z).toBeLessThanOrEqual(3);
  });
  // Should only hit a thin band of cells
  expect(hits.length).toBeLessThanOrEqual(5);
});

test('sample_triangle covers edge and vertex cases', () => {
  // Triangle exactly covers grid cell center at (1,1)
  const triangle = [
    { x: 0, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 1, y: 2, z: 1 }
  ];
  const grid = { min_x: 0, max_x: 2, min_y: 0, max_y: 2, res_x: 2, res_y: 2 };
  const hits = [];
  sample_triangle(triangle, grid, (ix, iy, z) => {
    hits.push({ ix, iy, z });
  });
  // Only cells whose centers are inside or on the edge should be hit
  // For this triangle and grid, that's (0,0) and (1,0)
  expect(hits.some(h => h.ix === 0 && h.iy === 0)).toBe(true);
  expect(hits.some(h => h.ix === 1 && h.iy === 0)).toBe(true);
  // (1,1) and (0,1) should NOT be hit
  expect(hits.some(h => h.ix === 1 && h.iy === 1)).toBe(false);
  expect(hits.some(h => h.ix === 0 && h.iy === 1)).toBe(false);
  expect(hits.every(h => h.z === 1)).toBe(true);
});