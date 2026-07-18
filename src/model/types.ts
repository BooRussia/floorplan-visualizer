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

export interface Plan {
  walls: Wall[]
  openings: Opening[]
  furniture: Furniture[]
  labels: Label[]
}

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'label'; id: string }
  | null

export type Tool =
  | { type: 'select' }
  | { type: 'pan' }
  | { type: 'wall' }
  | { type: 'opening'; opening: OpeningType }
  | { type: 'place'; kind: string }
  | { type: 'label' }

export const emptyPlan = (): Plan => ({
  walls: [],
  openings: [],
  furniture: [],
  labels: [],
})

let counter = 0
export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`
