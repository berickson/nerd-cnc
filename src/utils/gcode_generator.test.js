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