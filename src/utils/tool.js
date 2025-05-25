/**
 * Create a minimal tool definition.
 * All dimensions are in meters and must be > 0.
 * see https://www.harveyperformance.com/in-the-loupe/end-mill-anatomy
 * @param {Object} params - Tool parameters.
 * @param {number} params.cutter_diameter - Diameter of the cutting part (meters).
 * @param {number} params.shank_diameter - Diameter of the shank (meters).
 * @param {number} params.overall_length - OAL - Total tool length (meters).
 * @param {number} params.length_of_cut - LOC - Length of cutting part (meters).
 * @param {string} params.type - Tool type, e.g. 'flat', 'ball'.
 * @returns {Object} Tool object.
 */
function create_tool(params) {
  // Assumes params is an object with all required properties.
  if (!params || typeof params !== 'object') {
    throw new Error('params must be an object');
  }
  const {
    cutter_diameter,
    shank_diameter,
    overall_length,
    length_of_cut,
    type,
    v_angle
  } = params;

  if (typeof cutter_diameter !== 'number' || cutter_diameter <= 0) {
    throw new Error('cutter_diameter must be a positive number');
  }
  if (typeof shank_diameter !== 'number' || shank_diameter <= 0) {
    throw new Error('shank_diameter must be a positive number');
  }
  if (typeof overall_length !== 'number' || overall_length <= 0) {
    throw new Error('overall_length must be a positive number');
  }
  if (typeof length_of_cut !== 'number' || length_of_cut <= 0) {
    throw new Error('length_of_cut must be a positive number');
  }
  if (!type || typeof type !== 'string') {
    throw new Error('type must be a string');
  }
  if (!['flat', 'ball', 'vbit'].includes(type)) {
    throw new Error(`Unsupported tool type: ${type}`);
  }
  if (type === 'vbit') {
    // v_angle: included angle in degrees, must be >0 and <180
    if (typeof v_angle !== 'number' || v_angle <= 0 || v_angle >= 180) {
      throw new Error('v_angle must be a number in (0, 180) for vbit');
    }
  }

  const tool = {
    cutter_diameter,
    shank_diameter,
    overall_length,
    length_of_cut,
    type
  };
  if (type === 'vbit') tool.v_angle = v_angle;
  return tool;
}

module.exports = { create_tool };