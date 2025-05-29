import * as THREE from 'three';

// width, height: mm, grid_cells_x: int, grid_cells_y: int, initial_height: mm, origin_x?: number, origin_y?: number
export function create_heightmap_stock(
  width: number,
  height: number,
  grid_cells_x: number,
  grid_cells_y: number,
  initial_height: number,
  origin_x?: number,
  origin_y?: number
): any;
export function simulate_material_removal(stock: any, tool: any, toolpath: any[]): void;
export function heightmap_to_solid_mesh(stock: any): THREE.Mesh;