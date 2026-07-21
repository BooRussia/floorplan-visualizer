// Auto-guardrail placement: find the edges of a floor's "open to below" regions
// and the stairwell holes from the story beneath, then emit railing segments that
// run along those edges (axis-aligned runs merged from the raster boundary).

import type { Floor, Furniture, Pt, Wall } from './types'
import { rasterizeFloor, regionAt } from './raster'
import { isStairKind } from './catalog'
import { toLocal } from './geometry'

export interface GuardSeg {
  /** center point */
  x: number
  y: number
  /** run length (inches) */
  w: number
  /** rotation in degrees (0 = along +x) */
  rot: number
}

const MIN_RUN = 24

/** true when p falls inside the footprint of any of the given items */
function inFootprint(p: Pt, items: Furniture[]): boolean {
  for (const f of items) {
    const local = toLocal(p, f.x, f.y, f.rot)
    if (Math.abs(local.x) <= f.w / 2 && Math.abs(local.y) <= f.d / 2) return true
  }
  return false
}

/**
 * Guard runs for this floor: boundaries between walkable interior and
 * open-to-below regions / stairwell holes. `holes` are the stairs on the floor below.
 */
export function openEdgeGuards(
  floor: Floor,
  holes: Furniture[],
  belowWalls: Wall[] = []
): GuardSeg[] {
  // same union footprint the 3D floor surface uses: this story's walls + the
  // sealed footprint below, so deck areas and their paint regions are included
  const unionWalls = belowWalls.length ? [...belowWalls, ...floor.walls] : floor.walls
  const raster = rasterizeFloor(unionWalls, [])
  if (!raster) return []
  const { CELL, ox, oy, W, H, solid, outside, region } = raster

  // regions painted "open to below"
  const openRegions = new Set<number>()
  for (const p of floor.paints ?? []) {
    if (p.material !== 'open') continue
    const r = regionAt(raster, p.x, p.y)
    if (r >= 0) openRegions.add(r)
  }
  const stairHoles = holes.filter((h) => isStairKind(h.kind))
  if (!openRegions.size && !stairHoles.length) return []

  const at = (cx: number, cy: number) => cy * W + cx
  const center = (cx: number, cy: number): Pt => ({
    x: ox + cx * CELL + CELL / 2,
    y: oy + cy * CELL + CELL / 2,
  })
  // void = open region cell or a stairwell hole cell
  const isVoid = (cx: number, cy: number): boolean => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false
    const i = at(cx, cy)
    if (solid[i] || outside[i]) return false
    if (openRegions.has(region[i])) return true
    return stairHoles.length > 0 && inFootprint(center(cx, cy), stairHoles)
  }
  /** Cells at the top of a stair run — the walk-off onto this floor, left open. */
  const atStairLanding = (cx: number, cy: number): boolean => {
    const p = center(cx, cy)
    for (const h of stairHoles) {
      const l = toLocal(p, h.x, h.y, h.rot)
      // stairs ascend toward local -y, so the landing edge is that end
      if (Math.abs(l.x) <= h.w / 2 && l.y <= -h.d / 2 + 16) return true
    }
    return false
  }

  /** Walkable within a few cells in one direction, so thin dividers don't hide the edge. */
  const walkBeyond = (cx: number, cy: number, sx: number, sy: number): boolean => {
    for (let step = 1; step <= 3; step++) {
      const x = cx + sx * step
      const y = cy + sy * step
      if (x < 0 || y < 0 || x >= W || y >= H) return false
      if (isVoid(x, y)) return false
      const i = at(x, y)
      if (outside[i]) return false
      if (!solid[i]) return true // reached open floor on the other side
    }
    return false
  }

  const segs: GuardSeg[] = []
  // horizontal runs: void cell with walkable neighbor above / below
  for (const [dy, sign] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    for (let cy = 0; cy < H; cy++) {
      let run = -1
      for (let cx = 0; cx <= W; cx++) {
        const edge =
          cx < W && isVoid(cx, cy) && !atStairLanding(cx, cy) && walkBeyond(cx, cy, 0, dy)
        if (edge && run < 0) run = cx
        if (!edge && run >= 0) {
          const len = (cx - run) * CELL
          if (len >= MIN_RUN) {
            segs.push({
              x: ox + ((run + cx) / 2) * CELL,
              // sit on the void's edge facing the walkable side
              y: oy + cy * CELL + (sign < 0 ? 0 : CELL),
              w: len,
              rot: 0,
            })
          }
          run = -1
        }
      }
    }
  }
  // vertical runs: void cell with walkable neighbor left / right
  for (const [dx, sign] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    for (let cx = 0; cx < W; cx++) {
      let run = -1
      for (let cy = 0; cy <= H; cy++) {
        const edge =
          cy < H && isVoid(cx, cy) && !atStairLanding(cx, cy) && walkBeyond(cx, cy, dx, 0)
        if (edge && run < 0) run = cy
        if (!edge && run >= 0) {
          const len = (cy - run) * CELL
          if (len >= MIN_RUN) {
            segs.push({
              x: ox + cx * CELL + (sign < 0 ? 0 : CELL),
              y: oy + ((run + cy) / 2) * CELL,
              w: len,
              rot: 90,
            })
          }
          run = -1
        }
      }
    }
  }
  return segs
}
