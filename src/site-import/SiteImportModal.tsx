import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../model/store'
import { simplifyRing } from '../model/geometry'
import type { Pt } from '../model/types'
import { makeProjection, ringsBounds, ringAreaSqMeters } from './geo'
import { hasParcelCoverage, queryParcelAt, type ParcelHit } from './parcelSources'
import { fetchTerrain } from './terrain'
import { fetchFootprints, footprintsToBuildings } from './buildings'

const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR =
  'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
const SQM_PER_ACRE = 4046.86
const MARGIN_FT = 20

type Mode = 'parcel' | 'trace'

export default function SiteImportModal({ onClose }: { onClose: () => void }) {
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mode, setMode] = useState<Mode>('parcel')
  const [parcels, setParcels] = useState<ParcelHit[]>([])
  const [trace, setTrace] = useState<[number, number][]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [wantTerrain, setWantTerrain] = useState(true)
  const [wantBuildings, setWantBuildings] = useState(true)
  const [regridToken, setRegridToken] = useState(() => localStorage.getItem('fv-regrid-token') ?? '')
  const [customUrl, setCustomUrl] = useState(() => localStorage.getItem('fv-parcel-url') ?? '')
  // maplibre event handlers see the initial render's state — mirror what they need
  const live = useRef({ mode, parcels, trace, regridToken, customUrl, busy })
  live.current = { mode, parcels, trace, regridToken, customUrl, busy }

  useEffect(() => {
    if (!mapDiv.current) return
    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: {
        version: 8,
        sources: {
          esri: { type: 'raster', tiles: [ESRI_TILES], tileSize: 256, attribution: ESRI_ATTR, maxzoom: 19 },
        },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      },
      center: [-98.5, 39.8],
      zoom: 4,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.doubleClickZoom.disable()
    map.on('load', () => {
      map.addSource('sel', { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sel-fill',
        type: 'fill',
        source: 'sel',
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.25 },
      })
      map.addLayer({
        id: 'sel-line',
        type: 'line',
        source: 'sel',
        paint: { 'line-color': '#38bdf8', 'line-width': 2.5 },
      })
      map.addSource('trace', { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'trace-fill',
        type: 'fill',
        source: 'trace',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'trace-line',
        type: 'line',
        source: 'trace',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      })
      map.addLayer({
        id: 'trace-pts',
        type: 'circle',
        source: 'trace',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 4.5, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      })
    })
    map.on('click', (e) => {
      const s = live.current
      if (s.busy) return
      if (s.mode === 'trace') {
        setTrace((t) => [...t, [e.lngLat.lng, e.lngLat.lat]])
        return
      }
      void pickParcel(e.lngLat.lng, e.lngLat.lat)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // reflect selections onto the map
  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource('sel') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'FeatureCollection',
      features: parcels.map((p) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [p.rings[0]] },
      })),
    } as any)
  }, [parcels])
  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource('trace') as maplibregl.GeoJSONSource | undefined
    const feats: any[] = trace.map(([lng, lat]) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lng, lat] },
    }))
    if (trace.length >= 3)
      feats.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...trace, trace[0]]] },
      })
    src?.setData({ type: 'FeatureCollection', features: feats } as any)
  }, [trace])

  const pickParcel = async (lng: number, lat: number) => {
    const s = live.current
    // clicking a selected parcel deselects it
    const hitSel = s.parcels.find((p) =>
      p.rings.some((r) => {
        let inside = false
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [ax, ay] = r[i]
          const [bx, by] = r[j]
          if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside
        }
        return inside
      })
    )
    if (hitSel) {
      setParcels((ps) => ps.filter((p) => p.key !== hitSel.key))
      return
    }
    setBusy('Looking up parcel…')
    setNote(null)
    const hit = await queryParcelAt(lng, lat, {
      customUrl: s.customUrl || undefined,
      regridToken: s.regridToken || undefined,
    })
    setBusy(null)
    if (hit) {
      setParcels((ps) => (ps.some((p) => p.key === hit.key) ? ps : [...ps, hit]))
    } else {
      setNote(
        hasParcelCoverage(lng, lat) || s.customUrl || s.regridToken
          ? 'No parcel found at that point — try clicking inside the lot lines.'
          : 'No free parcel service covers this area yet. Switch to Trace mode and click the property corners, or paste a county ArcGIS parcel URL / Regrid token below.'
      )
    }
  }

  const doSearch = async () => {
    if (!search.trim()) return
    setBusy('Searching…')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`,
        { signal: AbortSignal.timeout(15000) }
      )
      const data = await res.json()
      if (data?.[0]) {
        mapRef.current?.flyTo({ center: [+data[0].lon, +data[0].lat], zoom: 17 })
        setNote(null)
      } else setNote('Address not found — try a simpler search.')
    } catch {
      setNote('Address search failed — pan and zoom to the property instead.')
    }
    setBusy(null)
  }

  const rings: [number, number][][] = [
    ...parcels.flatMap((p) => p.rings),
    ...(trace.length >= 3 ? [trace] : []),
  ]
  const acres = rings.reduce((a, r) => a + ringAreaSqMeters(r), 0) / SQM_PER_ACRE

  const generate = async () => {
    if (!rings.length) return
    const st = useStore.getState()
    try {
      setBusy('Projecting boundary…')
      const bounds = ringsBounds(rings)
      const pre = makeProjection({ lat: bounds.n, lon: bounds.w })
      const margin = MARGIN_FT * 12
      const anchor = (() => {
        const [lon, lat] = pre.toLngLat(-margin, -margin)
        return { lat, lon }
      })()
      const proj = makeProjection(anchor)
      const boundary: Pt[][] = rings.map((r) =>
        simplifyRing(
          r.map(([lng, lat]) => proj.toLocal(lng, lat)),
          2
        )
      )
      let maxX = 0
      let maxY = 0
      for (const ring of boundary)
        for (const p of ring) {
          maxX = Math.max(maxX, p.x)
          maxY = Math.max(maxY, p.y)
        }
      const plotW = Math.ceil(maxX + margin)
      const plotD = Math.ceil(maxY + margin)
      const fullBounds = {
        w: anchor.lon,
        n: anchor.lat,
        e: proj.toLngLat(plotW, plotD)[0],
        s: proj.toLngLat(plotW, plotD)[1],
      }

      let terrain
      if (wantTerrain) {
        setBusy('Fetching terrain elevation…')
        terrain = (await fetchTerrain(anchor, plotW, plotD, fullBounds)) ?? undefined
      }

      let buildings
      if (wantBuildings) {
        setBusy('Reading building footprints…')
        try {
          const hits = await fetchFootprints(fullBounds, rings)
          buildings = footprintsToBuildings(hits, proj, st.project.buildings.length)
          if (!buildings.length) buildings = undefined
        } catch {
          setNote('Building footprints unavailable right now — plot imported without them.')
        }
      }

      st.importSite({ plotW, plotD, boundary, geo: anchor, terrain, buildings })
      onClose()
    } catch (err) {
      setBusy(null)
      setNote(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
  }

  return (
    <div className="site-import-scrim">
      <div className="site-import">
        <div className="site-import-head">
          <b>Import site from map</b>
          <div className="site-import-search">
            <input
              placeholder="Search address or place…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void doSearch()
              }}
            />
            <button className="mini-btn" onClick={() => void doSearch()}>
              Go
            </button>
          </div>
          <div className="site-import-modes">
            <button className={`mini-btn ${mode === 'parcel' ? 'active' : ''}`} onClick={() => setMode('parcel')}>
              Click parcels
            </button>
            <button className={`mini-btn ${mode === 'trace' ? 'active' : ''}`} onClick={() => setMode('trace')}>
              Trace boundary
            </button>
          </div>
          <button className="mini-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="site-import-map" ref={mapDiv} />

        <div className="site-import-foot">
          <div className="site-import-status">
            {busy ?? note ?? (
              <>
                {mode === 'parcel'
                  ? 'Zoom to the property and click it — click more parcels to add them, click again to remove.'
                  : 'Click the property corners in order.'}{' '}
                {parcels.length > 0 && (
                  <b>
                    {parcels.length} parcel{parcels.length > 1 ? 's' : ''}
                  </b>
                )}
                {trace.length >= 3 && <b> · traced shape</b>}
                {acres > 0 && <b> · {acres >= 0.2 ? `${acres.toFixed(2)} acres` : `${Math.round(acres * 43560)} sq ft`}</b>}
              </>
            )}
          </div>
          {mode === 'trace' && trace.length > 0 && (
            <>
              <button className="mini-btn" onClick={() => setTrace((t) => t.slice(0, -1))}>
                Undo point
              </button>
              <button className="mini-btn" onClick={() => setTrace([])}>
                Clear
              </button>
            </>
          )}
          <label className="site-import-opt">
            <input type="checkbox" checked={wantTerrain} onChange={(e) => setWantTerrain(e.target.checked)} />
            Terrain
          </label>
          <label className="site-import-opt">
            <input type="checkbox" checked={wantBuildings} onChange={(e) => setWantBuildings(e.target.checked)} />
            Existing buildings
          </label>
          <button className="box-dialog-create" disabled={!rings.length || !!busy} onClick={() => void generate()}>
            {busy ? 'Working…' : 'Generate plot'}
          </button>
        </div>

        <details className="site-import-advanced">
          <summary>Parcel data options</summary>
          <div className="prop-row">
            <input
              placeholder="County ArcGIS parcel layer URL (…/MapServer/0)"
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value)
                localStorage.setItem('fv-parcel-url', e.target.value)
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="prop-row">
            <input
              placeholder="Regrid API token (optional, nationwide coverage)"
              value={regridToken}
              onChange={(e) => {
                setRegridToken(e.target.value)
                localStorage.setItem('fv-regrid-token', e.target.value)
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <p className="props-tip">
            Free parcel lookups are built in for WA, MT, FL, NY and Maricopa County AZ. Anywhere else,
            trace the boundary yourself or plug in your county's public ArcGIS parcel service.
          </p>
        </details>
      </div>
    </div>
  )
}

const emptyFC = () => ({ type: 'FeatureCollection', features: [] }) as any
