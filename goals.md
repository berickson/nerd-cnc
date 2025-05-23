# Project Goals: nerd-cnc

## Vision
Create a web-based application that empowers users to design, visualize, and generate tool paths for CNC mills, with a focus on usability, extensibility, and performance.

## Core Goals
- **User-Friendly Tool Path Creation:** Provide intuitive interfaces for users to create and edit CNC tool paths.
- **3D Visualization:** Enable interactive 3D visualization of models and tool paths within the browser.
- **File Import/Export:** Support importing STEP files and exporting GCODE for CNC machines.
- **GCODE Generation:** Accurately generate GCODE from user-defined tool paths.

## Technical Goals
- **Web Frontend:** Use React and Three.js for the user interface and 3D visualization.
- **Rust Integration:** Leverage Rust (via WebAssembly) for performance-critical 3D computations, geometry processing, and file parsing.
- **Testing:** Implement robust unit, integration, and end-to-end tests to ensure reliability.
- **Extensibility:** Design the architecture to allow for future expansion (e.g., more file formats, advanced tool path strategies).

## Development Approach
- Start with a minimal web UI and basic tool path logic.
- Incrementally add 3D visualization and file import features.
- Integrate Rust modules for heavy computation as the project matures.
- Continuously test and refine the user experience.

---
*This project is for personal development and experimentation, but is public for transparency and community feedback.*