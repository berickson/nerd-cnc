# nerd-cnc
Project Status: Early Concept Phase - Not Ready For Use

## Overview
nerd-cnc is a web-based application designed to assist users in creating tool paths for CNC mills. The application aims to provide a user-friendly interface for generating GCODE, importing STEP files, and visualizing tool paths in a 3D canvas.

## Features
- **Tool Path Creation**: Users can create and modify tool paths for CNC milling.
- **3D Canvas**: A visual representation of the tool paths and imported models.
- **File Import**: Ability to import STEP files for further processing.
- **GCODE Generation**: Automatically generate GCODE from the created tool paths.

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

### Our Approach

We use a hybrid strategy:

1. **Triangle Sampling:**  
   Each triangle is rasterized onto the heightmap grid, updating every covered cell with the maximum Z value encountered. This ensures even large triangles contribute heights to the grid interior, not just at their corners.

2. **Exact Mode (optional):**  
   For each grid cell, we store references to overlapping triangles. When a toolpath point needs an exact height, we check the triangles for that cell and compute the precise intersection, ensuring no features are missed.

### Why This Matters

- Ensures high-fidelity toolpaths, even for coarse or uneven meshes.
- Allows for fast toolpath generation after the initial precompute step.
- Supports future improvements, such as accounting for tool shape or overhangs.


## Contributing
This project is currently for personal development and experimentation. The repository is public so others can watch progress or provide feedback if they wish. Contributions are welcome, but please open an issue or discussion before submitting a pull request.
