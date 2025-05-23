# Project Roadmap & TODO

## Next Steps: Tool Definition and Stock Simulation

- [ ] Minimal tool definition (object with diameter and type, e.g. flat)
    - [x] Add tool data structure (e.g. { diameter: number, type: 'flat' })
    - [x] UI for selecting tool diameter and type (flat only at first)
    - [x] Visualize the tool live
    - [ ] Pass tool definition to toolpath and simulation logic

- [ ] Stock simulation (material removal)
    - [x] Decide on initial heightmap-based simulation for 2.5D
    - [x] Implement stock_heightmap data structure and update logic
    - [x] Simulate material removal for flat endmill using heightmap
    - [x] Adopt STL (natural) coordinates for all simulation and toolpath operations.
    - [x] Remove any translation of toolpath or stock to (0,0,0).
    - [ ] Allow user to specify stock offset/extra material in STL coordinates.
    - [ ] Visualize updated stock after each toolpath segment
    - [ ] Add unit tests for stock update logic
    - [ ] Design abstraction layer for stock representation (heightmap or mesh)
    - [ ] Plan and prototype mesh-based stock simulation for full 3D/4th axis
    - [ ] Allow switching between heightmap and mesh simulation modes

- [ ] Extend tool definition for more shapes (ball, V-bit, etc.) after flat tool works

## Features
- [ ] G-code export for toolpaths
    - [x] Basic G-code generation from toolpath
    - [x] UI button to export/download G-code file
    - [ ] User-settable feedrate, safe Z, and units
    - [ ] G-code preview in UI
    - [ ] Support for multiple toolpaths/operations
    - [ ] Test with real-world toolpaths and G-code viewers
- [ ] Tool definition (at minimum: diameter, type/shape)
    - [ ] UI for selecting tool type and diameter
    - [ ] Use tool definition in toolpath and simulation
- [ ] Stock simulation (visualize material removal as toolpaths are executed)
    - [ ] Use tool shape for material removal
    - [ ] Visualize updated stock after each toolpath segment- 
- [ ] Tool shape selection (flat, ball, V-bit, etc.)
- [ ] Tool visualization in 3D view
- [ ] Advanced G-code options (feeds, speeds, tool changes)
- [ ] Adaptive paths to minimize errors - e.g. clearing uses large steps, and vertical and horizontal plans and step sizes adjust to geometry and tool
- [ ] Export toolpath as CSV
- [ ] UI: axis/grid helpers
- [ ] UI: loading/progress for large files
- [ ] UI: highlight toolpath vs mesh
- [ ] 3d: Passes at different manual orientations
- [ ] 3d: Fourth axis support

## UX / UI
- [ ] Group controls (file input, export, settings) in a unified panel or toolbar
    - [x] Implement vertical panel with sections: File, Export, Settings, Visibility
    - [ ] Add section headers and visual separation
    - [ ] Prepare for future collapsible/expandable sections
- [ ] Toggle visibility of mesh, toolpath, and bounding box/object
- [ ] Orientation cube to quickly set views - right, top, etc
- [ ] Add G-code preview panel or modal
- [ ] Add visualization for stock and keepout zones (clamps, bed, fixtures)
- [ ] UI for managing and displaying keepout/fixture items

## Bugs / Technical Debt
- [ ] Ensure all grid cells are set for covering triangles
- [ ] Handle degenerate/zero-area triangles robustly

## Ideas / Wishlist
- [ ] Playback/scrub through toolpath simulation
- [ ] Support for multiple tools/operations
- [ ] Save/load project state
