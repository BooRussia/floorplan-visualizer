import * as THREE from 'three'
import { MAT, surfaceMaterial } from './materials'

// Builders produce a THREE.Group in inches: origin at footprint center,
// resting on y=0, front of the item facing +z. Parametric: proportions are
// rebuilt from w/d/h so nothing gets "squished" when resized.

type G = THREE.Group

function box(
  g: G,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
  ry = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y + h / 2, z)
  m.rotation.y = ry
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  return m
}

function cyl(
  g: G,
  mat: THREE.Material,
  rTop: number,
  rBottom: number,
  h: number,
  x = 0,
  y = 0,
  z = 0,
  segments = 24
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat)
  m.position.set(x, y + h / 2, z)
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  return m
}

function legs(g: G, w: number, d: number, h: number, inset = 2, t = 1.6, mat = MAT.woodDark) {
  const hx = w / 2 - inset
  const hz = d / 2 - inset
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ]) {
    box(g, mat, t, h, t, x as number, 0, z as number)
  }
}

// ---------- living ----------

function sofa(g: G, w: number, d: number, h: number, cushions: number) {
  const armW = Math.min(6.5, w * 0.09)
  const backD = Math.min(7, d * 0.24)
  const seatH = h * 0.42
  const iw = w - armW * 2
  box(g, MAT.fabric, w, seatH * 0.62, d) // base
  box(g, MAT.fabric, w, h, backD, 0, 0, -d / 2 + backD / 2) // back
  box(g, MAT.fabric, armW, h * 0.72, d, -w / 2 + armW / 2, 0)
  box(g, MAT.fabric, armW, h * 0.72, d, w / 2 - armW / 2, 0)
  const cw = iw / cushions
  for (let i = 0; i < cushions; i++) {
    const x = -iw / 2 + cw * (i + 0.5)
    box(g, MAT.fabricDark, cw - 1.2, seatH * 0.45, d - backD - 1.5, x, seatH * 0.6, backD / 2 + 0.25)
    box(g, MAT.fabric, cw - 1.2, h * 0.5, 4, x, seatH * 0.55, -d / 2 + backD + 2)
  }
  // accent pillows
  if (w >= 46) {
    box(g, MAT.accent, 12, 12, 4, -iw / 2 + 7, seatH * 0.95, -d / 2 + backD + 3.4, 0.22)
    box(g, MAT.accent2, 12, 12, 4, iw / 2 - 7, seatH * 0.95, -d / 2 + backD + 3.4, -0.18)
  }
}

function armchair(g: G, w: number, d: number, h: number) {
  sofa(g, w, d, h, 1)
}

function coffeeTable(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, 1.6, d, 0, h - 1.6)
  box(g, MAT.woodDark, w - 6, 1, d - 6, 0, h * 0.35)
  legs(g, w, d, h - 1.6, 1.6, 1.8, MAT.dark)
}

function endTable(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, 1.4, d, 0, h - 1.4)
  legs(g, w, d, h - 1.4, 1.4, 1.4)
}

function tvStand(g: G, w: number, d: number, h: number) {
  const standH = Math.min(20, h * 0.45)
  box(g, MAT.wood, w, standH, d)
  box(g, MAT.dark, w * 0.92, 1.5, d * 0.9, 0, standH * 0.55)
  // TV
  const tvW = w * 0.8
  const tvH = Math.max(14, h - standH - 2)
  box(g, MAT.dark, tvW, tvH, 1.6, 0, standH + 1.5, d * 0.1)
  box(g, MAT.screen, tvW - 1.6, tvH - 1.6, 0.5, 0, standH + 2.3, d * 0.1 + 0.7)
}

function floorLamp(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.steel, r * 0.55, r * 0.62, 1, 0, 0)
  cyl(g, MAT.steel, 0.45, 0.45, h - r * 1.1, 0, 1)
  const shade = cyl(g, MAT.fabric, r * 0.72, r * 0.95, r * 1.1, 0, h - r * 1.1)
  shade.material = MAT.fabric
}

function tableLamp(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.ceramic, r * 0.4, r * 0.55, h * 0.55, 0, 0)
  cyl(g, MAT.fabric, r * 0.75, r, h * 0.45, 0, h * 0.55)
}

function bookshelf(g: G, w: number, d: number, h: number) {
  box(g, MAT.white, w, h, d)
  const shelves = Math.max(3, Math.round(h / 15))
  for (let i = 1; i < shelves; i++) {
    box(g, MAT.wood, w - 2, 0.8, d - 1, 0, (i * h) / shelves, 0.5)
  }
  // a few books
  const bookMats = [MAT.accent, MAT.accent2, MAT.woodDark, MAT.fabricDark]
  for (let i = 1; i < shelves; i++) {
    let x = -w / 2 + 2.5
    let k = i
    while (x < w / 2 - 6) {
      const bw = 1 + ((i * 7 + k * 3) % 3) * 0.5
      const bh = Math.min(9, h / shelves - 3)
      box(g, bookMats[(i + k) % bookMats.length], bw, bh, d * 0.55, x, (i * h) / shelves + 0.8, 0.6)
      x += bw + 0.4
      k++
      if (k % 5 === 0) x += 4
    }
  }
}

function rug(g: G, w: number, d: number) {
  box(g, MAT.rugBorder, w, 0.5, d)
  box(g, MAT.rug, w - 5, 0.55, d - 5)
}

function plant(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.pot, r * 0.55, r * 0.42, h * 0.28, 0, 0)
  cyl(g, MAT.woodDark, 0.7, 0.9, h * 0.4, 0, h * 0.26)
  const foliage = [
    [0, h * 0.72, 0, r * 0.85],
    [r * 0.35, h * 0.58, r * 0.2, r * 0.55],
    [-r * 0.4, h * 0.62, -r * 0.15, r * 0.5],
  ]
  for (const [x, y, z, rr] of foliage) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 10), MAT.leaf)
    s.position.set(x, y, z)
    s.scale.y = 1.15
    s.castShadow = true
    g.add(s)
  }
}

// ---------- bedroom ----------

function bed(g: G, w: number, d: number, h: number, pillows: number) {
  const frameH = h * 0.3
  const mattressH = h * 0.35
  box(g, MAT.wood, w, frameH, d) // frame
  box(g, MAT.white, w + 1.5, h * 0.85, 2.5, 0, 0, -d / 2 + 1.25) // headboard
  box(g, MAT.fabric, w - 2, mattressH, d - 3, 0, frameH, 0.5) // mattress
  const pw = (w - 8) / pillows
  for (let i = 0; i < pillows; i++) {
    box(
      g,
      MAT.white,
      pw - 3,
      3.5,
      11,
      -((w - 8) / 2) + pw * (i + 0.5),
      frameH + mattressH,
      -d / 2 + 9
    )
  }
  // white duvet over the lower half, accent throw folded at the foot
  box(g, MAT.fabric, w - 1, mattressH * 0.4, d * 0.55, 0, frameH + mattressH * 0.75, d * 0.205)
  box(g, MAT.accent, w - 1, mattressH * 0.42, d * 0.16, 0, frameH + mattressH * 0.78, d * 0.38)
  if (pillows >= 2) {
    box(g, MAT.accent2, 13, 3.2, 8, 0, frameH + mattressH + 2.2, -d / 2 + 12, 0.15)
  }
}

function nightstand(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, h - 3, d, 0, 3)
  legs(g, w, d, 3, 1.5, 1.3)
  box(g, MAT.woodDark, w - 3, 1.5, 0.6, 0, h - 8, d / 2 - 0.2)
}

function dresser(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, h - 2.5, d, 0, 2.5)
  legs(g, w, d, 2.5, 1.5, 1.4)
  const cols = Math.max(2, Math.round(w / 22))
  const rows = Math.max(2, Math.round(h / 14))
  const cw = (w - 3) / cols
  const rh = (h - 6) / rows
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -((w - 3) / 2) + cw * (c + 0.5)
      const y = 3.5 + rh * r
      box(g, MAT.woodDark, cw - 1.4, rh - 1.4, 0.5, x, y, d / 2 - 0.1)
      box(g, MAT.steel, cw * 0.4, 0.7, 0.5, x, y + rh / 2 - 1.4, d / 2 + 0.3)
    }
  }
}

function wardrobe(g: G, w: number, d: number, h: number) {
  box(g, MAT.white, w, h, d)
  box(g, MAT.frame, w / 2 - 1.6, h - 4, 0.5, -w / 4 + 0.4, 2, d / 2 - 0.1)
  box(g, MAT.frame, w / 2 - 1.6, h - 4, 0.5, w / 4 - 0.4, 2, d / 2 - 0.1)
  box(g, MAT.steel, 0.8, 6, 0.8, -1.6, h / 2 - 3, d / 2 + 0.3)
  box(g, MAT.steel, 0.8, 6, 0.8, 1.6, h / 2 - 3, d / 2 + 0.3)
}

function desk(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, 1.4, d, 0, h - 1.4)
  legs(g, w, d, h - 1.4, 1.2, 1.6, MAT.steel)
  // small monitor
  box(g, MAT.dark, w * 0.35, w * 0.2, 1, 0, h + 2, -d * 0.2)
  box(g, MAT.steel, 3, 2.2, 2, 0, h - 0.2, -d * 0.2)
}

function officeChair(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.dark, r * 0.75, r * 0.85, 1, 0, 0)
  cyl(g, MAT.steel, 0.7, 0.7, h * 0.32, 0, 1)
  box(g, MAT.fabricDark, r * 1.5, 2.2, r * 1.5, 0, h * 0.35)
  box(g, MAT.fabricDark, r * 1.5, h * 0.5, 2.2, 0, h * 0.4, -r * 0.65)
}

// ---------- dining ----------

function diningTable(g: G, w: number, d: number, h: number) {
  box(g, MAT.wood, w, 1.6, d, 0, h - 1.6)
  legs(g, w, d, h - 1.6, 2.5, 2.2)
}

function roundTable(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.wood, r, r, 1.6, 0, h - 1.6, 0, 32)
  cyl(g, MAT.woodDark, 1.6, 2.2, h - 1.6, 0, 0)
  cyl(g, MAT.woodDark, r * 0.45, r * 0.5, 1, 0, 0, 0, 24)
}

function chair(g: G, w: number, d: number, h: number) {
  const seatH = h * 0.5
  box(g, MAT.wood, w, 1.4, d, 0, seatH - 1.4)
  legs(g, w, d, seatH - 1.4, 1, 1.1)
  box(g, MAT.wood, w, h - seatH, 1.4, 0, seatH, -d / 2 + 0.7)
}

function barStool(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  cyl(g, MAT.wood, r * 0.85, r * 0.85, 2, 0, h - 2)
  cyl(g, MAT.steel, 0.8, 0.8, h - 2, 0, 0)
  cyl(g, MAT.steel, r * 0.7, r * 0.7, 0.5, 0, h * 0.3)
  cyl(g, MAT.steel, r * 0.9, r * 0.9, 0.8, 0, 0)
}

// ---------- kitchen ----------

function counterTop(g: G, w: number, d: number, h: number) {
  box(g, MAT.tile, w + 1, 1.5, d + 1, 0, h - 1.5, 0)
}

function baseCabinet(g: G, w: number, d: number, h: number) {
  box(g, MAT.white, w, h - 1.5, d)
  counterTop(g, w, d, h)
  const doors = Math.max(1, Math.round(w / 18))
  const dw = (w - 2) / doors
  for (let i = 0; i < doors; i++) {
    const x = -((w - 2) / 2) + dw * (i + 0.5)
    box(g, MAT.frame, dw - 1.2, h - 8, 0.5, x, 3, d / 2 - 0.1)
    box(g, MAT.steel, 0.7, 4, 0.7, x + dw / 2 - 2, h / 2 - 2, d / 2 + 0.3)
  }
}

function kitchenIsland(g: G, w: number, d: number, h: number) {
  box(g, MAT.white, w, h - 1.5, d)
  box(g, MAT.tile, w + 3, 1.5, d + 3, 0, h - 1.5)
  // fruit bowl for life
  cyl(g, MAT.accent2, 3.4, 2.2, 1.8, -w * 0.2, h)
}

function kitchenSink(g: G, w: number, d: number, h: number) {
  baseCabinet(g, w, d, h)
  box(g, MAT.steel, Math.min(24, w - 8), 1, Math.min(16, d - 8), 0, h - 0.4)
  cyl(g, MAT.steel, 0.5, 0.5, 5, 0, h, -Math.min(16, d - 8) / 2 - 1)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4.5), MAT.steel)
  spout.rotation.x = Math.PI / 2
  spout.position.set(0, h + 4.8, -Math.min(16, d - 8) / 2 + 1.5)
  spout.castShadow = true
  g.add(spout)
}

function stove(g: G, w: number, d: number, h: number) {
  box(g, MAT.appliance, w, h, d)
  box(g, MAT.dark, w - 2, 0.6, d - 2, 0, h)
  const ox = w * 0.22
  const oz = d * 0.2
  for (const [x, z] of [
    [-ox, -oz],
    [ox, -oz],
    [-ox, oz],
    [ox, oz],
  ]) {
    cyl(g, MAT.screen, 3.2, 3.2, 0.3, x as number, h + 0.5, z as number)
  }
  box(g, MAT.steel, w - 6, 1, 1, 0, h * 0.72, d / 2 + 0.6) // oven handle
  box(g, MAT.dark, w - 8, h * 0.3, 0.5, 0, h * 0.3, d / 2 - 0.1) // oven window
}

function fridge(g: G, w: number, d: number, h: number) {
  box(g, MAT.appliance, w, h, d)
  box(g, MAT.steel, w - 1, 0.4, d - 1, 0, h * 0.62)
  box(g, MAT.steel, 1, h * 0.3, 1, -w / 2 + 2.5, h * 0.66, d / 2 + 0.5)
  box(g, MAT.steel, 1, h * 0.22, 1, -w / 2 + 2.5, h * 0.3, d / 2 + 0.5)
}

function dishwasher(g: G, w: number, d: number, h: number) {
  box(g, MAT.appliance, w, h, d)
  box(g, MAT.steel, w - 4, 1, 1.2, 0, h - 4, d / 2 + 0.5)
  counterTop(g, w, d, h + 2)
}

function laundry(g: G, w: number, d: number, h: number, dryer: boolean) {
  box(g, MAT.appliance, w, h, d)
  const r = Math.min(w, h) * 0.3
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 1.2, 10, 32), MAT.steel)
  ring.position.set(0, h * 0.45, d / 2 + 0.4)
  ring.castShadow = true
  g.add(ring)
  const door = new THREE.Mesh(new THREE.CircleGeometry(r - 0.5, 24), dryer ? MAT.appliance : MAT.screen)
  door.position.set(0, h * 0.45, d / 2 + 0.45)
  g.add(door)
  box(g, MAT.dark, w - 4, 2, 0.5, 0, h - 4, d / 2 + 0.2)
}

// ---------- bathroom ----------

function toilet(g: G, w: number, d: number, h: number) {
  box(g, MAT.ceramic, w * 0.9, h, d * 0.3, 0, 0, -d / 2 + d * 0.15) // tank
  box(g, MAT.ceramic, w * 0.6, h * 0.5, d * 0.45, 0, 0, -d * 0.05) // base
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.34, 3, 24), MAT.ceramic)
  bowl.scale.z = 1.25
  bowl.position.set(0, h * 0.48, d * 0.16)
  bowl.castShadow = true
  g.add(bowl)
}

function vanity(g: G, w: number, d: number, h: number) {
  box(g, MAT.white, w, h - 1.2, d)
  box(g, MAT.tile, w + 1, 1.2, d + 1, 0, h - 1.2)
  box(g, MAT.ceramic, Math.min(18, w - 6), 1.2, Math.min(13, d - 5), 0, h - 0.5)
  cyl(g, MAT.steel, 0.4, 0.4, 4, 0, h, -d / 2 + 3)
  box(g, MAT.frame, w - 3, h - 8, 0.4, 0, 3, d / 2 - 0.1)
}

function pedestalSink(g: G, w: number, d: number, h: number) {
  cyl(g, MAT.ceramic, 2.2, 3, h * 0.7, 0, 0)
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.3, 4, 24), MAT.ceramic)
  basin.position.set(0, h * 0.7 + 2, 0)
  basin.castShadow = true
  g.add(basin)
  cyl(g, MAT.steel, 0.4, 0.4, 4, 0, h * 0.72 + 2, -w * 0.3)
}

function shower(g: G, w: number, d: number, h: number) {
  box(g, MAT.ceramic, w, 3, d) // tray
  // glass on front & open side, tile back walls
  box(g, MAT.tile, w, h, 1, 0, 0, -d / 2 + 0.5)
  box(g, MAT.tile, 1, h, d, -w / 2 + 0.5, 0)
  box(g, MAT.glass, 0.4, h * 0.92, d - 2, w / 2 - 0.5, 3)
  box(g, MAT.glass, w * 0.55, h * 0.92, 0.4, -w * 0.22, 3, d / 2 - 0.4)
  // shower head
  cyl(g, MAT.steel, 0.5, 0.5, h * 0.6, -w / 2 + 3, 3, -d / 2 + 2)
  const head = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.8, 16), MAT.steel)
  head.position.set(-w / 2 + 6, h * 0.6 + 4, -d / 2 + 4)
  head.rotation.z = 0.5
  g.add(head)
}

function bathtub(g: G, w: number, d: number, h: number) {
  box(g, MAT.ceramic, w, h, d)
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 6, h * 0.55, d - 6), MAT.tile)
  inner.position.set(0, h * 0.62, 0)
  g.add(inner)
  cyl(g, MAT.steel, 0.5, 0.5, 6, -w / 2 + 4, h, 0)
}

// ---------- structure ----------

function staircase(g: G, w: number, d: number, h: number) {
  // solid stepped mass: risers ≤ 7¾", ascending toward -z (the 2D arrow direction)
  const risers = Math.max(2, Math.ceil(h / 7.75))
  const rh = h / risers
  const td = d / (risers - 1)
  for (let i = 0; i < risers - 1; i++) {
    const stepH = rh * (i + 1)
    const z = d / 2 - td * i - td / 2
    box(g, MAT.wood, w - 3, stepH, td + 0.05, 0, 0, z)
  }
  // side stringers
  for (const sx of [-w / 2 + 1.4, w / 2 - 1.4]) {
    for (let i = 0; i < risers - 1; i++) {
      const stepH = rh * (i + 1)
      const z = d / 2 - td * i - td / 2
      box(g, MAT.white, 2.6, stepH + 1, td + 0.05, sx, 0, z)
    }
  }
  // simple handrail on the right side
  const railH = 34
  for (let i = 0; i < risers - 1; i += 2) {
    const z = d / 2 - td * i - td / 2
    cyl(g, MAT.steel, 0.5, 0.5, railH, w / 2 - 1.4, rh * (i + 1), z, 8)
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, Math.hypot(d, h) * 0.98, 8), MAT.wood)
  rail.position.set(w / 2 - 1.4, h / 2 + railH, 0)
  rail.rotation.x = -Math.atan2(d, h)
  rail.castShadow = true
  g.add(rail)
}

/** Shared step-run helper: a flight climbing from y0 along an axis. */
function flight(
  g: G,
  opts: {
    axis: 'x' | 'z'
    dir: 1 | -1
    /** start of the run along the axis (bottom of the flight) */
    s0: number
    /** cross-axis center + width of the flight */
    cross: number
    width: number
    treads: number
    treadDepth: number
    riserH: number
    y0: number
  }
) {
  const { axis, dir, s0, cross, width, treads, treadDepth, riserH, y0 } = opts
  for (let i = 0; i < treads; i++) {
    const stepH = y0 + riserH * (i + 1)
    const s = s0 + dir * (treadDepth * i + treadDepth / 2)
    const x = axis === 'z' ? cross : s
    const z = axis === 'z' ? s : cross
    const sw = axis === 'z' ? width - 3 : treadDepth + 0.05
    const sd = axis === 'z' ? treadDepth + 0.05 : width - 3
    box(g, MAT.wood, sw, stepH, sd, x, 0, z)
  }
}

/** Guard rail posts + top rail along a straight edge (interior guard, 42"). */
function guardRun(
  g: G,
  a: { x: number; z: number },
  b: { x: number; z: number },
  y: number,
  h = 42
) {
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  if (len < 4) return
  const ang = Math.atan2(b.z - a.z, b.x - a.x)
  const posts = Math.max(2, Math.round(len / 48) + 1)
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1)
    cyl(g, MAT.steel, 0.7, 0.7, h, a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t, 8)
  }
  for (const ry of [y + h, y + h * 0.55]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, ry === y + h ? 2 : 1.2, 1.6), MAT.wood)
    r.position.set((a.x + b.x) / 2, ry, (a.z + b.z) / 2)
    r.rotation.y = -ang
    r.castShadow = true
    g.add(r)
  }
}

/** L-shaped stair: flight along -z, square landing, flight along +x. */
function staircaseL(g: G, w: number, d: number, h: number) {
  const risers = Math.max(3, Math.ceil(h / 7.75))
  const rh = h / risers
  const LW = Math.max(24, Math.min(w, d) * 0.4)
  const runA = Math.max(10, d - LW)
  const runB = Math.max(10, w - LW)
  const T = risers - 1
  let tA = Math.max(1, Math.round((T * runA) / (runA + runB)))
  let tB = Math.max(1, T - tA)
  if (tA + tB > T) tA = T - tB
  const tdA = runA / tA
  const tdB = runB / tB
  const xL = -w / 2 + LW / 2 // center of the lower flight
  const zL = -d / 2 + LW / 2 // center of the landing row

  flight(g, { axis: 'z', dir: -1, s0: d / 2, cross: xL, width: LW, treads: tA, treadDepth: tdA, riserH: rh, y0: 0 })
  // landing platform at the turn
  const landY = rh * tA
  box(g, MAT.wood, LW, landY, LW, xL, 0, zL)
  flight(g, {
    axis: 'x',
    dir: 1,
    s0: -w / 2 + LW,
    cross: zL,
    width: LW,
    treads: tB,
    treadDepth: tdB,
    riserH: rh,
    y0: landY,
  })
  // guard along the open sides of both flights
  guardRun(g, { x: xL + LW / 2, z: d / 2 }, { x: xL + LW / 2, z: -d / 2 + LW }, h * 0.5, 34)
  guardRun(g, { x: -w / 2 + LW, z: zL + LW / 2 }, { x: w / 2, z: zL + LW / 2 }, h * 0.82, 34)
}

/** U-shaped stair: two parallel flights with a landing across the back. */
function staircaseU(g: G, w: number, d: number, h: number) {
  const risers = Math.max(4, Math.ceil(h / 7.75))
  const rh = h / risers
  const LD = Math.max(30, Math.min(48, d * 0.28)) // landing depth
  const run = Math.max(10, d - LD)
  const T = risers - 1
  const tA = Math.max(1, Math.ceil(T / 2))
  const tB = Math.max(1, T - tA)
  const td = run / Math.max(tA, tB)
  const legW = w / 2
  const zLand = -d / 2 + LD / 2

  flight(g, { axis: 'z', dir: -1, s0: d / 2, cross: -legW / 2, width: legW, treads: tA, treadDepth: td, riserH: rh, y0: 0 })
  const landY = rh * tA
  box(g, MAT.wood, w, landY, LD, 0, 0, zLand)
  flight(g, {
    axis: 'z',
    dir: 1,
    s0: -d / 2 + LD,
    cross: legW / 2,
    width: legW,
    treads: tB,
    treadDepth: td,
    riserH: rh,
    y0: landY,
  })
  // center stringer wall between the flights + outer guards
  box(g, MAT.white, 3, h * 0.9, run, 0, 0, -d / 2 + LD + run / 2)
  guardRun(g, { x: -w / 2, z: d / 2 }, { x: -w / 2, z: -d / 2 + LD }, h * 0.4, 34)
  guardRun(g, { x: w / 2, z: -d / 2 + LD }, { x: w / 2, z: d / 2 }, h * 0.75, 34)
}

/** Straight guardrail: posts, top rail, and balusters (mezzanine / stairwell guard). */
function railing(g: G, w: number, _d: number, h: number) {
  const postR = 0.85
  const posts = Math.max(2, Math.round(w / 48) + 1)
  for (let i = 0; i < posts; i++) {
    const x = -w / 2 + (w * i) / (posts - 1)
    cyl(g, MAT.steel, postR, postR, h, x, 0, 0, 10)
  }
  const balusters = Math.max(2, Math.floor(w / 5))
  for (let i = 1; i < balusters; i++) {
    const x = -w / 2 + (w * i) / balusters
    cyl(g, MAT.steel, 0.32, 0.32, h - 3, x, 0, 0, 6)
  }
  box(g, MAT.wood, w, 2.2, 3.2, 0, h - 2.2) // top rail
  box(g, MAT.steel, w, 1, 1.2, 0, h * 0.45) // mid rail
}

// ---------- garage & vehicles ----------
// Vehicles face -z (nose toward the 2D glyph's arrow/bow side).

function wheel(g: G, r: number, x: number, y: number, z: number, width = 0.35) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * width * 2, 18), MAT.tire)
  t.rotation.z = Math.PI / 2
  t.position.set(x, y, z)
  t.castShadow = true
  g.add(t)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * width * 2 + 0.4, 12), MAT.steel)
  hub.rotation.z = Math.PI / 2
  hub.position.set(x, y, z)
  g.add(hub)
}

function car(g: G, w: number, d: number, h: number) {
  const bw = w * 0.86
  const wheelR = h * 0.16
  const bodyY = wheelR * 0.9
  const bodyH = h * 0.42
  // lower body
  box(g, MAT.carPaint, bw, bodyH, d * 0.96, 0, bodyY)
  // hood + trunk taper
  box(g, MAT.carPaint, bw * 0.96, bodyH * 0.5, d * 0.16, 0, bodyY + bodyH * 0.2, -d * 0.42)
  // cabin with glass band
  const cabD = d * 0.48
  box(g, MAT.carPaint, bw * 0.88, h * 0.3, cabD, 0, bodyY + bodyH, -d * 0.02)
  box(g, MAT.glass, bw * 0.88 + 0.4, h * 0.17, cabD * 0.92, 0, bodyY + bodyH + h * 0.04, -d * 0.02)
  // lights
  box(g, MAT.white, bw * 0.7, 2.5, 1.2, 0, bodyY + bodyH * 0.55, -d * 0.48)
  box(g, MAT.toolRed, bw * 0.7, 2.2, 1.2, 0, bodyY + bodyH * 0.55, d * 0.475)
  for (const [x, z] of [
    [-bw / 2, -d * 0.3],
    [bw / 2, -d * 0.3],
    [-bw / 2, d * 0.3],
    [bw / 2, d * 0.3],
  ]) {
    wheel(g, wheelR, x as number, wheelR, z as number)
  }
}

function pickup(g: G, w: number, d: number, h: number) {
  const bw = w * 0.88
  const wheelR = h * 0.18
  const bodyY = wheelR
  const bodyH = h * 0.34
  box(g, MAT.carPaint, bw, bodyH, d * 0.96, 0, bodyY) // frame body
  box(g, MAT.carPaint, bw * 0.94, bodyH * 0.6, d * 0.2, 0, bodyY + bodyH * 0.3, -d * 0.38) // hood
  // cab
  box(g, MAT.carPaint, bw * 0.9, h * 0.36, d * 0.24, 0, bodyY + bodyH, -d * 0.14)
  box(g, MAT.glass, bw * 0.9 + 0.4, h * 0.19, d * 0.21, 0, bodyY + bodyH + h * 0.06, -d * 0.14)
  // open bed walls
  const bedZ = d * 0.24
  const bedD = d * 0.42
  box(g, MAT.carPaint, bw, bodyH * 0.9, 2, 0, bodyY + bodyH * 0.5, bedZ + bedD / 2) // tailgate
  box(g, MAT.carPaint, 2, bodyH * 0.9, bedD, -bw / 2 + 1, bodyY + bodyH * 0.5, bedZ)
  box(g, MAT.carPaint, 2, bodyH * 0.9, bedD, bw / 2 - 1, bodyY + bodyH * 0.5, bedZ)
  box(g, MAT.carDark, bw - 4, 1, bedD, 0, bodyY + bodyH * 0.35, bedZ) // bed floor
  for (const [x, z] of [
    [-bw / 2, -d * 0.3],
    [bw / 2, -d * 0.3],
    [-bw / 2, d * 0.32],
    [bw / 2, d * 0.32],
  ]) {
    wheel(g, wheelR, x as number, wheelR, z as number, 0.4)
  }
}

function camper(g: G, w: number, d: number, h: number) {
  const bodyD = d - 18 // leave room for the hitch tongue at -z
  const clearance = 14
  const bodyH = h - clearance
  const cz = 9 // body center shifted back
  box(g, MAT.camperShell, w, bodyH, bodyD, 0, clearance, cz)
  // rounded-ish nose cap
  box(g, MAT.camperShell, w * 0.86, bodyH * 0.9, 8, 0, clearance + bodyH * 0.05, cz - bodyD / 2 - 3)
  // accent stripe + door + window
  box(g, MAT.accent2, w + 0.4, 6, bodyD * 0.98, 0, clearance + bodyH * 0.45, cz)
  box(g, MAT.frame, 1, bodyH * 0.62, 24, w / 2 - 0.3, clearance + 2, cz + bodyD * 0.18)
  box(g, MAT.glass, 1, 14, 22, w / 2 + 0.1, clearance + bodyH * 0.55, cz - bodyD * 0.22)
  box(g, MAT.glass, 1, 14, 22, -w / 2 - 0.1, clearance + bodyH * 0.55, cz)
  // roof AC unit
  box(g, MAT.frame, 16, 6, 22, 0, clearance + bodyH, cz)
  // hitch tongue + jack
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 26), MAT.steel)
  tongue.position.set(0, clearance - 2, -d / 2 + 13)
  tongue.castShadow = true
  g.add(tongue)
  cyl(g, MAT.steel, 1, 1, clearance - 2, 0, 0, -d / 2 + 6)
  // tandem wheels
  for (const z of [d * 0.1, d * 0.24]) {
    wheel(g, 13, -w / 2 + 2, 13, z, 0.3)
    wheel(g, 13, w / 2 - 2, 13, z, 0.3)
  }
}

function boatTrailer(g: G, w: number, d: number, h: number) {
  const bw = w * 0.8
  const deckY = h * 0.34
  const hullH = h * 0.3
  const hullD = d * 0.82
  const hullZ = d * 0.06
  // trailer frame
  box(g, MAT.steel, 3, 2.5, d * 0.9, -bw * 0.3, deckY - hullH * 0.6, 0)
  box(g, MAT.steel, 3, 2.5, d * 0.9, bw * 0.3, deckY - hullH * 0.6, 0)
  box(g, MAT.steel, 3, 2.5, d * 0.55, 0, deckY - hullH * 0.55, -d * 0.28)
  wheel(g, 10, -w / 2 + 2, 10, d * 0.2, 0.32)
  wheel(g, 10, w / 2 - 2, 10, d * 0.2, 0.32)
  // hull: stern block + tapered bow (scaled box)
  box(g, MAT.hullNavy, bw, hullH, hullD * 0.62, 0, deckY, hullZ + hullD * 0.19)
  const bow = new THREE.Mesh(new THREE.BoxGeometry(bw, hullH, hullD * 0.42), MAT.hullNavy)
  bow.position.set(0, deckY + hullH / 2, hullZ - hullD * 0.31)
  bow.scale.x = 0.55
  bow.rotation.y = 0
  bow.castShadow = true
  g.add(bow)
  // deck + windshield + motor
  box(g, MAT.white, bw * 0.92, 3, hullD * 0.58, 0, deckY + hullH, hullZ + hullD * 0.2)
  box(g, MAT.glass, bw * 0.8, h * 0.14, 1, 0, deckY + hullH + 3, hullZ - hullD * 0.09)
  box(g, MAT.carDark, bw * 0.22, h * 0.2, 6, 0, deckY + hullH, hullZ + hullD * 0.52)
  // seats
  box(g, MAT.fabricDark, bw * 0.7, 6, hullD * 0.2, 0, deckY + hullH + 2, hullZ + hullD * 0.18)
}

function jetSki(g: G, w: number, d: number, h: number) {
  const jw = w * 0.62
  const deckY = h * 0.3
  // mini trailer
  box(g, MAT.steel, 2.5, 2, d * 0.85, -jw * 0.35, deckY - 4, 0)
  box(g, MAT.steel, 2.5, 2, d * 0.85, jw * 0.35, deckY - 4, 0)
  wheel(g, 7, -w / 2 + 1.5, 7, d * 0.22, 0.3)
  wheel(g, 7, w / 2 - 1.5, 7, d * 0.22, 0.3)
  // hull with tapered nose
  box(g, MAT.accent2, jw, h * 0.24, d * 0.55, 0, deckY, d * 0.12)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(jw, h * 0.2, d * 0.32), MAT.accent2)
  nose.position.set(0, deckY + h * 0.11, -d * 0.24)
  nose.scale.x = 0.6
  nose.castShadow = true
  g.add(nose)
  // seat + handlebars
  box(g, MAT.dark, jw * 0.5, h * 0.16, d * 0.4, 0, deckY + h * 0.22, d * 0.14)
  cyl(g, MAT.steel, 0.6, 0.6, h * 0.16, 0, deckY + h * 0.2, -d * 0.16)
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, jw * 0.6, 8), MAT.steel)
  bars.rotation.z = Math.PI / 2
  bars.position.set(0, deckY + h * 0.38, -d * 0.16)
  g.add(bars)
}

function workbench(g: G, w: number, d: number, h: number) {
  box(g, MAT.woodDark, w, 2.2, d, 0, h - 2.2) // butcher top
  legs(g, w, d, h - 2.2, 2, 2.4, MAT.steel)
  box(g, MAT.wood, w - 6, 1.4, d - 4, 0, h * 0.3) // lower shelf
  // pegboard back rising above the top
  box(g, MAT.frame, w, h * 0.55, 1, 0, h, -d / 2 + 0.5)
  // a few hanging tools
  box(g, MAT.steel, 1.4, 7, 0.8, -w * 0.3, h + h * 0.18, -d / 2 + 1.2)
  box(g, MAT.toolRed, 2.2, 5, 0.8, -w * 0.12, h + h * 0.2, -d / 2 + 1.2)
  box(g, MAT.steel, 1.2, 8, 0.8, w * 0.08, h + h * 0.16, -d / 2 + 1.2)
  box(g, MAT.carDark, 3, 4, 0.8, w * 0.28, h + h * 0.22, -d / 2 + 1.2)
  // vise
  box(g, MAT.steel, 4, 3.5, 5, -w / 2 + 6, h - 0.5, d / 2 - 4)
}

function toolChest(g: G, w: number, d: number, h: number) {
  box(g, MAT.toolRed, w, h - 4, d, 0, 4)
  const rows = Math.max(3, Math.round(h / 10))
  for (let i = 0; i < rows; i++) {
    const y = 5.5 + ((i + 0.15) * (h - 10)) / rows
    box(g, MAT.carDark, w - 4, 1, 0.5, 0, y, d / 2 + 0.1)
  }
  box(g, MAT.steel, w - 6, 1.2, 1.2, 0, h - 2.5, d / 2 + 0.4) // top rail handle
  // casters
  for (const [x, z] of [
    [-w / 2 + 4, -d / 2 + 3],
    [w / 2 - 4, -d / 2 + 3],
    [-w / 2 + 4, d / 2 - 3],
    [w / 2 - 4, d / 2 - 3],
  ]) {
    cyl(g, MAT.tire, 2, 2, 3.4, x as number, 0.3, z as number, 10)
  }
}

// ---------- landscape & site ----------

function surfacePatch(g: G, kind: string, w: number, d: number) {
  const mat = surfaceMaterial(kind)
  if (mat.map) {
    const map = mat.map.clone()
    map.repeat.set(Math.max(0.25, w / 96), Math.max(0.25, d / 96))
    map.needsUpdate = true
    mat.map = map
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, kind === 'surface-mulch' ? 2.5 : 1.2, d), mat)
  m.position.y = kind === 'surface-mulch' ? 1.25 : 0.6
  m.receiveShadow = true
  g.add(m)
}

function treeOak(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  const trunkH = h * 0.32
  cyl(g, MAT.trunk, r * 0.06, r * 0.09, trunkH, 0, 0, 0, 10)
  const blobs: [number, number, number, number][] = [
    [0, trunkH + (h - trunkH) * 0.45, 0, r * 0.62],
    [r * 0.4, trunkH + (h - trunkH) * 0.3, r * 0.15, r * 0.42],
    [-r * 0.42, trunkH + (h - trunkH) * 0.34, -r * 0.1, r * 0.45],
    [r * 0.05, trunkH + (h - trunkH) * 0.75, r * 0.3, r * 0.4],
    [-r * 0.15, trunkH + (h - trunkH) * 0.72, -r * 0.35, r * 0.38],
  ]
  for (const [x, y, z, rr] of blobs) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 8), MAT.leaf)
    s.position.set(x, y, z)
    s.castShadow = true
    g.add(s)
  }
}

function treePine(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  const trunkH = h * 0.22
  cyl(g, MAT.trunk, r * 0.07, r * 0.1, trunkH, 0, 0, 0, 10)
  const tiers = 4
  for (let i = 0; i < tiers; i++) {
    const tierR = r * (1 - i * 0.22)
    const tierH = (h - trunkH) / (tiers - 0.6)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(tierR, tierH * 1.35, 10), MAT.leafDark)
    cone.position.y = trunkH + tierH * i + tierH * 0.55
    cone.castShadow = true
    g.add(cone)
  }
}

function shrub(g: G, w: number, d: number, h: number) {
  const r = Math.min(w, d) / 2
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), MAT.leaf)
  s.position.y = h * 0.55
  s.scale.y = h / (r * 2) || 1
  s.castShadow = true
  g.add(s)
}

function flowerBed(g: G, w: number, d: number, h: number) {
  surfacePatch(g, 'surface-mulch', w, d)
  const mats = [MAT.flower1, MAT.flower2, MAT.flower3]
  const n = Math.max(4, Math.round((w * d) / 500))
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 5 + ((i * 53) % Math.max(1, w - 10))
    const z = -d / 2 + 5 + ((i * 31 + 11) % Math.max(1, d - 10))
    cyl(g, MAT.leafDark, 0.5, 0.5, h * 0.5, x, 2, z, 6)
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), mats[i % 3])
    bloom.position.set(x, 2 + h * 0.55, z)
    bloom.castShadow = true
    g.add(bloom)
  }
}

function steppingStone(g: G, w: number, d: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 1.6, 12), MAT.stone)
  m.scale.z = d / w
  m.position.y = 0.8
  m.receiveShadow = true
  m.castShadow = true
  g.add(m)
}

function boulder(g: G, w: number, d: number, h: number) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.min(w, d) / 2, 0), MAT.stone)
  m.scale.set(w / Math.min(w, d), h / Math.min(w, d), d / Math.min(w, d))
  m.position.y = h * 0.42
  m.rotation.y = 0.6
  m.castShadow = true
  g.add(m)
}

function mailbox(g: G, w: number, d: number, h: number) {
  box(g, MAT.woodDark, 2.2, h - 8, 2.2, 0, 0)
  const bx = box(g, MAT.steel, w, 8, d, 0, h - 8)
  bx.castShadow = true
  const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 12, 1, false, 0, Math.PI), MAT.steel)
  top.rotation.x = Math.PI / 2
  top.position.set(0, h - 4 + 4, 0)
  g.add(top)
  box(g, MAT.toolRed, 0.8, 5, 0.8, w / 2 + 0.4, h - 6)
}

// ---------- registry ----------

const builders: Record<string, (g: G, w: number, d: number, h: number) => void> = {
  staircase,
  'staircase-l': staircaseL,
  'staircase-u': staircaseU,
  railing,
  'tree-oak': treeOak,
  'tree-pine': treePine,
  shrub,
  'flower-bed': flowerBed,
  'stepping-stone': (g, w, d) => steppingStone(g, w, d),
  boulder,
  mailbox,
  'surface-concrete': (g, w, d) => surfacePatch(g, 'surface-concrete', w, d),
  'surface-asphalt': (g, w, d) => surfacePatch(g, 'surface-asphalt', w, d),
  'surface-gravel': (g, w, d) => surfacePatch(g, 'surface-gravel', w, d),
  'surface-pavers': (g, w, d) => surfacePatch(g, 'surface-pavers', w, d),
  'surface-mulch': (g, w, d) => surfacePatch(g, 'surface-mulch', w, d),
  car,
  pickup,
  camper,
  'boat-trailer': boatTrailer,
  'jet-ski': jetSki,
  workbench,
  'tool-chest': toolChest,
  sofa: (g, w, d, h) => sofa(g, w, d, h, Math.max(2, Math.round(w / 28))),
  loveseat: (g, w, d, h) => sofa(g, w, d, h, 2),
  armchair,
  'coffee-table': coffeeTable,
  'end-table': endTable,
  'tv-stand': tvStand,
  'floor-lamp': floorLamp,
  'table-lamp': tableLamp,
  bookshelf,
  rug: (g, w, d) => rug(g, w, d),
  plant,
  'bed-queen': (g, w, d, h) => bed(g, w, d, h, 2),
  'bed-king': (g, w, d, h) => bed(g, w, d, h, 3),
  'bed-twin': (g, w, d, h) => bed(g, w, d, h, 1),
  nightstand,
  dresser,
  wardrobe,
  desk,
  'office-chair': officeChair,
  'dining-table': diningTable,
  'round-table': roundTable,
  chair,
  'bar-stool': barStool,
  'base-cabinet': baseCabinet,
  'kitchen-island': kitchenIsland,
  'kitchen-sink': kitchenSink,
  stove,
  fridge,
  dishwasher,
  washer: (g, w, d, h) => laundry(g, w, d, h, false),
  dryer: (g, w, d, h) => laundry(g, w, d, h, true),
  toilet,
  vanity,
  'pedestal-sink': pedestalSink,
  shower,
  bathtub,
}

export function buildFurniture(kind: string, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group()
  const fn = builders[kind]
  if (fn) fn(g, w, d, h)
  else box(g, MAT.white, w, h, d)
  return g
}
