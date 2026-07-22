// All world coordinates and lengths are stored in INCHES.

export interface Pt {
  x: number
  y: number
}

export type FenceType = 'privacy' | 'picket' | 'chain' | 'rail'

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number // inches
  /** Perpendicular offset of the curve midpoint from the chord. 0 = straight wall. */
  bulge: number
  height: number // inches, used by the 3D view
  /** When set, this "wall" is a fence line on the site plan. */
  fence?: FenceType
  /** Invisible room divider: splits rooms for names/areas/materials; no 3D geometry. */
  divider?: boolean
  /** Roof directive for exterior walls: 'gable' makes this wall a gable end (default eave). */
  roofEdge?: 'gable'
}

export type OpeningType =
  | 'door'
  | 'double-door'
  | 'sliding'
  | 'bifold'
  | 'pocket'
  | 'barn'
  | 'opening'
  | 'window'
  | 'garage'
  | 'gate'

export type WindowStyle = 'fixed' | 'single-hung' | 'slider' | 'casement' | 'picture'

export interface Opening {
  id: string
  wallId: string
  /** 0..1 — center position along the wall */
  t: number
  width: number // inches
  type: OpeningType
  /** Swing arc / slide direction on the other side of the wall */
  flipSwing: boolean
  /** Hinge on the other jamb */
  flipHinge: boolean
  /** Head height in inches (garage doors + windows); falls back to the standard head height */
  height?: number
  /** Windows: sash/mullion style */
  style?: WindowStyle
  /** Windows: sill height in inches (default 30) */
  sill?: number
}

export interface Furniture {
  id: string
  kind: string // key into the catalog
  x: number
  y: number // center position, inches
  rot: number // degrees, clockwise
  w: number // footprint width (local x), inches
  d: number // footprint depth (local y), inches
  h: number // height, inches (3D)
}

export interface Label {
  id: string
  x: number
  y: number
  text: string
  /** font size in world inches */
  size: number
}

/** A measurement reference point (Photoshop-guide style). */
export interface Guide {
  id: string
  x: number
  y: number
}

export type FloorMaterial = 'wood' | 'tile' | 'carpet' | 'concrete' | 'stone' | 'open'

export type RoadMaterial = 'asphalt' | 'concrete' | 'gravel' | 'pavers'

/** Pen-tool anchor: position + symmetric bezier handle vector (0,0 = corner point). */
export interface RoadNode {
  x: number
  y: number
  hx: number
  hy: number
}

/** A road/path drawn as a bezier centerline, rendered `width` wide either side. */
export interface Road {
  id: string
  nodes: RoadNode[]
  width: number // inches
  material: RoadMaterial
}

/** Paint-bucket seed: the room containing this point gets the material. */
export interface FloorPaint {
  id: string
  x: number
  y: number
  material: FloorMaterial
}

/** Room-name seed: the detected room containing this point gets the name. */
export interface RoomTag {
  id: string
  x: number
  y: number
  name: string
  /** Interior wall paint for this room's wall faces (3D) */
  wallColor?: string
}

export interface Floor {
  id: string
  name: string
  /** story (ceiling) height in inches — drives stair runs and 3D stacking */
  height: number
  walls: Wall[]
  openings: Opening[]
  furniture: Furniture[]
  labels: Label[]
  guides: Guide[]
  paints: FloorPaint[]
  rooms: RoomTag[]
  roads: Road[]
}

export type RoofStyle = 'flat' | 'gable' | 'hip' | 'shed'
export type RoofMaterial = 'shingles' | 'metal'

export type SidingType = 'paint' | 'lap' | 'board-batten' | 'metal' | 'brick' | 'stone'

/** Exterior finish for a building's outside wall faces. */
export interface SidingSpec {
  type: SidingType
  color: string
  /** Lower accent band with its own color (pole-barn wainscot) */
  wainscot?: { color: string; height: number }
  /** Trim color: window/door frames + gable ends */
  trim?: string
}

export interface RoofSpec {
  style: RoofStyle
  /** rise per 12 of run (4 = 4:12) */
  pitch: number
  material: RoofMaterial
  /** ridge direction: auto = along the longer side */
  ridge?: 'auto' | 'ew' | 'ns'
  /** shed roofs: which side is the low eave */
  shedLow?: 'n' | 's' | 'e' | 'w'
}

/** A building placed on the plot. Floor geometry is in building-local inches. */
export interface Building {
  id: string
  name: string
  x: number // plot position of the building's local origin, inches
  y: number
  rot: number // degrees clockwise
  floors: Floor[]
  roof: RoofSpec
  siding?: SidingSpec
}

/** Sun / time-of-day for the 3D view. Hour is 6..20 (6am..8pm). */
export interface SunSpec {
  hour: number
  shadows: boolean
}

export const DEFAULT_SUN: SunSpec = { hour: 11, shadows: true }

/** A saved 3D viewpoint. Bookmarks belong to the view they were taken in. */
export interface SavedCamera {
  id: string
  name: string
  /** camera position + orbit target, world inches */
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
  /** which view it was saved from: 'plot' or a building id (never an index —
   *  indices shift when a building is deleted and would re-point the bookmark) */
  scope: string
  /** closed-exterior toggle and floor isolation at save time */
  closed: boolean
  vis: 'all' | number
}

/** Geographic anchor: plot-local (0,0) sits at this lat/lon corner, north-up (+y = south). */
export interface GeoAnchor {
  lat: number
  lon: number
}

/** Terrain heightfield sampled over the plot. Elevations in inches, relative (min = 0). */
export interface TerrainGrid {
  /** cell size in inches */
  cell: number
  /** columns / rows */
  w: number
  h: number
  /** row-major elevations at cell corners, (w+1)*(h+1) values */
  elev: number[]
}

export interface Project {
  /** plot dimensions in inches */
  plotW: number
  plotD: number
  /** true property boundary rings in plot inches (from site import or tracing); absent = plotW×plotD rectangle */
  plotBoundary?: Pt[][]
  geo?: GeoAnchor
  terrain?: TerrainGrid
  /** 3D view settings — not geometry, so changing these never rebuilds the scene */
  sun?: SunSpec
  cameras?: SavedCamera[]
  /** landscaping layer: walls double as fence lines, furniture as landscape items/surfaces */
  site: Floor
  buildings: Building[]
}

export const MAX_FLOORS = 3
export const MAX_BUILDINGS = 8
/** Structural gap between a story's ceiling and the next story's floor surface. */
export const STORY_GAP = 10
export const SQIN_PER_ACRE = 43560 * 144

/** Which layer is being edited. */
export type EditMode = { scope: 'plot' } | { scope: 'building'; index: number }

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'guide'; id: string }
  | { kind: 'paint'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'building'; id: string }
  | null

export type Tool =
  | { type: 'select' }
  | { type: 'pan' }
  | { type: 'wall'; divider?: boolean }
  | { type: 'box' }
  | { type: 'fence'; fence: FenceType }
  | { type: 'opening'; opening: OpeningType }
  | { type: 'place'; kind: string }
  | { type: 'label' }
  | { type: 'measure' }
  | { type: 'paint'; material: FloorMaterial }
  | { type: 'road' }

export const emptyFloor = (n: number): Floor => ({
  id: uid('floor'),
  name: `Floor ${n}`,
  height: 96,
  walls: [],
  openings: [],
  furniture: [],
  labels: [],
  guides: [],
  paints: [],
  rooms: [],
  roads: [],
})

export const emptyBuilding = (n: number, x = 0, y = 0): Building => ({
  id: uid('bldg'),
  name: `Building ${n}`,
  x,
  y,
  rot: 0,
  floors: [emptyFloor(1)],
  roof: { style: 'gable', pitch: 4, material: 'shingles' },
})

export const emptyProject = (): Project => ({
  plotW: 200 * 12,
  plotD: 150 * 12,
  site: { ...emptyFloor(1), id: uid('site'), name: 'Site' },
  buildings: [emptyBuilding(1)],
})

const migrateFloor = (f: any, i: number): Floor => ({
  id: f.id ?? uid('floor'),
  name: f.name ?? `Floor ${i + 1}`,
  height: typeof f.height === 'number' ? f.height : 96,
  walls: f.walls ?? [],
  openings: f.openings ?? [],
  furniture: f.furniture ?? [],
  labels: f.labels ?? [],
  guides: f.guides ?? [],
  paints: f.paints ?? [],
  rooms: f.rooms ?? [],
  roads: f.roads ?? [],
})

/** Accepts the current project shape plus both legacy shapes (floors-only, single-floor). */
export function migrateProject(raw: any): Project | null {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.buildings)) {
    const boundary: Pt[][] | undefined = Array.isArray(raw.plotBoundary)
      ? raw.plotBoundary.filter(
          (ring: any) =>
            Array.isArray(ring) &&
            ring.length >= 3 &&
            ring.every((p: any) => typeof p?.x === 'number' && typeof p?.y === 'number')
        )
      : undefined
    const terrain: TerrainGrid | undefined =
      raw.terrain &&
      typeof raw.terrain.cell === 'number' &&
      typeof raw.terrain.w === 'number' &&
      typeof raw.terrain.h === 'number' &&
      Array.isArray(raw.terrain.elev) &&
      raw.terrain.elev.length === (raw.terrain.w + 1) * (raw.terrain.h + 1)
        ? { cell: raw.terrain.cell, w: raw.terrain.w, h: raw.terrain.h, elev: raw.terrain.elev }
        : undefined
    return {
      plotW: typeof raw.plotW === 'number' ? raw.plotW : 200 * 12,
      plotD: typeof raw.plotD === 'number' ? raw.plotD : 150 * 12,
      ...(boundary && boundary.length ? { plotBoundary: boundary } : {}),
      ...(typeof raw.geo?.lat === 'number' && typeof raw.geo?.lon === 'number'
        ? { geo: { lat: raw.geo.lat, lon: raw.geo.lon } }
        : {}),
      ...(terrain ? { terrain } : {}),
      ...(typeof raw.sun?.hour === 'number'
        ? { sun: { hour: raw.sun.hour, shadows: raw.sun.shadows !== false } }
        : {}),
      ...(Array.isArray(raw.cameras)
        ? {
            // scope must be a building id or 'plot'; drop pre-id bookmarks
            cameras: raw.cameras.filter(
              (c: any) =>
                c &&
                typeof c.id === 'string' &&
                typeof c.scope === 'string' &&
                ['px', 'py', 'pz', 'tx', 'ty', 'tz'].every((k) => typeof c[k] === 'number')
            ),
          }
        : {}),
      site: raw.site ? migrateFloor(raw.site, 0) : { ...emptyFloor(1), name: 'Site' },
      buildings: raw.buildings.slice(0, MAX_BUILDINGS).map((b: any, i: number) => ({
        id: b.id ?? uid('bldg'),
        name: b.name ?? `Building ${i + 1}`,
        x: b.x ?? 0,
        y: b.y ?? 0,
        rot: b.rot ?? 0,
        floors: (b.floors ?? []).slice(0, MAX_FLOORS).map(migrateFloor),
        roof: {
          style: b.roof?.style ?? 'gable',
          pitch: typeof b.roof?.pitch === 'number' ? b.roof.pitch : 4,
          material: b.roof?.material ?? 'shingles',
          ridge: b.roof?.ridge ?? 'auto',
          ...(b.roof?.shedLow ? { shedLow: b.roof.shedLow } : {}),
        },
        ...(b.siding && typeof b.siding.color === 'string'
          ? { siding: b.siding as SidingSpec }
          : {}),
      })),
    }
  }
  // legacy: multi-floor plan or single-floor plan → one building on a default plot
  let floors: Floor[] | null = null
  if (Array.isArray(raw.floors) && raw.floors.length) {
    floors = raw.floors.slice(0, MAX_FLOORS).map(migrateFloor)
  } else if (Array.isArray(raw.walls)) {
    floors = [migrateFloor(raw, 0)]
  }
  if (!floors) return null
  const project = emptyProject()
  project.buildings = [{ ...emptyBuilding(1, 300, 300), name: 'House', floors }]
  return project
}

let counter = 0
export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`
