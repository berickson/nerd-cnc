const { generate_gcode } = require('./gcode_generator');

test('generate_gcode outputs correct G-code for a simple toolpath', () => {
  const toolpath = [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
    { x: 1, y: 1, z: 1 }
  ];
  // Wrap toolpath in an array to match expected input
  const gcode = generate_gcode([toolpath]);

  // Check for header commands
  expect(gcode).toMatch(/G21/);
  expect(gcode).toMatch(/G90/);

  // Check for initial move and plunge
  expect(gcode).toMatch(/G0 Z6\.000/);
  expect(gcode).toMatch(/G0 X0\.000 Y0\.000/);
  expect(gcode).toMatch(/G1 Z1\.000/);

  // Check for toolpath moves
  expect(gcode).toMatch(/G1 X0\.000 Y0\.000 Z1\.000/);
  expect(gcode).toMatch(/G1 X1\.000 Y0\.000 Z1\.000/);
  expect(gcode).toMatch(/G1 X1\.000 Y1\.000 Z1\.000/);

  // Check for retract and end
  expect(gcode).toMatch(/G0 Z6\.000/);
  expect(gcode).toMatch(/M2/);
});

test('generate_gcode handles empty toolpath', () => {
  const gcode = generate_gcode([]);
  expect(gcode).toMatch(/G21/);
  expect(gcode).toMatch(/G90/);
  expect(gcode).toMatch(/G1 F1000/);
  expect(gcode).not.toMatch(/G0 X/);
});

test('flatten G-code includes Z=0 top of stock assumption comment', () => {
  const toolpath = [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 }
    ]
  ];
  const gcode = generate_gcode(toolpath);
  expect(gcode).toMatch(/Assumption: Z=0 is the top of the stock/);
});

test('flatten G-code Z coordinates are relative to top of stock (Z=0)', () => {
  // Simulate a flatten toolpath that should cut at Z=0 (top of stock)
  const toolpath = [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 }
    ]
  ];
  const gcode = generate_gcode(toolpath);
  // All G1 Z values should be 0.000
  const zLines = gcode.split('\n').filter(line => line.match(/G1 .*Z/));
  for (const line of zLines) {
    expect(line).toMatch(/Z0\.000/);
  }
});

test('generate_gcode includes spindle start/stop and feedrate', () => {
  const toolpath = [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ]
  ];
  const gcode = generate_gcode(toolpath, { feedrate: 1234, spindle_speed: 5678 });
  expect(gcode).toMatch(/G1 F1234/);
  expect(gcode).toMatch(/M3 S5678/);
  expect(gcode).toMatch(/M5/);
  expect(gcode).toMatch(/M2/);
});