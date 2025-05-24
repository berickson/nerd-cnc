import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { heightmap_from_mesh } from '../utils/heightmap_from_mesh.js';
import { generate_gcode } from '../utils/gcode_generator';
import { create_heightmap_stock, simulate_material_removal, heightmap_to_mesh, heightmap_to_solid_mesh } from "../utils/stock_simulator.js";
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

declare global {
  interface Window {
    current_heightmap?: any;
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

const StartPage: React.FC = () => {
  const mount_ref = useRef<HTMLDivElement>(null);
  const scene_ref = useRef<THREE.Scene>(null);
  const toolpath_points_ref = React.useRef<{ x: number; y: number; z: number }[]>([]);
  const camera_ref = useRef<THREE.OrthographicCamera | null>(null);
  const controls_ref = useRef<OrbitControls | null>(null);
  const tool_mesh_ref = useRef<THREE.Group | null>(null);

  const [boxSize, set_box_size] = React.useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const [box_bounds, set_box_bounds] = React.useState<{ min: THREE.Vector3, max: THREE.Vector3 } | null>(null); const [show_mesh, set_show_mesh] = React.useState(true);
  const [show_toolpath, set_show_toolpath] = React.useState(true);
  const [show_bounding_box, set_show_bounding_box] = React.useState(true);
  const [show_wireframe, set_show_wireframe] = React.useState(false);
  const [show_stock, set_show_stock] = React.useState(true);
  const stock_mesh_ref = useRef<THREE.Mesh | null>(null);

  const [tool, set_tool] = React.useState({
    cutter_diameter: 3.175,    // all dimensions are mm
    shank_diameter: 3.175,
    overall_length: 38.0,
    length_of_cut: 17.0,
    type: 'flat'
  });
  const [tool_error, set_tool_error] = React.useState<string | null>(null);

  // initialize three.js scene, camera, renderer, and controls on mount
  useEffect(() => {
    if (!mount_ref.current) return; // Add this guard
    // Set up scene
    const scene = new THREE.Scene();
    scene_ref.current = scene;

    scene.background = new THREE.Color(0x222222);

    // Add lights for MeshPhongMaterial
    const ambient_light = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient_light);
    const directional_light = new THREE.DirectionalLight(0xffffff, 0.8);
    directional_light.position.set(1, 2, 3);
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


  // show the stock mesh in the 3D scene whenever the show_stock toggle changes
useEffect(() => {
if (!scene_ref.current) return;
const scene = scene_ref.current; // Use 'scene' instead of 'scene_ref.current' below

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

  // Show solid box for stock
if (show_stock && window.current_heightmap && box_bounds) {
  const mesh = heightmap_to_mesh(window.current_heightmap);
  mesh.userData.is_stock_heightmap = true;
  mesh.position.set(box_bounds.min.x, box_bounds.min.y, 0);

  // Set material properties safely for both array and single material
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => {
      const mat = m as THREE.MeshPhongMaterial;
      mat.transparent = true;
      mat.opacity = 0.8;
      mat.color = new THREE.Color(0x00ff00);
    });
  } else {
    const mat = mesh.material as THREE.MeshPhongMaterial;
    mat.transparent = true;
    mat.opacity = 0.8;
    mat.color = new THREE.Color(0x00ff00);
  }

  scene.add(mesh);
}

  // Show heightmap mesh (top surface of remaining stock)
  if (show_stock && window.current_heightmap && box_bounds) {
    const mesh = heightmap_to_mesh(window.current_heightmap);
    mesh.userData.is_stock_heightmap = true;
    mesh.position.set(box_bounds.min.x, box_bounds.min.y, 0);
    const mat = mesh.material as THREE.MeshPhongMaterial;
    mat.transparent = true;
    mat.opacity = 0.8;
    mat.color = new THREE.Color(0x00ff00); // green for cut surface
    scene.add(mesh);
  }

  // Show solid box for stock
  if (show_stock && window.current_heightmap && box_bounds) {
    const min_z = box_bounds.min.z;
    const mesh = heightmap_to_solid_mesh(window.current_heightmap);
    mesh.userData.is_stock_heightmap = true;
    mesh.position.set(box_bounds.min.x, box_bounds.min.y, 0);
    scene.add(mesh);
  }

}, [show_stock, box_bounds, scene_ref.current]);

  // Section: tool effect: show the tool in the 3D scene whenever tool parameters or bounding box change
  useEffect(() => {
    if (!scene_ref.current) {
      console.log('Tool effect: scene_ref.current is not set');
      return;
    }

    // Remove previous tool mesh if present
    if (tool_mesh_ref.current) {
      scene_ref.current.remove(tool_mesh_ref.current);
      tool_mesh_ref.current = null;
      console.log('Removed previous tool mesh');
    }

    // Default tool position and orientation
    let tool_position = new THREE.Vector3(0, 0, 0);
    let tool_rotation = new THREE.Euler(Math.PI / 2, 0, 0);

    if (box_bounds) {
      // Place the cutter tip just outside the top-front-left edge (min.x, max.y, max.z) of the bounding box
      // Offset by half the cutter diameter in -X so the tool is "outside" and ready to cut in
      const left_x = box_bounds.min.x;
      const front_y = box_bounds.max.y;
      const top_z = box_bounds.max.z;
      tool_position = new THREE.Vector3(
        left_x,
        front_y,
        top_z
      );
      console.log('Tool effect: tool_position (outside top-front-left)', tool_position);
    } else {
      console.log('Tool effect: using default tool position', tool_position);
    }

    // Create a group for the tool
    const tool_group = new THREE.Group();

    // Cutter (lower part) - light gray
    const cutter_geometry = new THREE.CylinderGeometry(
      tool.cutter_diameter / 2,
      tool.cutter_diameter / 2,
      tool.length_of_cut,
      32
    );
    const cutter_material = new THREE.MeshPhongMaterial({ color: 0xe0e0e0 });
    const cutter_mesh = new THREE.Mesh(cutter_geometry, cutter_material);
    cutter_mesh.position.y = tool.length_of_cut / 2; // build up from origin
    tool_group.add(cutter_mesh);

    // Shank (upper part) - blue
    const shank_length = Math.max(tool.overall_length - tool.length_of_cut, 0.0001);
    const shank_geometry = new THREE.CylinderGeometry(
      tool.shank_diameter / 2,
      tool.shank_diameter / 2,
      shank_length,
      32
    );
    const shank_material = new THREE.MeshPhongMaterial({ color: 0x2196f3 });
    const shank_mesh = new THREE.Mesh(shank_geometry, shank_material);
    shank_mesh.position.y = tool.length_of_cut + shank_length / 2;
    tool_group.add(shank_mesh);

    tool_group.position.copy(tool_position);
    tool_group.rotation.copy(tool_rotation);

    tool_group.userData.is_tool_visual = true;
    scene_ref.current.add(tool_group);
    tool_mesh_ref.current = tool_group;
    console.log('Tool effect: tool mesh added at', tool_position, 'rotation', tool_rotation);
  }, [tool, box_bounds, scene_ref.current]);


  // update mesh material to wireframe or normal based on show_wireframe toggle
  useEffect(() => {
    if (!scene_ref.current) return;
    scene_ref.current.children.forEach(obj => {
      if (obj.userData.is_stl && obj instanceof THREE.Mesh) {
        if (show_wireframe) {
          obj.material = new THREE.MeshBasicMaterial({ color: 0x2196f3, wireframe: true });
        } else {
          obj.material = new THREE.MeshNormalMaterial();
        }
      }
    });
  }, [show_wireframe, show_mesh]);

  // update visibility of mesh, toolpath, and bounding box based on UI toggles
  useEffect(() => {
    if (!scene_ref.current) return;
    scene_ref.current.children.forEach(obj => {
      if (obj.userData.is_stl) obj.visible = show_mesh;
      if (obj.userData.is_tool_path) obj.visible = show_toolpath;
      if (obj.userData.is_bounding_box) obj.visible = show_bounding_box;
    });
  }, [show_mesh, show_toolpath, show_bounding_box]);



  function handle_export_gcode() {
    const gcode = generate_gcode(toolpath_points_ref.current);
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'toolpath.nc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


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

    // Calculate camera position
    const distance = maxDim * offset;
    camera.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    );
    camera.lookAt(center);

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

    // Remove previous STL meshes and bounding boxes
    scene_ref.current!.children
      .filter(obj => obj.userData.is_stl || obj.userData.is_bounding_box || obj.userData.is_tool_path)
      .forEach(obj => scene_ref.current!.remove(obj));

    const loader = new STLLoader();
    const geometry = loader.parse(contents as ArrayBuffer);
    const material = new THREE.MeshNormalMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.is_stl = true;
    scene_ref.current!.add(mesh);

    // Compute and add bounding box helper
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const box = new THREE.Box3().setFromObject(mesh);
      set_box_bounds({ min: box.min.clone(), max: box.max.clone() });
      console.log('handle_file_change: set_box_bounds', box.min, box.max);
      const linewidth = compute_linewidth(box);
      const boxHelper = new THREE.Box3Helper(box, 0xff0000);
      boxHelper.userData.is_bounding_box = true;
      scene_ref.current!.add(boxHelper);

      if (camera_ref.current && controls_ref.current) {
        fit_camera_to_object(camera_ref.current, controls_ref.current, box);
      }
      // Set bounding box size in state
      const size = new THREE.Vector3();
      box.getSize(size);
      set_box_size(size);
      set_box_bounds({ min: box.min.clone(), max: box.max.clone() });

      // Tool path parameters
      const tool_diameter = 0.02; // meters
      const step_over = tool_diameter * 0.7; // 70% of tool diameter

      // Raster path generation (along X, stepping in Y)
      const min_x = box.min.x, max_x = box.max.x;
      const min_y = box.min.y, max_y = box.max.y;
      const max_z = box.max.z + 0.010; // Start just above the stock

      // Build the heightmap once
      const grid = {
        min_x: min_x,
        max_x: max_x,
        min_y: min_y,
        max_y: max_y,
        res_x: 200, // adjust for resolution
        res_y: 200,
      };
      const heightmap = heightmap_from_mesh(geometry, grid);

      // 1. Create a stock object from the heightmap bounds
      const stock_width = max_x - min_x;
      const stock_height = max_y - min_y;
      const stock_grid_size = stock_width / grid.res_x;
      const stock_initial_height = box.max.z;
      const stock = create_heightmap_stock(stock_width, stock_height, stock_grid_size, stock_initial_height);

      // 2. Generate toolpath BEFORE simulating material removal
      toolpath_points_ref.current = []; // Clear previous toolpath points
      let reverse = false;
      const points_per_line = 100;
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
          toolpath_points_ref.current.push({ x, y, z });
        }
        if (reverse) line_points.reverse();

        const positions = [];
        for (const pt of line_points) {
          positions.push(pt.x, pt.y, pt.z);
        }
        const line_geometry = new LineGeometry();
        line_geometry.setPositions(positions);
        const line_material = new LineMaterial({
          color: 0x00ff00,
          linewidth: linewidth, // in world units
          alphaToCoverage: true // enables anti-aliasing if supported
        });
        line_material.resolution.set(window.innerWidth, window.innerHeight); // required for LineMaterial
        const line = new Line2(line_geometry, line_material);
        line.computeLineDistances();
        line.userData.is_tool_path = true;
        scene_ref.current!.add(line);
        reverse = !reverse;
      }

      // 3. Log toolpath extents for debugging
      if (toolpath_points_ref.current.length > 0) {
        let min_tx = Infinity, max_tx = -Infinity;
        let min_ty = Infinity, max_ty = -Infinity;
        let min_tz = Infinity, max_tz = -Infinity;
        for (const pt of toolpath_points_ref.current) {
          if (pt.x < min_tx) min_tx = pt.x;
          if (pt.x > max_tx) max_tx = pt.x;
          if (pt.y < min_ty) min_ty = pt.y;
          if (pt.y > max_ty) max_ty = pt.y;
          if (pt.z < min_tz) min_tz = pt.z;
          if (pt.z > max_tz) max_tz = pt.z;
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

      // 4. Simulate material removal after toolpath is generated
      simulate_material_removal(stock, tool, toolpath_points_ref.current);

      // 5. Assign to window.current_heightmap for visualization effect
      window.current_heightmap = stock;

      // 6. Force update by toggling show_stock or updating box_bounds
      set_show_stock(false);
      setTimeout(() => set_show_stock(true), 0);
    }
  };
  reader.readAsArrayBuffer(file);
};

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>

      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 20,
          background: '#222',
          color: '#fff',
          borderRadius: 8,
          padding: 16,
          boxShadow: '0 2px 8px #0008',
          fontFamily: 'sans-serif',
          minWidth: 220,
          maxWidth: 320,
        }}
      >
        {/* File Section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>File</div>
          <input
            type="file"
            accept=".stl"
            onChange={handle_file_change}
            style={{ width: '100%' }}
          />
        </div>
        {/* Export Section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Export</div>
          <button
            style={{ width: '100%' }}
            onClick={handle_export_gcode}
          >
            Export G-code
          </button>
        </div>

        {/* Tool Section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Tool</div>
          <form
            onSubmit={e => e.preventDefault()}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <label>
              Cutter Diameter (m)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={tool.cutter_diameter}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set_tool(t => ({ ...t, cutter_diameter: v }));
                }}
              />
            </label>
            <label>
              Shank Diameter (m)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={tool.shank_diameter}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set_tool(t => ({ ...t, shank_diameter: v }));
                }}
              />
            </label>
            <label>
              Overall Length (m)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={tool.overall_length}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set_tool(t => ({ ...t, overall_length: v }));
                }}
              />
            </label>
            <label>
              Length of Cut (m)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={tool.length_of_cut}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set_tool(t => ({ ...t, length_of_cut: v }));
                }}
              />
            </label>
            <label>
              Type
              <select
                value={tool.type}
                onChange={e => set_tool(t => ({ ...t, type: e.target.value }))}
              >
                <option value="flat">Flat</option>
                {/* Future: <option value="ball">Ball</option> etc. */}
              </select>
            </label>
            {tool_error && <div style={{ color: 'red' }}>{tool_error}</div>}
          </form>
        </div>

        {/* Visibility Section */}
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Visibility</div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={show_mesh}
              onChange={e => set_show_mesh(e.target.checked)}
            />{' '}
            Show Mesh
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={show_toolpath}
              onChange={e => set_show_toolpath(e.target.checked)}
            />{' '}
            Show Toolpath
          </label>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={show_stock}
              onChange={e => set_show_stock(e.target.checked)}
            />{' '}
            Show Stock
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={show_bounding_box}
              onChange={e => set_show_bounding_box(e.target.checked)}
            />{' '}
            Show Bounding Box
          </label>
        </div>

        {/* Wireframe Section */}
        <label style={{ display: 'block', marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={show_wireframe}
            onChange={e => set_show_wireframe(e.target.checked)}
          />{' '}
          Show Wireframe
        </label>

        {/* Bounding Box Info and Controls */}
        <div style={{ marginTop: 20, color: '#ccc', fontSize: '0.95em' }}>
          <div>
            <strong>Bounding Box:</strong>{' '}
            {boxSize &&
              `${boxSize.x.toFixed(2)} × ${boxSize.y.toFixed(2)} × ${boxSize.z.toFixed(2)}`}
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
      <div
        ref={mount_ref}
        style={{
          width: '100vw',
          height: '100vh',
        }}
      />
    </div>
  );

};

export default StartPage;