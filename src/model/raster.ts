// Occupancy raster of a floor's walls: flood-fill interior detection + room region
// labeling. Shared by the 3D floor-surface builder and the 2D room auto-detection.

import type { Pt, Wall } from './types'
import { dist, wallSamples } from './geometry'

export interface FloorRaster {
  CELL: number
  ox: number
  oy: number
  W: number
  H: number
  solid: Uint8Array
  outside: Uint8Array
  region: Int32Array
  regionCount: number
  interiorCount: number
  /** true when the walls seal at least one real room */
  enclosed: boolean
}

export function rasterizeFloor(
  walls: Wall[],
  extraPts: Pt[],
  grid?: { CELL: number; ox: number; oy: number; W: number; H: number }
): FloorRaster | null {
  let CELL: number, ox: number, oy: number, W: number, H: number
  if (grid) {
    ;({ CELL, ox, oy, W, H } = grid)
  } else {
    const pts: Pt[] = []
    for (const w of walls) pts.push(...wallSamples(w, 12))
    if (!pts.length) pts.push(...extraPts)
    if (!pts.length) return null

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
    const PAD = 3
    // adaptive resolution: grow the cell size for huge plans instead of bailing out
    CELL = 3
    ox = 0
    oy = 0
    W = 0
    H = 0
    for (;;) {
      ox = minX - PAD * CELL
      oy = minY - PAD * CELL
      W = Math.ceil((maxX - ox + PAD * CELL) / CELL) + 1
      H = Math.ceil((maxY - oy + PAD * CELL) / CELL) + 1
      if (W * H <= 600_000 || CELL >= 24) break
      CELL *= 2
    }
    if (W * H > 2_000_000) return null // pathological (miles-wide bounds)
  }

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

  // flood the outside
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
  const enclosed = interiorCount > 30
  const isInterior = (i: number) => (enclosed ? !solid[i] && !outside[i] : !solid[i])

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

  return { CELL, ox, oy, W, H, solid, outside, region, regionCount, interiorCount, enclosed }
}

/** One detected room: cell count, area, and a label point guaranteed inside the room. */
export interface RoomRegion {
  id: number
  areaSqIn: number
  cx: number
  cy: number
}

/** Summarize the raster's regions into rooms (only meaningful when walls enclose). */
export function roomRegions(r: FloorRaster | null, minAreaSqIn = 4 * 144): RoomRegion[] {
  if (!r || !r.enclosed || !r.regionCount) return []
  const count = new Array<number>(r.regionCount).fill(0)
  const sx = new Array<number>(r.regionCount).fill(0)
  const sy = new Array<number>(r.regionCount).fill(0)
  for (let i = 0; i < r.W * r.H; i++) {
    const g = r.region[i]
    if (g < 0) continue
    count[g]++
    sx[g] += i % r.W
    sy[g] += (i / r.W) | 0
  }
  const rooms: RoomRegion[] = []
  for (let g = 0; g < r.regionCount; g++) {
    const areaSqIn = count[g] * r.CELL * r.CELL
    if (areaSqIn < minAreaSqIn) continue
    let ccx = sx[g] / count[g]
    let ccy = sy[g] / count[g]
    // centroid can fall outside an L/U-shaped room — snap to the nearest cell of the region
    const at = Math.round(ccy) * r.W + Math.round(ccx)
    if (r.region[at] !== g) {
      let best = Infinity
      for (let i = 0; i < r.W * r.H; i++) {
        if (r.region[i] !== g) continue
        const dx = (i % r.W) - ccx
        const dy = ((i / r.W) | 0) - ccy
        const d = dx * dx + dy * dy
        if (d < best) {
          best = d
          ccx = i % r.W
          ccy = (i / r.W) | 0
        }
      }
    }
    rooms.push({
      id: g,
      areaSqIn,
      cx: r.ox + ccx * r.CELL,
      cy: r.oy + ccy * r.CELL,
    })
  }
  return rooms
}

/** The region id at a world point, or -1. */
export function regionAt(r: FloorRaster, x: number, y: number): number {
  const cx = Math.round((x - r.ox) / r.CELL)
  const cy = Math.round((y - r.oy) / r.CELL)
  if (cx < 0 || cy < 0 || cx >= r.W || cy >= r.H) return -1
  return r.region[cy * r.W + cx]
}

/** Whether a world point falls in the outside flood (or off-grid). */
export function outsideAt(r: FloorRaster, x: number, y: number): boolean {
  const cx = Math.round((x - r.ox) / r.CELL)
  const cy = Math.round((y - r.oy) / r.CELL)
  if (cx < 0 || cy < 0 || cx >= r.W || cy >= r.H) return true
  return r.outside[cy * r.W + cx] === 1
}
