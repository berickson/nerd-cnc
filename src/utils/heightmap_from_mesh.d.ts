export function heightmap_from_mesh(
  geometry: any,
  grid: {
    min_x: number,
    max_x: number,
    min_y: number,
    max_y: number,
    res_x: number,
    res_y: number
  }
): number[][];