import * as THREE from 'three'
import { STORY_GAP, type Floor, type Furniture, type Opening, type Plan, type Pt, type Wall } from '../model/types'
import { dist, toLocal, wallSamples } from '../model/geometry'
import { MAT } from './materials'
import { buildFurniture } from './furniture3d'

const FLOOR_Y = 0.12
const SLAB_DEPTH = 4
const DOOR_HEAD = 80
const WINDOW_SILL = 30
const WINDOW_HEAD = 78

export interface BuiltFurniture {
  group: THREE.Group
  floorIndex: number
  elevation: number
}

export interface BuiltPlan {
  group: THREE.Group
  floorGroups: THREE.Group[]
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
  const side = o.flipSwing ? 1 : -1

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
function buildFloorAndSlab(group: THREE.Group, floor: Floor, level: number, holes: Furniture[]) {
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

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const pushQuad = (x0: number, z0: number, x1: number, z1: number) => {
    const base = positions.length / 3
    positions.push(x0, FLOOR_Y, z0, x1, FLOOR_Y, z0, x1, FLOOR_Y, z1, x0, FLOOR_Y, z1)
    const s = 1 / 96
    uvs.push(x0 * s, z0 * s, x1 * s, z0 * s, x1 * s, z1 * s, x0 * s, z1 * s)
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }

  const slabRuns: [number, number, number][] = []
  for (let cy = 0; cy < H; cy++) {
    let runStart = -1
    let slabStart = -1
    for (let cx = 0; cx <= W; cx++) {
      const i = cx < W ? idx(cx, cy) : -1
      const holed = cx < W && holes.length > 0 && inFootprint(cellCenter(cx, cy), holes)
      const interior = cx < W && isInterior(i) && !holed
      const slabby = cx < W && (interior || (solid[i] === 1 && !holed))
      if (interior && runStart < 0) runStart = cx
      if (!interior && runStart >= 0) {
        pushQuad(ox + runStart * CELL, oy + cy * CELL, ox + cx * CELL, oy + (cy + 1) * CELL)
        runStart = -1
      }
      if (slabby && slabStart < 0) slabStart = cx
      if (!slabby && slabStart >= 0) {
        slabRuns.push([cy, slabStart, cx])
        slabStart = -1
      }
    }
  }

  if (positions.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    group.add(mesh(geo, MAT.floor(), false, true))
  }

  // structural slab: below grade for the ground floor, story band for upper floors
  const slabTh = level === 0 ? SLAB_DEPTH : STORY_GAP
  for (const [row, x0, x1] of slabRuns) {
    const wpx = (x1 - x0) * CELL
    const m = mesh(new THREE.BoxGeometry(wpx, slabTh, CELL), MAT.slab, level > 0, true)
    m.position.set(ox + x0 * CELL + wpx / 2, -slabTh / 2 + 0.06, oy + row * CELL + CELL / 2)
    group.add(m)
  }
}

// ---------- main ----------

export function buildPlan(plan: Plan): BuiltPlan {
  const group = new THREE.Group()
  const floorGroups: THREE.Group[] = []
  const furniture = new Map<string, BuiltFurniture>()

  let elevation = 0
  plan.floors.forEach((floor, k) => {
    const fg = new THREE.Group()
    fg.position.y = elevation

    const holes =
      k > 0 ? plan.floors[k - 1].furniture.filter((f) => f.kind === 'staircase') : []
    buildFloorAndSlab(fg, floor, k, holes)
    for (const w of floor.walls) buildWall(fg, w, floor.openings)

    for (const f of floor.furniture) {
      const g = buildFurniture(f.kind, f.w, f.d, f.h)
      g.position.set(f.x, FLOOR_Y, f.y)
      g.rotation.y = -THREE.MathUtils.degToRad(f.rot)
      g.userData.furnId = f.id
      furniture.set(f.id, { group: g, floorIndex: k, elevation })
      fg.add(g)
    }

    group.add(fg)
    floorGroups.push(fg)
    elevation += floor.height + STORY_GAP
  })

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

export function disposePlan(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
    }
  })
}
