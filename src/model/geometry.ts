import type { Pt, RoadNode, Wall } from './types'

// ---------- vector helpers ----------

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
export const len = (a: Pt) => Math.hypot(a.x, a.y)
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})
export const norm = (a: Pt): Pt => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l }
}
/** Left-hand perpendicular */
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x })
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y

// ---------- wall curve math ----------
// A wall is a quadratic bezier from a to b whose midpoint is offset
// perpendicular to the chord by `bulge` inches. Control point C = mid + 2*bulge*n.

export const wallControl = (w: Wall): Pt => {
  const mid = lerp(w.a, w.b, 0.5)
  const n = perp(norm(sub(w.b, w.a)))
  return add(mid, scale(n, 2 * w.bulge))
}

export const wallPointAt = (w: Wall, t: number): Pt => {
  if (!w.bulge) return lerp(w.a, w.b, t)
  const c = wallControl(w)
  const u = 1 - t
  return {
    x: u * u * w.a.x + 2 * u * t * c.x + t * t * w.b.x,
    y: u * u * w.a.y + 2 * u * t * c.y + t * t * w.b.y,
  }
}

/** Unit tangent along the wall at t */
export const wallTangentAt = (w: Wall, t: number): Pt => {
  if (!w.bulge) return norm(sub(w.b, w.a))
  const c = wallControl(w)
  return norm({
    x: 2 * (1 - t) * (c.x - w.a.x) + 2 * t * (w.b.x - c.x),
    y: 2 * (1 - t) * (c.y - w.a.y) + 2 * t * (w.b.y - c.y),
  })
}

export const wallLength = (w: Wall): number => {
  if (!w.bulge) return dist(w.a, w.b)
  let l = 0
  let prev = w.a
  const N = 24
  for (let i = 1; i <= N; i++) {
    const p = wallPointAt(w, i / N)
    l += dist(prev, p)
    prev = p
  }
  return l
}

/** Sample points along a wall (inclusive of endpoints). Straight walls get 2 points. */
export const wallSamples = (w: Wall, maxSeg = 6): Pt[] => {
  if (!w.bulge) return [w.a, w.b]
  const n = Math.max(8, Math.ceil(wallLength(w) / maxSeg))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) pts.push(wallPointAt(w, i / n))
  return pts
}

/** Closest point on wall to p. Returns { t, point, distance }. */
export function closestOnWall(w: Wall, p: Pt) {
  if (!w.bulge) {
    const ab = sub(w.b, w.a)
    const t = Math.max(0, Math.min(1, dot(sub(p, w.a), ab) / (dot(ab, ab) || 1)))
    const point = lerp(w.a, w.b, t)
    return { t, point, distance: dist(p, point) }
  }
  let best = { t: 0, point: w.a, distance: dist(p, w.a) }
  const N = 48
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const point = wallPointAt(w, t)
    const d = dist(p, point)
    if (d < best.distance) best = { t, point, distance: d }
  }
  return best
}

// ---------- measurement formatting / parsing ----------

/** 150 -> `12'6"` ; rounds to nearest half inch */
export function fmtLen(inches: number): string {
  const half = Math.round(inches * 2) / 2
  const ft = Math.floor(half / 12)
  let inch = half - ft * 12
  // avoid 12" leftovers from float rounding
  if (inch >= 11.999) return `${ft + 1}'`
  const inchStr =
    inch === 0 ? '' : Number.isInteger(inch) ? `${inch}"` : `${Math.floor(inch)}½"`
  if (ft === 0) return inchStr || `0"`
  return `${ft}'${inchStr ? ` ${inchStr}` : ''}`
}

/** Short form used in tight labels: 12'6" (no space) */
export function fmtLenShort(inches: number): string {
  return fmtLen(inches).replace("' ", "'")
}

/**
 * Parse a measurement string to inches.
 * Accepts: 12'6" · 12' 6" · 12'6 · 12.5' · 150" · 12ft 6in · bare number = feet
 */
export function parseLen(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[”“]/g, '"').replace(/[’‘]/g, "'")
  if (!s) return null
  // feet + optional inches:  12'6"  12' 6  12ft6in
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/)
  if (m) return parseFloat(m[1]) * 12 + (m[2] ? parseFloat(m[2]) : 0)
  // inches only: 150"  150in
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inches)$/)
  if (m) return parseFloat(m[1])
  // meters / cm for good measure
  m = s.match(/^(\d+(?:\.\d+)?)\s*m$/)
  if (m) return parseFloat(m[1]) * 39.3701
  m = s.match(/^(\d+(?:\.\d+)?)\s*cm$/)
  if (m) return parseFloat(m[1]) * 0.393701
  // bare number => feet
  m = s.match(/^(\d+(?:\.\d+)?)$/)
  if (m) return parseFloat(m[1]) * 12
  return null
}

// ---------- snapping ----------

export const snapTo = (v: number, step: number) => Math.round(v / step) * step

export function snapPoint(p: Pt, step: number): Pt {
  return { x: snapTo(p.x, step), y: snapTo(p.y, step) }
}

/** Snap direction from `from` to `to` onto 45° increments, preserving distance. */
export function snapAngle(from: Pt, to: Pt): Pt {
  const d = sub(to, from)
  const r = len(d)
  if (r < 0.001) return to
  const ang = Math.atan2(d.y, d.x)
  const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
  return { x: from.x + r * Math.cos(snapped), y: from.y + r * Math.sin(snapped) }
}

/** Rotate point p around origin by deg (clockwise, screen coords) */
export function rotatePt(p: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** World point -> furniture local coords */
export function toLocal(p: Pt, cx: number, cy: number, rotDeg: number): Pt {
  return rotatePt({ x: p.x - cx, y: p.y - cy }, -rotDeg)
}

// ---------- roads (pen-tool bezier centerlines) ----------
// Each pair of consecutive nodes forms a cubic bezier:
//   P0 = node[i], C1 = P0 + h[i], C2 = P1 - h[i+1], P3 = node[i+1]
// Handles are symmetric (Photoshop smooth anchors); h = (0,0) makes a corner.

/** SVG path for a road centerline. */
export function roadPathD(nodes: RoadNode[]): string {
  if (!nodes.length) return ''
  let d = `M ${nodes[0].x} ${nodes[0].y}`
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    d += ` C ${a.x + a.hx} ${a.y + a.hy} ${b.x - b.hx} ${b.y - b.hy} ${b.x} ${b.y}`
  }
  return d
}

function cubicAt(a: RoadNode, b: RoadNode, t: number): Pt {
  const p0 = { x: a.x, y: a.y }
  const p1 = { x: a.x + a.hx, y: a.y + a.hy }
  const p2 = { x: b.x - b.hx, y: b.y - b.hy }
  const p3 = { x: b.x, y: b.y }
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** Sample the centerline into a dense polyline (~`step` inch spacing). */
export function sampleRoad(nodes: RoadNode[], step = 12): Pt[] {
  if (nodes.length < 2) return nodes.map((n) => ({ x: n.x, y: n.y }))
  const pts: Pt[] = [{ x: nodes[0].x, y: nodes[0].y }]
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    // estimate segment length from control polygon
    const est =
      Math.hypot(a.hx, a.hy) +
      Math.hypot(b.x - b.hx - (a.x + a.hx), b.y - b.hy - (a.y + a.hy)) +
      Math.hypot(b.hx, b.hy)
    const n = Math.max(4, Math.ceil((est || dist(a, b)) / step))
    for (let k = 1; k <= n; k++) pts.push(cubicAt(a, b, k / n))
  }
  return pts
}

export function roadLength(nodes: RoadNode[]): number {
  const pts = sampleRoad(nodes, 12)
  let l = 0
  for (let i = 0; i < pts.length - 1; i++) l += dist(pts[i], pts[i + 1])
  return l
}

// ---------- guide distance rays ----------

export interface GuideRay {
  /** unit direction of the ray */
  dir: Pt
  /** clear distance from the point to the wall face */
  distance: number
  /** point on the wall face where the ray lands */
  hit: Pt
}

/**
 * Cast axis-aligned rays (±x, ±y) from p and return the nearest wall hit in each
 * direction, measured to the wall face (centerline minus half thickness).
 */
export function guideRays(p: Pt, walls: Wall[], maxDist = 720): GuideRay[] {
  const dirs: Pt[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]
  const out: GuideRay[] = []
  for (const dir of dirs) {
    let best = Infinity
    let bestTh = 0
    for (const w of walls) {
      const samples = wallSamples(w, 4)
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i]
        const b = samples[i + 1]
        // ray p + t*dir  vs  segment a + u*(b-a)
        const rx = dir.x
        const ry = dir.y
        const sx = b.x - a.x
        const sy = b.y - a.y
        const denom = rx * sy - ry * sx
        if (Math.abs(denom) < 1e-9) continue
        const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom
        const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denom
        if (t > 0.5 && u >= 0 && u <= 1 && t < best) {
          best = t
          bestTh = w.thickness
        }
      }
    }
    if (best < maxDist) {
      const distance = Math.max(0, best - bestTh / 2)
      out.push({
        dir,
        distance,
        hit: { x: p.x + dir.x * distance, y: p.y + dir.y * distance },
      })
    }
  }
  return out
}

// ---------- plan bounds ----------

export function planBounds(pts: Pt[]): { min: Pt; max: Pt } | null {
  if (!pts.length) return null
  const min = { x: Infinity, y: Infinity }
  const max = { x: -Infinity, y: -Infinity }
  for (const p of pts) {
    min.x = Math.min(min.x, p.x)
    min.y = Math.min(min.y, p.y)
    max.x = Math.max(max.x, p.x)
    max.y = Math.max(max.y, p.y)
  }
  return { min, max }
}
