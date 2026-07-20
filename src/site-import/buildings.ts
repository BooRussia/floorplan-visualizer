// Existing-building footprints from the Overture Maps buildings PMTiles archive
// (public S3, CORS + HTTP-Range verified). Footprints inside the selected parcels
// become Building shells with walls traced along the real outline.

import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { emptyFloor, uid, type Building, type Pt, type Wall } from '../model/types'
import { polygonArea, simplifyRing } from '../model/geometry'
import { lngLatInRing, tileRange, type GeoProjection, type LngLatBounds } from './geo'

const OVERTURE_PMTILES =
  'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-06-17.0/buildings.pmtiles'

const IN_PER_M = 39.3701

export interface FootprintHit {
  /** outer ring [lng, lat][] */
  ring: [number, number][]
  heightIn?: number
  name?: string
}

/** Fetch Overture building footprints whose centroid falls inside any of the given parcel rings. */
export async function fetchFootprints(
  bounds: LngLatBounds,
  parcelRings: [number, number][][]
): Promise<FootprintHit[]> {
  const pm = new PMTiles(OVERTURE_PMTILES)
  const header = await pm.getHeader()
  const z = Math.min(header.maxZoom, 14)
  const r = tileRange(bounds, z)
  const out: FootprintHit[] = []
  const seen = new Set<string>()

  for (let tx = r.x0; tx <= r.x1; tx++) {
    for (let ty = r.y0; ty <= r.y1; ty++) {
      let buf
      try {
        buf = await pm.getZxy(z, tx, ty)
      } catch {
        continue
      }
      if (!buf?.data) continue
      const vt = new VectorTile(new PbfReader(buf.data))
      for (const layerName of Object.keys(vt.layers)) {
        const layer = vt.layers[layerName]
        for (let i = 0; i < layer.length; i++) {
          const feat = layer.feature(i)
          if (feat.type !== 3) continue // polygons only
          const gj = feat.toGeoJSON(tx, ty, z)
          const polys: [number, number][][] =
            gj.geometry.type === 'Polygon'
              ? [gj.geometry.coordinates[0] as [number, number][]]
              : gj.geometry.type === 'MultiPolygon'
                ? (gj.geometry.coordinates.map((p: any) => p[0]) as [number, number][][])
                : []
          for (const ring of polys) {
            if (!ring || ring.length < 4) continue
            let cx = 0
            let cy = 0
            for (const [lng, lat] of ring) {
              cx += lng
              cy += lat
            }
            cx /= ring.length
            cy /= ring.length
            if (!parcelRings.some((pr) => lngLatInRing(cx, cy, pr))) continue
            const key = `${cx.toFixed(6)},${cy.toFixed(6)}`
            if (seen.has(key)) continue
            seen.add(key)
            const props: any = gj.properties ?? {}
            const hM =
              typeof props.height === 'number'
                ? props.height
                : typeof props.num_floors === 'number'
                  ? props.num_floors * 3.2
                  : undefined
            out.push({
              ring,
              heightIn: hM ? hM * IN_PER_M : undefined,
              name: typeof props.subtype === 'string' ? props.subtype : undefined,
            })
          }
        }
      }
    }
  }
  return out
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Convert footprints into Building shells (walls in building-local inches). */
export function footprintsToBuildings(
  hits: FootprintHit[],
  proj: GeoProjection,
  startIndex: number
): Building[] {
  const buildings: Building[] = []
  const byArea = hits
    .map((hit) => {
      const local = hit.ring.map(([lng, lat]) => proj.toLocal(lng, lat))
      const ring = simplifyRing(local, 6)
      return { hit, ring, area: Math.abs(polygonArea(ring)) }
    })
    .filter((x) => x.ring.length >= 3 && x.area >= 60 * 144) // ignore < 60 sq ft
    .sort((a, b) => b.area - a.area)

  for (const { hit, ring } of byArea) {
    const minX = Math.min(...ring.map((p) => p.x))
    const minY = Math.min(...ring.map((p) => p.y))
    const localRing: Pt[] = ring.map((p) => ({
      x: Math.round((p.x - minX) * 2) / 2,
      y: Math.round((p.y - minY) * 2) / 2,
    }))
    const wallH = Math.max(96, Math.min(360, Math.round(hit.heightIn ?? 120)))
    const walls: Wall[] = localRing.map((p, i) => ({
      id: uid('wall'),
      a: p,
      b: localRing[(i + 1) % localRing.length],
      thickness: 6,
      bulge: 0,
      height: wallH,
    }))
    const floor = { ...emptyFloor(1), height: wallH, walls }
    const n = startIndex + buildings.length + 1
    buildings.push({
      id: uid('bldg'),
      name: hit.name && hit.name !== 'building' ? titleCase(hit.name) : `Building ${n}`,
      x: Math.round(minX),
      y: Math.round(minY),
      rot: 0,
      floors: [floor],
      roof: { style: 'gable', pitch: 4, material: 'shingles', ridge: 'auto' },
    })
  }
  return buildings
}
