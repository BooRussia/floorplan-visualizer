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
  type Wall,
} from '../model/types'
import { dist, sampleRoad, toLocal, wallPointAt, wallSamples } from '../model/geometry'
import { getGrassTexture, MAT, roomFloorMaterial, surfaceMaterial } from './materials'
import { buildFurniture } from './furniture3d'

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
  floorGroups: { floor: number; group: THREE.Group }[]
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
  extendEnd = 0
) {
  const L = dist(a, b) + extendStart + extendEnd
  if (L <= 0.01 || y1 - y0 <= 0.01) return
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const midS = (dist(a, b) + extendEnd - extendStart) / 2
  const cx = a.x + ux * midS
  const cz = a.y + uy * midS
  const m = mesh(new THREE.BoxGeometry(L, y1 - y0, thickness), mat)
  m.position.set(cx, (y0 + y1) / 2, cz)
  m.rotation.y = -ang
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
        const bar = mesh(new THREE.BoxGeometry(pw, 2, 1.4), MAT.frame)
        bar.position.set(0, fy + 0.75, 0)
        frame.add(bar)
      }
      for (const fx of [-pw / 2 + 0.7, pw / 2 - 0.7]) {
        const bar = mesh(new THREE.BoxGeometry(1.4, ph, 1.4), MAT.frame)
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

function buildWindow(group: THREE.Group, w: Wall, o: Opening, s0: number, s1: number) {
  const a = alongWall(w, s0)
  const b = alongWall(w, s1)
  const head = Math.min(WINDOW_HEAD, w.height - 6)
  wallBox(group, a, b, WINDOW_SILL - 1.2, WINDOW_SILL, w.thickness + 2, MAT.frame)
  const mid = alongWall(w, (s0 + s1) / 2)
  const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
  const holder = new THREE.Group()
  holder.position.set(mid.x, 0, mid.y)
  holder.rotation.y = -ang
  const width = s1 - s0
  const gl = mesh(new THREE.BoxGeometry(width - 1, head - WINDOW_SILL, 0.6), MAT.glass, false)
  gl.position.set(0, (head + WINDOW_SILL) / 2, 0)
  holder.add(gl)
  const mull = mesh(new THREE.BoxGeometry(1.2, head - WINDOW_SILL, 1.4), MAT.frame)
  mull.position.set(0, (head + WINDOW_SILL) / 2, 0)
  holder.add(mull)
  for (const fx of [-width / 2 + 0.6, width / 2 - 0.6]) {
    const jamb = mesh(new THREE.BoxGeometry(1.2, head - WINDOW_SILL, w.thickness + 1), MAT.frame)
    jamb.position.set(fx, (head + WINDOW_SILL) / 2, 0)
    holder.add(jamb)
  }
  group.add(holder)
}

function fenceMat(type: string) {
  return type === 'chain' ? MAT.chainMetal : type === 'picket' ? MAT.fenceWhite : MAT.fenceWood
}

/** Infill between two points for one fence style. */
function fenceSegment(group: THREE.Group, a: Pt, b: Pt, type: string, H: number) {
  const segL = dist(a, b)
  if (segL < 2) return
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const place = (m: THREE.Mesh, y: number) => {
    m.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2)
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
      picket.position.set(px, (H - 4) / 2, pz)
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
function gateLeaf(group: THREE.Group, hinge: Pt, ang: number, openDeg: number, lw: number, H: number, type: string) {
  const gh = Math.max(24, H - 4)
  const m = fenceMat(type)
  const pivot = new THREE.Group()
  pivot.position.set(hinge.x, 0, hinge.y)
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

function buildFence(group: THREE.Group, w: Wall, openings: Opening[]) {
  const type = w.fence!
  const H = w.height
  const postMat = fenceMat(type)
  const post = (p: Pt, big = false) => {
    const pm = mesh(new THREE.BoxGeometry(big ? 4.5 : 3.5, H + (big ? 2 : 0), big ? 4.5 : 3.5), postMat)
    pm.position.set(p.x, (H + (big ? 2 : 0)) / 2, p.y)
    group.add(pm)
  }

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
      fenceSegment(group, samples[i], samples[i + 1], type, H)
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
      fenceSegment(group, prev, p, type, H)
      prev = p
    }
  }

  for (const { o, s0, s1 } of gates) {
    post(at(s0), true)
    post(at(s1), true)
    const width = s1 - s0
    const side = o.flipSwing ? 1 : -1
    if (width > 72) {
      gateLeaf(group, at(s0), ang, side * 45, width / 2 - 1, H, type)
      gateLeaf(group, at(s1), ang, 180 - side * 45, width / 2 - 1, H, type)
    } else if (o.flipHinge) {
      gateLeaf(group, at(s1), ang, 180 - side * 50, width - 1, H, type)
    } else {
      gateLeaf(group, at(s0), ang, side * 50, width - 1, H, type)
    }
  }
}

function buildWall(group: THREE.Group, w: Wall, openings: Opening[]) {
  const H = w.height
  const th = w.thickness
  const ext = th / 2 // match the 2D square line caps so corners close

  if (w.bulge) {
    const pts = wallSamples(w, 4)
    for (let i = 0; i < pts.length - 1; i++) {
      wallBox(group, pts[i], pts[i + 1], 0, H, th, MAT.wall, 0.6, 0.6)
      wallBox(group, pts[i], pts[i + 1], H, H + 1, th + 0.4, MAT.wallCap, 0.6, 0.6)
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
      wallBox(group, alongWall(w, cursor), alongWall(w, s0), 0, H, th, MAT.wall, cursor === 0 ? ext : 0, 0)
    }
    const head =
      o.type === 'window'
        ? Math.min(WINDOW_HEAD, H - 6)
        : o.type === 'garage'
          ? Math.min(o.height ?? 84, H - 3)
          : Math.min(DOOR_HEAD, H - 4)
    wallBox(group, alongWall(w, s0), alongWall(w, s1), head, H, th, MAT.wall)
    if (o.type === 'window') {
      wallBox(group, alongWall(w, s0), alongWall(w, s1), 0, WINDOW_SILL, th, MAT.wall)
      buildWindow(group, w, o, s0, s1)
    } else if (o.type === 'garage') {
      buildGarageDoor(group, w, o, s0, s1, head)
    } else {
      buildDoorLeaves(group, w, o, s0, s1)
    }
    cursor = s1
  }
  if (cursor < L) {
    wallBox(group, alongWall(w, cursor), w.b, 0, H, th, MAT.wall, cursor === 0 ? ext : 0, ext)
  }
  wallBox(group, w.a, w.b, H, H + 1, th + 0.4, MAT.wallCap, ext, ext)
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
 * Wood floor + structural slab for one story.
 * level 0 gets a ground slab below grade; upper levels get a story-gap band.
 * `holes` are stairwell footprints from the floor below — skipped in both meshes.
 */
function buildFloorAndSlab(
  group: THREE.Group,
  floor: Floor,
  level: number,
  holes: Furniture[],
  roofY?: number
) {
  const walls = floor.walls
  const pts: Pt[] = []
  for (const w of walls) pts.push(...wallSamples(w, 12))
  for (const f of floor.furniture) pts.push({ x: f.x, y: f.y })
  for (const h of holes) pts.push({ x: h.x, y: h.y })
  if (!pts.length) return

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const CELL = 3
  const PAD = 3
  const ox = minX - PAD * CELL
  const oy = minY - PAD * CELL
  const W = Math.ceil((maxX - ox + PAD * CELL) / CELL) + 1
  const H = Math.ceil((maxY - oy + PAD * CELL) / CELL) + 1
  if (W * H > 1_200_000) return

  const solid = new Uint8Array(W * H)
  const idx = (cx: number, cy: number) => cy * W + cx

  for (const w of walls) {
    const samples = wallSamples(w, CELL / 2)
    const rad = w.thickness / 2 + CELL * 0.45
    const rc = Math.ceil(rad / CELL)
    const pts2: Pt[] = []
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]
      const b = samples[i + 1]
      const n = Math.max(1, Math.ceil(dist(a, b) / (CELL / 2)))
      for (let k = 0; k <= n; k++) {
        pts2.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
      }
    }
    for (const p of pts2) {
      const cx = Math.round((p.x - ox) / CELL)
      const cy = Math.round((p.y - oy) / CELL)
      for (let dy = -rc; dy <= rc; dy++) {
        for (let dx = -rc; dx <= rc; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          if (Math.hypot(dx * CELL, dy * CELL) <= rad) solid[idx(x, y)] = 1
        }
      }
    }
  }

  // flood outside
  const outside = new Uint8Array(W * H)
  const stack: number[] = [0]
  outside[0] = 1
  while (stack.length) {
    const i = stack.pop()!
    const cx = i % W
    const cy = (i / W) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const j = idx(x, y)
      if (!outside[j] && !solid[j]) {
        outside[j] = 1
        stack.push(j)
      }
    }
  }

  let interiorCount = 0
  for (let i = 0; i < W * H; i++) if (!solid[i] && !outside[i]) interiorCount++
  const isInterior = (i: number) => (interiorCount > 30 ? !solid[i] && !outside[i] : !solid[i])

  const cellCenter = (cx: number, cy: number): Pt => ({
    x: ox + cx * CELL + CELL / 2,
    y: oy + cy * CELL + CELL / 2,
  })

  // label connected interior regions (rooms) so paint seeds can assign materials
  const region = new Int32Array(W * H).fill(-1)
  let regionCount = 0
  for (let i = 0; i < W * H; i++) {
    if (region[i] !== -1 || !isInterior(i)) continue
    const stack2 = [i]
    region[i] = regionCount
    while (stack2.length) {
      const j = stack2.pop()!
      const cx = j % W
      const cy = (j / W) | 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const k = idx(x, y)
        if (region[k] === -1 && isInterior(k)) {
          region[k] = regionCount
          stack2.push(k)
        }
      }
    }
    regionCount++
  }
  const regionMaterial: string[] = new Array(regionCount).fill('wood')
  for (const paint of floor.paints ?? []) {
    const cx = Math.round((paint.x - ox) / CELL)
    const cy = Math.round((paint.y - oy) / CELL)
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue
    const r = region[idx(cx, cy)]
    if (r >= 0) regionMaterial[r] = paint.material
  }

  // one geometry per material
  const byMat = new Map<string, { positions: number[]; uvs: number[]; indices: number[] }>()
  const pushQuad = (material: string, x0: number, z0: number, x1: number, z1: number) => {
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
      const cellMat = interior ? regionMaterial[region[i]] ?? 'wood' : ''
      const slabby = cx < W && (interior || (solid[i] === 1 && !holed))
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
function buildRoad(group: THREE.Group, road: Road) {
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
    positions.push(pts[i].x + nx * hw, Y, pts[i].y + ny * hw)
    positions.push(pts[i].x - nx * hw, Y, pts[i].y - ny * hw)
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
      dash.position.set((a.x + b.x) / 2, Y + 0.2, (a.y + b.y) / 2)
      dash.rotation.y = -ang
      group.add(dash)
    }
  }
}

// ---------- main ----------

function buildBuilding(
  b: Building,
  index: number,
  furniture: Map<string, BuiltFurniture>,
  floorGroups: { floor: number; group: THREE.Group }[],
  enclosed: boolean
): THREE.Group {
  const bg = new THREE.Group()
  bg.position.set(b.x, 0, b.y)
  bg.rotation.y = -THREE.MathUtils.degToRad(b.rot)

  let elevation = 0
  b.floors.forEach((floor, k) => {
    const fg = new THREE.Group()
    fg.position.y = elevation

    const holes = k > 0 ? b.floors[k - 1].furniture.filter((f) => f.kind === 'staircase') : []
    // top floor of an enclosed building gets a roof at its wall height
    const isTop = k === b.floors.length - 1
    const wallTop = floor.walls.reduce((m, w) => Math.max(m, w.height), floor.height)
    const roofY = enclosed && isTop ? wallTop : undefined
    buildFloorAndSlab(fg, floor, k, holes, roofY)
    for (const w of floor.walls) buildWall(fg, w, floor.openings)

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
    floorGroups.push({ floor: k, group: fg })
    elevation += floor.height + STORY_GAP
  })
  return bg
}

/**
 * Focus decides what the 3D shows:
 *  - building: only that one building as an OPEN dollhouse (no roof, no site).
 *  - plot: the whole property with ENCLOSED buildings (roofed) on grass + landscaping.
 */
export function buildProject(project: Project, focus: EditMode): BuiltProject {
  const group = new THREE.Group()
  const floorGroups: { floor: number; group: THREE.Group }[] = []
  const furniture = new Map<string, BuiltFurniture>()

  if (focus.scope === 'building') {
    const b = project.buildings[focus.index]
    // build a single building centered at the origin, open (no roof)
    const bg = buildBuilding({ ...b, x: 0, y: 0, rot: 0 }, focus.index, furniture, floorGroups, false)
    group.add(bg)
    const bbox = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    if (!bbox.isEmpty()) {
      bbox.getCenter(center)
      bbox.getSize(size)
    }
    const radius = Math.max(size.x, size.z, 120) / 2
    return { group, floorGroups, furniture, center, radius }
  }

  // ---- plot: whole property, buildings enclosed ----
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

  // site layer: roads under everything, then fences + landscape/surfaces
  for (const r of project.site.roads) buildRoad(group, r)
  for (const w of project.site.walls) {
    if (w.fence) buildFence(group, w, project.site.openings)
    else buildWall(group, w, project.site.openings)
  }
  for (const f of project.site.furniture) {
    const g = buildFurniture(f.kind, f.w, f.d, f.h)
    g.position.set(f.x, 0.06, f.y)
    g.rotation.y = -THREE.MathUtils.degToRad(f.rot)
    g.userData.furnId = f.id
    furniture.set(f.id, { group: g, place: { scope: 'site' }, elevation: 0 })
    group.add(g)
  }

  project.buildings.forEach((b, i) => {
    group.add(buildBuilding(b, i, furniture, floorGroups, true))
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
