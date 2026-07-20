// Terrain heightfield from AWS Terrain Tiles (Mapzen terrarium encoding, public S3, CORS-open).
// elevation_m = (R * 256 + G + B / 256) - 32768

import type { GeoAnchor, TerrainGrid } from '../model/types'
import { latToTileY, lngToTileX, makeProjection, tileRange, type LngLatBounds } from './geo'

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const TILE = 256
const IN_PER_M = 39.3701

interface TilePixels {
  x: number
  y: number
  data: Uint8ClampedArray
}

async function fetchTile(z: number, x: number, y: number): Promise<TilePixels | null> {
  try {
    const res = await fetch(TILE_URL(z, x, y), { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    const cv = document.createElement('canvas')
    cv.width = TILE
    cv.height = TILE
    const ctx = cv.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    return { x, y, data: ctx.getImageData(0, 0, TILE, TILE).data }
  } catch {
    return null
  }
}

/**
 * Sample a terrain grid over the plot. `anchor` is the plot's NW corner;
 * plotW/plotD in inches. Returns null if tiles can't be fetched or the ground is flat.
 */
export async function fetchTerrain(
  anchor: GeoAnchor,
  plotW: number,
  plotD: number,
  bounds: LngLatBounds
): Promise<TerrainGrid | null> {
  // ~10 ft cells, clamped so the grid stays light
  const cell = Math.max(60, Math.min(240, Math.ceil(Math.max(plotW, plotD) / 80 / 12) * 12))
  const w = Math.max(8, Math.round(plotW / cell))
  const h = Math.max(8, Math.round(plotD / cell))

  const z = 15
  const r = tileRange(bounds, z)
  const tiles = new Map<string, TilePixels>()
  const jobs: Promise<void>[] = []
  for (let tx = r.x0 - 1; tx <= r.x1 + 1; tx++)
    for (let ty = r.y0 - 1; ty <= r.y1 + 1; ty++)
      jobs.push(
        fetchTile(z, tx, ty).then((t) => {
          if (t) tiles.set(`${tx},${ty}`, t)
        })
      )
  await Promise.all(jobs)
  if (!tiles.size) return null

  const proj = makeProjection(anchor)
  const sample = (lng: number, lat: number): number => {
    const fx = lngToTileX(lng, z) * TILE
    const fy = latToTileY(lat, z) * TILE
    // bilinear over the mosaic
    const x0 = Math.floor(fx - 0.5)
    const y0 = Math.floor(fy - 0.5)
    const dx = fx - 0.5 - x0
    const dy = fy - 0.5 - y0
    const at = (px: number, py: number): number => {
      const t = tiles.get(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`)
      if (!t) return NaN
      const ix = ((px % TILE) + TILE) % TILE
      const iy = ((py % TILE) + TILE) % TILE
      const o = (iy * TILE + ix) * 4
      return t.data[o] * 256 + t.data[o + 1] + t.data[o + 2] / 256 - 32768
    }
    const v00 = at(x0, y0)
    const v10 = at(x0 + 1, y0)
    const v01 = at(x0, y0 + 1)
    const v11 = at(x0 + 1, y0 + 1)
    if ([v00, v10, v01, v11].some(Number.isNaN)) {
      const v = [v00, v10, v01, v11].find((n) => !Number.isNaN(n))
      return v ?? 0
    }
    return v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy
  }

  const elev = new Array<number>((w + 1) * (h + 1))
  let min = Infinity
  let max = -Infinity
  for (let j = 0; j <= h; j++)
    for (let i = 0; i <= w; i++) {
      const [lng, lat] = proj.toLngLat((i * plotW) / w, (j * plotD) / h)
      const m = sample(lng, lat)
      const inches = m * IN_PER_M
      elev[j * (w + 1) + i] = inches
      min = Math.min(min, inches)
      max = Math.max(max, inches)
    }
  if (!Number.isFinite(min)) return null
  for (let k = 0; k < elev.length; k++) elev[k] = Math.round((elev[k] - min) * 10) / 10
  // effectively flat ground: skip the heightfield entirely
  if (max - min < 12) return null
  return { cell: Math.round(plotW / w), w, h, elev }
}
