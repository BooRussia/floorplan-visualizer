import * as THREE from 'three'
import { MAT } from './materials'

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

// ---------- registry ----------

const builders: Record<string, (g: G, w: number, d: number, h: number) => void> = {
  staircase,
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
