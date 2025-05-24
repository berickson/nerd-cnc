import * as THREE from 'three';

export function create_heightmap_stock(width: number, height: number, grid_size: number, initial_height: number): any;
export function simulate_material_removal(stock: any, tool: any, toolpath: any[]): void;
export function heightmap_to_mesh(stock: any): THREE.Mesh;
export function heightmap_to_solid_mesh(stock: any): THREE.Mesh;