const { create_tool } = require('./tool');

describe('create_tool', () => {
  it('creates a flat tool with all required properties', () => {
    const tool = create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    });
    expect(tool.cutter_diameter).toBe(0.01);
    expect(tool.shank_diameter).toBe(0.008);
    expect(tool.overall_length).toBe(0.05);
    expect(tool.length_of_cut).toBe(0.02);
    expect(tool.type).toBe('flat');
  });

  it('creates a ball tool with all required properties', () => {
    const tool = create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'ball'
    });
    expect(tool.cutter_diameter).toBe(0.01);
    expect(tool.shank_diameter).toBe(0.008);
    expect(tool.overall_length).toBe(0.05);
    expect(tool.length_of_cut).toBe(0.02);
    expect(tool.type).toBe('ball');
  });

  it('creates a vbit tool with all required properties', () => {
    const tool = create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'vbit',
      v_angle: 60
    });
    expect(tool.cutter_diameter).toBe(0.01);
    expect(tool.shank_diameter).toBe(0.008);
    expect(tool.overall_length).toBe(0.05);
    expect(tool.length_of_cut).toBe(0.02);
    expect(tool.type).toBe('vbit');
    expect(tool.v_angle).toBe(60);
  });

  it('throws if cutter_diameter is zero or negative', () => {
    expect(() => create_tool({
      cutter_diameter: 0,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
  });

  it('throws if any required property is missing or invalid', () => {
    expect(() => create_tool({
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02
    })).toThrow();
  });

  it('throws if any dimension is not a positive number', () => {
    expect(() => create_tool({
      cutter_diameter: -1,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: -0.05,
      length_of_cut: 0.02,
      type: 'flat'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0,
      type: 'flat'
    })).toThrow();
  });

  it('throws if type is missing or not a string', () => {
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 123
    })).toThrow();
  });

  it('throws if type is unsupported', () => {
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'unsupported'
    })).toThrow('Unsupported tool type: unsupported');
  });

  it('throws if vbit is missing v_angle or v_angle is invalid', () => {
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'vbit'
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'vbit',
      v_angle: 0
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'vbit',
      v_angle: -30
    })).toThrow();
    expect(() => create_tool({
      cutter_diameter: 0.01,
      shank_diameter: 0.008,
      overall_length: 0.05,
      length_of_cut: 0.02,
      type: 'vbit',
      v_angle: 200
    })).toThrow();
  });
});