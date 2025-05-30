# nerd-cnc
Project Status: Early Concept Phase - Not Ready For Use

## Overview
nerd-cnc is a web-based application designed to assist users in creating tool paths for CNC mills. The application aims to provide a user-friendly interface for generating GCODE, importing STEP files, and visualizing tool paths in a 3D canvas.

## Features
- **Tool Path Creation**: Users can create and modify tool paths for CNC milling.
- **3D Canvas**: A visual representation of the tool paths and imported models.
- **File Import**: Ability to import STL files for further processing (STEP file support planned).
- **GCODE Generation**: Basic GCODE generation is implemented. Advanced options like feedrate, safe Z, and units are planned.

## Project Structure
- **src/components**: Reusable UI components such as buttons, forms, and visualizers.
- **src/pages**: Main application pages including home and tool path creation views.
- **src/utils**: Utility functions for file parsing, GCODE generation, and other operations.
- **src/types**: TypeScript types and interfaces for type safety.

## Getting Started
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/nerd-cnc.git
   ```
2. Navigate to the project directory:
   ```
   cd nerd-cnc
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Start the development server:
   ```
   npm start
   ```

## Heightmap Generation & Toolpath Fidelity

To generate accurate 2.5D toolpaths from STL meshes, we use a heightmap representing the top surface of the model.

### Challenges

- **Vertex-based heightmaps** are fast but can miss surface details between vertices, especially for large triangles.
- **Raycasting for every toolpath point** is accurate but slow.

### Our Plan

Hybrid strategy:

1. **Triangle Sampling:**  
   Each triangle is rasterized onto the heightmap grid, updating every covered cell with the maximum Z value encountered. This ensures even large triangles contribute heights to the grid interior, not just at their corners.

2. **Exact Mode (planned):**  
   For each grid cell, we store references to overlapping triangles. When a toolpath point needs an exact height, we check the triangles for that cell and compute the precise intersection, ensuring no features are missed.

### Why This Matters

- Ensures high-fidelity toolpaths, even for coarse or uneven meshes.
- Allows for fast toolpath generation after the initial precompute step.
- Supports future improvements, such as accounting for tool shape or overhangs.

## CNC Stock Simulator: Test and WASM Policy

- All WASM logic is now tested in Rust (`wasm_kernel/src/`, run with `cargo test`).
- JS tests (Jest) cover integration, UI, and non-WASM logic only.
- Obsolete JS vs WASM performance benchmarks are now placeholders with dummy tests.
- To run all tests: `npm test` (runs both JS and Rust tests).
- See `wasm_kernel/README.md` for Rust-side test details.

## Visualization Notes

- The current "stock" mesh shown in the simulation is actually the carved result after material removal, **not** the initial, uncut stock.
- In the future, both the starting stock (with a semi-transparent or distinct material) and the carved result (with a solid, visually distinct material) will be visualized for clarity.
- The carved result now uses a more visually distinct, solid color/material inspired by STL's `MeshNormalMaterial` for better clarity.
- (Planned) The initial stock will be shown with a semi-transparent or light material to distinguish it from the carved result.

## Contributing
This project is currently for personal development and experimentation. The repository is public so others can watch progress or provide feedback if they wish. Contributions are welcome, but please open an issue or discussion before submitting a pull request.

## Hacking

### Setup

- Install [Node.js](https://nodejs.org/) (v18+ recommended).
- Install [npm](https://www.npmjs.com/) (comes with Node.js).
- Install [Rust](https://www.rust-lang.org/tools/install) (for WASM kernel):
  ```
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- (Optional) Install [wasm-pack](https://rustwasm.github.io/wasm-pack/):
  ```
  cargo install wasm-pack
  ```

### Building

- Build the WASM kernel (from project root):
  ```
  cd wasm_kernel
  cargo build --release
  cd ..
  ```
- Build the JS/React app:
  ```
  npm install
  npm run build
  ```

### Running Locally

- Start the development server:
  ```
  npm start
  ```
- Open your browser to [http://localhost:3000](http://localhost:3000)

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

### Notes
- See `roadmap.md` for planned features and development priorities.
- See `wasm_kernel/README.md` for Rust-side/WASM details.
- Most development happens in `src/pages/start_page.tsx` and `src/utils/`.
