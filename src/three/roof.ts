// Roof v2: footprint-true pitched roofs from a distance-transform heightfield.
//
// The footprint raster is dilated by the eave overhang, then a chamfer distance
// transform runs from the eave boundary (gable ends and shed high/rake sides are
// excluded from the seeds). Roof height at every lattice corner = distance x
// pitch/12 — which produces correct hips, ridges, and *valleys* on L/T/U shapes
// automatically, with no straight-skeleton math. Gable-end walls fall out of the
// same field: wherever the original footprint boundary sits above the wall top,
// a vertical skirt (in siding material) closes the gable triangle.

import * as THREE from 'three'
import type { Pt, RoofSpec, SidingSpec, Wall } from '../model/types'
import { rasterizeFloor } from '../model/raster'
import { roofSurfaceMaterial, sidingMaterial, tintedMaterial } from './materials'

const OV = 10 // eave overhang, inches
const ROOF_TH = 6 // visual roof slab thickness
const FASCIA = 7

/** Distance from a point to a wall segment (straight walls only). */
function distToWall(p: { x: number; y: number }, w: Wall): number {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1) return Math.hypot(p.x - w.a.x, p.y - w.a.y)
  let t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (w.a.x + dx * t), p.y - (w.a.y + dy * t))
}

export interface RoofMats {
  gable?: SidingSpec
}

/**
 * Build a pitched roof over the walls' footprint. Returns false when the
 * footprint can't be rasterized (caller falls back to the legacy bbox prism).
 */
export function buildRasterRoof(
  group: THREE.Group,
  walls: Wall[],
  baseY: number,
  roof: RoofSpec,
  mats: RoofMats = {}
): boolean {
  // probe once for resolution, then re-rasterize on a grid expanded enough that
  // the dilated overhang never clips at the lattice border
  const probe = rasterizeFloor(walls, [])
  if (!probe || !probe.enclosed) return false
  const padC = Math.round((OV + 6) / probe.CELL) + 1
  const raster = rasterizeFloor(walls, [], {
    CELL: probe.CELL,
    ox: probe.ox - padC * probe.CELL,
    oy: probe.oy - padC * probe.CELL,
    W: probe.W + 2 * padC,
    H: probe.H + 2 * padC,
  })
  if (!raster || !raster.enclosed) return false
  const { CELL, ox, oy, W, H, outside } = raster

  // --- covered cells (footprint incl. walls), dilated by the overhang ---
  const covered = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) covered[i] = outside[i] ? 0 : 1
  const ovc = Math.max(1, Math.round(OV / CELL))
  const dilated = new Uint8Array(covered)
  for (let pass = 0; pass < ovc; pass++) {
    const prev = new Uint8Array(dilated)
    for (let cy = 0; cy < H; cy++) {
      for (let cx = 0; cx < W; cx++) {
        const i = cy * W + cx
        if (prev[i]) continue
        if (
          (cx > 0 && prev[i - 1]) ||
          (cx < W - 1 && prev[i + 1]) ||
          (cy > 0 && prev[i - W]) ||
          (cy < H - 1 && prev[i + W])
        ) {
          dilated[i] = 1
        }
      }
    }
  }

  // --- corner lattice ---
  const CW = W + 1
  const CH = H + 1
  const cellAt = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < W && cy < H ? dilated[cy * W + cx] : 0
  const origAt = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < W && cy < H ? covered[cy * W + cx] : 0
  const cornerCovered = new Uint8Array(CW * CH)
  const cornerBoundary = new Uint8Array(CW * CH)
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const n = [cellAt(cx - 1, cy - 1), cellAt(cx, cy - 1), cellAt(cx - 1, cy), cellAt(cx, cy)]
      const any = n.some(Boolean)
      cornerCovered[cy * CW + cx] = any ? 1 : 0
      cornerBoundary[cy * CW + cx] = any && !n.every(Boolean) ? 1 : 0
    }
  }
  const cwx = (cx: number) => ox + cx * CELL
  const cwy = (cy: number) => oy + cy * CELL

  // --- eave seeds: boundary corners minus gable/shed exclusion zones ---
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const w of walls)
    for (const p of [w.a, w.b]) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
  const gableWalls = walls.filter((w) => w.roofEdge === 'gable' && !w.bulge)
  const band = OV + 3 * CELL
  const alongX = roof.ridge === 'ew' ? true : roof.ridge === 'ns' ? false : x1 - x0 >= y1 - y0
  const shedLow = roof.shedLow ?? 's'

  const isExcluded = (px: number, py: number): boolean => {
    if (roof.style === 'shed') {
      // seed ONLY the low side band
      if (shedLow === 'n') return py > y0 + band
      if (shedLow === 's') return py < y1 - band
      if (shedLow === 'w') return px > x0 + band
      return px < x1 - band
    }
    for (const g of gableWalls) {
      if (distToWall({ x: px, y: py }, g) < g.thickness / 2 + band) return true
    }
    if (roof.style === 'gable' && !gableWalls.length) {
      // auto gable ends at the bbox extremes along the ridge axis
      if (alongX) return px < x0 + band || px > x1 - band
      return py < y0 + band || py > y1 - band
    }
    return false
  }

  const INF = 1e9
  const d = new Float32Array(CW * CH).fill(INF)
  let seeds = 0
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx
      if (!cornerBoundary[i]) continue
      if (isExcluded(cwx(cx), cwy(cy))) continue
      d[i] = 0
      seeds++
    }
  }
  if (!seeds) return false

  // --- two-pass chamfer distance transform (5-7-11 weights ≈ euclidean) ---
  const relax = (i: number, j: number, w: number) => {
    if (d[j] + w < d[i]) d[i] = d[j] + w
  }
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx
      if (!cornerCovered[i]) continue
      if (cx > 0) relax(i, i - 1, 5)
      if (cy > 0) relax(i, i - CW, 5)
      if (cx > 0 && cy > 0) relax(i, i - CW - 1, 7)
      if (cx < CW - 1 && cy > 0) relax(i, i - CW + 1, 7)
      if (cx > 1 && cy > 0) relax(i, i - CW - 2, 11)
      if (cx < CW - 2 && cy > 0) relax(i, i - CW + 2, 11)
      if (cx > 0 && cy > 1) relax(i, i - 2 * CW - 1, 11)
      if (cx < CW - 1 && cy > 1) relax(i, i - 2 * CW + 1, 11)
    }
  }
  for (let cy = CH - 1; cy >= 0; cy--) {
    for (let cx = CW - 1; cx >= 0; cx--) {
      const i = cy * CW + cx
      if (!cornerCovered[i]) continue
      if (cx < CW - 1) relax(i, i + 1, 5)
      if (cy < CH - 1) relax(i, i + CW, 5)
      if (cx < CW - 1 && cy < CH - 1) relax(i, i + CW + 1, 7)
      if (cx > 0 && cy < CH - 1) relax(i, i + CW - 1, 7)
      if (cx < CW - 2 && cy < CH - 1) relax(i, i + CW + 2, 11)
      if (cx > 1 && cy < CH - 1) relax(i, i + CW - 2, 11)
      if (cx < CW - 1 && cy < CH - 2) relax(i, i + 2 * CW + 1, 11)
      if (cx > 0 && cy < CH - 2) relax(i, i + 2 * CW - 1, 11)
    }
  }

  const slope = Math.max(0.5, roof.pitch) / 12
  const hAt = (cx: number, cy: number): number => {
    const v = d[cy * CW + cx]
    if (v >= INF) return baseY
    return baseY + (v / 5) * CELL * slope
  }

  // --- meshes ---
  const roofMat = roofSurfaceMaterial(roof.material)
  const top: number[] = []
  const topUv: number[] = []
  const tri = (
    arr: number[],
    uvArr: number[] | null,
    a: number[],
    b: number[],
    c: number[]
  ) => {
    arr.push(...a, ...b, ...c)
    uvArr?.push(a[0] / 96, a[2] / 96, b[0] / 96, b[2] / 96, c[0] / 96, c[2] / 96)
  }

  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (!dilated[cy * W + cx]) continue
      const xA = cwx(cx)
      const xB = cwx(cx + 1)
      const zA = cwy(cy)
      const zB = cwy(cy + 1)
      const h00 = hAt(cx, cy) + ROOF_TH
      const h10 = hAt(cx + 1, cy) + ROOF_TH
      const h01 = hAt(cx, cy + 1) + ROOF_TH
      const h11 = hAt(cx + 1, cy + 1) + ROOF_TH
      // split along the diagonal that best follows ridges/valleys
      if (Math.abs(h00 - h11) <= Math.abs(h10 - h01)) {
        tri(top, topUv, [xA, h00, zA], [xB, h11, zB], [xB, h10, zA])
        tri(top, topUv, [xA, h00, zA], [xA, h01, zB], [xB, h11, zB])
      } else {
        tri(top, topUv, [xA, h00, zA], [xA, h01, zB], [xB, h10, zA])
        tri(top, topUv, [xB, h10, zA], [xA, h01, zB], [xB, h11, zB])
      }
    }
  }

  // fascia around the dilated edge + gable skirts at the original boundary + soffit
  const fascia: number[] = []
  const skirt: number[] = []
  const skirtUv: number[] = []
  const soffit: number[] = []
  const edge = (
    arr: number[],
    uvArr: number[] | null,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    topA: number,
    topB: number,
    botA: number,
    botB: number
  ) => {
    tri(arr, null, [ax, topA, az], [bx, topB, bz], [ax, botA, az])
    tri(arr, null, [bx, topB, bz], [bx, botB, bz], [ax, botA, az])
    // u tracks x+z so siding stays keyed on both E-W and N-S gable walls
    const ua = (ax + az) / 96
    const ub = (bx + bz) / 96
    uvArr?.push(ua, topA / 96, ub, topB / 96, ua, botA / 96)
    uvArr?.push(ub, topB / 96, ub, botB / 96, ua, botA / 96)
  }

  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = cy * W + cx
      // fascia: edges of the dilated footprint
      if (dilated[i]) {
        const sides: [number, number, [number, number], [number, number]][] = []
        if (!cellAt(cx, cy - 1)) sides.push([cx, cy, [cx + 1, cy], [0, 0]])
        if (!cellAt(cx, cy + 1)) sides.push([cx + 1, cy + 1, [cx, cy + 1], [0, 0]])
        if (!cellAt(cx - 1, cy)) sides.push([cx, cy + 1, [cx, cy], [0, 0]])
        if (!cellAt(cx + 1, cy)) sides.push([cx + 1, cy, [cx + 1, cy + 1], [0, 0]])
        for (const [acx, acy, [bcx, bcy]] of sides) {
          const hA = hAt(acx, acy) + ROOF_TH
          const hB = hAt(bcx, bcy) + ROOF_TH
          edge(fascia, null, cwx(acx), cwy(acy), cwx(bcx), cwy(bcy), hA, hB, hA - FASCIA, hB - FASCIA)
        }
      }
      // gable skirt: edges of the ORIGINAL footprint that sit above the wall top
      if (covered[i]) {
        const sides: [number, number, number, number][] = []
        if (!origAt(cx, cy - 1)) sides.push([cx, cy, cx + 1, cy])
        if (!origAt(cx, cy + 1)) sides.push([cx + 1, cy + 1, cx, cy + 1])
        if (!origAt(cx - 1, cy)) sides.push([cx, cy + 1, cx, cy])
        if (!origAt(cx + 1, cy)) sides.push([cx + 1, cy, cx + 1, cy + 1])
        for (const [acx, acy, bcx, bcy] of sides) {
          const hA = hAt(acx, acy)
          const hB = hAt(bcx, bcy)
          if (hA - baseY < 4 && hB - baseY < 4) continue
          edge(skirt, skirtUv, cwx(acx), cwy(acy), cwx(bcx), cwy(bcy), hA + ROOF_TH - 1, hB + ROOF_TH - 1, baseY - 1, baseY - 1)
        }
      }
      // soffit: overhang ring underside
      if (dilated[i] && !covered[i]) {
        const xA = cwx(cx)
        const xB = cwx(cx + 1)
        const zA = cwy(cy)
        const zB = cwy(cy + 1)
        tri(soffit, null, [xA, baseY, zA], [xB, baseY, zA], [xB, baseY, zB])
        tri(soffit, null, [xA, baseY, zA], [xB, baseY, zB], [xA, baseY, zB])
      }
    }
  }

  const addMesh = (
    pos: number[],
    uv: number[] | null,
    material: THREE.Material,
    doubleSide = false
  ) => {
    if (!pos.length) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    if (uv && uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, material)
    m.castShadow = true
    m.receiveShadow = true
    if (doubleSide && 'side' in material) (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    group.add(m)
  }

  const trimMat = tintedMaterial(mats.gable?.trim ?? '#f5f3ee', 0.85)
  const gableMat = mats.gable
    ? sidingMaterial(mats.gable.type, mats.gable.color, true)
    : new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.92, side: THREE.DoubleSide })

  addMesh(top, topUv, roofMat, true)
  addMesh(fascia, null, trimMat, true)
  addMesh(skirt, skirtUv, gableMat, true)
  addMesh(soffit, null, trimMat, true)
  return true
}

/** Bounding box of a wall set (for legacy fallback callers). */
export function wallsBBox(walls: Wall[]): { x0: number; z0: number; x1: number; z1: number } | null {
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (const w of walls)
    for (const p of [w.a, w.b] as Pt[]) {
      x0 = Math.min(x0, p.x)
      z0 = Math.min(z0, p.y)
      x1 = Math.max(x1, p.x)
      z1 = Math.max(z1, p.y)
    }
  return x1 > x0 && z1 > z0 ? { x0, z0, x1, z1 } : null
}
