import * as THREE from 'three'
import {
  STORY_GAP,
  type Building,
  type EditMode,
  type Floor,
  type Furniture,
  type Opening,
  type Project,
  type Pt,
  type Road,
  type RoofSpec,
  type Wall,
} from '../model/types'
import { dist, sampleRoad, toLocal, wallPointAt, wallSamples } from '../model/geometry'
import {
  getGrassTexture,
  MAT,
  roofSurfaceMaterial,
  roomFloorMaterial,
  sidingMaterial,
  surfaceMaterial,
  tintedMaterial,
} from './materials'
import { buildFurniture } from './furniture3d'
import { buildRasterRoof, wallsBBox } from './roof'
import { isStairKind } from '../model/catalog'
import { outsideAt, rasterizeFloor, regionAt, type FloorRaster } from '../model/raster'
import {
  buildBoundaryLines,
  buildTerrainMesh,
  padSampler,
  rawSampler,
  type BuildingPad,
  type GroundSampler,
} from './terrain3d'

const FLAT_GROUND: GroundSampler = () => 0

const FLOOR_Y = 0.12
const SLAB_DEPTH = 4
const DOOR_HEAD = 80
const WINDOW_SILL = 30
const WINDOW_HEAD = 78

export type FurniturePlace =
  | { scope: 'site' }
  | { scope: 'building'; index: number; floor: number }

export interface BuiltFurniture {
  group: THREE.Group
  place: FurniturePlace
  /** world elevation of the floor the item stands on */
  elevation: number
  /** building transform for local<->world conversion (undefined for site items) */
  transform?: { x: number; y: number; rot: number }
}

export interface BuiltProject {
  group: THREE.Group
  /** per-story groups across all buildings, for the visibility switcher */
  floorGroups: { floor: number; group: THREE.Group; baseY: number }[]
  furniture: Map<string, BuiltFurniture>
  center: THREE.Vector3
  radius: number
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

/** Frame/trim material — swapped per building when a trim color is set. */
let FRAME: THREE.Material = MAT.frame

/** Per-side face materials for a wall box: plus = the wall's local +z side
 * (plan-left of a→b), minus = the other. UVs on those faces are world-scaled
 * (96" per repeat) and offset by u0/y0 so patterns align across segments. */
interface WallFaceMats {
  plus?: THREE.Material
  minus?: THREE.Material
  u0?: number
}

/** Axis box between two plan points (plan y -> world z), from y0 to y1. */
function wallBox(
  group: THREE.Group,
  a: Pt,
  b: Pt,
  y0: number,
  y1: number,
  thickness: number,
  mat: THREE.Material,
  extendStart = 0,
  extendEnd = 0,
  tag?: { wallId: string; floor: number },
  faces?: WallFaceMats
) {
  const L = dist(a, b) + extendStart + extendEnd
  if (L <= 0.01 || y1 - y0 <= 0.01) return
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const midS = (dist(a, b) + extendEnd - extendStart) / 2
  const cx = a.x + ux * midS
  const cz = a.y + uy * midS
  const geo = new THREE.BoxGeometry(L, y1 - y0, thickness)
  let material: THREE.Material | THREE.Material[] = mat
  if (faces && (faces.plus || faces.minus)) {
    // world-scale the side-face UVs so siding courses align across wall segments
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (const start of [16, 20]) {
      for (let i = start; i < start + 4; i++) {
        const u = uv.getX(i)
        const v = uv.getY(i)
        uv.setXY(i, ((faces.u0 ?? 0) - extendStart) / 96 + (u * L) / 96, (y0 + v * (y1 - y0)) / 96)
      }
    }
    uv.needsUpdate = true
    material = [mat, mat, mat, mat, faces.plus ?? mat, faces.minus ?? mat]
  }
  const m = mesh(geo, material as THREE.Material, true, true)
  m.position.set(cx, (y0 + y1) / 2, cz)
  m.rotation.y = -ang
  if (tag) m.userData.wallTag = tag
  group.add(m)
}

/** Point at distance s along a straight wall */
function alongWall(w: Wall, s: number): Pt {
  const L = dist(w.a, w.b) || 1
  return { x: w.a.x + ((w.b.x - w.a.x) * s) / L, y: w.a.y + ((w.b.y - w.a.y) * s) / L }
}

function buildDoorLeaves(group: THREE.Group, w: Wall, o: Opening, s0: number, s1: number) {
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  const width = s1 - s0
  const leafH = Math.min(DOOR_HEAD - 1, w.height - 4)
  // +openDeg swings the leaf toward the wall's -y (plan) side, matching the 2D
  // default; flipSwing sends it to +y. (Was inverted, so 3D swings disagreed with 2D.)
  const side = o.flipSwing ? -1 : 1

  const makeLeaf = (hingeS: number, leafW: number, openDeg: number) => {
    const hinge = alongWall(w, hingeS)
    const pivot = new THREE.Group()
    pivot.position.set(hinge.x, 0, hinge.y)
    pivot.rotation.y = -ang + THREE.MathUtils.degToRad(openDeg)
    const leaf = mesh(new THREE.BoxGeometry(leafW, leafH, 1.6), MAT.doorLeaf)
    leaf.position.set(leafW / 2, leafH / 2 + 0.2, 0)
    pivot.add(leaf)
    const knob = mesh(new THREE.SphereGeometry(0.9, 10, 8), MAT.steel)
    knob.position.set(leafW - 3, 38, side * 1.6)
    pivot.add(knob)
    group.add(pivot)
  }

  if (o.type === 'pocket') {
    // slab half-tucked into the wall cavity, sliding from the hinge side
    const from = o.flipHinge ? s1 : s0
    const dir = o.flipHinge ? -1 : 1
    const slabW = width * 0.55
    const start = alongWall(w, from + (dir * slabW) / 2 - dir * width * 0.18)
    const holder = new THREE.Group()
    holder.position.set(start.x, 0, start.y)
    holder.rotation.y = -ang
    const slab = mesh(new THREE.BoxGeometry(slabW, leafH, 1.4), MAT.doorLeaf)
    slab.position.set(0, leafH / 2 + 0.2, 0)
    holder.add(slab)
    const pull = mesh(new THREE.BoxGeometry(1, 4.5, 0.5), MAT.steel)
    pull.position.set((dir * slabW) / 2 - dir * 2, 38, 0.9)
    holder.add(pull)
    group.add(holder)
    return
  }
  if (o.type === 'barn') {
    // surface-mounted slab on the swing side + track bar above the opening
    const mid = alongWall(w, (s0 + s1) / 2)
    const holder = new THREE.Group()
    holder.position.set(mid.x, 0, mid.y)
    holder.rotation.y = -ang
    const z = side * (w.thickness / 2 + 1.6)
    const slabW = width * 1.08
    // parked slightly off-center toward the hinge side so the opening reads open-able
    const shift = (o.flipHinge ? 1 : -1) * width * 0.18
    const slab = mesh(new THREE.BoxGeometry(slabW, leafH + 2, 1.7), MAT.doorLeaf)
    slab.position.set(shift, (leafH + 2) / 2 + 0.2, z)
    holder.add(slab)
    // X-brace planks
    for (const sgn of [1, -1]) {
      const brace = mesh(new THREE.BoxGeometry(Math.hypot(slabW - 6, (leafH - 10) / 2), 3, 0.6), MAT.doorLeaf)
      brace.position.set(shift, leafH / 2, z + side * 1.2)
      brace.rotation.z = sgn * Math.atan2((leafH - 10) / 2, slabW - 6)
      holder.add(brace)
    }
    const track = mesh(new THREE.BoxGeometry(width * 2, 1.6, 0.8), MAT.steel)
    track.position.set(0, leafH + 5, z)
    holder.add(track)
    for (const hx of [shift - slabW / 2 + 3, shift + slabW / 2 - 3]) {
      const hanger = mesh(new THREE.BoxGeometry(1.2, 4.5, 0.6), MAT.steel)
      hanger.position.set(hx, leafH + 2.6, z + 0.3)
      holder.add(hanger)
    }
    group.add(holder)
    return
  }
  if (o.type === 'door') {
    const hingeS = o.flipHinge ? s1 : s0
    makeLeaf(hingeS, width, o.flipHinge ? 180 - side * 72 : side * 72)
  } else if (o.type === 'double-door') {
    makeLeaf(s0, width / 2, side * 65)
    makeLeaf(s1, width / 2, 180 - side * 65)
  } else if (o.type === 'bifold') {
    const q = width / 4
    const fold = side * 55
    const a0 = alongWall(w, s0)
    const p0 = new THREE.Group()
    p0.position.set(a0.x, 0, a0.y)
    p0.rotation.y = -ang + THREE.MathUtils.degToRad(fold)
    const l1 = mesh(new THREE.BoxGeometry(q, leafH, 1.3), MAT.doorLeaf)
    l1.position.set(q / 2, leafH / 2, 0)
    p0.add(l1)
    const p0b = new THREE.Group()
    p0b.position.set(q, 0, 0)
    p0b.rotation.y = THREE.MathUtils.degToRad(-fold * 1.8)
    const l2 = mesh(new THREE.BoxGeometry(q, leafH, 1.3), MAT.doorLeaf)
    l2.position.set(q / 2, leafH / 2, 0)
    p0b.add(l2)
    p0.add(p0b)
    group.add(p0)
    const a1 = alongWall(w, s1)
    const p1 = new THREE.Group()
    p1.position.set(a1.x, 0, a1.y)
    p1.rotation.y = -ang + Math.PI - THREE.MathUtils.degToRad(fold)
    const r1 = mesh(new THREE.BoxGeometry(q, leafH, 1.3), MAT.doorLeaf)
    r1.position.set(q / 2, leafH / 2, 0)
    p1.add(r1)
    const p1b = new THREE.Group()
    p1b.position.set(q, 0, 0)
    p1b.rotation.y = THREE.MathUtils.degToRad(fold * 1.8)
    const r2 = mesh(new THREE.BoxGeometry(q, leafH, 1.3), MAT.doorLeaf)
    r2.position.set(q / 2, leafH / 2, 0)
    p1b.add(r2)
    p1.add(p1b)
    group.add(p1)
  } else if (o.type === 'sliding') {
    const mid = alongWall(w, (s0 + s1) / 2)
    const holder = new THREE.Group()
    holder.position.set(mid.x, 0, mid.y)
    holder.rotation.y = -ang
    const ph = Math.min(w.height - 3, 80)
    const pw = width * 0.55
    for (const [off, shift] of [
      [-0.9, -width / 2 + pw / 2],
      [0.9, width / 2 - pw / 2],
    ]) {
      const frame = new THREE.Group()
      frame.position.set(shift as number, 0, off as number)
      const gl = mesh(new THREE.BoxGeometry(pw - 2, ph - 4, 0.5), MAT.glass, false)
      gl.position.set(0, ph / 2, 0)
      frame.add(gl)
      for (const fy of [1, ph - 1.5]) {
        const bar = mesh(new THREE.BoxGeometry(pw, 2, 1.4), FRAME)
        bar.position.set(0, fy + 0.75, 0)
        frame.add(bar)
      }
      for (const fx of [-pw / 2 + 0.7, pw / 2 - 0.7]) {
        const bar = mesh(new THREE.BoxGeometry(1.4, ph, 1.4), FRAME)
        bar.position.set(fx, ph / 2, 0)
        frame.add(bar)
      }
      holder.add(frame)
    }
    group.add(holder)
  }
}

function buildGarageDoor(
  group: THREE.Group,
  w: Wall,
  o: Opening,
  s0: number,
  s1: number,
  head: number
) {
  const mid = alongWall(w, (s0 + s1) / 2)
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  const holder = new THREE.Group()
  holder.position.set(mid.x, 0, mid.y)
  holder.rotation.y = -ang
  const width = s1 - s0
  const side = o.flipSwing ? -1 : 1 // which side of the wall the garage interior is on

  // sectional panels
  const panels = 4
  const ph = (head - 1) / panels
  for (let i = 0; i < panels; i++) {
    const panel = mesh(new THREE.BoxGeometry(width - 3, ph - 0.7, 1.8), MAT.doorLeaf)
    panel.position.set(0, ph * i + ph / 2 + 0.5, 0)
    holder.add(panel)
  }
  // window row on the top panel
  const winCount = Math.max(2, Math.round(width / 48))
  const winW = Math.min(18, (width - 12) / winCount - 4)
  for (let i = 0; i < winCount; i++) {
    const x = -width / 2 + ((i + 0.5) * width) / winCount
    const glass = mesh(new THREE.BoxGeometry(winW, ph * 0.45, 0.6), MAT.glass, false)
    glass.position.set(x, head - ph / 2 - 0.2, 1)
    holder.add(glass)
  }
  // handle
  const handle = mesh(new THREE.BoxGeometry(8, 1.4, 1), MAT.steel)
  handle.position.set(0, ph * 1.05, -side * 1.5)
  holder.add(handle)
  // vertical tracks just inside the garage
  for (const fx of [-width / 2 + 1.5, width / 2 - 1.5]) {
    const track = mesh(new THREE.BoxGeometry(2, head + 6, 1.2), MAT.steel)
    track.position.set(fx, (head + 6) / 2, side * (w.thickness / 2 + 1.4))
    holder.add(track)
  }
  group.add(holder)
}

/** Window sill height for an opening (windows only). */
const winSill = (o: Opening) => Math.max(2, o.sill ?? WINDOW_SILL)
const winHead = (o: Opening, wallH: number) => Math.min(o.height ?? WINDOW_HEAD, wallH - 3)

function buildWindow(group: THREE.Group, w: Wall, o: Opening, s0: number, s1: number) {
  const a = alongWall(w, s0)
  const b = alongWall(w, s1)
  const sill = winSill(o)
  const head = Math.max(sill + 8, winHead(o, w.height))
  const style = o.style ?? 'slider'
  // sill ledge
  wallBox(group, a, b, sill - 1.2, sill, w.thickness + 2, FRAME)
  const mid = alongWall(w, (s0 + s1) / 2)
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  const holder = new THREE.Group()
  holder.position.set(mid.x, 0, mid.y)
  holder.rotation.y = -ang
  const width = s1 - s0
  const h = head - sill
  const cy = (head + sill) / 2

  const bar = (bw: number, bh: number, x: number, y: number, z = 0, depth = 1.4) => {
    const m = mesh(new THREE.BoxGeometry(bw, bh, depth), FRAME)
    m.position.set(x, y, z)
    holder.add(m)
  }

  const gl = mesh(new THREE.BoxGeometry(width - 1, h, 0.6), MAT.glass, false)
  gl.position.set(0, cy, 0)
  holder.add(gl)
  // jambs + head/sill rails on every style
  for (const fx of [-width / 2 + 0.6, width / 2 - 0.6]) {
    const jamb = mesh(new THREE.BoxGeometry(1.2, h, w.thickness + 1), FRAME)
    jamb.position.set(fx, cy, 0)
    holder.add(jamb)
  }
  bar(width - 1, 1.6, 0, head - 0.8)
  bar(width - 1, 1.6, 0, sill + 0.8)

  if (style === 'slider') {
    // two sliding panes: center mull, one pane proud of the other
    bar(1.4, h, 0, cy)
    bar(width / 2 - 1, 1.1, -width / 4, cy, 0.9, 0.8)
  } else if (style === 'single-hung') {
    // horizontal meeting rail; lower sash sits proud
    bar(width - 1, 1.8, 0, cy)
    const lower = mesh(new THREE.BoxGeometry(width - 2, h / 2 - 1.6, 0.5), MAT.glass, false)
    lower.position.set(0, sill + h / 4, 0.8)
    holder.add(lower)
    for (const fx of [-width / 2 + 1.2, width / 2 - 1.2]) bar(1.1, h / 2 - 1, fx, sill + h / 4, 0.9, 0.9)
    bar(width - 2, 1.2, 0, sill + h / 2 - 1.4, 0.9, 0.9)
    bar(width - 2, 1.2, 0, sill + 1.6, 0.9, 0.9)
  } else if (style === 'casement') {
    // two hinged panes with a center mull and slim sash frames
    bar(1.6, h, 0, cy)
    for (const sgn of [-1, 1]) {
      for (const fx of [sgn * 2, sgn * (width / 2 - 1.4)]) bar(1.0, h - 2, fx, cy, 0.8, 0.8)
      bar(width / 2 - 3, 1.0, (sgn * width) / 4, head - 2, 0.8, 0.8)
      bar(width / 2 - 3, 1.0, (sgn * width) / 4, sill + 2, 0.8, 0.8)
      // crank handle at the sill
      const crank = mesh(new THREE.BoxGeometry(2.2, 1, 1), MAT.steel)
      crank.position.set((sgn * width) / 4, sill + 2.6, 1.4)
      holder.add(crank)
    }
  } else if (style === 'fixed') {
    bar(1.2, h, 0, cy) // single center mull (classic double-lite look)
  }
  // picture: clean uninterrupted glass — no mullions

  group.add(holder)
}

function fenceMat(type: string) {
  return type === 'chain' ? MAT.chainMetal : type === 'picket' ? MAT.fenceWhite : MAT.fenceWood
}

/** Infill between two points for one fence style. baseY lets fences follow terrain. */
function fenceSegment(group: THREE.Group, a: Pt, b: Pt, type: string, H: number, baseY = 0) {
  const segL = dist(a, b)
  if (segL < 2) return
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const place = (m: THREE.Mesh, y: number) => {
    m.position.set((a.x + b.x) / 2, y + baseY, (a.y + b.y) / 2)
    m.rotation.y = -ang
    group.add(m)
  }
  if (type === 'privacy') {
    place(mesh(new THREE.BoxGeometry(segL, H - 6, 1.6), MAT.fenceWood), (H - 6) / 2 + 4)
    place(mesh(new THREE.BoxGeometry(segL, 3, 2.4), MAT.fenceWood), H - 2)
  } else if (type === 'picket') {
    place(mesh(new THREE.BoxGeometry(segL, 2.4, 1.4), MAT.fenceWhite), H * 0.35)
    place(mesh(new THREE.BoxGeometry(segL, 2.4, 1.4), MAT.fenceWhite), H * 0.8)
    const pickets = Math.max(2, Math.floor(segL / 8))
    for (let k = 0; k < pickets; k++) {
      const t = (k + 0.5) / pickets
      const px = a.x + (b.x - a.x) * t
      const pz = a.y + (b.y - a.y) * t
      const picket = mesh(new THREE.BoxGeometry(2.6, H - 4, 1), MAT.fenceWhite)
      picket.position.set(px, (H - 4) / 2 + baseY, pz)
      picket.rotation.y = -ang
      group.add(picket)
    }
  } else if (type === 'chain') {
    const mat = MAT.glass.clone()
    mat.color.set('#9aa0a6')
    mat.opacity = 0.25
    place(mesh(new THREE.BoxGeometry(segL, H - 8, 0.4), mat, false), (H - 8) / 2 + 4)
    place(mesh(new THREE.CylinderGeometry(0.8, 0.8, segL, 6).rotateZ(Math.PI / 2), MAT.chainMetal), H - 2)
  } else {
    place(mesh(new THREE.BoxGeometry(segL, 3.2, 2), MAT.fenceWood), H * 0.5)
    place(mesh(new THREE.BoxGeometry(segL, 3.2, 2), MAT.fenceWood), H - 2)
  }
}

/** One swinging gate leaf: frame + diagonal brace + style-matched infill. */
function gateLeaf(group: THREE.Group, hinge: Pt, ang: number, openDeg: number, lw: number, H: number, type: string, baseY = 0) {
  const gh = Math.max(24, H - 4)
  const m = fenceMat(type)
  const pivot = new THREE.Group()
  pivot.position.set(hinge.x, baseY, hinge.y)
  pivot.rotation.y = -ang + THREE.MathUtils.degToRad(openDeg)
  const bar = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const bm = mesh(new THREE.BoxGeometry(w, h, d), m)
    bm.position.set(x, y, z)
    pivot.add(bm)
  }
  bar(2, gh, 2, 1, gh / 2 + 2)
  bar(2, gh, 2, lw - 1, gh / 2 + 2)
  bar(lw - 2, 2.4, 2, lw / 2, gh + 1)
  bar(lw - 2, 2.4, 2, lw / 2, 4)
  // diagonal brace
  const brace = mesh(new THREE.BoxGeometry(Math.hypot(lw - 4, gh - 8), 2, 1.4), m)
  brace.position.set(lw / 2, gh / 2 + 2, 0)
  brace.rotation.z = Math.atan2(gh - 8, lw - 4)
  pivot.add(brace)
  if (type === 'privacy') {
    const panel = mesh(new THREE.BoxGeometry(lw - 4, gh - 8, 1), MAT.fenceWood)
    panel.position.set(lw / 2, gh / 2 + 2, 0.8)
    pivot.add(panel)
  } else if (type === 'picket') {
    const pickets = Math.max(2, Math.floor(lw / 8))
    for (let k = 0; k < pickets; k++) {
      const x = ((k + 0.5) * lw) / pickets
      const p = mesh(new THREE.BoxGeometry(2.4, gh - 4, 1), MAT.fenceWhite)
      p.position.set(x, gh / 2 + 1, 0.8)
      pivot.add(p)
    }
  } else if (type === 'chain') {
    const mat = MAT.glass.clone()
    mat.color.set('#9aa0a6')
    mat.opacity = 0.25
    const mesh2 = mesh(new THREE.BoxGeometry(lw - 4, gh - 8, 0.4), mat, false)
    mesh2.position.set(lw / 2, gh / 2 + 2, 0)
    pivot.add(mesh2)
  } else {
    bar(lw - 2, 2.6, 1.6, lw / 2, gh * 0.55)
  }
  group.add(pivot)
}

function buildFence(group: THREE.Group, w: Wall, openings: Opening[], gy: GroundSampler = FLAT_GROUND) {
  const type = w.fence!
  const H = w.height
  const postMat = fenceMat(type)
  const post = (p: Pt, big = false) => {
    const pm = mesh(new THREE.BoxGeometry(big ? 4.5 : 3.5, H + (big ? 2 : 0), big ? 4.5 : 3.5), postMat)
    pm.position.set(p.x, (H + (big ? 2 : 0)) / 2 + gy(p.x, p.y), p.y)
    group.add(pm)
  }
  const segY = (a: Pt, b: Pt) => (gy(a.x, a.y) + gy(b.x, b.y)) / 2

  const L = dist(w.a, w.b)
  const gates = openings
    .filter((o) => o.wallId === w.id && o.type === 'gate' && !w.bulge)
    .map((o) => {
      const c = o.t * L
      return { o, s0: Math.max(0, c - o.width / 2), s1: Math.min(L, c + o.width / 2) }
    })
    .sort((x, y) => x.s0 - y.s0)

  if (!gates.length) {
    // no gates: posts + infill along the (possibly curved) line
    const len = w.bulge ? wallSamples(w, 6).length * 6 : L
    const posts = Math.max(2, Math.round(len / 96) + 1)
    for (let i = 0; i < posts; i++) post(wallPointAt(w, i / (posts - 1)))
    const samples = wallSamples(w, 96)
    for (let i = 0; i < samples.length - 1; i++) {
      fenceSegment(group, samples[i], samples[i + 1], type, H, segY(samples[i], samples[i + 1]))
    }
    return
  }

  const at = (s: number): Pt => ({
    x: w.a.x + ((w.b.x - w.a.x) * s) / (L || 1),
    y: w.a.y + ((w.b.y - w.a.y) * s) / (L || 1),
  })
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)

  // clear ranges between gates
  const ranges: [number, number][] = []
  let cursor = 0
  for (const g of gates) {
    if (g.s0 > cursor) ranges.push([cursor, g.s0])
    cursor = g.s1
  }
  if (cursor < L) ranges.push([cursor, L])

  for (const [r0, r1] of ranges) {
    const runL = r1 - r0
    const posts = Math.max(2, Math.round(runL / 96) + 1)
    let prev = at(r0)
    post(prev)
    for (let i = 1; i < posts; i++) {
      const p = at(r0 + (runL * i) / (posts - 1))
      post(p)
      fenceSegment(group, prev, p, type, H, segY(prev, p))
      prev = p
    }
  }

  for (const { o, s0, s1 } of gates) {
    post(at(s0), true)
    post(at(s1), true)
    const width = s1 - s0
    const side = o.flipSwing ? 1 : -1
    const gyAt = (s: number) => {
      const p = at(s)
      return gy(p.x, p.y)
    }
    if (width > 72) {
      gateLeaf(group, at(s0), ang, side * 45, width / 2 - 1, H, type, gyAt(s0))
      gateLeaf(group, at(s1), ang, 180 - side * 45, width / 2 - 1, H, type, gyAt(s1))
    } else if (o.flipHinge) {
      gateLeaf(group, at(s1), ang, 180 - side * 50, width - 1, H, type, gyAt(s1))
    } else {
      gateLeaf(group, at(s0), ang, side * 50, width - 1, H, type, gyAt(s0))
    }
  }
}

/** Context for resolving what each side of a wall shows: exterior siding, an
 * interior room's paint color, or the default wall white. */
interface WallFaceCtx {
  raster: FloorRaster
  matRaster: FloorRaster | null
  roomColors: Map<number, string>
  siding?: import('../model/types').SidingSpec
}

/** Resolve the +z / -z face materials for a wall from its surroundings. */
function resolveFaces(
  w: Wall,
  ctx: WallFaceCtx | undefined
): { plus?: THREE.Material; minus?: THREE.Material; plusOut: boolean; minusOut: boolean } {
  if (!ctx) return { plusOut: false, minusOut: false }
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  const mid = wallPointAt(w, 0.5)
  const d = w.thickness / 2 + ctx.raster.CELL * 2.5
  const sideMat = (sign: 1 | -1): { mat?: THREE.Material; out: boolean } => {
    const px = mid.x + nx * sign * d
    const py = mid.y + ny * sign * d
    if (outsideAt(ctx.raster, px, py)) {
      return {
        mat: ctx.siding ? sidingMaterial(ctx.siding.type, ctx.siding.color) : undefined,
        out: true,
      }
    }
    const reg = ctx.matRaster ? regionAt(ctx.matRaster, px, py) : regionAt(ctx.raster, px, py)
    const color = reg >= 0 ? ctx.roomColors.get(reg) : undefined
    return { mat: color ? tintedMaterial(color) : undefined, out: false }
  }
  const plus = sideMat(1)
  const minus = sideMat(-1)
  return { plus: plus.mat, minus: minus.mat, plusOut: plus.out, minusOut: minus.out }
}

/**
 * extendTo: when this wall belongs to a floor with another story above, full-height
 * walls are extended up to `extendTo` (the underside of the next story's floor) so
 * walls meet the floor above with no gap; the cap is skipped (it would be buried).
 */
function buildWall(
  group: THREE.Group,
  w: Wall,
  openings: Opening[],
  extendTo?: { to: number; ifAtLeast: number },
  tag?: { wallId: string; floor: number },
  faceCtx?: WallFaceCtx
) {
  const H = w.height
  const extended = !!extendTo && w.height >= extendTo.ifAtLeast - 0.5
  const top = extended ? Math.max(H, extendTo!.to) : H
  const th = w.thickness
  const ext = th / 2 // match the 2D square line caps so corners close
  const fr = resolveFaces(w, faceCtx)
  const hasFaces = !!(fr.plus || fr.minus)
  const facesAt = (u0: number): WallFaceMats | undefined =>
    hasFaces ? { plus: fr.plus, minus: fr.minus, u0 } : undefined

  if (w.bulge) {
    const pts = wallSamples(w, 4)
    let arc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      wallBox(group, pts[i], pts[i + 1], 0, top, th, MAT.wall, 0.6, 0.6, tag, facesAt(arc))
      if (!extended) wallBox(group, pts[i], pts[i + 1], H, H + 1, th + 0.4, MAT.wallCap, 0.6, 0.6)
      arc += dist(pts[i], pts[i + 1])
    }
    return
  }

  const L = dist(w.a, w.b)
  const ops = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => {
      const c = o.t * L
      return { o, s0: Math.max(0, c - o.width / 2), s1: Math.min(L, c + o.width / 2) }
    })
    .sort((x, y) => x.s0 - y.s0)

  let cursor = 0
  for (const { o, s0, s1 } of ops) {
    if (s0 > cursor) {
      wallBox(group, alongWall(w, cursor), alongWall(w, s0), 0, top, th, MAT.wall, cursor === 0 ? ext : 0, 0, tag, facesAt(cursor))
    }
    const head =
      o.type === 'window'
        ? Math.max(winSill(o) + 8, winHead(o, H))
        : o.type === 'garage'
          ? Math.min(o.height ?? 84, H - 3)
          : Math.min(DOOR_HEAD, H - 4)
    wallBox(group, alongWall(w, s0), alongWall(w, s1), head, top, th, MAT.wall, 0, 0, tag, facesAt(s0))
    if (o.type === 'window') {
      wallBox(group, alongWall(w, s0), alongWall(w, s1), 0, winSill(o), th, MAT.wall, 0, 0, tag, facesAt(s0))
      buildWindow(group, w, o, s0, s1)
    } else if (o.type === 'garage') {
      buildGarageDoor(group, w, o, s0, s1, head)
    } else {
      buildDoorLeaves(group, w, o, s0, s1)
    }
    cursor = s1
  }
  if (cursor < L) {
    wallBox(group, alongWall(w, cursor), w.b, 0, top, th, MAT.wall, cursor === 0 ? ext : 0, ext, tag, facesAt(cursor))
  }
  if (!extended) wallBox(group, w.a, w.b, H, H + 1, th + 0.4, MAT.wallCap, ext, ext)

  // wainscot: lower accent band on exterior faces, broken around low openings
  const wain = faceCtx?.siding?.wainscot
  if (wain && (fr.plusOut || fr.minusOut) && !w.bulge) {
    const wh = Math.min(wain.height, H - 6)
    const wmat = sidingMaterial(faceCtx!.siding!.type, wain.color)
    const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    const lows = ops.filter(
      ({ o }) => o.type !== 'window' || winSill(o) < wh - 1
    )
    const ranges: [number, number][] = []
    let c2 = 0
    for (const { s0, s1 } of lows) {
      if (s0 > c2 + 1) ranges.push([c2, s0])
      c2 = Math.max(c2, s1)
    }
    if (c2 < L - 1) ranges.push([c2, L])
    for (const sign of [1, -1] as const) {
      if (!(sign === 1 ? fr.plusOut : fr.minusOut)) continue
      const off = th / 2 + 0.7
      for (const [r0, r1] of ranges) {
        const aP = alongWall(w, r0)
        const bP = alongWall(w, r1)
        const shift = (p: Pt): Pt => ({ x: p.x + nx * sign * off, y: p.y + ny * sign * off })
        wallBox(
          group,
          shift(aP),
          shift(bP),
          0,
          wh,
          1.2,
          wmat,
          r0 === 0 ? ext : 0,
          r1 >= L - 0.5 ? ext : 0,
          undefined,
          { plus: wmat, minus: wmat, u0: r0 }
        )
      }
    }
  }
}

// ---------- floor surfaces via flood fill ----------

/** true when p falls inside the footprint of any of the given furniture items */
function inFootprint(p: Pt, items: Furniture[]): boolean {
  for (const f of items) {
    const local = toLocal(p, f.x, f.y, f.rot)
    if (Math.abs(local.x) <= f.w / 2 && Math.abs(local.y) <= f.d / 2) return true
  }
  return false
}

/**
 * Wood floor + structural slab for one story, from a prepared raster.
 * level 0 gets a ground slab below grade; upper levels get a story-gap band.
 * `holes` are stairwell footprints from the floor below — skipped in both meshes.
 */
function buildFloorSurface(
  group: THREE.Group,
  floor: Floor,
  level: number,
  holes: Furniture[],
  raster: FloorRaster,
  rooms: FloorRaster | null,
  roofY?: number,
  matRaster?: FloorRaster | null
) {
  const { CELL, ox, oy, W, H, solid, outside, region, enclosed } = raster
  const idx = (cx: number, cy: number) => cy * W + cx
  const isInterior = (i: number) => (enclosed ? !solid[i] && !outside[i] : !solid[i])

  const cellCenter = (cx: number, cy: number): Pt => ({
    x: ox + cx * CELL + CELL / 2,
    y: oy + cy * CELL + CELL / 2,
  })

  // Room dividers split MATERIAL regions without adding geometry: material lookup
  // runs on matRegion (walls + dividers, same grid) while floor/slab quads use `region`.
  const matRegion = matRaster && matRaster.W === W && matRaster.H === H ? matRaster.region : region
  let regionCount = 0
  for (let i = 0; i < W * H; i++) if (matRegion[i] >= regionCount) regionCount = matRegion[i] + 1

  // Default material per region: on upper stories, regions with no cell sealed by
  // this story's OWN walls read as flat deck/roof; rooms default to wood.
  const useRooms = level > 0 && rooms != null && rooms.enclosed
  const regionMaterial: string[] = new Array(regionCount).fill(
    useRooms ? '__deck' : 'wood'
  )
  if (useRooms) {
    for (let i = 0; i < W * H; i++) {
      const r = matRegion[i]
      if (r >= 0 && !rooms!.solid[i] && !rooms!.outside[i]) regionMaterial[r] = 'wood'
    }
  }

  // paint seeds override per region (deck included — paint it if you want)
  for (const paint of floor.paints ?? []) {
    const cx = Math.round((paint.x - ox) / CELL)
    const cy = Math.round((paint.y - oy) / CELL)
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue
    const r = matRegion[idx(cx, cy)]
    if (r >= 0) regionMaterial[r] = paint.material
  }

  // one geometry per material
  const byMat = new Map<string, { positions: number[]; uvs: number[]; indices: number[] }>()
  const pushQuad = (material: string, x0: number, z0: number, x1: number, z1: number) => {
    if (material === 'open') return // open to below: no floor surface
    let acc = byMat.get(material)
    if (!acc) {
      acc = { positions: [], uvs: [], indices: [] }
      byMat.set(material, acc)
    }
    const base = acc.positions.length / 3
    acc.positions.push(x0, FLOOR_Y, z0, x1, FLOOR_Y, z0, x1, FLOOR_Y, z1, x0, FLOOR_Y, z1)
    const s = 1 / 96
    acc.uvs.push(x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s)
    acc.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }

  const slabRuns: [number, number, number][] = []
  for (let cy = 0; cy < H; cy++) {
    let runStart = -1
    let runMat = 'wood'
    let slabStart = -1
    for (let cx = 0; cx <= W; cx++) {
      const i = cx < W ? idx(cx, cy) : -1
      const holed = cx < W && holes.length > 0 && inFootprint(cellCenter(cx, cy), holes)
      const interior = cx < W && isInterior(i) && !holed
      const cellMat = interior ? regionMaterial[matRegion[i]] ?? 'wood' : ''
      // 'open to below' regions have no floor and no structural band on upper stories
      const openCell = level > 0 && cellMat === 'open'
      const slabby = cx < W && ((interior && !openCell) || (solid[i] === 1 && !holed))
      if (interior && runStart < 0) {
        runStart = cx
        runMat = cellMat
      } else if (interior && runStart >= 0 && cellMat !== runMat) {
        pushQuad(runMat, ox + runStart * CELL, oy + cy * CELL, ox + cx * CELL, oy + (cy + 1) * CELL)
        runStart = cx
        runMat = cellMat
      }
      if (!interior && runStart >= 0) {
        pushQuad(runMat, ox + runStart * CELL, oy + cy * CELL, ox + cx * CELL, oy + (cy + 1) * CELL)
        runStart = -1
      }
      if (slabby && slabStart < 0) slabStart = cx
      if (!slabby && slabStart >= 0) {
        slabRuns.push([cy, slabStart, cx])
        slabStart = -1
      }
    }
  }

  for (const [material, acc] of byMat) {
    if (!acc.positions.length) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2))
    geo.setIndex(acc.indices)
    geo.computeVertexNormals()
    group.add(mesh(geo, roomFloorMaterial(material), false, true))
  }

  // structural slab: below grade for the ground floor, story band for upper floors
  const slabTh = level === 0 ? SLAB_DEPTH : STORY_GAP
  for (const [row, x0, x1] of slabRuns) {
    const wpx = (x1 - x0) * CELL
    const m = mesh(new THREE.BoxGeometry(wpx, slabTh, CELL), MAT.slab, level > 0, true)
    m.position.set(ox + x0 * CELL + wpx / 2, -slabTh / 2 + 0.06, oy + row * CELL + CELL / 2)
    group.add(m)
  }

  // flat roof cap over the footprint (enclosed buildings only)
  if (roofY != null) {
    for (const [row, x0, x1] of slabRuns) {
      const wpx = (x1 - x0) * CELL
      const m = mesh(new THREE.BoxGeometry(wpx, 5, CELL), MAT.roof, true, true)
      m.position.set(ox + x0 * CELL + wpx / 2, roofY + 2.5, oy + row * CELL + CELL / 2)
      group.add(m)
    }
  }
}

// ---------- roads ----------

/** Flat ribbon mesh along the road's bezier centerline, width/2 to each side. */
function buildRoad(group: THREE.Group, road: Road, gy: GroundSampler = FLAT_GROUND) {
  const pts = sampleRoad(road.nodes, 10)
  if (pts.length < 2) return
  const hw = road.width / 2
  const Y = 0.5

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let arc = 0
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    if (i > 0) arc += dist(prev, pts[i])
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const tl = Math.hypot(tx, ty) || 1
    const nx = -ty / tl
    const ny = tx / tl
    const lx = pts[i].x + nx * hw
    const lz = pts[i].y + ny * hw
    const rx = pts[i].x - nx * hw
    const rz = pts[i].y - ny * hw
    positions.push(lx, Y + gy(lx, lz), lz)
    positions.push(rx, Y + gy(rx, rz), rz)
    const s = 1 / 96
    uvs.push(0, arc * s, road.width * s, arc * s)
    if (i > 0) {
      const b = i * 2
      indices.push(b - 2, b, b - 1, b, b + 1, b - 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mat = surfaceMaterial(`surface-${road.material}`)
  const m = new THREE.Mesh(geo, mat)
  m.receiveShadow = true
  group.add(m)

  // dashed center line for asphalt roads wide enough to have lanes
  if (road.material === 'asphalt' && road.width >= 144) {
    for (let i = 4; i < pts.length - 4; i += 10) {
      const a = pts[i]
      const b = pts[Math.min(pts.length - 1, i + 3)]
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const dash = mesh(new THREE.BoxGeometry(dist(a, b), 0.3, 4), MAT.white, false)
      const mx = (a.x + b.x) / 2
      const mz = (a.y + b.y) / 2
      dash.position.set(mx, Y + 0.2 + gy(mx, mz), mz)
      dash.rotation.y = -ang
      group.add(dash)
    }
  }
}

// ---------- main ----------

/**
 * Gable or hip roof prism over the footprint bounding box (+overhang), with
 * gable-end infill triangles in wall material. UVs are world-scaled (96"/repeat).
 */
function buildPitchedRoof(
  group: THREE.Group,
  bounds: { x0: number; z0: number; x1: number; z1: number },
  baseY: number,
  roof: RoofSpec,
  gableMat?: THREE.Material
) {
  const OV = 10 // eave overhang
  const x0 = bounds.x0 - OV
  const z0 = bounds.z0 - OV
  const x1 = bounds.x1 + OV
  const z1 = bounds.z1 + OV
  const alongX =
    roof.ridge === 'ew' ? true : roof.ridge === 'ns' ? false : x1 - x0 >= z1 - z0
  const hs = (alongX ? z1 - z0 : x1 - x0) / 2
  const rise = Math.max(4, (Math.max(0.5, roof.pitch) / 12) * hs)
  const ridgeY = baseY + rise
  const mat = roofSurfaceMaterial(roof.material)
  const s = 1 / 96

  const pos: number[] = []
  const uv: number[] = []
  const idc: number[] = []
  const tri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number]
  ) => {
    const base = pos.length / 3
    pos.push(...a, ...b, ...c)
    uv.push(ua[0] * s, ua[1] * s, ub[0] * s, ub[1] * s, uc[0] * s, uc[1] * s)
    idc.push(base, base + 1, base + 2)
  }
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
    ud: [number, number]
  ) => {
    tri(a, b, c, ua, ub, uc)
    tri(a, c, d, ua, uc, ud)
  }

  const slope = Math.hypot(hs, rise) // uv length up the slope
  if (alongX) {
    const zc = (z0 + z1) / 2
    if (roof.style === 'hip') {
      const inset = Math.min(hs, (x1 - x0) / 2)
      const r0 = x0 + inset
      const r1 = x1 - inset
      quad([x0, baseY, z1], [x1, baseY, z1], [r1, ridgeY, zc], [r0, ridgeY, zc],
        [x0, 0], [x1, 0], [r1, slope], [r0, slope])
      quad([x1, baseY, z0], [x0, baseY, z0], [r0, ridgeY, zc], [r1, ridgeY, zc],
        [x1, 0], [x0, 0], [r0, slope], [r1, slope])
      tri([x1, baseY, z1], [x1, baseY, z0], [r1, ridgeY, zc], [z1, 0], [z0, 0], [zc, slope])
      tri([x0, baseY, z0], [x0, baseY, z1], [r0, ridgeY, zc], [z0, 0], [z1, 0], [zc, slope])
    } else {
      quad([x0, baseY, z1], [x1, baseY, z1], [x1, ridgeY, zc], [x0, ridgeY, zc],
        [x0, 0], [x1, 0], [x1, slope], [x0, slope])
      quad([x1, baseY, z0], [x0, baseY, z0], [x0, ridgeY, zc], [x1, ridgeY, zc],
        [x1, 0], [x0, 0], [x0, slope], [x1, slope])
    }
  } else {
    const xc = (x0 + x1) / 2
    if (roof.style === 'hip') {
      const inset = Math.min(hs, (z1 - z0) / 2)
      const r0 = z0 + inset
      const r1 = z1 - inset
      quad([x0, baseY, z0], [x0, baseY, z1], [xc, ridgeY, r1], [xc, ridgeY, r0],
        [z0, 0], [z1, 0], [r1, slope], [r0, slope])
      quad([x1, baseY, z1], [x1, baseY, z0], [xc, ridgeY, r0], [xc, ridgeY, r1],
        [z1, 0], [z0, 0], [r0, slope], [r1, slope])
      tri([x0, baseY, z1], [x1, baseY, z1], [xc, ridgeY, r1], [x0, 0], [x1, 0], [xc, slope])
      tri([x1, baseY, z0], [x0, baseY, z0], [xc, ridgeY, r0], [x1, 0], [x0, 0], [xc, slope])
    } else {
      quad([x0, baseY, z0], [x0, baseY, z1], [xc, ridgeY, z1], [xc, ridgeY, z0],
        [z0, 0], [z1, 0], [z1, slope], [z0, slope])
      quad([x1, baseY, z1], [x1, baseY, z0], [xc, ridgeY, z0], [xc, ridgeY, z1],
        [z1, 0], [z0, 0], [z0, slope], [z1, slope])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idc)
  geo.computeVertexNormals()
  const m = mesh(geo, mat, true, true)
  group.add(m)

  // gable-end infill walls (wall material), inset to the true wall line
  if (roof.style === 'gable') {
    const wpos: number[] = []
    const widc: number[] = []
    const wtri = (a: number[], b: number[], c: number[]) => {
      const base = wpos.length / 3
      wpos.push(...a, ...b, ...c)
      widc.push(base, base + 1, base + 2)
    }
    if (alongX) {
      const zc = (z0 + z1) / 2
      wtri([bounds.x0, baseY, z0 + OV], [bounds.x0, baseY, z1 - OV], [bounds.x0, ridgeY, zc])
      wtri([bounds.x1, baseY, z1 - OV], [bounds.x1, baseY, z0 + OV], [bounds.x1, ridgeY, zc])
    } else {
      const xc = (x0 + x1) / 2
      wtri([x1 - OV, baseY, bounds.z0], [x0 + OV, baseY, bounds.z0], [xc, ridgeY, bounds.z0])
      wtri([x0 + OV, baseY, bounds.z1], [x1 - OV, baseY, bounds.z1], [xc, ridgeY, bounds.z1])
    }
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
    wg.setIndex(widc)
    // world-scaled UVs so siding patterns continue up the gable
    const wuv: number[] = []
    for (let i = 0; i < wpos.length; i += 3) {
      wuv.push((alongX ? wpos[i + 2] : wpos[i]) / 96, wpos[i + 1] / 96)
    }
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2))
    wg.computeVertexNormals()
    const gm =
      gableMat ??
      new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.92, side: THREE.DoubleSide })
    group.add(mesh(wg, gm, true, true))
  }
}

function buildBuilding(
  b: Building,
  index: number,
  furniture: Map<string, BuiltFurniture>,
  floorGroups: { floor: number; group: THREE.Group; baseY: number }[],
  enclosed: boolean
): THREE.Group {
  const bg = new THREE.Group()
  bg.position.set(b.x, 0, b.y)
  bg.rotation.y = -THREE.MathUtils.degToRad(b.rot)

  // trim color drives the frame material for this building's openings
  const prevFrame = FRAME
  if (b.siding?.trim) FRAME = tintedMaterial(b.siding.trim, 0.8)

  let elevation = 0
  // the wall set whose footprint the story below sealed with — floors above
  // inherit it when their own walls don't enclose anything yet
  let footprintWalls: Wall[] = []
  b.floors.forEach((floor, k) => {
    const fg = new THREE.Group()
    fg.position.y = elevation

    const holes = k > 0 ? b.floors[k - 1].furniture.filter((f) => isStairKind(f.kind)) : []
    // top floor of an enclosed building gets a roof at its wall height
    const isTop = k === b.floors.length - 1
    const wallTop = floor.walls.reduce((m, w) => Math.max(m, w.height), floor.height)
    // flat roofs follow the footprint per-cell; pitched roofs are built after the loop
    const roofY = enclosed && isTop && b.roof.style === 'flat' ? wallTop : undefined

    // floor surface: seal with this story's own walls UNION the footprint below.
    // Rooms sealed by own walls get their floor material; other covered area over
    // the story below becomes a flat deck/roof surface. This means upper stories
    // always get a real floor even when their rooms borrow lower-story walls.
    const extras: Pt[] = [
      ...floor.furniture.map((f) => ({ x: f.x, y: f.y })),
      ...holes.map((h) => ({ x: h.x, y: h.y })),
    ]
    // dividers never make 3D geometry — they only split material regions below
    const geomWalls = floor.walls.filter((w) => !w.divider)
    const unionWalls = k > 0 && footprintWalls.length ? [...footprintWalls, ...geomWalls] : geomWalls
    const union = rasterizeFloor(unionWalls, extras)
    const grid = union
      ? { CELL: union.CELL, ox: union.ox, oy: union.oy, W: union.W, H: union.H }
      : undefined
    const own = k > 0 && union ? rasterizeFloor(geomWalls, extras, grid) : null
    const hasDividers = floor.walls.length !== geomWalls.length
    const matRaster =
      hasDividers && union
        ? rasterizeFloor(
            k > 0 && footprintWalls.length ? [...footprintWalls, ...floor.walls] : floor.walls,
            extras,
            grid
          )
        : null
    if (union) buildFloorSurface(fg, floor, k, holes, union, own, roofY, matRaster)
    footprintWalls = union && union.enclosed ? unionWalls : geomWalls

    // walls: extend full-height walls up through the story gap so they meet the
    // underside of the next floor. "Full height" = at least the story height OR the
    // tallest wall on the floor (covers walls shorter than an increased story
    // height). Never cut taller walls down.
    const maxWallH = geomWalls.reduce((m, w) => Math.max(m, w.height), 0)
    const fullH = Math.min(floor.height, maxWallH || floor.height)
    const extend = isTop
      ? undefined
      : { to: Math.max(floor.height + STORY_GAP, 0), ifAtLeast: fullH }
    // per-room interior paint: map material-region -> wall color from the room tags
    const roomColors = new Map<number, string>()
    const regRaster = matRaster ?? union
    if (regRaster) {
      for (const t of floor.rooms ?? []) {
        if (!t.wallColor) continue
        const r = regionAt(regRaster, t.x, t.y)
        if (r >= 0) roomColors.set(r, t.wallColor)
      }
    }
    const faceCtx: WallFaceCtx | undefined = union
      ? { raster: union, matRaster, roomColors, siding: b.siding }
      : undefined
    for (const w of geomWalls)
      buildWall(fg, w, floor.openings, extend, { wallId: w.id, floor: k }, faceCtx)

    // pitched roof over the top story: prefer the story's own sealed outline
    // (e.g. the apartment) — the deck around it stays a flat roof
    if (enclosed && isTop && b.roof.style !== 'flat') {
      const roofWalls = own && own.enclosed && geomWalls.length ? geomWalls : footprintWalls
      // footprint-true roof (hips/ridges/valleys via distance transform);
      // falls back to the legacy bbox prism if the footprint can't be rasterized
      const ok = buildRasterRoof(fg, roofWalls, wallTop, b.roof, { gable: b.siding })
      if (!ok) {
        const bounds = wallsBBox(roofWalls)
        if (bounds)
          buildPitchedRoof(
            fg,
            bounds,
            wallTop,
            b.roof,
            b.siding ? sidingMaterial(b.siding.type, b.siding.color, true) : undefined
          )
      }
    }

    for (const f of floor.furniture) {
      const g = buildFurniture(f.kind, f.w, f.d, f.h)
      g.position.set(f.x, FLOOR_Y, f.y)
      g.rotation.y = -THREE.MathUtils.degToRad(f.rot)
      g.userData.furnId = f.id
      furniture.set(f.id, {
        group: g,
        place: { scope: 'building', index, floor: k },
        elevation,
        transform: { x: b.x, y: b.y, rot: b.rot },
      })
      fg.add(g)
    }

    bg.add(fg)
    floorGroups.push({ floor: k, group: fg, baseY: elevation })
    elevation += floor.height + STORY_GAP
  })
  FRAME = prevFrame
  return bg
}

/**
 * Focus decides what the 3D shows:
 *  - building: only that one building as an OPEN dollhouse (no roof, no site).
 *  - plot: the whole property with ENCLOSED buildings (roofed) on grass + landscaping.
 */
export function buildProject(
  project: Project,
  focus: EditMode,
  closedDollhouse = false
): BuiltProject {
  const group = new THREE.Group()
  const floorGroups: { floor: number; group: THREE.Group; baseY: number }[] = []
  const furniture = new Map<string, BuiltFurniture>()

  if (focus.scope === 'building') {
    const b = project.buildings[focus.index]
    // build a single building centered at the origin, open (no roof)
    const bg = buildBuilding(
      { ...b, x: 0, y: 0, rot: 0 },
      focus.index,
      furniture,
      floorGroups,
      closedDollhouse
    )
    group.add(bg)
    const bbox = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    if (!bbox.isEmpty()) {
      bbox.getCenter(center)
      bbox.getSize(size)
    }
    // include height so tall (multi-story) buildings are framed, not clipped
    const radius = Math.max(size.x, size.z, size.y * 1.1, 120) / 2
    return { group, floorGroups, furniture, center, radius }
  }

  // ---- plot: whole property, buildings enclosed ----
  // grade: imported terrain heightfield with flat pads under each building
  const rawGy = rawSampler(project.terrain, project.plotW, project.plotD)
  const pads: BuildingPad[] = project.buildings.map((b) => {
    const r = (b.rot * Math.PI) / 180
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    let x0 = Infinity
    let z0 = Infinity
    let x1 = -Infinity
    let z1 = -Infinity
    for (const w of b.floors[0]?.walls ?? []) {
      for (const p of [w.a, w.b]) {
        const px = b.x + p.x * cos - p.y * sin
        const pz = b.y + p.x * sin + p.y * cos
        x0 = Math.min(x0, px)
        z0 = Math.min(z0, pz)
        x1 = Math.max(x1, px)
        z1 = Math.max(z1, pz)
      }
    }
    if (!Number.isFinite(x0)) {
      x0 = b.x - 120
      z0 = b.y - 120
      x1 = b.x + 120
      z1 = b.y + 120
    }
    const pad = { x0: x0 - 12, z0: z0 - 12, x1: x1 + 12, z1: z1 + 12, y: 0 }
    pad.y = rawGy((x0 + x1) / 2, (z0 + z1) / 2)
    return pad
  })
  const gy = project.terrain ? padSampler(rawGy, pads) : FLAT_GROUND

  if (project.terrain) {
    group.add(buildTerrainMesh(gy, project.plotW, project.plotD, project.terrain.w * 2))
  } else {
    const grassMat = new THREE.MeshStandardMaterial({ map: getGrassTexture(), roughness: 1 })
    if (grassMat.map) {
      const map = grassMat.map.clone()
      map.repeat.set(project.plotW / 120, project.plotD / 120)
      map.needsUpdate = true
      grassMat.map = map
    }
    const grass = mesh(new THREE.BoxGeometry(project.plotW, 6, project.plotD), grassMat, false, true)
    grass.position.set(project.plotW / 2, -3, project.plotD / 2)
    group.add(grass)
  }

  if (project.plotBoundary?.length) {
    group.add(buildBoundaryLines(project.plotBoundary, gy))
  }

  // site layer: roads under everything, then fences + landscape/surfaces
  for (const r of project.site.roads) buildRoad(group, r, gy)
  for (const w of project.site.walls) {
    if (w.divider) continue
    if (w.fence) buildFence(group, w, project.site.openings, gy)
    else buildWall(group, w, project.site.openings)
  }
  for (const f of project.site.furniture) {
    const g = buildFurniture(f.kind, f.w, f.d, f.h)
    g.position.set(f.x, 0.06 + gy(f.x, f.y), f.y)
    g.rotation.y = -THREE.MathUtils.degToRad(f.rot)
    g.userData.furnId = f.id
    furniture.set(f.id, { group: g, place: { scope: 'site' }, elevation: 0 })
    group.add(g)
  }

  project.buildings.forEach((b, i) => {
    const bg = buildBuilding(b, i, furniture, floorGroups, true)
    bg.position.y = pads[i].y
    group.add(bg)
  })

  const center = new THREE.Vector3(project.plotW / 2, 0, project.plotD / 2)
  const radius = Math.max(project.plotW, project.plotD, 240) / 2

  return { group, floorGroups, furniture, center, radius }
}

export function disposePlan(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
    }
  })
}
