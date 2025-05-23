import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { heightmap_from_mesh } from '../utils/heightmap_from_mesh.js';
import { generate_gcode } from '../utils/gcode_generator';


const StartPage: React.FC = () => {
  const mount_ref = useRef<HTMLDivElement>(null);
  const scene_ref = useRef<THREE.Scene>(null);
  const toolpath_points_ref = React.useRef<{ x: number; y: number; z: number }[]>([]);
  const camera_ref = useRef<THREE.OrthographicCamera | null>(null);
  const controls_ref = useRef<OrbitControls | null>(null);

  const [boxSize, setBoxSize] = React.useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));


const fitCameraToObject = (
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
  useEffect(() => {
    if (!mount_ref.current) return;

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
      -frustumSize * aspect / 2, // left
      frustumSize * aspect / 2, // right
      frustumSize / 2,          // top
      -frustumSize / 2,          // bottom
      -1000,                      // near
      1000                       // far
    );
    camera.position.set(2, 2, 2); // or any nonzero vector
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


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !scene_ref.current) return;
  
   setBoxSize(new THREE.Vector3(0, 0, 0));
    const reader = new FileReader();
    reader.onload = function (e) {
      const contents = e.target?.result;
      if (!contents) return;
  
      // Remove previous STL meshes and bounding boxes
      scene_ref.current!.children
        .filter(obj => obj.userData.isSTL || obj.userData.isBoundingBox || obj.userData.isToolPath)
        .forEach(obj => scene_ref.current!.remove(obj));
  
      const loader = new STLLoader();
      const geometry = loader.parse(contents as ArrayBuffer);
      const material = new THREE.MeshNormalMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.isSTL = true;
      scene_ref.current!.add(mesh);
  
      // Compute and add bounding box helper
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        const box = new THREE.Box3().setFromObject(mesh);
        const boxHelper = new THREE.Box3Helper(box, 0xff0000);
        boxHelper.userData.isBoundingBox = true;
        scene_ref.current!.add(boxHelper);

        if (camera_ref.current && controls_ref.current) {
          fitCameraToObject(camera_ref.current, controls_ref.current, box);
        }
        // Set bounding box size in state
        const size = new THREE.Vector3();
        box.getSize(size);
        setBoxSize(size);  
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
  const linePoints: THREE.Vector3[] = [];
  for (let x_idx = 0; x_idx < grid.res_x; x_idx += Math.max(1, Math.floor(grid.res_x / points_per_line))) {
    const x = minX + (maxX - minX) * (x_idx / grid.res_x);
    const z = heightmap[y_idx][x_idx] > -Infinity ? heightmap[y_idx][x_idx] + 0.001 : box.min.z;
    linePoints.push(new THREE.Vector3(x, y, z));
    toolpath_points_ref.current.push({ x, y, z });
  }
  if (reverse) linePoints.reverse();
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0x00ff00 })
  );
  line.userData.isToolPath = true;
  scene_ref.current!.add(line);
  reverse = !reverse;
}      }
    };
    reader.readAsArrayBuffer(file); // <-- This must be outside reader.onload!
  };

    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 0,
            width: '100%',
            textAlign: 'center',
            color: '#fff',
            zIndex: 1,
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            textShadow: '0 0 8px #222',
          }}
        >
          {boxSize && (
            <div
              style={{
                //position: 'absolute',
                top: 10,
                left: 0,
                width: '100%',
                textAlign: 'center',
                color: '#fff',
                zIndex: 99,
                fontFamily: 'monospace',
                pointerEvents: 'none',
                textShadow: '0 0 8px #222',
              }}
            >
              Bounding Box: {boxSize.x.toFixed(2)} x {boxSize.y.toFixed(2)} x {boxSize.z.toFixed(2)}
            </div>
          )}

          <strong>3D Controls:</strong>
          &nbsp;Rotate: <kbd>Left Mouse</kbd> &nbsp;|&nbsp;
          Zoom: <kbd>Scroll</kbd> &nbsp;|&nbsp;
          Pan: <kbd>Right Mouse</kbd> or <kbd>Ctrl + Left Mouse</kbd>
        </div>
        <input
          type="file"
          accept=".stl"
          onChange={handleFileChange}
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            background: '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 8px',
          }}
        />
        <div
          ref={mount_ref}
          style={{
            width: '100vw',
            height: '100vh',
          }}
        />
        <button
          style={{ position: 'absolute', top: 100, left: 20, zIndex: 10 }}
          onClick={() => {
            const gcode = generate_gcode(toolpath_points_ref.current); // toolpath: your array of points
            const blob = new Blob([gcode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'toolpath.nc';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export G-code
        </button>
        
      </div>
      
      
    );
  };

  export default StartPage;