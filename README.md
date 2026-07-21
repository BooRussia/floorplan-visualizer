# Floorplan Visualizer

Design a whole property: set a plot (up to acreage scale), place multiple buildings, draw
precise multi-story floorplans inside each one, landscape the site with driveways, fences
and planting — then generate a clean, textured 3D "dollhouse" view of the entire property
with one click.

## The plot

The editor opens on the **site plan**: a dashed property line around your plot (size it in
the right panel — it shows square footage/acreage; a 10-acre square is ~660'×660'). On the
plot you can:

- **Place buildings** (up to 8). Drag to move, rotate from the panel, and
  **double-click a building to dive into its floor plans** — the breadcrumb takes you back.
- **Draw roads with a pen tool**: click to place centerline points, click-drag a point to
  pull out curve handles (Photoshop-style, symmetric). Hit Enter / ✓ Finish and the road
  generates at equal width either side of the centerline — then pick its width (presets
  8'–20' or any exact value) and material (asphalt with dashed center line, concrete,
  gravel, pavers). Selected roads expose their points and curvature grips for editing;
  double-click a point to remove it.
- **Draw fences** with the fence tool (`W` on the plot): privacy, picket, chain-link, or
  split rail — each renders properly in 3D as posts, rails and boards.
- **Drop surfaces** from the site library: concrete, asphalt (with center line), gravel,
  pavers, and mulch beds. They're resizable/rotatable patches with real textures in 3D —
  layer them into driveways, patios and garden beds.
- **Landscape** with shade trees, pines, shrubs, flower beds, stepping stones, boulders
  and a mailbox. Everything places in 2D and can be clicked and dragged in 3D too.
- **Import your real property from a map** (`File ▾ → Import site from map…`, or the 🌍
  button in the Plot panel). Search your address on satellite imagery, then **click your
  parcel** — the true property boundary loads from public county/state GIS records
  (built-in coverage: WA, MT, FL, NY statewide + Maricopa County AZ; paste any county's
  public ArcGIS parcel URL or a Regrid token for other areas, or just **trace the
  boundary** by clicking corners on the imagery). Select multiple parcels if your land is
  split. Generate, and the app builds the plot at real-world scale with:
  - the **true boundary polygon** as your property line (acreage computed from it),
  - **terrain elevation** sampled from USGS-derived elevation tiles — the 3D ground
    becomes a real heightfield, buildings sit on graded pads, and fences/roads follow
    the slope,
  - **existing buildings** from the Overture Maps footprint dataset, placed at their
    real positions with their real outlines and heights — open any of them and draw
    the interior.

Inside a building, the **floor material paint tool** (`P`) drops a material marker in any
room — wood, tile, carpet, concrete, or stone — and the whole room gets that floor in 3D
(rooms are detected automatically from your walls).

## Stairs & guardrails

- **Straight, L-shaped, and U-shaped stairs** in the Structure library. Drop one and it
  sizes itself from the story height — risers ≤ 7¾", 10½" treads — splitting the run
  across two flights with a real landing at the turn, drawn with the turning walk-line
  and UP arrow in 2D and built tread-by-tread with rails in 3D. Change the story height
  and every stair on the floor re-fits.
- **Guardrails** — a stretchable railing item (posts, top rail, balusters) for mezzanine
  edges and stairwell openings.
- **One-click guards**: on an upper floor, *Add guardrails to open edges* traces the
  floor's open-to-below regions and the stairwell openings punched by the stairs below,
  then places railings all the way around them — leaving the walk-off at the top of each
  stair open so you can actually step onto the floor.

## Real roofs

Closed-exterior roofs follow the **true footprint**, not a bounding box: L, T, and
U-shaped buildings get correct hips, ridges, and **valleys** automatically (a
distance-field solver — every roof point rises with its distance from the nearest eave).

- **Styles**: gable, hip, **shed** (pick the low side), or flat — with any pitch from
  2:12 to 12:12 and shingle or metal surfaces.
- **Per-wall gable ends**: select any exterior wall and set *Roof edge → Gable end* to
  run a ridge out to that wall (Chief Architect-style roof directives). With none marked,
  gable ends land on the ridge-direction ends automatically.
- **Eave detail**: 10" overhangs with fascia in the trim color, level soffits, and
  gable-end walls that fill to the ridge **in the building's siding**.

## Openings & finishes

- **Window styles** — slider, single-hung, casement, fixed, or picture, each with its own
  sash/mullion look in 2D and 3D, plus per-window **sill and head heights** (a high
  picture window over a camper bay is sill 60", head 110").
- **Pocket and barn doors** in the door flyout — the pocket slab tucks into a dashed wall
  cavity, the barn door hangs on a track outside the wall in both views.
- **Exterior siding** (Building panel) — painted, lap, board & batten, metal panel, brick,
  or stone with a 12-color palette; an optional **wainscot band** with its own color and
  height (the classic pole-barn look) that breaks around doors; and a **trim color** that
  tints every window/door frame. Siding runs up gable ends and extended upper walls.
- **Room wall colors** — pick a paint color on any named room and its wall faces tint in
  the 3D dollhouse.

## Plans that read like plans

- **Rooms with live areas** — every enclosed room is detected automatically and shows its
  square footage; click the label to name it ("Garage", "Kitchen"…) and the name + area
  stick to the room as walls move. Per-floor and whole-building totals show in the panel;
  the ft² toolbar button toggles the labels.
- **Room dividers** — the Wall tool's flyout has an invisible divider: it splits an open
  space into separately named/measured rooms (and separate floor materials in 3D) without
  building any 3D wall — perfect for open-plan kitchen/living splits or labeling the shop
  vs. garage halves of one big bay.
- **Auto dimensions** — exterior dimension strings on all four sides regenerate as you
  edit, with per-segment rows and an overall total. **Click any dimension, type a new
  length**, and everything beyond that segment shifts — across all floors, so upper-story
  walls stay aligned with the shell.
- **Print / PDF** (`File ▾`) — a true-to-scale sheet (Letter/Legal/Tabloid/A4/A3,
  architectural scales from 1/16″=1′ to 1/2″=1′ or fit-to-page) with title block, date,
  scale bar and all labels/dimensions, printed or saved as PDF from the browser dialog.
  **Export plan as PNG** downloads the current canvas at 2× resolution.

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
| Doors | `D` | Single, double, sliding glass, bifold, cased opening, garage door — pick from the ▾ menu. Hover a wall and click to place; drag along (or across to another) wall later. Flip swing/hinge in the right panel. Garage doors get quick width presets (8'/9'/16'/18'), free-form width, and an adjustable door height that carries into 3D. |
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
- **Furniture** — 40+ items (kitchen, bathroom, bedroom, living, dining, garage) in the
  left library — including cars, a pickup, camper trailer, boat and jet ski on trailers,
  a pegboard workbench, and a rolling tool chest for garage layouts. Click an item then click the plan (hold Shift to place several). Selected
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

**Generate 3D** is scope-aware:
- **Inside a building** it shows just that building as an open cutaway *dollhouse* — with
  an **Open / Closed toggle** to switch to the finished exterior. Closed mode completes
  the shell and adds the roof, with live controls for **style (gable / hip / flat),
  pitch (2:12–12:12) and material (shingles / standing-seam metal)** — also editable from
  the building's panel on the plot.
- A **+ Window** mode lets you click any wall in the 3D view (open or closed) to add a
  window right there; it syncs back to the 2D plan instantly.
- **On the plot** it shows the whole property with buildings **fully enclosed** using each
  building's roof settings, on grass with driveways, fences and landscaping.

The plan is rebuilt as a realistic cutaway model: textured wood
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
