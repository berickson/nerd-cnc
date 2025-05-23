# Project Roadmap & TODO

## Features
- [ ] G-code export for toolpaths
    - [x] Basic G-code generation from toolpath
    - [x] UI button to export/download G-code file
    - [ ] User-settable feedrate, safe Z, and units
    - [ ] G-code preview in UI
    - [ ] Support for multiple toolpaths/operations
    - [ ] Test with real-world toolpaths and G-code viewers
- [ ] Tool shape selection (flat, ball, V-bit, etc.)
- [ ] Tool visualization in 3D view
- [ ] Stock simulation (material removal)
- [ ] Advanced G-code options (feeds, speeds, tool changes)
- [ ] Export toolpath as CSV
- [ ] UI: axis/grid helpers
- [ ] UI: loading/progress for large files
- [ ] UI: highlight toolpath vs mesh

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

## Fix: Heightmap edge-case for triangle edges/vertices

- Problem: When a grid sample lands exactly on a triangle edge or vertex, the cell may not be updated, causing the mesh/toolpath to drop to z=0 or -Infinity.
- Solution: In `sample_triangle`, ensure that all grid cells whose centers are on the triangle edge or vertex are included. Consider relaxing the epsilon in `point_in_triangle`, or always update the cell if it overlaps the triangle (not just if the center is inside).
- Add unit tests for edge and vertex cases.