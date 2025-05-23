# Project Roadmap & TODO

## Features
- [ ] G-code export for toolpaths
    - [x] Basic G-code generation from toolpath
    - [ ] UI button to export/download G-code file
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

## Bugs / Technical Debt
- [ ] Ensure all grid cells are set for covering triangles
- [ ] Handle degenerate/zero-area triangles robustly

## Ideas / Wishlist
- [ ] Playback/scrub through toolpath simulation
- [ ] Support for multiple tools/operations
- [ ] Save/load project state