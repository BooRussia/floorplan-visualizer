// Heightfield ground for plots with imported terrain, plus the ground sampler used
// to sit buildings, fences, roads, and landscaping at grade.

import * as THREE from 'three'
import type { Pt, TerrainGrid } from '../model/types'
import { getGrassTexture } from './materials'

export type GroundSampler = (x: number, z: number) => number

export interface BuildingPad {
  x0: number
  z0: number
  x1: number
  z1: number
  y: number
}

/** Raw bilinear sample of the terrain grid (no pads). */
export function rawSampler(terrain: TerrainGrid | undefined, plotW: number, plotD: number): GroundSampler {
  if (!terrain) return () => 0
  const { w, h, elev } = terrain
  return (x, z) => {
    const fx = Math.min(w - 1e-6, Math.max(0, (x / plotW) * w))
    const fz = Math.min(h - 1e-6, Math.max(0, (z / plotD) * h))
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const dx = fx - i
    const dz = fz - j
    const at = (ii: number, jj: number) => elev[jj * (w + 1) + ii]
    return (
      at(i, j) * (1 - dx) * (1 - dz) +
      at(i + 1, j) * dx * (1 - dz) +
      at(i, j + 1) * (1 - dx) * dz +
      at(i + 1, j + 1) * dx * dz
    )
  }
}

/** Sampler with flat building pads blended into the surrounding grade over a fringe. */
export function padSampler(raw: GroundSampler, pads: BuildingPad[]): GroundSampler {
  if (!pads.length) return raw
  const FRINGE = 90 // inches of blend around each pad
  return (x, z) => {
    let y = raw(x, z)
    for (const p of pads) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1)
      const dz = Math.max(p.z0 - z, 0, z - p.z1)
      const d = Math.max(dx, dz)
      if (d >= FRINGE) continue
      const t = 1 - d / FRINGE // 1 inside the pad, 0 at fringe edge
      y = y * (1 - t) + p.y * t
    }
    return y
  }
}

/** Displaced grass heightfield with a dirt skirt down to y = -6. */
export function buildTerrainMesh(
  sampler: GroundSampler,
  plotW: number,
  plotD: number,
  detail: number
): THREE.Group {
  const group = new THREE.Group()
  const segX = Math.min(240, Math.max(40, detail))
  const segZ = Math.min(240, Math.max(40, Math.round((detail * plotD) / plotW)))

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = (i / segX) * plotW
      const z = (j / segZ) * plotD
      positions.push(x, sampler(x, z), z)
      uvs.push(x / 120, z / 120)
    }
  }
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i
      const b = a + 1
      const c = a + segX + 1
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const tex = getGrassTexture()
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  const ground = new THREE.Mesh(geo, mat)
  ground.receiveShadow = true
  group.add(ground)

  // dirt skirt around the perimeter down to below grade
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#7d6a52', roughness: 1 })
  const sp: number[] = []
  const si: number[] = []
  const edge: [number, number][] = []
  for (let i = 0; i <= segX; i++) edge.push([(i / segX) * plotW, 0])
  for (let j = 1; j <= segZ; j++) edge.push([plotW, (j / segZ) * plotD])
  for (let i = segX - 1; i >= 0; i--) edge.push([(i / segX) * plotW, plotD])
  for (let j = segZ - 1; j >= 0; j--) edge.push([0, (j / segZ) * plotD])
  for (let k = 0; k < edge.length; k++) {
    const [x, z] = edge[k]
    sp.push(x, sampler(x, z), z, x, -6, z)
    const n = ((k + 1) % edge.length) * 2
    const c = k * 2
    si.push(c, c + 1, n, n, c + 1, n + 1)
  }
  const sgeo = new THREE.BufferGeometry()
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
  sgeo.setIndex(si)
  sgeo.computeVertexNormals()
  const skirt = new THREE.Mesh(sgeo, skirtMat)
  skirt.material.side = THREE.DoubleSide
  group.add(skirt)
  return group
}

/** Dashed property-boundary line draped on the ground. */
export function buildBoundaryLines(
  rings: Pt[][],
  sampler: GroundSampler,
  color = 0xf59e0b
): THREE.Group {
  const group = new THREE.Group()
  for (const ring of rings) {
    if (ring.length < 3) continue
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 60))
      for (let s = 0; s < steps; s++) {
        const t = s / steps
        const x = a.x + (b.x - a.x) * t
        const z = a.y + (b.y - a.y) * t
        pts.push(new THREE.Vector3(x, sampler(x, z) + 2, z))
      }
    }
    pts.push(pts[0].clone())
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color, dashSize: 14, gapSize: 8, linewidth: 2 })
    )
    line.computeLineDistances()
    group.add(line)
  }
  return group
}
