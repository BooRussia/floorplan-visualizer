// Public parcel-boundary services, queried straight from the browser.
// Every endpoint here was live-verified (HTTP 200 + CORS + real parcel polygon) July 2026.

export interface ParcelSource {
  id: string
  name: string
  /** ArcGIS layer query endpoint (…/MapServer/N/query or …/FeatureServer/N/query) */
  url: string
  /** lng/lat coverage box [w, s, e, n] */
  bbox: [number, number, number, number]
}

export const PARCEL_SOURCES: ParcelSource[] = [
  {
    id: 'wa',
    name: 'Washington statewide parcels',
    url: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0/query',
    bbox: [-124.9, 45.5, -116.9, 49.1],
  },
  {
    id: 'mt',
    name: 'Montana statewide cadastral',
    url: 'https://gisservicemt.gov/arcgis/rest/services/MSDI_Framework/Parcels/MapServer/0/query',
    bbox: [-116.1, 44.3, -104.0, 49.1],
  },
  {
    id: 'fl',
    name: 'Florida statewide cadastral',
    url: 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query',
    bbox: [-87.7, 24.4, -79.9, 31.1],
  },
  {
    id: 'ny',
    name: 'New York statewide tax parcels',
    url: 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1/query',
    bbox: [-79.8, 40.4, -71.8, 45.1],
  },
  {
    id: 'maricopa-az',
    name: 'Maricopa County, AZ parcels',
    url: 'https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer/1/query',
    bbox: [-113.4, 32.4, -111.0, 34.1],
  },
]

export interface ParcelHit {
  /** stable identity for select/deselect */
  key: string
  /** outer rings as [lng, lat][] */
  rings: [number, number][][]
  label: string
}

const covers = (s: ParcelSource, lng: number, lat: number) =>
  lng >= s.bbox[0] && lng <= s.bbox[2] && lat >= s.bbox[1] && lat <= s.bbox[3]

/** Extract outer rings from a GeoJSON Polygon/MultiPolygon geometry. */
function outerRings(geom: any): [number, number][][] {
  if (!geom) return []
  if (geom.type === 'Polygon') return geom.coordinates.length ? [geom.coordinates[0]] : []
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p: any) => p[0]).filter(Boolean)
  return []
}

function labelFrom(props: Record<string, any> | null | undefined): string {
  if (!props) return 'Parcel'
  for (const k of Object.keys(props)) {
    const lk = k.toLowerCase()
    if (/(^|_)(apn|pin|parcel_?id|parcelid|print_key|taxparcel|parcel_no|geocode)($|_)/.test(lk)) {
      const v = props[k]
      if (v != null && `${v}`.trim()) return `${v}`
    }
  }
  return 'Parcel'
}

/**
 * Point-lookup a parcel. Uses a tiny envelope rather than a point geometry —
 * live testing showed some servers (NY) return nothing for point intersects.
 */
export async function queryParcelAt(
  lng: number,
  lat: number,
  opts?: { customUrl?: string; regridToken?: string }
): Promise<ParcelHit | null> {
  const eps = 0.00004
  const candidates: { url: string; name: string }[] = []
  if (opts?.customUrl) candidates.push({ url: opts.customUrl.replace(/\/query\/?$/, '') + '/query', name: 'custom' })
  for (const s of PARCEL_SOURCES) if (covers(s, lng, lat)) candidates.push({ url: s.url, name: s.name })

  for (const c of candidates) {
    try {
      const params = new URLSearchParams({
        geometry: `${lng - eps},${lat - eps},${lng + eps},${lat + eps}`,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'geojson',
      })
      const res = await fetch(`${c.url}?${params}`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const data = await res.json()
      const feats: any[] = data?.features ?? []
      // prefer the feature actually containing the click
      const pick =
        feats.find((f) => outerRings(f.geometry).some((r) => ringContains(r, lng, lat))) ?? feats[0]
      if (!pick) continue
      const rings = outerRings(pick.geometry)
      if (!rings.length) continue
      return { key: ringKey(rings), rings, label: labelFrom(pick.properties) }
    } catch {
      /* try the next source */
    }
  }

  if (opts?.regridToken) {
    try {
      const u = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lng}&return_geometry=true&token=${encodeURIComponent(opts.regridToken)}`
      const res = await fetch(u, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const data = await res.json()
        const feats: any[] = data?.parcels?.features ?? data?.features ?? []
        if (feats.length) {
          const rings = outerRings(feats[0].geometry)
          if (rings.length)
            return {
              key: ringKey(rings),
              rings,
              label: feats[0].properties?.fields?.parcelnumb ?? labelFrom(feats[0].properties) ?? 'Parcel',
            }
        }
      }
    } catch {
      /* fall through */
    }
  }
  return null
}

function ringContains(ring: [number, number][], lng: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[j]
    if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

const ringKey = (rings: [number, number][][]) => {
  const r = rings[0]
  const [lng, lat] = r[0]
  return `${lng.toFixed(6)},${lat.toFixed(6)},${r.length}`
}

/** Whether any shipped source covers this location (drives the UI hint). */
export function hasParcelCoverage(lng: number, lat: number): boolean {
  return PARCEL_SOURCES.some((s) => covers(s, lng, lat))
}
