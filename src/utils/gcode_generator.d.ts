export function generate_gcode(
  toolpaths: Array<Array<{ x: number; y: number; z: number }>>,
  options?: object
): string;