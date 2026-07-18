# Floorplan Visualizer

Draw precise 2D floorplans — up to three stories — then generate a clean, textured 3D
"dollhouse" view of the whole building with one click.

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
| Measure | `M` | Drop Photoshop-style reference marks. Each mark shows dotted distance rays to the four nearest walls, and walls snap to marks while drawing. "✕ Marks" clears them. |

- **Exact measurements** — select any wall and a floating input appears at its midpoint;
  type the length you want and connected walls follow. Thickness and 3D height are in
  the right panel. While drawing a chain, the label shows the current segment **and the
  running total**; snapping onto an existing wall shows how far along it you are
  (e.g. `25'1" ⟷ 30'11"`) so you can hit an exact spot on a wall.
- **Curved walls** — select a wall and drag the round midpoint handle to bow it.
  "Straighten" resets it.
- **Furniture** — 35+ items (kitchen, bathroom, bedroom, living, dining) in the left
  library. Click an item then click the plan (hold Shift to place several). Selected
  furniture gets corner resize handles and a rotate handle; `R` rotates 90°,
  `⌘D` duplicates.
- **Floors** — up to 3 stories via the numbered tabs in the toolbar. Each floor has its
  own story height (right panel with nothing selected). While editing an upper floor,
  the floor below shows as a gray underlay for alignment.
- **Staircases** — in the Structure library category. When placed, the run is
  auto-computed from the story height using real rise/run rules (risers ≤ 7¾",
  10½" treads), and the floor above automatically gets a stairwell opening. Changing a
  story's height re-sizes its staircases.
- **Undo/redo** — `⌘Z` / `⌘⇧Z`.
- **Navigation** — scroll to pan, `⌘`+scroll (or pinch) to zoom, Space+drag or middle-drag
  to pan, plus on-screen zoom/fit buttons.

## 3D view

Hit **Generate 3D** and the plan is rebuilt as a realistic cutaway model: textured wood
floors (auto-detected room interiors, any shape — including curved walls), white walls with
gray caps on a platform slab, glass windows, open door leaves, sliding panels, and parametric
3D furniture. Multi-story plans stack into a full dollhouse with structural bands between
stories, stepped staircases with railings, and stairwell openings cut through upper floors.

- Orbit (drag), zoom (scroll), recenter (⌂). With multiple floors, use the **All / 1 / 2 / 3**
  switcher to isolate a story.
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
