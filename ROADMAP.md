# Floorplan Visualizer — Feature Audit & Implementation Roadmap

> Status: **APPROVED** (all phases, 2026-07-19). Build order: Phase 9 first, then 1→8.
> Shipped so far: **Phase 9 v1** (site-import wizard, parcel click + trace, terrain
> heightfield, Overture building shells, boundary polygon + georeferencing) and
> **Phase 1** (auto-detected rooms w/ names + live areas + floor totals, invisible room
> dividers, auto exterior dimension strings w/ click-to-stretch resize, print/PDF sheet,
> PNG export; shared rasterizer extracted to `src/model/raster.ts`), and
> **Phase 2** (window styles w/ sill+head heights, pocket + barn doors, exterior siding
> w/ wainscot band + trim color incl. gable ends, per-room interior wall paint), and
> **Phase 3 core** (roof v2: distance-transform footprint roofs with hips/ridges/valleys,
> per-wall gable directives via Wall.roofEdge, shed style w/ low side, fascia + soffit,
> siding-clad gable skirts; legacy bbox prism kept as fallback). Phase 3 leftovers:
> 3.4 skylights + dormers. Other leftovers: interior auto-dims, blueprint style, corner
> boards. Next: Phase 4 (L/U stairs + landings, railings/guardrails).
>
> Basis: three competitive research sweeps (July 2026) covering
> **consumer floorplanners** (RoomSketcher, Floorplanner, Planner 5D, HomeByMe, Coohom),
> **professional CAD suites** (Chief Architect Premier/Home Designer, Cedreo, SoftPlan, SketchUp + LayOut),
> and **capture / landscape / building-configurator tools** (MagicPlan, CubiCasa, Canvas.io, Sweet Home 3D,
> iScape, PRO Landscape+, VizTerra, Tuff Shed / Morton / IdeaRoom shed configurators),
> cross-referenced against a current-state audit of this codebase (~8.7k LOC).

Effort scale: **S** = hours (one focused change, 1–3 files) · **M** = a day-ish (new subsystem seam, 3–6 files) · **L** = multi-day (new subsystem or algorithm).

---

## 1. Where we stand

What we already do that competitors consider table stakes — and in some cases better than the consumer tier:

- Single shared model in inches driving both 2D SVG and 3D (sync by construction — Floorplanner/RoomSketcher's "Live 3D" equivalence)
- Exact-length entry during and after drawing; curved walls (bulge); per-wall thickness/height
- Multi-story with union rasterization, open-to-below regions, walls that rise to meet the story above (Floorplanner's "cutout surface" pattern, done structurally)
- Scope-aware 3D: open dollhouse per building, enclosed whole-plot view; closed-exterior toggle with editable roof style/pitch/material/ridge
- Add windows by clicking walls in 3D (shed-configurator drag-on-3D-wall pattern, partially)
- Plot system: roads (pen bezier), fences w/ parametric gates, surfaces, landscaping, garage catalog incl. campers/boats (Lancaster's "fit-check library" pattern — we already have it)
- Measure marks with 4-way distance rays; along-wall snap readouts; chain totals — better than most consumer tools
- Procedural textures only (zero-asset, fast loads), dark mode, undo/redo, autosave, JSON export/import, auto-deployed GitHub Pages site

The 18 self-identified gaps in the current audit all showed up as standard features in at least two competitor products. That's the roadmap below.

---

## 2. Gap analysis (condensed)

| Gap | Who has it | Verdict |
|---|---|---|
| Room auto-detection w/ name + live area labels | All 10 surveyed products | **Must have** — foundation for half the list |
| Auto exterior/interior dimension strings | CA, HD, SP, FP, RS, Cedreo | **Must have** for "plans that read like plans" |
| Click a dimension → type value → wall moves | CA, HD, FP, HBM | **Must have** — we already have the entry UI on selected walls |
| Window types + sill/head heights | CA, HD, SP, FP (215 window models) | **Must have** — ours are all one slider-look |
| Real roof geometry (valleys, L-shapes, overhangs, per-edge gable/hip) | CA (directive model), HD (gable/hip toggle), SP, Cedreo | **Must have** — bbox prisms are our most visible weakness |
| Exterior siding/materials + wainscot band + trim color | CA, HD, SP, Morton/Lancaster configurators | **Must have** for the shop/pole-barn audience |
| Interior wall paint per room | All | High |
| Stairs: L/U shapes, landings, railings | CA, HD, SP, RS (richest stair set), FP, Cedreo | High |
| Railings / guardrails / mezzanine guard | CA, HD, SP, FP | High |
| First-person walkthrough | All five consumer tools + CA/HD/SP | High |
| Saved cameras | FP (named cameras + fly-through), SU (Scenes), CA/HD | High |
| Print/PDF at scale + PNG export | All | **Must have** |
| Image underlay tracing w/ scale calibration | FP, RS, P5D, HBM, CH, Sweet Home 3D, Cedreo | High — the standard remodel onboarding path |
| Sun position / time-of-day lighting | FP, HBM, CH, CA, SH3D | Medium |
| DXF export | P5D, HBM, CH, MagicPlan, Cedreo | Medium |
| glTF export | SketchUp (first-class since 2025) | Medium — trivial for us (three.js) |
| Multi-project save slots | All cloud tools | High |
| Share links | FP, RS, CubiCasa, shed configurators | Medium |
| Terrain elevation | CA, HD, SP, VizTerra, Cedreo | Medium — plot feature, big lift |
| Decks/porches/pergolas | CA, HD, SP, VizTerra | Medium |
| Dormers/skylights | CA, HD, SP, Cedreo (VELUX library) | Medium — after roof v2 |
| Elevations/sections as drawings | CA, HD, SP, Cedreo | Low for now — ortho camera presets get 60% |
| Multi-select / copy-paste across floors / nudges / lock | FP (best-in-class) | QoL sweep |
| Metric units toggle | All | QoL sweep |
| Import the real lot (parcels + terrain + existing buildings) | VizTerra GIS import, SoftPlan geo-located site data, LandGlide | High — see Phase 9 |

Explicitly **not** proposed (poor fit for a zero-backend, zero-asset web app): AI plan conversion services, LiDAR capture, 100k+ asset marketplaces, team seats/credits monetization, VR headsets, IFC/Revit interop, irrigation design, energy compliance.

---

## 3. The plan — 9 phases

Ordered so each phase ships something visible on its own; phases 1–3 carry the most user-visible value for this project's actual use case (shop + apartment on acreage).

### Phase 1 — Plans that read like plans

**1.1 Rooms as first-class entities** — Effort **M** · no dependencies
Auto-detect rooms from enclosed wall loops (we already do this — `rasterizeFloor` region labeling in [buildScene.ts](src/three/buildScene.ts)). Extract the rasterizer to `src/model/raster.ts` so the 2D side can use it. Each detected region gets a centroid label: editable name + computed area (`cells × CELL²`, shown as sq ft). Store room names/types like paints (seed point + data on `Floor`). Room type presets (bedroom/bath/kitchen/garage/shop…) with optional color tint in 2D. Per-floor and whole-building area totals in the properties panel.
*Precedent: every product surveyed; RoomSketcher's auto color-coding; Floorplanner's per-room show-name/show-area toggles.*

**1.2 Auto dimension strings** — Effort **M–L** · after 1.1 (uses the same boundary analysis)
Generated exterior dimension lines offset outside the footprint (per side, segmented at wall intersections), plus an interior-dimensions toggle. Auto-refresh as walls move; never overwrite user-placed measure marks (SoftPlan's "fill in missing, never delete manual" behavior). New `src/editor2d/dimensions.tsx`; toggles in [Toolbar.tsx](src/ui/Toolbar.tsx).
*Precedent: Chief Architect auto-refresh strings; SoftPlan smart merge.*

**1.3 Click-dimension-to-resize** — Effort **S** · after 1.2
Click any dimension label → type exact value → the wall moves (choose which end via arrow buttons, Floorplanner-style). We already have the floating exact-length input; this rewires it to dimension labels.

**1.4 Invisible room dividers** — Effort **S–M** · with 1.1
Zero-thickness "divider" wall variant: splits rooms for naming/area/floor-material purposes, renders as a dashed line in 2D, produces no 3D geometry but participates in rasterization. Solves open-plan kitchen/living splits and lets the shop/garage halves be labeled separately without a real wall.
*Precedent: Floorplanner's 0-thickness walls — its single cleverest modeling feature.*

**1.5 Print / PDF / PNG export of the 2D plan** — Effort **M** · independent
A print view that renders the plan SVG at true scale (paper size, 1/4″=1′ style scale presets, scale bar, title block with project name/date), via `window.print()` → PDF. Plus one-click PNG export (serialize SVG → canvas → download). Optional B&W "blueprint" display style for output.
*Precedent: RoomSketcher scaled PDF letterhead; Floorplanner export panel.*

### Phase 2 — Openings & envelope finishes

**2.1 Window types + sill/head heights** — Effort **M**
`Opening` gains `style` (fixed / single-hung / slider / casement / picture) and `sill` (default 36″); height already exists for garage doors — generalize it. Properties panel gets style select + sill/height inputs; 3D renders glass between sill and head with frame + mullion pattern per style; 2D glyphs get minor variants. Files: [types.ts](src/model/types.ts), [PropertiesPanel.tsx](src/ui/PropertiesPanel.tsx), [buildScene.ts](src/three/buildScene.ts), [planRender.tsx](src/editor2d/planRender.tsx).

**2.2 More door types** — Effort **S–M**
Pocket door and barn door (2D glyphs + 3D slab-outside-wall with track). Both are one new `OpeningType` each in the existing pipeline.

**2.3 Exterior siding, wainscot, trim** — Effort **M–L**
Building-level exterior finish: siding type (lap / board-and-batten / metal panel / brick / stone) + color, **wainscot toggle** with independent band color (the Morton/Lancaster pole-barn pattern — cheap to build, huge perceived customization for shops), trim/corner color. New procedural textures in [materials.ts](src/three/materials.ts); applied to the outside face of exterior walls (outside = raster outside test we already run). Per-wall override later.

**2.4 Interior wall paint per room** — Effort **M** · after 1.1
Room entity carries a wall color; interior wall faces bordering that region tint accordingly in 3D. 2D unaffected.

### Phase 3 — Roof v2 (the flagship)

**3.1 Footprint-true roofs with valleys** — Effort **L**
Replace the bbox prism with a **distance-transform heightfield roof**: on the existing footprint raster, roof height at each cell = (distance to nearest eave edge) × pitch. This produces correct hips and **valleys on L/T/U shapes automatically**, meshes greedily into triangles, and fits our raster architecture perfectly — no straight-skeleton library needed. Gable ends = walls excluded from the distance seed (their cells inherit height from the perpendicular run, wall triangles fill the gable). Overhang = dilate the footprint by N cells before the transform. New `src/three/roof.ts`.

**3.2 Per-wall gable/hip directives** — Effort **M** · with 3.1
Chief Architect's proven model: each exterior wall carries a roof directive (eave by default; toggle to gable). One-click Gable/Hip toggle per edge in a small roof-edit mode (2D) and by clicking the wall in closed 3D view. Replaces the global `ridge` override with something that handles any footprint. `Wall` gains `roofEdge?: 'eave' | 'gable'`.

**3.3 Shed roofs + eave detail** — Effort **M**
Shed (single-slope) style; fascia board + soffit band extruded along eaves; slightly thicker roof slab edge. Gutters optional later.

**3.4 Dormers & skylights** — Effort **M each** · after 3.1
Skylight: rectangle on a roof plane, cuts the raster, glass inset (Cedreo/VELUX pattern). Dormer: parametric gable pop-up placed on a roof plane (false dormer first — no interior connection — matching SoftPlan's "minimal interaction" version).

### Phase 4 — Vertical circulation

**4.1 Stairs v2: L/U shapes + landings** — Effort **M–L**
Stair item gains shape (straight / L / U) and landing config; run math already derives from story height. Auto-oriented 2D glyph with UP arrow and break line; parametric 3D treads/risers per leg.
*Precedent: HD's one-click auto L/U stairs; RoomSketcher's stair-type set.*

**4.2 Railings & guardrails** — Effort **M**
Railing as an interior fence-like wall variant (posts + top rail + balusters, reusing the fence builder): stair rails, landing guards, and **mezzanine/open-to-below guardrails** — directly needed by the shop apartment's loft edge.

**4.3 Auto stairwell guard suggestion** — Effort **S** · after 4.2
When a floor has open-to-below regions, offer one-click guardrail placement along the open edge (CA's "Auto Stairwell" spirit).

### Phase 5 — Experiencing the 3D

**5.1 First-person walkthrough** — Effort **M**
Toggle in Scene3D: pointer-lock + WASD at 66″ eye height, walk the dollhouse or closed building. No collision physics in v1.
*Precedent: universal — all five consumer tools.*

**5.2 Saved cameras** — Effort **S–M**
Named camera list stored on the project (position/target/mode); one click to recall; optional auto-orbit "present" mode stepping through them (Floorplanner's fly-through).

**5.3 Sun & time-of-day** — Effort **S–M**
Slider (morning→evening) driving directional-light azimuth/elevation + warmth; shadows toggle. Sweet Home 3D-style simple model, no lat/long needed in v1.

**5.4 3D snapshot + glTF export** — Effort **S**
PNG snapshot at 2×/4× via `renderer.domElement.toDataURL`; glTF export via three.js `GLTFExporter` (opens our model in Blender/SketchUp — SketchUp treats glTF as first-class now).

### Phase 6 — Import, interop, projects

**6.1 Image underlay tracing** — Effort **M–L**
Per-floor background image (PNG/JPG upload): place, rotate, set opacity, then **calibrate by drawing a line over a known dimension and typing its real length** (the Sweet Home 3D / Floorplanner wizard, the industry-standard remodel onboarding). `B` toggles the backdrop while tracing. Stored as dataURL in the project (size warning past ~2 MB for localStorage).

**6.2 DXF export** — Effort **M**
Walls/openings/labels/dimensions as DXF entities (simple text format, hand-rolled writer, no dependency). Opens in AutoCAD/QCAD — the handoff pros ask for.

**6.3 Multi-project manager** — Effort **M**
Named project slots in localStorage (new/duplicate/rename/delete, thumbnails later), replacing the single autosave key. File menu grows a project switcher.

**6.4 Share links** — Effort **M**
Compress project JSON (lz-string) into the URL hash — shareable/bookmarkable on GitHub Pages with zero backend. Falls back to "download file" past URL-length limits.

### Phase 7 — Site & outdoor

**7.1 Decks, porches, pergolas** — Effort **M each**
Parametric items: deck (planked platform + posts + optional railing), porch (deck + posts + shed roof tied to building wall), pergola (posts + slats). *Precedent: VizTerra's "pergola in 3 clicks"; CA deck tools.*

**7.2 Terrain elevation** — Effort **L**
Elevation points on the plot → heightfield ground mesh; buildings/roads/fences sit at terrain height (fence posts follow grade — SoftPlan 2026 pattern). Retaining walls later. Biggest site-side lift; recommended last.

**7.3 Materials/area report** — Effort **S–M**
Per-project quantities: room areas by floor, wall linear footage, road/driveway/surface areas by material, fence length, opening counts. One printable table (lightweight cousin of CA's materials list).

### Phase 8 — Quality-of-life sweep

Each S–M, slot in anytime:
- **Multi-select** (shift-click/drag) with group move/delete
- **Copy/paste across floors** (the align-floors workflow)
- **Shift+arrow nudges** (1″/12″ steps), item **lock**
- **Keyboard shortcut overlay** (`?`)
- **Metric/imperial toggle** (display layer only; model stays inches)
- **2D display styles**: textured / outline / blueprint
- **Plan check**: lint for door widths < 24″, stairs exceeding riser code (we already compute), missing egress window in bedrooms
- **In-canvas coaching hints** for empty states

### Phase 9 — Real-world site import (click your property on a map)

Generate the land plot from the actual property: pick parcel(s) on a satellite map, and the app builds the plot boundary, terrain, and existing buildings at their real sizes and positions. Data-source availability, pricing, and browser CORS access were **live-verified July 2026** — every layer except parcels has a free, keyless, browser-fetchable source.

One constraint to be honest about up front: **Google Maps does not expose parcel boundaries through any API** (its boundary styling stops at country/state/county/locality/postal-code). The parcel lines Google draws on its own map are not available to developers. So the feature delivers the same experience — click your lot on satellite imagery — on an open map stack instead of Google's.

**9.1 Site-import wizard (map modal)** — Effort **M**
`File ▾ → Import site from map…` opens a full-screen MapLibre GL map with Esri World Imagery satellite tiles (free ArcGIS Location Platform key: 2M tiles/month; MapTiler free tier as no-card fallback) and address search. New `src/site-import/` module, lazy-loaded so the main bundle stays lean.

**9.2 Parcel picking, multi-select** — Effort **M** (+ ongoing coverage additions)
Click the lot → point-in-polygon query against the county's public ArcGIS REST parcel endpoint (`…/query?geometry={lng},{lat}&f=geojson`) → parcel polygon highlights. Click neighboring parcels to add them (properties split across multiple parcels union into one plot; click again to remove; running acreage total shown). County/state ArcGIS parcel servers are free, keyless, and CORS-open by default (live-verified, e.g. Maricopa County) — but there is no single national endpoint, so we ship a curated endpoint table (user's county first, then majors/statewide services like NY, WI, WA, TX, FL) and grow it. Two fallbacks always available: **trace mode** (click the corners on the imagery yourself — also the path for users outside coverage) and an optional **Regrid API key** field for paid nationwide coverage (the LandGlide-style dataset).
*Precedent: VizTerra's GIS import (assessor-derived parcel lines, user confirms the boundary in-app).*

**9.3 Terrain fetch** — Effort **M** · display depends on 7.2
Fetch AWS Terrain Tiles (Mazen terrarium PNGs on S3 — free, keyless, CORS-verified), decode elevation from RGB in JS, sample a heightfield over the plot bbox, optionally calibrated with a couple of USGS 3DEP point queries (1 m resolution, free, CORS-verified). Stored on the site floor as `terrain: {grid, w, h, cell}`; Phase 7.2's heightfield ground mesh is the renderer for it, so 9.3 lands together with or after 7.2.

**9.4 Existing buildings from footprints** — Effort **M**
Stream building footprints for the plot bbox from the **Overture Maps buildings PMTiles** (free, keyless, CORS + HTTP-Range verified — browser reads just the tiles it needs from a 179 GB archive; includes `height`/`num_floors` where known; Overpass/OSM as fallback). Each footprint inside the selected parcels becomes a `Building` with shell walls traced along the real polygon at the correct position and rotation, wall height from Overture data when present (default 10′ story otherwise). You then open each building and draw the interior — which is exactly the existing footprint-first workflow.

**9.5 Plot generation & georeferencing** — Effort **M–L** · model work underpinning 9.1–9.4
Model additions: `Project.plotBoundary?: Pt[][]` (polygon rings replace the implicit rectangle; non-contiguous parcels supported), `Project.geo?: {lat, lon, rotation}` anchor, meters→feet local projection around the plot centroid. 2D plot view renders the true boundary (dashed property line follows the polygon); 3D grass/ground mesh clips to it; acreage readout uses real polygon area. Optional satellite-image ground drape at runtime (SoftPlan's site-texture pattern) — fetched live, not baked into the save file.

**Dependency graph:** 9.5 (boundary polygon + geo model) underpins the rest; 9.3 pairs with 7.2 (terrain rendering); 9.1/9.2/9.4 are independent of other phases. Total: the largest single phase in the plan, but every data layer is free and already verified reachable from a static GitHub Pages app.

---

## 4. Recommended order & rationale

**1 → 2 → 3** front-loads what this project's plans are missing most: readable annotated drawings (rooms, areas, dimensions, print) and a 3D that looks like the real building (window styles, siding/wainscot, true roof with valleys). **4** completes the shop-apartment story (L/U stairs, mezzanine guardrails). **5** is the show-off layer (walkthrough, sun, exports). **6** makes it a real multi-project tool. **7–8** round out the site and polish. **9** (real-world site import) is the headline site feature — it pairs naturally with 7.2 (terrain) and can be pulled forward if starting from the real property matters more than interior polish.

Dependencies worth respecting: 1.1 (shared rasterizer extraction) unlocks 1.2, 1.4, 2.4, and cleans up buildScene; 3.1 must precede 3.2–3.4; 4.2 precedes 4.3; 9.5 (plot-boundary polygon + georeferencing) underpins 9.1–9.4, and 9.3 ships with or after 7.2.

---

*Research sources: full inventories archived in session scratchpad (`research-consumer.md`, `research-mobile-shed.md`, pro-CAD report) with ~90 cited product/help-center pages.*
