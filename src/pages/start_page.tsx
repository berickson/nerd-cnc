import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { heightmap_from_mesh } from '../utils/heightmap_from_mesh.js';
import { generate_gcode } from '../utils/gcode_generator.js';
import { create_heightmap_stock, simulate_material_removal, heightmap_to_solid_mesh } from "../utils/stock_simulator.js";
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import '../global.css'
declare global {
  interface Window {
    current_heightmap?: any;
    last_simulation_timings?: any;
  }
}
/**
 * Compute a visible linewidth in world units based on bounding box size.

 */
function compute_linewidth(box: THREE.Box3): number {
  // Use 2% of the diagonal as line width, minimum 0.02
  const diagonal = box.max.clone().sub(box.min).length();
  return Math.max(diagonal * 0.005, 0.000002);
}

// Define operation types for type safety
// (Place near the top, after imports)
type StockOperation = {
  type: 'stock',
  params: {
    width: number,
    height: number,
    thickness: number
  }
};
type CarveOperation = {
  type: 'carve',
  params: {
    tool: {
      cutter_diameter: number,
      shank_diameter: number,
      overall_length: number,
      length_of_cut: number,
      type: string,
      v_angle: number
    },
    step_over_percent: number,
    toolpath_grid_resolution: number
  }
};
type FlattenOperation = {
  type: 'flatten',
  params: {
    flatten_depth: number,
    tool: {
      cutter_diameter: number,
      shank_diameter: number,
      overall_length: number,
      length_of_cut: number,
      type: string,
      v_angle: number
    },
    step_over_percent: number
  }
};
type Operation = StockOperation | CarveOperation | FlattenOperation;

const StartPage: React.FC = () => {

  //////////////////////////////////////////////////////////
  // ref variables

  const mount_ref = useRef<HTMLDivElement>(null);
  const scene_ref = useRef<THREE.Scene>(null);
  const toolpath_points_ref = React.useRef<{ x: number; y: number; z: number }[][]>([]);
  const camera_ref = useRef<THREE.OrthographicCamera | null>(null);
  const controls_ref = useRef<OrbitControls | null>(null);
  const tool_mesh_ref = useRef<THREE.Group | null>(null);
  const renderer_ref = useRef<THREE.WebGLRenderer | null>(null);

  //////////////////////////////////////////////////////////
  // react state hooks

  const [boxSize, set_box_size] = React.useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const [box_bounds, set_box_bounds] = React.useState<{ min: THREE.Vector3, max: THREE.Vector3 } | null>(null); const [show_mesh, set_show_mesh] = React.useState(true);
  const [show_toolpath, set_show_toolpath] = React.useState(true);
  const [show_bounding_box, set_show_bounding_box] = React.useState(true);
  const [show_wireframe, set_show_wireframe] = React.useState(false);
  const [show_stock, set_show_stock] = React.useState(true);
  const [show_initial_stock, set_show_initial_stock] = React.useState(true); // Add state for initial stock visibility
  const stock_mesh_ref = useRef<THREE.Mesh | null>(null);
  const [step_over_percent, set_step_over_percent] = React.useState(0.7); // default 70% of cutter diameter
  const [toolpath_grid_resolution, set_toolpath_grid_resolution] = React.useState(2000); // default 2000
  const [simulation_dirty, set_simulation_dirty] = React.useState(true);
  const [generating, set_generating] = React.useState(false); // true while simulation is running

  // Add v_angle to tool state for vbit support
  const [tool, set_tool] = React.useState({
    cutter_diameter: 3.175,    // all dimensions are mm
    shank_diameter: 3.175,
    overall_length: 38.0,
    length_of_cut: 17.0,
    type: 'flat',
    v_angle: 60 // default, only used for vbit
  });
  const [tool_error, set_tool_error] = React.useState<string | null>(null);
  const [stl_geometry, set_stl_geometry] = React.useState<THREE.BufferGeometry | null>(null);
  const [last_tool, set_last_tool] = React.useState(tool);
  const [stock_update_counter, set_stock_update_counter] = useState(0);
  const [generate_timings, set_generate_timings] = React.useState<any>(null);

  // Add state for carved result wireframe
  const [show_stock_wireframe, set_show_stock_wireframe] = React.useState(false);

  // Flatten operation states
  const [flatten_depth, set_flatten_depth] = React.useState(1); // mm, default flatten depth
  const [generating_flatten, set_generating_flatten] = React.useState(false);
  const [flatten_toolpath, set_flatten_toolpath] = React.useState<any>(null);

  // Operation-driven workflow state
  const [operations, set_operations] = React.useState<Operation[]>([
    { type: 'carve', params: { tool: { ...tool }, step_over_percent, toolpath_grid_resolution } }
  ]);
  const [selected_operation_index, set_selected_operation_index] = React.useState(0);

  // Track if stock is defined (STL loaded or manual stock entry)
  const [stock_defined, set_stock_defined] = React.useState(false);

  //////////////////////////////////////////////////////////
  // effects

  // initialize three.js scene, camera, renderer, and controls on mount
  useEffect(() => {
    if (!mount_ref.current) return; // Add this guard
    // Set up scene
    const scene = new THREE.Scene();
    scene_ref.current = scene;

    scene.background = new THREE.Color(0x222222);

    // Add lights for MeshPhongMaterial
    const ambient_light = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambient_light);
    const directional_light = new THREE.DirectionalLight(0xffffff, 1.0);
    directional_light.position.set(100, 100, 100);
    scene.add(directional_light);

    // Set up camera
    const width = mount_ref.current.clientWidth;
    const height = mount_ref.current.clientHeight;
    const aspect = width / height;
    const frustumSize = 100; // Adjust for your scene scale
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -1000,
      1000
    );
    camera.position.set(100, 100, 100); // mm scale
    camera.lookAt(0, 0, 0);
    camera_ref.current = camera;

    // Set up renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer_ref.current = renderer;
    mount_ref.current.appendChild(renderer.domElement);

    // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls_ref.current = controls;

    // Animation loop
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      if (mount_ref.current) {
        mount_ref.current.removeChild(renderer.domElement);
      }
    };
  }, []);



  // window resize handler
  useEffect(() => {
    if (!mount_ref.current) return;

    function handle_resize() {
      if (!mount_ref.current || !camera_ref.current || !renderer_ref.current) return;
      const width = mount_ref.current.clientWidth;
      const height = mount_ref.current.clientHeight;
      renderer_ref.current.setSize(width, height);
      const aspect = width / height;
      const frustumSize = 100;
      camera_ref.current.left = -frustumSize * aspect / 2;
      camera_ref.current.right = frustumSize * aspect / 2;
      camera_ref.current.top = frustumSize / 2;
      camera_ref.current.bottom = -frustumSize / 2;
      camera_ref.current.updateProjectionMatrix();
    }

    window.addEventListener('resize', handle_resize);

    // Initial resize
    handle_resize();

    // Cleanup
    return () => {
      // Use renderer_ref.current instead of renderer
      if (renderer_ref.current) renderer_ref.current.dispose();
      window.removeEventListener('resize', handle_resize);
      if (mount_ref.current && renderer_ref.current) {
        mount_ref.current.removeChild(renderer_ref.current.domElement);
      }
    };
  }, []);

  // show the stock mesh in the 3D scene whenever the show_stock toggle changes
  useEffect(() => {
    if (!scene_ref.current) return;
    const scene = scene_ref.current;

    // Remove previous stock mesh if present
    if (stock_mesh_ref.current) {
      scene.remove(stock_mesh_ref.current);
      stock_mesh_ref.current = null;
    }
    // Remove previous heightmap mesh if present
    if (scene.children) {
      scene.children
        .filter(obj => obj.userData.is_stock_heightmap)
        .forEach(obj => scene.remove(obj));
    }

    // Show solid box for stock (actually the carved result, not the initial stock)
    if (show_stock && window.current_heightmap && box_bounds) {
      const min_z = box_bounds.min.z;
      const mesh = heightmap_to_solid_mesh(window.current_heightmap);
      mesh.userData.is_stock_heightmap = true;
      // This mesh is the carved result after simulation, not the initial uncut stock.
      // Use a visually distinct, solid material for clarity
      mesh.material = new THREE.MeshNormalMaterial({ flatShading: true });
      scene.add(mesh);
    }
  }, [show_stock, box_bounds, scene_ref.current, stock_update_counter]);

  // update mesh material to wireframe or normal based on show_wireframe toggle
  useEffect(() => {
    if (!scene_ref.current) return;
    scene_ref.current.children.forEach(obj => {
      if (obj.userData.is_stl && obj instanceof THREE.Mesh) {
        if (!show_mesh) {
          obj.visible = false;
        } else {
          obj.visible = true;
          if (show_wireframe) {
            obj.material = new THREE.MeshBasicMaterial({ color: 0x2196f3, wireframe: true });
          } else {
            obj.material = new THREE.MeshPhongMaterial({ color: 0x2196f3, flatShading: true });
          }
        }
      }
      if (obj.userData.is_stock_heightmap && obj instanceof THREE.Mesh) {
        if (!show_stock) {
          obj.visible = false;
        } else {
          obj.visible = true;
          if (show_stock_wireframe) {
            obj.material = new THREE.MeshBasicMaterial({ color: 0xff9800, wireframe: true });
          } else {
            obj.material = new THREE.MeshNormalMaterial({ flatShading: true });
          }
        }
      }
    });
  }, [show_mesh, show_wireframe, show_stock, show_stock_wireframe]);

  // update visibility of mesh, toolpath, and bounding box based on UI toggles
  useEffect(() => {
    if (!scene_ref.current) return;
    scene_ref.current.children.forEach(obj => {
      if (obj.userData.is_stl) obj.visible = show_mesh;
      if (obj.userData.is_tool_path) obj.visible = show_toolpath;
      if (obj.userData.is_bounding_box) obj.visible = show_bounding_box;
    });
  }, [show_mesh, show_toolpath, show_bounding_box]);


  const fit_camera_to_object = (
    camera: THREE.OrthographicCamera,
    controls: OrbitControls,
    box: THREE.Box3,
    offset: number = 1.25
  ) => {
    const size = new THREE.Vector3();
    box.getSize(size);

    // Get the max dimension for scaling
    const maxDim = Math.max(size.x, size.y, size.z);

    // Get the center of the object
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Calculate camera position for CNC convention: X right, Y away, Z up, origin at front-left-bottom
    // Place camera at a custom angle: more horizontal X, more vertical Y, still above
    const distance = maxDim * offset;
    // Custom angle: X is more horizontal, Y is more vertical (between isometric and front)
    // Use a mix of -X and -Y for camera position
    const cam_x = box.min.x + distance * 0.2;
    const cam_y = box.min.y - distance * 0.9;
    const cam_z = box.max.z + distance * 0.6;
    camera.position.set(cam_x, cam_y, cam_z);
    camera.up.set(0, 0, 1); // Z up
    camera.lookAt(center.x, center.y, center.z);

    // Calculate the new frustum size
    const aspect = mount_ref.current ? mount_ref.current.clientWidth / mount_ref.current.clientHeight : 1;
    const newFrustumSize = maxDim * offset;

    // Update camera frustum
    camera.left = -newFrustumSize * aspect;
    camera.right = newFrustumSize * aspect;
    camera.top = newFrustumSize;
    camera.bottom = -newFrustumSize;
    camera.near = -distance * 10;
    camera.far = distance * 10;

    camera.updateProjectionMatrix();

    // Update controls
    controls.target.copy(center);
    controls.update();
  };


  function run_simulation(geometry: THREE.BufferGeometry, tool: any, box_bounds: { min: THREE.Vector3, max: THREE.Vector3 }) {
    // Assumes geometry has boundingBox computed, tool is a flat object, box_bounds is {min, max}
    const box = new THREE.Box3(box_bounds.min.clone(), box_bounds.max.clone());
    set_box_bounds({ min: box.min.clone(), max: box.max.clone() });
    const linewidth = compute_linewidth(box);
    const boxHelper = new THREE.Box3Helper(box, 0xff0000);
    boxHelper.userData.is_bounding_box = true;
    scene_ref.current!.add(boxHelper);
    boxHelper.visible = show_bounding_box;

    // Removed camera reset here to preserve user view
    // if (camera_ref.current && controls_ref.current) {
    //   fit_camera_to_object(camera_ref.current, controls_ref.current, box);
    // }

    // Set bounding box size in state
    const size = new THREE.Vector3();
    box.getSize(size);
    set_box_size(size);
    set_box_bounds({ min: box.min.clone(), max: box.max.clone() });


    // Tool path parameters (all in STL coordinates)
    const step_over = tool.cutter_diameter * step_over_percent;

    // Raster path generation (along X, stepping in Y)
    const min_x = box.min.x, max_x = box.max.x;
    const min_y = box.min.y, max_y = box.max.y;
    const max_z = box.max.z + 0.010; // Start just above the stock

    // Build the heightmap once, using STL coordinates
    const grid = {
      min_x: min_x,
      max_x: max_x,
      min_y: min_y,
      max_y: max_y,
      res_x: toolpath_grid_resolution,
      res_y: toolpath_grid_resolution,
    };
    const heightmap = heightmap_from_mesh(geometry, grid);

    // remove all existing toolpath lines from the scene
    scene_ref.current!.children
      .filter(obj => obj.userData.is_tool_path)
      .forEach(obj => scene_ref.current!.remove(obj));

    // 1. Create a stock object from the heightmap bounds (STL coordinates)
    const stock_width = max_x - min_x;
    const stock_height = max_y - min_y;
    // Use grid cell counts for stock creation
    const grid_cells_x = grid.res_x + 1;
    const grid_cells_y = grid.res_y + 1;
    const stock_initial_height = box.max.z;
    // Set origin_x, origin_y to min_x, min_y (matches mesh/toolpath)
    const stock = create_heightmap_stock(
      stock_width,
      stock_height,
      grid_cells_x,
      grid_cells_y,
      stock_initial_height,
      min_x,
      min_y
    );
    // 2. Generate toolpath in STL coordinates
    toolpath_points_ref.current = []; // now an array of arrays
    let reverse = false;
    const points_per_line = 200;
    for (
      let y_idx = 0;
      y_idx < grid.res_y;
      y_idx += Math.max(1, Math.round(step_over / ((max_y - min_y) / grid.res_y)))
    ) {
      const y = min_y + (max_y - min_y) * (y_idx / grid.res_y);
      const line_points: THREE.Vector3[] = [];
      for (
        let x_idx = 0;
        x_idx < grid.res_x;
        x_idx += Math.max(1, Math.floor(grid.res_x / points_per_line))
      ) {
        const x = min_x + (max_x - min_x) * (x_idx / grid.res_x);
        const z = heightmap[y_idx][x_idx] > -Infinity ? heightmap[y_idx][x_idx] + 0.001 : box.min.z;
        line_points.push(new THREE.Vector3(x, y, z));
      }
      if (reverse) line_points.reverse();

      // Store this tool operation (line) as an array of points
      toolpath_points_ref.current.push(line_points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })));

      const positions = [];
      for (const pt of line_points) {
        positions.push(pt.x, pt.y, pt.z);
      }
      const line_geometry = new LineGeometry();
      line_geometry.setPositions(positions);
      const line_material = new LineMaterial({
        color: 0x00ff00,
        linewidth: linewidth,
        alphaToCoverage: true
      });
      line_material.resolution.set(window.innerWidth, window.innerHeight);
      const line = new Line2(line_geometry, line_material);
      line.computeLineDistances();
      line.userData.is_tool_path = true;
      scene_ref.current!.add(line);
      line.visible = show_toolpath
      reverse = !reverse;
    }

    // 3. Log toolpath extents for debugging
    if (toolpath_points_ref.current.length > 0) {
      let min_tx = Infinity, max_tx = -Infinity;
      let min_ty = Infinity, max_ty = -Infinity;
      let min_tz = Infinity, max_tz = -Infinity;
      for (const op of toolpath_points_ref.current) {
        for (const pt of op) {
          if (pt.x < min_tx) min_tx = pt.x;
          if (pt.x > max_tx) max_tx = pt.x;
          if (pt.y < min_ty) min_ty = pt.y;
          if (pt.y > max_ty) max_ty = pt.y;
          if (pt.z < min_tz) min_tz = pt.z;
          if (pt.z > max_tz) max_tz = pt.z;
        }
      }
      console.log(
        'Toolpath extents:',
        'x:', min_tx, 'to', max_tx,
        'y:', min_ty, 'to', max_ty,
        'z:', min_tz, 'to', max_tz
      );
    } else {
      console.log('Toolpath is empty after generation!');
    }

    // 4. Simulate material removal after toolpath is generated (all in STL coordinates)
    // Flatten all tool operations for simulation
    simulate_material_removal(stock, tool, toolpath_points_ref.current.flat());

    // 5. Assign to window.current_heightmap for visualization effect
    window.current_heightmap = stock;
    set_stock_update_counter((c: number) => c + 1);
    // 6. Force update by toggling show_stock or updating box_bounds
    set_show_stock(false);
    setTimeout(() => set_show_stock(true), 0)
  }

  function handle_generate() {
    if (!box_bounds) return;
    const selected_op = operations[selected_operation_index];
    if (selected_op?.type === 'flatten') {
      // Generate flatten toolpath for the selected flatten operation
      set_generating_flatten(true);
      const min_x = box_bounds.min.x;
      const max_x = box_bounds.max.x;
      const min_y = box_bounds.min.y;
      const max_y = box_bounds.max.y;
      const z = box_bounds.max.z - selected_op.params.flatten_depth;
      const step_over = selected_op.params.tool.cutter_diameter * selected_op.params.step_over_percent;
      const toolpath: { x: number; y: number; z: number }[] = [];
      let reverse = false;
      for (let y = min_y; y <= max_y; y += step_over) {
        const line: { x: number; y: number; z: number }[] = [];
        for (let x = min_x; x <= max_x; x += step_over / 2) {
          line.push({ x, y, z });
        }
        if (reverse) line.reverse();
        toolpath.push(...line);
        reverse = !reverse;
      }
      set_flatten_toolpath(toolpath);
      // Simulate material removal for flatten toolpath and update carved result
      // Create a stock object matching the current box_bounds
      const size = new THREE.Vector3();
      size.subVectors(box_bounds.max, box_bounds.min);
      const grid_cells_x = 100; // reasonable default for flatten
      const grid_cells_y = 100;
      const stock = create_heightmap_stock(
        size.x,
        size.y,
        grid_cells_x,
        grid_cells_y,
        box_bounds.max.z,
        box_bounds.min.x,
        box_bounds.min.y
      );
      simulate_material_removal(stock, selected_op.params.tool, toolpath);
      window.current_heightmap = stock;
      set_stock_update_counter((c: number) => c + 1);
      set_show_stock(false);
      setTimeout(() => set_show_stock(true), 0);
      set_generating_flatten(false);
      set_simulation_dirty(false);
      return;
    }
    if (!stl_geometry) return;
    set_generating(true); // Disable button instantly
    set_simulation_dirty(false); // Mark as not dirty
    set_generate_timings(null);

    setTimeout(() => {
      const timings: any = {};
      let t0 = performance.now();
      set_last_tool(tool);

      // 1. Tool/parameter validation
      const grid_cell_size_x = (box_bounds.max.x - box_bounds.min.x) / toolpath_grid_resolution;
      const grid_cell_size_y = (box_bounds.max.y - box_bounds.min.y) / toolpath_grid_resolution;
      const required_tool_size = Math.max(grid_cell_size_x, grid_cell_size_y) * 1.2;
      timings.validation = performance.now() - t0;
      t0 = performance.now();

      if (tool.cutter_diameter <= required_tool_size) {
        set_tool_error(
          `Tool cutter diameter (${tool.cutter_diameter} mm) is smaller than or equal to the minimum grid cell size with margin (${required_tool_size.toFixed(2)} mm). Increase the tool size or grid resolution for better results.`
        );
        set_generating(false);
        return;
      } else {
        set_tool_error(null);
      }

      // 2. Toolpath generation (heightmap, toolpath, lines)
      const run_simulation_with_timing = (geometry: THREE.BufferGeometry, tool: any, box_bounds: { min: THREE.Vector3, max: THREE.Vector3 }) => {
        let t1 = performance.now();
        // ...existing code before heightmap...
        const box = new THREE.Box3(box_bounds.min.clone(), box_bounds.max.clone());
        set_box_bounds({ min: box.min.clone(), max: box.max.clone() });
        const linewidth = compute_linewidth(box);
        const boxHelper = new THREE.Box3Helper(box, 0xff0000);
        boxHelper.userData.is_bounding_box = true;
        scene_ref.current!.add(boxHelper);
        boxHelper.visible = show_bounding_box;
        const size = new THREE.Vector3();
        box.getSize(size);
        set_box_size(size);
        set_box_bounds({ min: box.min.clone(), max: box.max.clone() });
        const step_over = tool.cutter_diameter * step_over_percent;
        const min_x = box.min.x, max_x = box.max.x;
        const min_y = box.min.y, max_y = box.max.y;
        const max_z = box.max.z + 0.010;
        const grid = {
          min_x: min_x,
          max_x: max_x,
          min_y: min_y,
          max_y: max_y,
          res_x: toolpath_grid_resolution,
          res_y: toolpath_grid_resolution,
        };
        const heightmap_start = performance.now();
        const heightmap = heightmap_from_mesh(geometry, grid);
        timings.heightmap = performance.now() - heightmap_start;
        // ...existing code for toolpath...
        scene_ref.current!.children
          .filter(obj => obj.userData.is_tool_path)
          .forEach(obj => scene_ref.current!.remove(obj));
        // Always use the same bounding box for stock and toolpath grid
        // Use min_x, min_y from the mesh bounding box for both
        const stock_width = max_x - min_x;
        const stock_height = max_y - min_y;
        const stock_initial_height = box.max.z;
        // Compute grid cell counts: only the larger dimension gets the full resolution
        let grid_cells_x, grid_cells_y;
        if (stock_width >= stock_height) {
          grid_cells_x = toolpath_grid_resolution + 1;
          grid_cells_y = Math.round((stock_height / stock_width) * toolpath_grid_resolution) + 1;
        } else {
          grid_cells_y = toolpath_grid_resolution + 1;
          grid_cells_x = Math.round((stock_width / stock_height) * toolpath_grid_resolution) + 1;
        }
        console.log(`Grid cells: x=${grid_cells_x}, y=${grid_cells_y} (user res=${toolpath_grid_resolution})`);
        const stock = create_heightmap_stock(
          stock_width,
          stock_height,
          grid_cells_x,
          grid_cells_y,
          stock_initial_height,
          min_x,
          min_y
        );
        toolpath_points_ref.current = [];
        let reverse = false;
        const points_per_line = 200;
        const toolpath_start = performance.now();
        for (
          let y_idx = 0;
          y_idx < grid.res_y;
          y_idx += Math.max(1, Math.round(step_over / ((max_y - min_y) / grid.res_y)))
        ) {
          const y = min_y + (max_y - min_y) * (y_idx / grid.res_y);
          const line_points: THREE.Vector3[] = [];
          for (
            let x_idx = 0;
            x_idx < grid.res_x;
            x_idx += Math.max(1, Math.floor(grid.res_x / points_per_line))
          ) {
            const x = min_x + (max_x - min_x) * (x_idx / grid.res_x);
            const z = heightmap[y_idx][x_idx] > -Infinity ? heightmap[y_idx][x_idx] + 0.001 : box.min.z;
            line_points.push(new THREE.Vector3(x, y, z));
          }
          if (reverse) line_points.reverse();
          toolpath_points_ref.current.push(line_points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })));
          const positions = [];
          for (const pt of line_points) {
            positions.push(pt.x, pt.y, pt.z);
          }
          const line_geometry = new LineGeometry();
          line_geometry.setPositions(positions);
          const line_material = new LineMaterial({
            color: 0x00ff00,
            linewidth: linewidth,
            alphaToCoverage: true
          });
          line_material.resolution.set(window.innerWidth, window.innerHeight);
          const line = new Line2(line_geometry, line_material);
          line.computeLineDistances();
          line.userData.is_tool_path = true;
          scene_ref.current!.add(line);
          line.visible = show_toolpath
          reverse = !reverse;
        }
        timings.toolpath = performance.now() - toolpath_start;
        // ...existing code for toolpath extents...
        // 3. Material removal simulation
        const sim_start = performance.now();
        simulate_material_removal(stock, tool, toolpath_points_ref.current.flat());
        timings.simulation = performance.now() - sim_start;
        // 4. Stock mesh update/visualization
        const mesh_start = performance.now();
        window.current_heightmap = stock;
        set_stock_update_counter((c: number) => c + 1);
        set_show_stock(false);
        setTimeout(() => set_show_stock(true), 0);
        timings.mesh_update = performance.now() - mesh_start;
      };

      run_simulation_with_timing(stl_geometry, tool, box_bounds);
      set_generate_timings(timings);
      set_generating(false);
    }, 0);
  }

  // handle_file_change: loads STL, generates heightmap, toolpath, simulates material removal, updates visualization
  const handle_file_change = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileChange called', event.target.files?.[0]);
    const file = event.target.files?.[0];
    if (!file || !scene_ref.current) return;

    set_box_size(new THREE.Vector3(0, 0, 0));
    const reader = new FileReader();
    reader.onload = function (e) {
      const contents = e.target?.result;
      if (!contents) return;

      // Remove previous STL meshes, bounding boxes, and toolpaths
      scene_ref.current!.children
        .filter(obj => obj.userData.is_stl || obj.userData.is_bounding_box || obj.userData.is_tool_path)
        .forEach(obj => scene_ref.current!.remove(obj));

      const loader = new STLLoader();
      const geometry = loader.parse(contents as ArrayBuffer);
      set_stl_geometry(geometry);
      // Use a blue-tinted MeshPhongMaterial for STL mesh to distinguish from carved result
      const material = new THREE.MeshPhongMaterial({ color: 0x2196f3, flatShading: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.is_stl = true;
      scene_ref.current!.add(mesh);
      mesh.visible = show_mesh;

      // Compute and set bounding box for the new mesh
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const box = new THREE.Box3().setFromObject(mesh);
        set_box_bounds({ min: box.min.clone(), max: box.max.clone() });
        // Remove any previous bounding box
        scene_ref.current!.children
          .filter(obj => obj.userData.is_bounding_box)
          .forEach(obj => scene_ref.current!.remove(obj));
        // Add bounding box helper immediately after STL load
        const boxHelper = new THREE.Box3Helper(box, 0xff0000);
        boxHelper.userData.is_bounding_box = true;
        boxHelper.visible = show_bounding_box;
        scene_ref.current!.add(boxHelper);
        // Fit camera to bounding box and set Z-up
        if (camera_ref.current && controls_ref.current) {
          camera_ref.current.up.set(0, 0, 1); // Z axis up
          fit_camera_to_object(camera_ref.current, controls_ref.current, box);
        }
      }
      set_simulation_dirty(true);
      set_stock_defined(true);
    };
    reader.readAsArrayBuffer(file);
  };

  // Handler for starting with blank/manual stock
  function handle_start_blank_stock() {
    // Add a stock operation as the first operation with default size
    const default_stock: StockOperation = {
      type: 'stock',
      params: {
        width: 100,
        height: 100,
        thickness: 20
      }
    };
    set_operations([default_stock]);
    set_selected_operation_index(0);
    set_stock_defined(true);
    const min = new THREE.Vector3(0, 0, 0);
    const max = new THREE.Vector3(100, 100, 20);
    set_box_bounds({ min, max });
    set_box_size(new THREE.Vector3(100, 100, 20));
    set_stl_geometry(null); // No STL loaded
    set_simulation_dirty(true);
    // Add bounding box helper for blank stock
    if (scene_ref.current) {
      // Remove any previous bounding box
      scene_ref.current!.children
        .filter(obj => obj.userData && obj.userData.is_bounding_box)
        .forEach(obj => scene_ref.current!.remove(obj));
      const box = new THREE.Box3(min.clone(), max.clone());
      const boxHelper = new THREE.Box3Helper(box, 0xff0000);
      boxHelper.userData.is_bounding_box = true;
      boxHelper.visible = show_bounding_box;
      scene_ref.current!.add(boxHelper);
      // Fit camera to bounding box and set Z-up
      if (camera_ref.current && controls_ref.current) {
        camera_ref.current.up.set(0, 0, 1); // Z axis up
        fit_camera_to_object(camera_ref.current, controls_ref.current, box);
      }
    }
  }

  //////////////////////////////////////////////////////////
  // Add effect to render/remove the initial stock block
  useEffect(() => {
    if (!scene_ref.current) return;
    const scene = scene_ref.current;
    // Remove previous initial stock mesh if present
    scene.children
      .filter((obj: any) => obj.userData && obj.userData.is_initial_stock)
      .forEach((obj: any) => scene.remove(obj));
    if (show_initial_stock && box_bounds) {
      // Render a transparent rectangular solid for the initial stock
      const size = new THREE.Vector3();
      const min = box_bounds.min;
      const max = box_bounds.max;
      size.subVectors(max, min);
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const material = new THREE.MeshPhongMaterial({ color: 0xffffff, opacity: 0.18, transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        min.x + size.x / 2,
        min.y + size.y / 2,
        min.z + size.z / 2
      );
      mesh.userData.is_initial_stock = true;
      scene.add(mesh);
    }
  }, [show_initial_stock, box_bounds]);

  // Flatten operation effects: generate toolpath for flattening
  useEffect(() => {
    if (!scene_ref.current || !box_bounds) return;
    const scene = scene_ref.current;

    // Remove previous flatten toolpath lines
    scene.children
      .filter(obj => obj.userData.is_tool_path && obj.userData.operation === 'flatten')
      .forEach(obj => scene.remove(obj));

    if (flatten_toolpath && flatten_toolpath.length > 0) {
      // Create lines for the flatten toolpath
      const positions = [];
      for (const pt of flatten_toolpath) {
        positions.push(pt.x, pt.y, pt.z);
      }
      const line_geometry = new LineGeometry();
      line_geometry.setPositions(positions);
      const line_material = new LineMaterial({
        color: 0xff9800,
        linewidth: 2,
        alphaToCoverage: true
      });
      line_material.resolution.set(window.innerWidth, window.innerHeight);
      const line = new Line2(line_geometry, line_material);
      line.computeLineDistances();
      line.userData.is_tool_path = true;
      line.userData.operation = 'flatten';
      scene.add(line);
    }
  }, [flatten_toolpath, scene_ref.current, box_bounds]);

  // Generate a raster flatten toolpath for the current stock bounds
  function handle_flatten_generate() {
    if (!box_bounds || !tool) return;
    set_generating_flatten(true);
    // For now, flatten the entire top face of the stock
    const min_x = box_bounds.min.x;
    const max_x = box_bounds.max.x;
    const min_y = box_bounds.min.y;
    const max_y = box_bounds.max.y;
    const z = box_bounds.max.z - flatten_depth;
    const step_over = tool.cutter_diameter * step_over_percent;
    const toolpath: { x: number; y: number; z: number }[] = [];
    let reverse = false;
    for (
      let y = min_y; y <= max_y; y += step_over
    ) {
      const line: { x: number; y: number; z: number }[] = [];
      for (
        let x = min_x; x <= max_x; x += step_over / 2
      ) {
        line.push({ x, y, z });
      }
      if (reverse) line.reverse();
      toolpath.push(...line);
      reverse = !reverse;
    }
    set_flatten_toolpath(toolpath);
    // Simulate material removal for flatten toolpath and update carved result
    // Create a stock object matching the current box_bounds
    const size = new THREE.Vector3();
    size.subVectors(box_bounds.max, box_bounds.min);
    const grid_cells_x = 100; // reasonable default for flatten
    const grid_cells_y = 100;
    const stock = create_heightmap_stock(
      size.x,
      size.y,
      grid_cells_x,
      grid_cells_y,
      box_bounds.max.z,
      box_bounds.min.x,
      box_bounds.min.y
    );
    simulate_material_removal(stock, tool, toolpath);
    window.current_heightmap = stock;
    set_stock_update_counter((c: number) => c + 1);
    set_show_stock(false);
    setTimeout(() => set_show_stock(true), 0);
    set_generating_flatten(false);
  }

  // Export flatten toolpath as G-code
  function handle_export_flatten_gcode() {
    if (!flatten_toolpath || flatten_toolpath.length === 0 || !box_bounds) return;
    const gcode = generate_gcode([flatten_toolpath], { safe_z: box_bounds.max.z + 5 });
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flatten.nc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Add effect to update bounding box helper when box_bounds changes
  useEffect(() => {
    if (!scene_ref.current || !box_bounds) return;
    // Remove any previous bounding box
    scene_ref.current.children
      .filter(obj => obj.userData && obj.userData.is_bounding_box)
      .forEach(obj => scene_ref.current!.remove(obj));
    // Add new bounding box helper
    const box = new THREE.Box3(box_bounds.min.clone(), box_bounds.max.clone());
    const boxHelper = new THREE.Box3Helper(box, 0xff0000);
    boxHelper.userData.is_bounding_box = true;
    boxHelper.visible = show_bounding_box;
    scene_ref.current.add(boxHelper);
  }, [box_bounds, show_bounding_box]);

  // Section: tool effect: show the tool in the 3D scene whenever tool parameters or bounding box change
  useEffect(() => {
    if (!scene_ref.current) return;
    // Get the tool for the selected operation (skip if stock op)
    const op = operations[selected_operation_index];
    let op_tool = null;
    if (op && op.type === 'carve' && op.params.tool) {
      op_tool = op.params.tool;
    } else if (op && op.type === 'flatten' && op.params.tool) {
      op_tool = op.params.tool;
    }
    // Remove previous tool mesh if present
    if (tool_mesh_ref.current) {
      scene_ref.current.remove(tool_mesh_ref.current);
      tool_mesh_ref.current = null;
    }
    // Only show tool if box_bounds and op_tool are defined
    if (!box_bounds || !op_tool) return;
    // Place the tool at the top-front-left of the bounding box (min.x, max.y, max.z)
    const tool_position = new THREE.Vector3(
      box_bounds.min.x,
      box_bounds.min.y,
      box_bounds.max.z
    );
    // CNC convention: Z up, so rotate tool to point down -Y (Three.js default is Y up)
    const tool_rotation = new THREE.Euler(Math.PI / 2, 0, 0);

    // Create a group for the tool
    const tool_group = new THREE.Group();
    // Cutter (lower part)
    let cutter_geometry;
    if (op_tool.type === 'ball') {
      // Ball-nose: cylinder + hemisphere
      const cyl_height = Math.max(op_tool.length_of_cut - op_tool.cutter_diameter / 2, 0.001);
      const cyl_geom = new THREE.CylinderGeometry(
        op_tool.cutter_diameter / 2,
        op_tool.cutter_diameter / 2,
        cyl_height,
        32
      );
      cyl_geom.translate(0, cyl_height / 2 + op_tool.cutter_diameter / 2, 0);
      const sphere_geom = new THREE.SphereGeometry(
        op_tool.cutter_diameter / 2,
        32,
        16,
        0,
        Math.PI * 2,
        -Math.PI,
        Math.PI / 2
      );
      sphere_geom.translate(0, op_tool.cutter_diameter/2,0); // hemisphere at base
      cutter_geometry = BufferGeometryUtils.mergeGeometries([
        cyl_geom,
        sphere_geom
      ]) as THREE.BufferGeometry;
      cutter_geometry.computeVertexNormals();
    } else if (op_tool.type === 'vbit') {
      // V-bit: cone with correct V angle + cylinder for length_of_cut
      const radius = op_tool.cutter_diameter / 2;
      const v_angle_rad = op_tool.v_angle * Math.PI / 180;
      const cone_height = radius / Math.tan(v_angle_rad / 2);
      const cone_geom = new THREE.ConeGeometry(
        radius,
        cone_height,
        64
      );
      cone_geom.rotateX(Math.PI);
      cone_geom.translate(0, cone_height / 2, 0);
      let cutter_geoms: THREE.BufferGeometry[] = [cone_geom];
      const cyl_height = Math.max(op_tool.length_of_cut - cone_height, 0.001);
 
      if (op_tool.length_of_cut > cone_height) {
        const cyl_geom = new THREE.CylinderGeometry(
          op_tool.cutter_diameter / 2,
          op_tool.cutter_diameter / 2,
          cyl_height,
          32
        );
        cyl_geom.translate(0, cyl_height / 2 + cone_height, 0);
        cutter_geoms.push(cyl_geom);
      }
      cutter_geometry = BufferGeometryUtils.mergeGeometries(cutter_geoms) as THREE.BufferGeometry;
      cutter_geometry.computeVertexNormals();
    } else {
      // Flat endmill: just a cylinder
      cutter_geometry = new THREE.CylinderGeometry(
        op_tool.cutter_diameter / 2,
        op_tool.cutter_diameter / 2,
        op_tool.length_of_cut,
        32
      );
      cutter_geometry.translate(0, op_tool.length_of_cut / 2, 0);
    }
    const cutter_material = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, side: THREE.DoubleSide });
    const cutter_mesh = new THREE.Mesh(cutter_geometry, cutter_material);
    tool_group.add(cutter_mesh);
    // Shank (upper part)
    const shank_length = Math.max(op_tool.overall_length - op_tool.length_of_cut, 0.0001);
    const shank_geometry = new THREE.CylinderGeometry(
      op_tool.shank_diameter / 2,
      op_tool.shank_diameter / 2,
      shank_length,
      32
    );
    shank_geometry.translate(0, op_tool.length_of_cut + shank_length / 2, 0);
    const shank_material = new THREE.MeshPhongMaterial({ color: 0x2196f3 });
    const shank_mesh = new THREE.Mesh(shank_geometry, shank_material);
    tool_group.add(shank_mesh);
    tool_group.position.copy(tool_position);
    tool_group.rotation.copy(tool_rotation);
    tool_group.userData.is_tool_visual = true;
    scene_ref.current.add(tool_group);
    tool_mesh_ref.current = tool_group;
  }, [operations, selected_operation_index, box_bounds, scene_ref.current]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Control Panel */}
      <div className="control-panel" style={{ position: 'absolute', top: 20, left: 20, zIndex: 20 }}>
        {/* Logo and Welcome/Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <img src="/assets/robonerd-robot-logo-light.svg" alt="RoboNerd Logo" style={{ width: 80, height: 80, marginBottom: 12, filter: 'drop-shadow(0 2px 8px #0006)' }} />
          {!stock_defined && (
            <div style={{ color: '#eee', fontSize: '1.15em', textAlign: 'center', marginBottom: 12, lineHeight: 1.4 }}>
              <strong>Welcome!</strong><br />
              <span style={{ fontWeight: 400 }}>
                Load a 3D model (STL) or start with blank stock to begin.<br />
                <span style={{ color: '#aaa', fontSize: '0.98em' }}>
                  You can adjust toolpaths, simulation, and export options after defining your stock.
                </span>
              </span>
            </div>
          )}
        </div>
        {/* File Section (always visible) */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '1.05em' }}>File</div>
          <input type="file" accept=".stl" onChange={handle_file_change} style={{ width: '100%', marginBottom: 8 }} />
          <button style={{ width: '100%', fontWeight: 600, background: '#fff', color: '#222', border: 'none', borderRadius: 4, padding: '8px 0', boxShadow: '0 1px 4px #0002', cursor: 'pointer', transition: 'background 0.2s' }} onClick={handle_start_blank_stock}>
            Start with Blank Stock
          </button>
        </div>
        {/* Hide all other controls until stock is defined */}
        {stock_defined && (
          <>
            {/* Calculation Section */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Calculation</div>
              <label style={{ display: 'block', marginBottom: 4 }}>
                Toolpath Grid Resolution
                <input
                  type="number"
                  min={20}
                  max={1000}
                  step="any"
                  value={toolpath_grid_resolution}
                  onChange={e => {
                    set_toolpath_grid_resolution(Number(e.target.value));
                    set_simulation_dirty(true);
                  }}
                  style={{ width: 80, marginLeft: 8 }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 4 }}>
                Tool Step Over (% of Cutter Diameter)
                <input
                  type='number'
                  min={0.05}
                  max={1.0}
                  step="any"
                  value={step_over_percent}
                  onChange={e => {
                    set_step_over_percent(Number(e.target.value));
                    set_simulation_dirty(true);
                  }}
                  style={{ width: 80, marginLeft: 8 }}
                />
                <span style={{ marginLeft: 8, color: '#aaa', fontSize: '0.95em' }}>
                  (lower = smoother, slower)
                </span>
              </label>
            </div>
            {/* Visibility Section */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Visibility</div>
              {/* Show/hide the original STL model, with option for wireframe */}
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={show_mesh} onChange={e => set_show_mesh(e.target.checked)} />{' '}
                Show STL Model
              </label>
              {show_mesh && (
                <label style={{ display: 'block', marginBottom: 4, marginLeft: 24 }}>
                  <input type="checkbox" checked={show_wireframe} onChange={e => set_show_wireframe(e.target.checked)} />{' '}
                  Show as Wireframe
                </label>
              )}
              {/* Show/hide the initial stock block (transparent) */}
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={show_initial_stock} onChange={e => set_show_initial_stock(e.target.checked)} />{' '}
                Show Stock (Initial Block)
              </label>
              {/* Show/hide the carved result (simulated stock), with option for wireframe */}
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={show_stock} onChange={e => set_show_stock(e.target.checked)} />{' '}
                Show Carved Result
              </label>
              {show_stock && (
                <label style={{ display: 'block', marginBottom: 4, marginLeft: 24 }}>
                  <input type="checkbox" checked={show_stock_wireframe} onChange={e => set_show_stock_wireframe(e.target.checked)} />{' '}
                  Show as Wireframe
                </label>
              )}
              {/* Show/hide the toolpath lines */}
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={show_toolpath} onChange={e => set_show_toolpath(e.target.checked)} />{' '}
                Show Toolpath
              </label>
              {/* Show/hide the bounding box */}
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input type="checkbox" checked={show_bounding_box} onChange={e => set_show_bounding_box(e.target.checked)} />{' '}
                Show Bounding Box
              </label>
              {/* Bounding Box Info and Controls */}
              <div style={{ marginTop: 20, color: '#ccc', fontSize: '0.95em' }}>
                <div>
                  <strong>Bounding Box:</strong>{' '}
                  {boxSize && `${boxSize.x.toFixed(2)} × ${boxSize.y.toFixed(2)} × ${boxSize.z.toFixed(2)}`}
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>3D Controls:</strong>
                  <div>
                    Rotate: <kbd>Left Mouse</kbd> &nbsp;|&nbsp;
                    Zoom: <kbd>Scroll</kbd> &nbsp;|&nbsp;
                    Pan: <kbd>Right Mouse</kbd> or <kbd>Ctrl + Left Mouse</kbd>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {/* Divider and operations panel (already stock_defined-gated below) */}
        {stock_defined && (
          <hr style={{ border: 0, borderTop: '1px solid #444', margin: '16px 0' }} />
        )}
        {/* Show operations and per-operation controls only if stock is defined */}
        {stock_defined ? (
          <>
            {/* Operations Section */}
            <div style={{ marginBottom: 16, border: '1px solid #444', borderRadius: 4, padding: 8 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Operations</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {operations.map((op, idx) => (
                  <li
                    key={idx}
                    style={{
                      background: idx === selected_operation_index ? '#333' : 'transparent',
                      color: idx === selected_operation_index ? '#fff' : '#ccc',
                      padding: '4px 8px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      marginBottom: 2
                    }}
                    onClick={() => set_selected_operation_index(idx)}
                  >
                    {op.type.charAt(0).toUpperCase() + op.type.slice(1)}
                  </li>
                ))}
              </ul>
              <button
                style={{ width: '100%', marginTop: 6 }}
                onClick={() => set_operations([
                  ...operations,
                  {
                    type: 'carve',
                    params: {
                      tool: { ...tool },
                      step_over_percent,
                      toolpath_grid_resolution
                    }
                  } as CarveOperation
                ])}
              >
                + Add Carve Operation
              </button>
              <button
                style={{ width: '100%', marginTop: 6 }}
                onClick={() => set_operations([
                  ...operations,
                  {
                    type: 'flatten',
                    params: {
                      flatten_depth,
                      tool: { ...tool },
                      step_over_percent
                    }
                  } as FlattenOperation
                ])}
              >
                + Add Flatten Operation
              </button>
            </div>
            {/* Selected Operation Parameters Section */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Selected Operation Parameters</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Tool Section (per operation) */}
                <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Only show tool controls for the selected operation */}
                  {operations[selected_operation_index]?.type === 'carve' && (() => {
                    const op = operations[selected_operation_index] as CarveOperation;
                    return (
                      <>
                        <label>
                          Cutter Diameter
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.cutter_diameter}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'carve'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, cutter_diameter: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Shank Diameter
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.shank_diameter}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'carve'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, shank_diameter: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Overall Length
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.overall_length}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'carve'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, overall_length: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Length of Cut
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.length_of_cut}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'carve'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, length_of_cut: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Type
                          <select
                            value={op.params.tool.type}
                            onChange={e => {
                              const new_type = e.target.value;
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'carve'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, type: new_type, v_angle: new_type === 'vbit' ? (op2.params.tool.v_angle || 60) : 60 } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          >
                            <option value="flat">Flat</option>
                            <option value="ball">Ball</option>
                            <option value="vbit">V-bit</option>
                          </select>
                        </label>
                        {op.params.tool.type === 'vbit' && (
                          <label>
                            V Angle
                            <input
                              type="number"
                              min="10"
                              max="170"
                              step="any"
                              value={op.params.tool.v_angle}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                set_operations(ops => ops.map((op2, idx) =>
                                  idx === selected_operation_index && op2.type === 'carve'
                                    ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, v_angle: v } } }
                                    : op2
                                ));
                                set_simulation_dirty(true);
                              }}
                            />
                            °
                          </label>
                        )}
                        <button style={{ width: '100%' }} onClick={handle_generate} disabled={generating || !simulation_dirty}>Generate</button>
                        <button
                          disabled={simulation_dirty}
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            if (!box_bounds) return;
                            // Generate G-code for this carve operation's toolpath
                            const gcode = generate_gcode(toolpath_points_ref.current, { safe_z: box_bounds.max.z + 5 });
                            const blob = new Blob([gcode], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'carve.nc';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Generate G-code
                        </button>
                      </>
                    );
                  })()}
                  {/* Flatten operation parameters (flatten_depth, tool, step_over_percent) */}
                  {operations[selected_operation_index]?.type === 'flatten' && (() => {
                    const op = operations[selected_operation_index] as FlattenOperation;
                    return (
                      <>
                        <label>
                          Flatten Depth
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            value={op.params.flatten_depth}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, flatten_depth: v } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Cutter Diameter
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.cutter_diameter}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, cutter_diameter: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Shank Diameter
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.shank_diameter}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, shank_diameter: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Overall Length
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.overall_length}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, overall_length: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Length of Cut
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={op.params.tool.length_of_cut}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, length_of_cut: v } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          />
                          mm
                        </label>
                        <label>
                          Type
                          <select
                            value={op.params.tool.type}
                            onChange={e => {
                              const new_type = e.target.value;
                              set_operations(ops => ops.map((op2, idx) =>
                                idx === selected_operation_index && op2.type === 'flatten'
                                  ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, type: new_type, v_angle: new_type === 'vbit' ? (op2.params.tool.v_angle || 60) : 60 } } }
                                  : op2
                              ));
                              set_simulation_dirty(true);
                            }}
                          >
                            <option value="flat">Flat</option>
                            <option value="ball">Ball</option>
                            <option value="vbit">V-bit</option>
                          </select>
                        </label>
                        {op.params.tool.type === 'vbit' && (
                          <label>
                            V Angle
                            <input
                              type="number"
                              min="10"
                              max="170"
                              value={op.params.tool.v_angle}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                set_operations(ops => ops.map((op2, idx) =>
                                  idx === selected_operation_index && op2.type === 'flatten'
                                    ? { ...op2, params: { ...op2.params, tool: { ...op2.params.tool, v_angle: v } } }
                                    : op2
                                ));
                                set_simulation_dirty(true);
                              }}
                            />
                            °
                          </label>
                        )}
                        <button style={{ width: '100%' }} onClick={handle_generate} disabled={generating || !simulation_dirty}>Generate</button>
                        <button 
                          disabled={!flatten_toolpath || flatten_toolpath.length === 0}
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            if (!flatten_toolpath || flatten_toolpath.length === 0 || !box_bounds) return;
                            const gcode = generate_gcode([flatten_toolpath], { safe_z: box_bounds.max.z + 5 });
                            const blob = new Blob([gcode], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'flatten.nc';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Generate G-code
                        </button>
                      </>
                    );
                  })()}
                  {/* Stock operation parameters (width, height, thickness) */}
                  {operations[selected_operation_index]?.type === 'stock' && (() => {
                    const op = operations[selected_operation_index] as StockOperation;
                    // Helper to re-run carve simulation if carve op is selected after stock change
                    function rerun_carve_if_needed(new_width: number, new_height: number, new_thickness: number) {
                      const carve_op = operations.find(o => o.type === 'carve') as CarveOperation | undefined;
                      if (carve_op && toolpath_points_ref.current.length > 0) {
                        // Update box bounds for simulation
                        const min = new THREE.Vector3(0, 0, 0);
                        const max = new THREE.Vector3(new_width, new_height, new_thickness);
                        set_box_bounds({ min, max });
                        // Create a new stock object and re-run simulation
                        const grid_cells_x = 100;
                        const grid_cells_y = 100;
                        const stock = create_heightmap_stock(
                          new_width,
                          new_height,
                          grid_cells_x,
                          grid_cells_y,
                          new_thickness,
                          0,
                          0
                        );
                        simulate_material_removal(stock, carve_op.params.tool, toolpath_points_ref.current.flat());
                        window.current_heightmap = stock;
                        set_stock_update_counter((c: number) => c + 1);
                        set_show_stock(false);
                        setTimeout(() => set_show_stock(true), 0);
                      }
                    }
                    return (
                      <>
                        <label style={{ display: 'block', marginBottom: 4 }}>
                          Width (mm)
                          <input
                            type="number"
                            min={1}
                            value={op.params.width}
                            onChange={e => {
                              const width = Number(e.target.value);
                              set_operations(ops => ops.map((o, i) =>
                                i === selected_operation_index && o.type === 'stock'
                                  ? { ...o, params: { ...((o as StockOperation).params), width } }
                                  : o
                              ));
                              set_box_size(size => new THREE.Vector3(width, op.params.height, op.params.thickness));
                              set_box_bounds(bounds => bounds ? { min: bounds.min, max: new THREE.Vector3(bounds.min.x + width, bounds.min.y + op.params.height, bounds.min.z + op.params.thickness) } : bounds);
                              set_simulation_dirty(true);
                              rerun_carve_if_needed(width, op.params.height, op.params.thickness);
                            }}
                            style={{ width: 80, marginLeft: 8 }}
                          />
                        </label>
                        <label style={{ display: 'block', marginBottom: 4 }}>
                          Height (mm)
                          <input
                            type="number"
                            min={1}
                            value={op.params.height}
                            onChange={e => {
                              const height = Number(e.target.value);
                              set_operations(ops => ops.map((o, i) =>
                                i === selected_operation_index && o.type === 'stock'
                                  ? { ...o, params: { ...((o as StockOperation).params), height } }
                                  : o
                              ));
                              set_box_size(size => new THREE.Vector3(op.params.width, height, op.params.thickness));
                              set_box_bounds(bounds => bounds ? { min: bounds.min, max: new THREE.Vector3(bounds.min.x + op.params.width, bounds.min.y + height, bounds.min.z + op.params.thickness) } : bounds);
                              set_simulation_dirty(true);
                              rerun_carve_if_needed(op.params.width, height, op.params.thickness);
                            }}
                            style={{ width: 80, marginLeft: 8 }}
                          />
                        </label>
                        <label style={{ display: 'block', marginBottom: 4 }}>
                          Thickness (mm)
                          <input
                            type="number"
                            min={1}
                            value={op.params.thickness}
                            onChange={e => {
                              const thickness = Number(e.target.value);
                              set_operations(ops => ops.map((o, i) =>
                                i === selected_operation_index && o.type === 'stock'
                                  ? { ...o, params: { ...((o as StockOperation).params), thickness } }
                                  : o
                              ));
                              set_box_size(size => new THREE.Vector3(op.params.width, op.params.height, thickness));
                              set_box_bounds(bounds => bounds ? { min: bounds.min, max: new THREE.Vector3(bounds.min.x + op.params.width, bounds.min.y + op.params.height, bounds.min.z + thickness) } : bounds);
                              set_simulation_dirty(true);
                              rerun_carve_if_needed(op.params.width, op.params.height, thickness);
                            }}
                            style={{ width: 80, marginLeft: 8 }}
                          />
                        </label>
                      </>
                    );
                  })()}
                </form>
                {generate_timings && (
                  <div style={{ marginTop: 8, color: '#aaa', fontSize: '0.95em' }}>
                    <div><strong>Timing (ms):</strong></div>
                    <div>Validation: {generate_timings.validation?.toFixed(1)}</div>
                    <div>Heightmap: {generate_timings.heightmap?.toFixed(1)}</div>
                    <div>Toolpath: {generate_timings.toolpath?.toFixed(1)}</div>
                    <div>Simulation: {generate_timings.simulation?.toFixed(1)}</div>
                    <div>Mesh update: {generate_timings.mesh_update?.toFixed(1)}</div>
                  </div>
                )}
                {/* If window.last_simulation_timings is set, show it below the main timings */}
                {typeof window !== 'undefined' && window.last_simulation_timings && (
                  <div style={{ marginTop: 4, color: '#aaa', fontSize: '0.9em' }}>
                    <div><strong>Simulation details:</strong></div>
                    <div>Tool grid: {window.last_simulation_timings.tool_grid?.toFixed(1)} ms</div>
                    <div>Toolpath loop: {window.last_simulation_timings.toolpath_loop?.toFixed(1)} ms</div>
                    <div>Grid updates: {window.last_simulation_timings.grid_updates}</div>
                    <div>Total (JS only): {window.last_simulation_timings.total?.toFixed(1)} ms</div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div ref={mount_ref} style={{ width: '100vw', height: '100vh' }} />
    </div>
  );
};

export default StartPage;