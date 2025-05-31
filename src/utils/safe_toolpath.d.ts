// TypeScript declaration for safe_toolpath.js
export function generate_safe_toolpath_js(
  heightmap: number[][],
  grid: { nx: number; ny: number; grid_size_x: number; grid_size_y: number; origin_x: number; origin_y: number },
  tool: { type: string; cutter_diameter: number; v_angle?: number },
  toolpath_xy: { x: number; y: number }[]
): Promise<number[]>;
