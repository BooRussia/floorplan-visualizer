// Geographic helpers for site import. Plot-local coords are inches, +x east, +y south,
// with (0,0) at the plot's NW corner (matching the 2D editor's screen orientation).

import type { GeoAnchor, Pt } from '../model/types'

const M_PER_DEG_LAT = 111132
const IN_PER_M = 39.3701

export interface GeoProjection {
  anchor: GeoAnchor
  /** [lng, lat] -> plot inches */
  toLocal: (lng: number, lat: number) => Pt
  /** plot inches -> [lng, lat] */
  toLngLat: (x: number, y: number) => [number, number]
}

/** Equirectangular projection around the anchor — accurate to well under 1% at parcel scale. */
export function makeProjection(anchor: GeoAnchor): GeoProjection {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180)
  return {
    anchor,
    toLocal: (lng, lat) => ({
      x: (lng - anchor.lon) * mPerDegLon * IN_PER_M,
      y: (anchor.lat - lat) * M_PER_DEG_LAT * IN_PER_M,
    }),
    toLngLat: (x, y) => [
      anchor.lon + x / IN_PER_M / mPerDegLon,
      anchor.lat - y / IN_PER_M / M_PER_DEG_LAT,
    ],
  }
}

export interface LngLatBounds {
  w: number
  s: number
  e: number
  n: number
}

export function ringsBounds(rings: [number, number][][]): LngLatBounds {
  const b = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity }
  for (const ring of rings)
    for (const [lng, lat] of ring) {
      b.w = Math.min(b.w, lng)
      b.e = Math.max(b.e, lng)
      b.s = Math.min(b.s, lat)
      b.n = Math.max(b.n, lat)
    }
  return b
}

// ---------- slippy-map tile math ----------

export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

/** Integer tile range covering a bounds at zoom z. */
export function tileRange(b: LngLatBounds, z: number) {
  return {
    x0: Math.floor(lngToTileX(b.w, z)),
    x1: Math.floor(lngToTileX(b.e, z)),
    y0: Math.floor(latToTileY(b.n, z)),
    y1: Math.floor(latToTileY(b.s, z)),
  }
}

/** Point-in-ring test in lng/lat space. */
export function lngLatInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[j]
    if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

/** Shoelace area of a lng/lat ring in square meters (approximate, equirectangular). */
export function ringAreaSqMeters(ring: [number, number][]): number {
  if (ring.length < 3) return 0
  const lat0 = ring[0][1]
  const mLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * mLon * (y2 * M_PER_DEG_LAT) - x2 * mLon * (y1 * M_PER_DEG_LAT)
  }
  return Math.abs(a / 2)
}
