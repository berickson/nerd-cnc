# nerd-cnc
Project Status: Early Concept Phase - Not Ready For Use

## Overview
nerd-cnc is an HTML app that creates tool paths for CNC mills. 

## Features
- **Tool Path Creation**: Create and modify tool paths for CNC milling.
- **3D Visualization**: Visual tool paths and imported models.
- **Simulation** Simulator calculates the results of the milling operations
- **File Import**: Import STL files for further processing (STEP file support planned).
- **GCODE Generation**: Basic GCODE generation is implemented. Advanced options like feedrate, safe Z, and units are planned.

## Project Structure
- **src/components**: Reusable UI components such as buttons, forms, and visualizers.
- **src/pages**: Main application pages including home and tool path creation views.
- **src/utils**: Utility functions for file parsing, GCODE generation, and other operations.
- **src/types**: TypeScript types and interfaces for type safety.

## Getting Started

1. **Clone the repository:**
   ```
   git clone https://github.com/yourusername/nerd-cnc.git
   cd nerd-cnc
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Install Rust (for WASM kernel):**
   ```
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

4. **(Optional) Install wasm-pack:**
   ```
   cargo install wasm-pack
   ```

5. **Build the WASM kernel:**
   ```
   cd wasm_kernel
   wasm-pack build --target bundler
   cd ..
   ```

6. **Build the JS/React app:**
   ```
   npm run build
   ```

7. **Start the development server:**
   ```
   npm start
   ```
   Then open [http://localhost:3000](http://localhost:3000)

## Heightmap Generation & Toolpath Fidelity

To generate accurate 2.5D toolpaths from STL meshes, a heightmap is used to represent the top surface of the model.

### Challenges

- **Vertex-based heightmaps** are fast but can miss surface details between vertices, especially for large triangles.
- **Raycasting for every toolpath point** is accurate but slow.

### Plan

Hybrid strategy:

1. **Triangle Sampling:**  
   Each triangle is rasterized onto the heightmap grid, updating every covered cell with the maximum Z value encountered. This ensures even large triangles contribute heights to the grid interior, not just at their corners.

2. **Exact Mode (planned):**  
   For each grid cell, references to overlapping triangles are stored. When a toolpath point needs an exact height, the triangles for that cell are checked and the precise intersection is computed, ensuring no features are missed.


## CNC Stock Simulator: Test and WASM Policy

- All WASM logic is tested in Rust (`wasm_kernel/src/`, run with `cargo test`).
- Jest tests cover non-ui JS code.
- To run all tests: `npm test` (runs both JS and Rust tests).
- See `wasm_kernel/README.md` for Rust-side test details.

## Contributing
This project is currently for personal development and experimentation. The repository is public so others can watch progress or provide feedback if they wish. Contributions are welcome, but please open an issue or discussion before submitting a pull request.

## Hacking

- See `roadmap.md` for planned features and development priorities.
- See `wasm_kernel/README.md` for Rust-side/WASM details.
- Most development happens in `src/pages/start_page.tsx` and `src/utils/`.

### Running Tests

- Run all tests (JS + Rust):
  ```
  npm test
  ```
- Run only JS tests:
  ```
  npm run test:js
  ```
- Run only Rust (WASM) tests:
  ```
  cd wasm_kernel
  cargo test
  cd ..
  ```
