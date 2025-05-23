import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { heightmap_from_mesh } from '../utils/heightmap_from_mesh.js';
import { generate_gcode } from '../utils/gcode_generator';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

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

  const [boxSize, set_box_size] = React.useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const [show_mesh, set_show_mesh] = React.useState(true);
  const [show_toolpath, set_show_toolpath] = React.useState(true);
  const [show_bounding_box, set_show_bounding_box] = React.useState(true);
  const [show_wireframe, set_show_wireframe] = React.useState(false);

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

  useEffect(() => {
    // Update visibility of mesh, toolpath, and bounding box based on UI toggles
    if (!scene_ref.current) return;
    scene_ref.current.children.forEach(obj => {
      if (obj.userData.is_stl) obj.visible = show_mesh;
      if (obj.userData.is_tool_path) obj.visible = show_toolpath;
      if (obj.userData.is_bounding_box) obj.visible = show_bounding_box;
    });
  }, [show_mesh, show_toolpath, show_bounding_box]);

  useEffect(() => {
    if (!mount_ref.current) return; // Add this guard
    // Set up scene
    const scene = new THREE.Scene();
    scene_ref.current = scene;

    scene.background = new THREE.Color(0x222222);

    // Set up camera
    const width = mount_ref.current.clientWidth;
    const height = mount_ref.current.clientHeight;
    const aspect = width / height;
    const frustumSize = 2; // Adjust for your scene scale
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      -1000,
      1000
    );
    camera.position.set(2, 2, 2);
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
        // Tool path parameters
        const toolDiameter = 0.02; // meters
        const stepOver = toolDiameter * 0.7; // 70% of tool diameter

        // Raster path generation (along X, stepping in Y)
        const minX = box.min.x, maxX = box.max.x;
        const minY = box.min.y, maxY = box.max.y;
        const maxZ = box.max.z + 0.010; // Start just above the stock

        const z = box.max.z + 0.010; // Just above the stock
        // Build the heightmap once
        const grid = {
          min_x: minX,
          max_x: maxX,
          min_y: minY,
          max_y: maxY,
          res_x: 200, // adjust for resolution
          res_y: 200,
        };
        const heightmap = heightmap_from_mesh(geometry, grid);

        toolpath_points_ref.current = []; // Clear previous toolpath points
        let reverse = false;
        const points_per_line = 100;
        for (let y_idx = 0; y_idx < grid.res_y; y_idx += Math.max(1, Math.round(stepOver / ((maxY - minY) / grid.res_y)))) {
          const y = minY + (maxY - minY) * (y_idx / grid.res_y);
          const line_points: THREE.Vector3[] = [];
          for (let x_idx = 0; x_idx < grid.res_x; x_idx += Math.max(1, Math.floor(grid.res_x / points_per_line))) {
            // here?
            const x = minX + (maxX - minX) * (x_idx / grid.res_x);
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
      }
    };
    reader.readAsArrayBuffer(file); // <-- This must be outside reader.onload!
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
        {/* Settings Section */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Settings</div>
          {/* Placeholder for future settings (feedrate, safe Z, units, etc.) */}
          <span style={{ color: '#aaa', fontSize: '0.9em' }}>Coming soon</span>
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