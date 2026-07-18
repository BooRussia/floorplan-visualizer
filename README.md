# Floorplan Visualizer

Draw a precise 2D floorplan, then generate a clean, textured 3D "dollhouse" view of it with one click.

![2D editor → 3D view]

## Run it

```bash
npm install
npm run dev        # http://localhost:5199
npm run build      # production build in dist/
```

The app opens with a sample 3-bed apartment so you can explore right away. Your plan autosaves
to the browser (localStorage) and can be exported/imported as JSON from the toolbar.

## 2D editor

| Tool | Shortcut | Notes |
| --- | --- | --- |
| Select / move | `V` | Click anything to select; drag to move. Arrow keys nudge 1" (Shift = 12"). |
| Wall | `W` | Click to place points, chaining as you go. Type a length (`12'6"`, `150"`, `12.5'`) + Enter while drawing for an exact segment. Click the first point again to close a room. Enter/Esc ends the chain. Walls snap to endpoints, existing walls, 45° angles and a 1" grid (hold Alt for free angles). |
| Doors | `D` | Single, double, sliding glass, bifold, cased opening — pick from the ▾ menu. Hover a wall and click to place; drag along (or across to another) wall later. Flip swing/hinge in the right panel. |
| Window | `N` | Same placement flow as doors. |
| Label | `T` | Click to add a room label; double-click a label to rename. |

- **Exact measurements** — select any wall and a floating input appears at its midpoint;
  type the length you want and connected walls follow. Thickness and 3D height are in
  the right panel.
- **Curved walls** — select a wall and drag the round midpoint handle to bow it.
  "Straighten" resets it.
- **Furniture** — 35+ items (kitchen, bathroom, bedroom, living, dining) in the left
  library. Click an item then click the plan (hold Shift to place several). Selected
  furniture gets corner resize handles and a rotate handle; `R` rotates 90°,
  `⌘D` duplicates.
- **Undo/redo** — `⌘Z` / `⌘⇧Z`.
- **Navigation** — scroll to pan, `⌘`+scroll (or pinch) to zoom, Space+drag or middle-drag
  to pan, plus on-screen zoom/fit buttons.

## 3D view

Hit **Generate 3D** and the plan is rebuilt as a realistic cutaway model: textured wood
floors (auto-detected room interiors, any shape — including curved walls), white walls with
gray caps on a platform slab, glass windows, open door leaves, sliding panels, and parametric
3D furniture.

- Orbit (drag), zoom (scroll), recenter (⌂).
- Click furniture to select it, drag to move it on the floor.
- Resize via the right panel — models are **parametric**, so a 9' sofa gets more cushions
  instead of stretching; nothing squishes.
- Any change made back in the 2D editor regenerates the 3D view automatically.

## Architecture

Everything derives from one shared plan model (`src/model/types.ts`, zustand store) —
walls (with bulge for curves), openings (parented to walls at a position `t`), furniture
(footprint + rotation), labels. The 2D editor (`src/editor2d/`) renders it as SVG in
world-inch coordinates; the 3D view (`src/three/`) compiles the same model into a Three.js
scene: wall segments with cut openings, flood-fill floor detection, and procedural furniture
builders (`furniture3d.ts`). Because both views read the same store, 2D ↔ 3D stays in sync
by construction.

React + TypeScript + Vite + zustand + three.js. No external assets — textures are drawn
procedurally at runtime.
