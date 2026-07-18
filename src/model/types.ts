// All world coordinates and lengths are stored in INCHES.

export interface Pt {
  x: number
  y: number
}

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number // inches
  /** Perpendicular offset of the curve midpoint from the chord. 0 = straight wall. */
  bulge: number
  height: number // inches, used by the 3D view
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
}

export interface Plan {
  floors: Floor[]
}

export const MAX_FLOORS = 3
/** Structural gap between a story's ceiling and the next story's floor surface. */
export const STORY_GAP = 10

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'guide'; id: string }
  | null

export type Tool =
  | { type: 'select' }
  | { type: 'pan' }
  | { type: 'wall' }
  | { type: 'opening'; opening: OpeningType }
  | { type: 'place'; kind: string }
  | { type: 'label' }
  | { type: 'measure' }

export const emptyFloor = (n: number): Floor => ({
  id: uid('floor'),
  name: `Floor ${n}`,
  height: 96,
  walls: [],
  openings: [],
  furniture: [],
  labels: [],
  guides: [],
})

export const emptyPlan = (): Plan => ({ floors: [emptyFloor(1)] })

/** Accepts both the current {floors:[...]} shape and the legacy single-floor shape. */
export function migratePlan(raw: any): Plan | null {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.floors) && raw.floors.length) {
    const floors: Floor[] = raw.floors.slice(0, MAX_FLOORS).map((f: any, i: number) => ({
      id: f.id ?? uid('floor'),
      name: f.name ?? `Floor ${i + 1}`,
      height: typeof f.height === 'number' ? f.height : 96,
      walls: f.walls ?? [],
      openings: f.openings ?? [],
      furniture: f.furniture ?? [],
      labels: f.labels ?? [],
      guides: f.guides ?? [],
    }))
    return { floors }
  }
  if (Array.isArray(raw.walls)) {
    return {
      floors: [
        {
          ...emptyFloor(1),
          walls: raw.walls,
          openings: raw.openings ?? [],
          furniture: raw.furniture ?? [],
          labels: raw.labels ?? [],
          guides: raw.guides ?? [],
        },
      ],
    }
  }
  return null
}

let counter = 0
export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`
