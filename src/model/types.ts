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
}

export type OpeningType =
  | 'door'
  | 'double-door'
  | 'sliding'
  | 'bifold'
  | 'opening'
  | 'window'
  | 'garage'

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
  /** Head height in inches (garage doors); falls back to the standard head height */
  height?: number
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

export type FloorMaterial = 'wood' | 'tile' | 'carpet' | 'concrete' | 'stone'

/** Paint-bucket seed: the room containing this point gets the material. */
export interface FloorPaint {
  id: string
  x: number
  y: number
  material: FloorMaterial
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
}

/** A building placed on the plot. Floor geometry is in building-local inches. */
export interface Building {
  id: string
  name: string
  x: number // plot position of the building's local origin, inches
  y: number
  rot: number // degrees clockwise
  floors: Floor[]
}

export interface Project {
  /** plot dimensions in inches */
  plotW: number
  plotD: number
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
  | { kind: 'building'; id: string }
  | null

export type Tool =
  | { type: 'select' }
  | { type: 'pan' }
  | { type: 'wall' }
  | { type: 'fence'; fence: FenceType }
  | { type: 'opening'; opening: OpeningType }
  | { type: 'place'; kind: string }
  | { type: 'label' }
  | { type: 'measure' }
  | { type: 'paint'; material: FloorMaterial }

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
})

export const emptyBuilding = (n: number, x = 0, y = 0): Building => ({
  id: uid('bldg'),
  name: `Building ${n}`,
  x,
  y,
  rot: 0,
  floors: [emptyFloor(1)],
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
})

/** Accepts the current project shape plus both legacy shapes (floors-only, single-floor). */
export function migrateProject(raw: any): Project | null {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.buildings)) {
    return {
      plotW: typeof raw.plotW === 'number' ? raw.plotW : 200 * 12,
      plotD: typeof raw.plotD === 'number' ? raw.plotD : 150 * 12,
      site: raw.site ? migrateFloor(raw.site, 0) : { ...emptyFloor(1), name: 'Site' },
      buildings: raw.buildings.slice(0, MAX_BUILDINGS).map((b: any, i: number) => ({
        id: b.id ?? uid('bldg'),
        name: b.name ?? `Building ${i + 1}`,
        x: b.x ?? 0,
        y: b.y ?? 0,
        rot: b.rot ?? 0,
        floors: (b.floors ?? []).slice(0, MAX_FLOORS).map(migrateFloor),
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
