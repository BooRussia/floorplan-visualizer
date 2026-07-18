import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { floorFor, useActiveFloor, useStore } from '../model/store'
import type { FenceType, Floor, FloorMaterial, Pt, Road, RoadNode, Wall } from '../model/types'
import {
  add,
  closestOnWall,
  dist,
  fmtLenShort,
  guideRays,
  norm,
  parseLen,
  perp,
  planBounds,
  roadPathD,
  rotatePt,
  scale,
  snapAngle,
  snapPoint,
  snapTo,
  sub,
  toLocal,
  wallLength,
  wallPointAt,
  wallTangentAt,
} from '../model/geometry'
import { catalogItem } from '../model/catalog'
import { Glyph } from './glyphs'
import { ACCENT, BG, OpeningGlyph, OpeningHit, WallDim, WallShape, wallPathD } from './planRender'

const WALL_THICKNESS = 5
const MEASURE_COLOR = '#0e9488'
const PLOT_LINE = 'var(--plot-line)'

export const FENCE_HEIGHTS: Record<FenceType, number> = {
  privacy: 72,
  picket: 48,
  chain: 60,
  rail: 40,
}

export const ROAD_COLORS: Record<string, { fill: string; dash: string }> = {
  asphalt: { fill: '#b7b9bd', dash: '#f6f6f4' },
  concrete: { fill: '#dddddb', dash: '#b9b9b5' },
  gravel: { fill: '#d9d5cb', dash: '#b9b3a5' },
  pavers: { fill: '#ddd2be', dash: '#bfb29a' },
}

export const PAINT_COLORS: Record<FloorMaterial, string> = {
  wood: '#c89b66',
  tile: '#9fb6bd',
  carpet: '#b6a9c9',
  concrete: '#a8a8ab',
  stone: '#8f8878',
}

const OPENING_DEFAULTS: Record<string, number> = {
  door: 32,
  'double-door': 60,
  sliding: 72,
  bifold: 48,
  opening: 42,
  window: 36,
  garage: 192, // 16' double garage door
}

interface Viewport {
  cx: number
  cy: number
  ppi: number // pixels per inch
}

type EndKey = 'a' | 'b'
interface ClusterRef {
  wallId: string
  end: EndKey
}

interface SnapMark {
  p: Pt
  /** distances along a wall from its two ends, when snapped onto a wall line */
  along?: { d0: number; d1: number }
}

type Drag =
  | { mode: 'pan'; startClient: Pt; startView: Viewport }
  | { mode: 'wall-end'; wallId: string; end: EndKey; cluster: ClusterRef[] }
  | {
      mode: 'wall-move'
      wallId: string
      startWorld: Pt
      origA: Pt
      origB: Pt
      clusterA: ClusterRef[]
      clusterB: ClusterRef[]
    }
  | { mode: 'bulge'; wallId: string }
  | { mode: 'furn-move'; id: string; offset: Pt; moved: boolean }
  | { mode: 'furn-rotate'; id: string }
  | { mode: 'furn-resize'; id: string; corner: Pt; orig: { x: number; y: number; w: number; d: number; rot: number } }
  | { mode: 'opening-move'; id: string }
  | { mode: 'label-move'; id: string; offset: Pt }
  | { mode: 'guide-move'; id: string }
  | { mode: 'paint-move'; id: string }
  | { mode: 'building-move'; id: string; offset: Pt }
  | { mode: 'road-move'; id: string; startWorld: Pt; origNodes: RoadNode[] }
  | { mode: 'road-node'; id: string; index: number }
  | { mode: 'road-handle'; id: string; index: number; sign: 1 | -1 }

type FloatInput =
  | { kind: 'wall-len'; wallId: string }
  | { kind: 'label'; id: string }

/** Active floor from the store, for use inside event handlers. */
const fl = (): Floor => floorFor(useStore.getState())

export default function Editor2D() {
  const floor = useActiveFloor()
  const mode = useStore((s) => s.mode)
  const plotW = useStore((s) => s.project.plotW)
  const plotD = useStore((s) => s.project.plotD)
  const buildings = useStore((s) => s.project.buildings)
  const activeFloor = useStore((s) => s.activeFloor)
  const below = useStore((s) =>
    s.mode.scope === 'building' && s.activeFloor > 0
      ? s.project.buildings[s.mode.index].floors[s.activeFloor - 1]
      : null
  )
  const tool = useStore((s) => s.tool)
  const selection = useStore((s) => s.selection)
  const showDims = useStore((s) => s.showDims)
  const isPlot = mode.scope === 'plot'

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<Viewport>({ cx: 0, cy: 0, ppi: 1.4 })
  const viewRef = useRef(view)
  viewRef.current = view
  const sizeRef = useRef(size)
  sizeRef.current = size

  const dragRef = useRef<Drag | null>(null)
  const [draft, setDraftRaw] = useState<{ pts: Pt[]; cur: Pt | null } | null>(null)
  const [snapMark, setSnapMark] = useState<SnapMark | null>(null)
  const setDraft = useCallback((d: { pts: Pt[]; cur: Pt | null } | null) => {
    setDraftRaw(d)
    if (!d) setSnapMark(null)
  }, [])
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [hoverWorld, setHoverWorld] = useState<Pt | null>(null)
  const [openingGhost, setOpeningGhost] = useState<{ wallId: string; t: number } | null>(null)
  const [roadDraft, setRoadDraft] = useState<{ nodes: RoadNode[]; cur: Pt | null } | null>(null)
  const roadDraftRef = useRef(roadDraft)
  roadDraftRef.current = roadDraft
  const penDragRef = useRef(false)
  const roadStyleRef = useRef<{ width: number; material: Road['material'] }>({
    width: 144,
    material: 'asphalt',
  })
  const [floatInput, setFloatInput] = useState<FloatInput | null>(null)
  const [floatValue, setFloatValue] = useState('')
  const [spaceDown, setSpaceDown] = useState(false)
  const drawInputRef = useRef<HTMLInputElement>(null)
  const [drawValue, setDrawValue] = useState('')

  // clear transient markers when the tool changes
  useEffect(() => {
    setSnapMark(null)
    setOpeningGhost(null)
    if (tool.type !== 'road') setRoadDraft(null)
  }, [tool])

  // ---------- sizing ----------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback(() => {
    const s = useStore.getState()
    const { w: pw, h: ph } = sizeRef.current
    if (s.mode.scope === 'plot') {
      const spanX = s.project.plotW + 240
      const spanY = s.project.plotD + 240
      setView({
        cx: s.project.plotW / 2,
        cy: s.project.plotD / 2,
        ppi: Math.max(0.03, Math.min(pw / spanX, ph / spanY)),
      })
      return
    }
    const building = s.project.buildings[s.mode.index]
    const floor = building.floors[Math.min(s.activeFloor, building.floors.length - 1)]
    const source =
      floor.walls.length || floor.furniture.length
        ? floor
        : building.floors.find((f) => f.walls.length) ?? floor
    const pts: Pt[] = []
    for (const w of source.walls) pts.push(w.a, w.b)
    for (const f of source.furniture) pts.push({ x: f.x, y: f.y })
    const b = planBounds(pts)
    if (!b) {
      setView({ cx: 0, cy: 0, ppi: Math.min(pw, ph) / (40 * 12) })
      return
    }
    const spanX = Math.max(b.max.x - b.min.x, 120) + 96
    const spanY = Math.max(b.max.y - b.min.y, 120) + 96
    const ppi = Math.min(pw / spanX, ph / spanY, 6)
    setView({
      cx: (b.min.x + b.max.x) / 2,
      cy: (b.min.y + b.max.y) / 2,
      ppi: Math.max(0.15, ppi),
    })
  }, [])

  // Fit on first mount and whenever the edit scope changes (plot ↔ building)
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current || !size.w) return
    didFit.current = true
    fitView()
  }, [size.w, fitView])
  const modeKey = mode.scope === 'plot' ? 'plot' : `b${mode.index}`
  const lastModeKey = useRef(modeKey)
  useEffect(() => {
    if (lastModeKey.current !== modeKey) {
      lastModeKey.current = modeKey
      setDraft(null)
      fitView()
    }
  }, [modeKey, fitView, setDraft])

  // ---------- coordinate transforms ----------
  const worldFromClient = useCallback((clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return {
      x: v.cx + (clientX - rect.left - rect.width / 2) / v.ppi,
      y: v.cy + (clientY - rect.top - rect.height / 2) / v.ppi,
    }
  }, [])

  const screenFromWorld = useCallback((p: Pt): Pt => {
    const v = viewRef.current
    const { w, h } = sizeRef.current
    return {
      x: (p.x - v.cx) * v.ppi + w / 2,
      y: (p.y - v.cy) * v.ppi + h / 2,
    }
  }, [])

  // ---------- snapping ----------
  const snapForDraw = useCallback(
    (raw: Pt, from: Pt | null, altKey: boolean): { p: Pt; mark: SnapMark | null } => {
      // S toggles ANGLE snapping only; holding Alt momentarily inverts it.
      // Point magnets (endpoints, marks, wall lines) always stay active so
      // you can connect to existing geometry at any angle.
      const angleSnap = useStore.getState().snapOn ? !altKey : altKey
      const floor = fl()
      const ppi = viewRef.current.ppi
      // 0) measurement guide points
      for (const g of floor.guides) {
        if (dist(raw, g) < 10 / ppi) return { p: { x: g.x, y: g.y }, mark: { p: g } }
      }
      // 1) endpoint snap
      let best: Pt | null = null
      let bestD = 10 / ppi
      for (const w of floor.walls) {
        for (const e of [w.a, w.b]) {
          const d = dist(raw, e)
          if (d < bestD) {
            bestD = d
            best = e
          }
        }
      }
      if (best) return { p: best, mark: { p: best } }
      // 2) wall-line snap, with distance-along readout
      let bestWall: Wall | null = null
      let bestWD = 8 / ppi
      let bestWP: Pt | null = null
      let bestWT = 0
      for (const w of floor.walls) {
        const c = closestOnWall(w, raw)
        if (c.distance < bestWD) {
          bestWD = c.distance
          bestWall = w
          bestWP = c.point
          bestWT = c.t
        }
      }
      if (bestWall && bestWP) {
        const p = snapPoint(bestWP, 0.5)
        const L = wallLength(bestWall)
        const d0 = bestWT * L
        return { p, mark: { p: bestWP, along: { d0, d1: L - d0 } } }
      }
      // 3) angle + length snap from previous point (toggleable)
      if (from && angleSnap) {
        const snapped = snapAngle(from, raw)
        const d = dist(from, snapped)
        const rounded = snapTo(d, 1)
        const dir = norm(sub(snapped, from))
        return { p: add(from, scale(dir, rounded)), mark: null }
      }
      return { p: snapPoint(raw, 1), mark: null }
    },
    []
  )

  /** endpoints of other walls coincident with p */
  const clusterAt = useCallback((p: Pt, excludeWallId: string): ClusterRef[] => {
    const out: ClusterRef[] = []
    for (const w of fl().walls) {
      if (w.id === excludeWallId) continue
      if (dist(w.a, p) < 0.75) out.push({ wallId: w.id, end: 'a' })
      if (dist(w.b, p) < 0.75) out.push({ wallId: w.id, end: 'b' })
    }
    return out
  }, [])

  const moveCluster = useCallback((cluster: ClusterRef[], p: Pt) => {
    const { updateWall } = useStore.getState()
    for (const c of cluster) updateWall(c.wallId, { [c.end]: p } as Partial<Wall>)
  }, [])

  // ---------- drag machinery ----------
  const beginDrag = useCallback(
    (drag: Drag, e: React.PointerEvent, withCheckpoint = true) => {
      e.stopPropagation()
      e.preventDefault()
      if (withCheckpoint) useStore.getState().checkpoint()
      dragRef.current = drag

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const world = worldFromClient(ev.clientX, ev.clientY)
        const st = useStore.getState()
        switch (d.mode) {
          case 'pan': {
            const dx = (ev.clientX - d.startClient.x) / d.startView.ppi
            const dy = (ev.clientY - d.startClient.y) / d.startView.ppi
            setView({ ...d.startView, cx: d.startView.cx - dx, cy: d.startView.cy - dy })
            break
          }
          case 'wall-end': {
            const wall = fl().walls.find((w) => w.id === d.wallId)
            if (!wall) break
            const other = d.end === 'a' ? wall.b : wall.a
            const { p, mark } = snapForDraw(world, other, ev.altKey)
            setSnapMark(mark)
            st.updateWall(d.wallId, { [d.end]: p } as Partial<Wall>)
            moveCluster(d.cluster, p)
            break
          }
          case 'wall-move': {
            const delta = sub(world, d.startWorld)
            const sd = snapPoint(delta, 1)
            const na = add(d.origA, sd)
            const nb = add(d.origB, sd)
            st.updateWall(d.wallId, { a: na, b: nb })
            moveCluster(d.clusterA, na)
            moveCluster(d.clusterB, nb)
            break
          }
          case 'bulge': {
            const wall = fl().walls.find((w) => w.id === d.wallId)
            if (!wall) break
            const mid = scale(add(wall.a, wall.b), 0.5)
            const n = perp(norm(sub(wall.b, wall.a)))
            let bulge = (world.x - mid.x) * n.x + (world.y - mid.y) * n.y
            if (Math.abs(bulge) < 3) bulge = 0
            st.updateWall(d.wallId, { bulge: snapTo(bulge, 0.5) })
            break
          }
          case 'furn-move': {
            d.moved = true
            const p = snapPoint(sub(world, d.offset), 1)
            st.updateFurniture(d.id, { x: p.x, y: p.y })
            break
          }
          case 'furn-rotate': {
            const f = fl().furniture.find((x) => x.id === d.id)
            if (!f) break
            const ang = (Math.atan2(world.y - f.y, world.x - f.x) * 180) / Math.PI + 90
            let rot = ev.altKey ? ang : Math.round(ang / 15) * 15
            for (const c of [0, 90, 180, 270, 360, -90, -180, -270]) {
              if (Math.abs(rot - c) < 7) rot = c
            }
            st.updateFurniture(d.id, { rot: ((rot % 360) + 360) % 360 })
            break
          }
          case 'furn-resize': {
            const f = d.orig
            const local = toLocal(world, f.x, f.y, f.rot)
            const opp = { x: -d.corner.x * (f.w / 2), y: -d.corner.y * (f.d / 2) }
            const nw = Math.max(6, Math.abs(local.x - opp.x))
            const nd = Math.max(6, Math.abs(local.y - opp.y))
            const centerLocal = {
              x: opp.x + (d.corner.x * nw) / 2,
              y: opp.y + (d.corner.y * nd) / 2,
            }
            const centerWorld = add({ x: f.x, y: f.y }, rotatePt(centerLocal, f.rot))
            st.updateFurniture(d.id, {
              w: snapTo(nw, 1),
              d: snapTo(nd, 1),
              x: centerWorld.x,
              y: centerWorld.y,
            })
            break
          }
          case 'opening-move': {
            const floor = fl()
            const op = floor.openings.find((o) => o.id === d.id)
            if (!op) break
            let bestWall: Wall | null = null
            let bestT = 0
            let bestD = 20 / viewRef.current.ppi
            for (const w of floor.walls) {
              const c = closestOnWall(w, world)
              if (c.distance < bestD) {
                bestD = c.distance
                bestWall = w
                bestT = c.t
              }
            }
            if (bestWall) {
              const L = dist(bestWall.a, bestWall.b) || 1
              const margin = op.width / 2 / L
              const t = Math.max(margin, Math.min(1 - margin, bestT))
              st.updateOpening(d.id, { wallId: bestWall.id, t })
            }
            break
          }
          case 'label-move': {
            const p = sub(world, d.offset)
            st.updateLabel(d.id, { x: p.x, y: p.y })
            break
          }
          case 'guide-move': {
            const { p } = snapForDraw(world, null, ev.altKey)
            st.updateGuide(d.id, { x: p.x, y: p.y })
            break
          }
          case 'paint-move': {
            const p = snapPoint(world, 1)
            st.updatePaint(d.id, { x: p.x, y: p.y })
            break
          }
          case 'building-move': {
            const p = snapPoint(sub(world, d.offset), 1)
            st.updateBuilding(d.id, { x: p.x, y: p.y })
            break
          }
          case 'road-move': {
            const delta = snapPoint(sub(world, d.startWorld), 1)
            st.updateRoad(d.id, {
              nodes: d.origNodes.map((n) => ({ ...n, x: n.x + delta.x, y: n.y + delta.y })),
            })
            break
          }
          case 'road-node': {
            const road = fl().roads.find((r) => r.id === d.id)
            if (!road) break
            const p = snapPoint(world, 1)
            st.updateRoad(d.id, {
              nodes: road.nodes.map((n, i) => (i === d.index ? { ...n, x: p.x, y: p.y } : n)),
            })
            break
          }
          case 'road-handle': {
            const road = fl().roads.find((r) => r.id === d.id)
            if (!road) break
            const n = road.nodes[d.index]
            if (!n) break
            let h = { x: world.x - n.x, y: world.y - n.y }
            if (d.sign < 0) h = { x: -h.x, y: -h.y }
            st.updateRoad(d.id, {
              nodes: road.nodes.map((nn, i) =>
                i === d.index ? { ...nn, hx: snapTo(h.x, 0.5), hy: snapTo(h.y, 0.5) } : nn
              ),
            })
            break
          }
        }
      }
      const onUp = () => {
        dragRef.current = null
        setSnapMark(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [worldFromClient, snapForDraw, moveCluster]
  )

  // ---------- wall / fence drawing ----------
  const commitSegment = useCallback(
    (p: Pt) => {
      const d = draftRef.current
      if (!d) return
      const st = useStore.getState()
      const last = d.pts[d.pts.length - 1]
      if (dist(last, p) < 2) {
        setDraft(null)
        return
      }
      const start = d.pts[0]
      const closing = d.pts.length >= 2 && dist(p, start) < 12 / viewRef.current.ppi
      const end = closing ? start : p
      st.checkpoint()
      if (st.tool.type === 'fence') {
        st.addWall({
          a: last,
          b: end,
          thickness: 3,
          bulge: 0,
          height: FENCE_HEIGHTS[st.tool.fence],
          fence: st.tool.fence,
        })
      } else {
        st.addWall({ a: last, b: end, thickness: WALL_THICKNESS, bulge: 0, height: fl().height })
      }
      setDrawValue('')
      if (closing) setDraft(null)
      else setDraft({ pts: [...d.pts, end], cur: end })
    },
    [setDraft]
  )

  // ---------- road pen tool ----------
  const finishRoad = useCallback(() => {
    const d = roadDraftRef.current
    setRoadDraft(null)
    penDragRef.current = false
    if (!d || d.nodes.length < 2) return
    const st = useStore.getState()
    const id = st.addRoad({
      nodes: d.nodes,
      width: roadStyleRef.current.width,
      material: roadStyleRef.current.material,
    })
    st.setTool({ type: 'select' })
    st.select({ kind: 'road', id })
  }, [])

  // ---------- background pointer handlers ----------
  const onSvgPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1 || spaceDown || tool.type === 'pan') {
        beginDrag(
          { mode: 'pan', startClient: { x: e.clientX, y: e.clientY }, startView: viewRef.current },
          e,
          false
        )
        return
      }
      if (e.button !== 0) return
      const world = worldFromClient(e.clientX, e.clientY)
      const st = useStore.getState()

      if (tool.type === 'wall' || tool.type === 'fence') {
        e.preventDefault()
        const d = draftRef.current
        if (!d) {
          const { p, mark } = snapForDraw(world, null, e.altKey)
          setSnapMark(mark)
          setDraft({ pts: [p], cur: p })
        } else {
          const last = d.pts[d.pts.length - 1]
          const { p } = snapForDraw(world, last, e.altKey)
          commitSegment(p)
        }
        setTimeout(() => drawInputRef.current?.focus(), 0)
        return
      }

      if (tool.type === 'paint') {
        const p = snapPoint(world, 1)
        st.addPaint(p.x, p.y, tool.material)
        return
      }

      if (tool.type === 'road') {
        e.preventDefault()
        const { p } = snapForDraw(world, null, e.altKey)
        setRoadDraft((d) => ({
          nodes: [...(d?.nodes ?? []), { x: p.x, y: p.y, hx: 0, hy: 0 }],
          cur: p,
        }))
        penDragRef.current = true
        return
      }

      if (tool.type === 'opening') {
        if (openingGhost) {
          st.checkpoint()
          const wall = fl().walls.find((w) => w.id === openingGhost.wallId)
          if (wall) {
            const width = OPENING_DEFAULTS[tool.opening] ?? 36
            const L = dist(wall.a, wall.b) || 1
            const margin = width / 2 / L
            const t = Math.max(margin, Math.min(1 - margin, openingGhost.t))
            st.addOpening({
              wallId: wall.id,
              t,
              width,
              type: tool.opening,
              flipSwing: false,
              flipHinge: false,
              ...(tool.opening === 'garage' ? { height: 84 } : {}),
            })
          }
        }
        return
      }

      if (tool.type === 'place') {
        st.checkpoint()
        const p = snapPoint(world, 1)
        const id = st.addFurniture(tool.kind, p.x, p.y)
        if (!e.shiftKey) {
          st.setTool({ type: 'select' })
          st.select({ kind: 'furniture', id })
        }
        return
      }

      if (tool.type === 'label') {
        st.checkpoint()
        const id = st.addLabel(world.x, world.y, '')
        st.setTool({ type: 'select' })
        st.select({ kind: 'label', id })
        setFloatInput({ kind: 'label', id })
        setFloatValue('')
        return
      }

      if (tool.type === 'measure') {
        const { p } = snapForDraw(world, null, e.altKey)
        st.addGuide(p.x, p.y)
        return
      }

      // select tool on background: clear selection
      st.select(null)
      setFloatInput(null)
    },
    [tool, spaceDown, beginDrag, worldFromClient, snapForDraw, openingGhost, commitSegment, setDraft]
  )

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) return
      const world = worldFromClient(e.clientX, e.clientY)
      setHoverWorld(world)

      if (tool.type === 'road' && roadDraftRef.current) {
        const d = roadDraftRef.current
        if (penDragRef.current && d.nodes.length) {
          const last = d.nodes[d.nodes.length - 1]
          const h = { x: world.x - last.x, y: world.y - last.y }
          setRoadDraft({
            nodes: [...d.nodes.slice(0, -1), { ...last, hx: snapTo(h.x, 0.5), hy: snapTo(h.y, 0.5) }],
            cur: world,
          })
        } else {
          const { p, mark } = snapForDraw(world, null, e.altKey)
          setSnapMark(mark)
          setRoadDraft({ ...d, cur: p })
        }
        return
      }

      const drawing = tool.type === 'wall' || tool.type === 'fence'
      if (drawing && draftRef.current) {
        const d = draftRef.current
        const last = d.pts[d.pts.length - 1]
        const { p, mark } = snapForDraw(world, last, e.altKey)
        setSnapMark(mark)
        setDraftRaw({ ...d, cur: p })
      } else if (drawing || tool.type === 'measure') {
        const { mark } = snapForDraw(world, null, e.altKey)
        setSnapMark(mark)
      }

      if (tool.type === 'opening') {
        let best: { wallId: string; t: number } | null = null
        let bestD = 24 / viewRef.current.ppi
        for (const w of fl().walls) {
          if (w.bulge) continue // openings supported on straight walls
          const c = closestOnWall(w, world)
          if (c.distance < bestD) {
            bestD = c.distance
            best = { wallId: w.id, t: c.t }
          }
        }
        setOpeningGhost(best)
      }
    },
    [tool, worldFromClient, snapForDraw]
  )

  const onSvgDoubleClick = useCallback(() => {
    if (draftRef.current) setDraft(null)
    if (roadDraftRef.current) finishRoad()
  }, [setDraft, finishRoad])

  // ---------- wheel: scroll = pan, ctrl/cmd = zoom ----------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const px = e.clientX - rect.left - rect.width / 2
        const py = e.clientY - rect.top - rect.height / 2
        const factor = Math.exp(-e.deltaY * 0.0022)
        const ppi = Math.min(12, Math.max(0.12, v.ppi * factor))
        const wx = v.cx + px / v.ppi
        const wy = v.cy + py / v.ppi
        setView({ ppi, cx: wx - px / ppi, cy: wy - py / ppi })
      } else {
        setView({ ...v, cx: v.cx + e.deltaX / v.ppi, cy: v.cy + e.deltaY / v.ppi })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      const st = useStore.getState()

      if (e.code === 'Space' && !inField) {
        setSpaceDown(true)
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        if (roadDraftRef.current) {
          setRoadDraft(null)
          penDragRef.current = false
        } else if (draftRef.current) setDraft(null)
        else if (floatInput) setFloatInput(null)
        else if (st.tool.type !== 'select') st.setTool({ type: 'select' })
        else st.select(null)
        return
      }
      if (inField) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? st.redo() : st.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        st.duplicateSelected()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelected()
        return
      }
      if (e.key === 'Enter') {
        if (roadDraftRef.current) {
          finishRoad()
          return
        }
        if (draftRef.current) {
          setDraft(null)
          return
        }
      }
      switch (e.key.toLowerCase()) {
        case 'v':
          st.setTool({ type: 'select' })
          break
        case 'w':
          st.setTool(
            st.mode.scope === 'plot' ? { type: 'fence', fence: 'privacy' } : { type: 'wall' }
          )
          break
        case 'p':
          if (st.mode.scope === 'building') st.setTool({ type: 'paint', material: 'tile' })
          break
        case 's':
          st.setSnapOn(!st.snapOn)
          break
        case 'd':
          st.setTool({ type: 'opening', opening: 'door' })
          break
        case 'n':
          st.setTool({ type: 'opening', opening: 'window' })
          break
        case 't':
          st.setTool({ type: 'label' })
          break
        case 'm':
          st.setTool({ type: 'measure' })
          break
        case 'r': {
          if (st.selection?.kind === 'furniture') {
            const f = fl().furniture.find((x) => x.id === st.selection!.id)
            if (f) {
              st.checkpoint()
              st.updateFurniture(f.id, { rot: (f.rot + 90) % 360 })
            }
          }
          break
        }
      }
      // nudge
      if (st.selection && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 12 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const sel = st.selection
        const floor = fl()
        if (sel.kind === 'furniture') {
          const f = floor.furniture.find((x) => x.id === sel.id)
          if (f) st.updateFurniture(f.id, { x: f.x + dx, y: f.y + dy })
        } else if (sel.kind === 'label') {
          const l = floor.labels.find((x) => x.id === sel.id)
          if (l) st.updateLabel(l.id, { x: l.x + dx, y: l.y + dy })
        } else if (sel.kind === 'guide') {
          const g = floor.guides.find((x) => x.id === sel.id)
          if (g) st.updateGuide(g.id, { x: g.x + dx, y: g.y + dy })
        } else if (sel.kind === 'wall') {
          const w = floor.walls.find((x) => x.id === sel.id)
          if (w)
            st.updateWall(w.id, {
              a: { x: w.a.x + dx, y: w.a.y + dy },
              b: { x: w.b.x + dx, y: w.b.y + dy },
            })
        }
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [floatInput, setDraft, finishRoad])

  // ---------- draw-length input ----------
  const applyDrawValue = useCallback(() => {
    const d = draftRef.current
    if (!d || !d.cur) return
    const v = parseLen(drawValue)
    if (v == null || v <= 0) {
      setDraft(null)
      return
    }
    const last = d.pts[d.pts.length - 1]
    const dir = norm(sub(d.cur, last))
    if (!dir.x && !dir.y) return
    commitSegment(add(last, scale(dir, v)))
    setDrawValue('')
    setTimeout(() => drawInputRef.current?.focus(), 0)
  }, [drawValue, commitSegment, setDraft])

  // ---------- float input (wall length / label text) ----------
  useEffect(() => {
    if (selection?.kind === 'wall') {
      setFloatInput({ kind: 'wall-len', wallId: selection.id })
      const w = floor.walls.find((x) => x.id === selection.id)
      if (w) setFloatValue(fmtLenShort(dist(w.a, w.b)))
    } else if (floatInput?.kind === 'wall-len') {
      setFloatInput(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  const applyFloatInput = useCallback(() => {
    const fi = floatInput
    if (!fi) return
    const st = useStore.getState()
    if (fi.kind === 'wall-len') {
      const w = fl().walls.find((x) => x.id === fi.wallId)
      const v = parseLen(floatValue)
      if (w && v != null && v > 1) {
        st.checkpoint()
        const dir = norm(sub(w.b, w.a))
        const oldB = w.b
        const nb = add(w.a, scale(dir, v))
        st.updateWall(w.id, { b: nb })
        for (const c of clusterAt(oldB, w.id)) {
          st.updateWall(c.wallId, { [c.end]: nb } as Partial<Wall>)
        }
        setFloatValue(fmtLenShort(v))
      }
    } else if (fi.kind === 'label') {
      const text = floatValue.trim()
      if (text) st.updateLabel(fi.id, { text })
      else {
        st.select({ kind: 'label', id: fi.id })
        st.deleteSelected()
      }
      setFloatInput(null)
    }
  }, [floatInput, floatValue, clusterAt])

  // ---------- derived render data ----------
  const { w: pw, h: ph } = size
  const minX = view.cx - pw / 2 / view.ppi
  const minY = view.cy - ph / 2 / view.ppi
  const viewBox = `${minX} ${minY} ${pw / view.ppi} ${ph / view.ppi}`
  const handleSize = 9 / view.ppi
  const fontWorld = 11.5 / view.ppi

  // debug hook for scripted testing (dev only)
  if (import.meta.env.DEV) (window as any).__view = { view, size }

  const wallsById = useMemo(() => {
    const m = new Map<string, Wall>()
    for (const w of floor.walls) m.set(w.id, w)
    return m
  }, [floor.walls])

  const sortedFurniture = useMemo(
    () =>
      [...floor.furniture].sort(
        (a, b) => (a.kind === 'rug' ? -1 : 0) - (b.kind === 'rug' ? -1 : 0)
      ),
    [floor.furniture]
  )

  const cursor =
    spaceDown || tool.type === 'pan'
      ? 'grab'
      : tool.type === 'select'
        ? 'default'
        : 'crosshair'

  // float input screen position
  let floatPos: Pt | null = null
  if (floatInput?.kind === 'wall-len') {
    const w = wallsById.get(floatInput.wallId)
    if (w) floatPos = screenFromWorld(wallPointAt(w, 0.5))
  } else if (floatInput?.kind === 'label') {
    const l = floor.labels.find((x) => x.id === floatInput.id)
    if (l) floatPos = screenFromWorld({ x: l.x, y: l.y })
  }
  const drawCurScreen = draft?.cur ? screenFromWorld(draft.cur) : null

  const selectedFurn =
    selection?.kind === 'furniture'
      ? floor.furniture.find((f) => f.id === selection.id)
      : undefined
  const selectedWall = selection?.kind === 'wall' ? wallsById.get(selection.id) : undefined

  // chain running total while drawing
  let chainTotal = 0
  if (draft && draft.cur) {
    for (let i = 0; i < draft.pts.length - 1; i++) chainTotal += dist(draft.pts[i], draft.pts[i + 1])
    chainTotal += dist(draft.pts[draft.pts.length - 1], draft.cur)
  }

  const guidesVisible = floor.guides

  return (
    <div ref={wrapRef} className="editor-canvas" style={{ cursor }}>
      <svg
        ref={svgRef}
        width={pw}
        height={ph}
        viewBox={viewBox}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={() => {
          penDragRef.current = false
        }}
        onDoubleClick={onSvgDoubleClick}
      >
        <defs>
          <pattern id="gridMinor" width={6} height={6} patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="var(--grid-minor)" strokeWidth={0.6} />
          </pattern>
          <pattern id="gridMajor" width={12} height={12} patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="var(--grid-major)" strokeWidth={0.8} />
          </pattern>
          <pattern id="gridBig" width={60} height={60} patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="var(--grid-big)" strokeWidth={1} />
          </pattern>
        </defs>
        <rect x={minX} y={minY} width={pw / view.ppi} height={ph / view.ppi} fill={BG} />
        {view.ppi > 1.6 && (
          <rect x={minX} y={minY} width={pw / view.ppi} height={ph / view.ppi} fill="url(#gridMinor)" />
        )}
        {view.ppi > 0.5 && (
          <rect x={minX} y={minY} width={pw / view.ppi} height={ph / view.ppi} fill="url(#gridMajor)" />
        )}
        <rect x={minX} y={minY} width={pw / view.ppi} height={ph / view.ppi} fill="url(#gridBig)" />

        {/* plot boundary (property line) */}
        {isPlot && (
          <>
            <rect x={0} y={0} width={plotW} height={plotD} fill="var(--plot-fill)" />
            <rect
              x={0}
              y={0}
              width={plotW}
              height={plotD}
              fill="none"
              stroke={PLOT_LINE}
              strokeWidth={2}
              strokeDasharray="14 7 3 7"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* underlay: the floor below, for alignment */}
        {below && (
          <g opacity={0.28} pointerEvents="none">
            {below.walls.map((w) => (
              <path
                key={w.id}
                d={wallPathD(w)}
                stroke="#71717a"
                strokeWidth={w.thickness}
                strokeLinecap="square"
                fill="none"
              />
            ))}
            {below.furniture
              .filter((f) => f.kind === 'staircase')
              .map((f) => (
                <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
                  <Glyph kind={f.kind} w={f.w} d={f.d} />
                </g>
              ))}
          </g>
        )}

        {/* roads */}
        {floor.roads.map((r) => {
          const colors = ROAD_COLORS[r.material] ?? ROAD_COLORS.asphalt
          const selectedR = selection?.kind === 'road' && selection.id === r.id
          const pathD = roadPathD(r.nodes)
          const grip = 24 / view.ppi
          return (
            <g key={r.id}>
              <path
                d={pathD}
                stroke="#a3a39f"
                strokeWidth={r.width + 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d={pathD}
                stroke={colors.fill}
                strokeWidth={r.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d={pathD}
                stroke={colors.dash}
                strokeWidth={1.4}
                strokeDasharray="14 10"
                vectorEffect="non-scaling-stroke"
                fill="none"
                opacity={0.9}
              />
              {selectedR && (
                <path
                  d={pathD}
                  stroke={ACCENT}
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="6 5"
                  fill="none"
                />
              )}
              <path
                d={pathD}
                stroke="transparent"
                strokeWidth={Math.max(r.width, 20 / view.ppi)}
                strokeLinecap="round"
                fill="none"
                style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool.type !== 'select' || spaceDown) return
                  const world = worldFromClient(e.clientX, e.clientY)
                  useStore.getState().select({ kind: 'road', id: r.id })
                  beginDrag(
                    {
                      mode: 'road-move',
                      id: r.id,
                      startWorld: world,
                      origNodes: r.nodes.map((n) => ({ ...n })),
                    },
                    e
                  )
                }}
              />
              {selectedR &&
                r.nodes.map((n, i) => {
                  // handle grip positions: real handles, or tangent-aligned grips for corners
                  let hx = n.hx
                  let hy = n.hy
                  if (Math.hypot(hx, hy) < 0.5) {
                    const ref = r.nodes[i + 1] ?? r.nodes[i - 1] ?? { x: n.x + 1, y: n.y }
                    const dir = norm({ x: ref.x - n.x, y: ref.y - n.y })
                    hx = dir.x * grip
                    hy = dir.y * grip
                  }
                  return (
                    <g key={i}>
                      <line
                        x1={n.x - hx}
                        y1={n.y - hy}
                        x2={n.x + hx}
                        y2={n.y + hy}
                        stroke={ACCENT}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        opacity={0.8}
                      />
                      {([1, -1] as const).map((sign) => (
                        <circle
                          key={sign}
                          cx={n.x + sign * hx}
                          cy={n.y + sign * hy}
                          r={handleSize * 0.42}
                          fill="#fff"
                          stroke={ACCENT}
                          strokeWidth={1.4}
                          vectorEffect="non-scaling-stroke"
                          style={{ cursor: 'grab' }}
                          onPointerDown={(e) =>
                            beginDrag({ mode: 'road-handle', id: r.id, index: i, sign }, e)
                          }
                        />
                      ))}
                      <rect
                        x={n.x - handleSize / 2}
                        y={n.y - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill={ACCENT}
                        stroke="#fff"
                        strokeWidth={1.4}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => beginDrag({ mode: 'road-node', id: r.id, index: i }, e)}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          if (r.nodes.length > 2) {
                            const st = useStore.getState()
                            st.checkpoint()
                            st.updateRoad(r.id, { nodes: r.nodes.filter((_, j) => j !== i) })
                          }
                        }}
                      />
                    </g>
                  )
                })}
            </g>
          )
        })}

        {/* road draft preview */}
        {roadDraft &&
          roadDraft.nodes.length > 0 &&
          (() => {
            const previewNodes =
              roadDraft.cur && !penDragRef.current
                ? [...roadDraft.nodes, { x: roadDraft.cur.x, y: roadDraft.cur.y, hx: 0, hy: 0 }]
                : roadDraft.nodes
            const pathD = roadPathD(previewNodes)
            const colors = ROAD_COLORS[roadStyleRef.current.material] ?? ROAD_COLORS.asphalt
            const last = roadDraft.nodes[roadDraft.nodes.length - 1]
            return (
              <g pointerEvents="none">
                <path
                  d={pathD}
                  stroke={colors.fill}
                  strokeWidth={roadStyleRef.current.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.45}
                />
                <path
                  d={pathD}
                  stroke={ACCENT}
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                  strokeDasharray="6 5"
                />
                {roadDraft.nodes.map((n, i) => (
                  <rect
                    key={i}
                    x={n.x - handleSize / 2}
                    y={n.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill={ACCENT}
                    stroke="#fff"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {(Math.hypot(last.hx, last.hy) > 0.5 || penDragRef.current) && (
                  <>
                    <line
                      x1={last.x - last.hx}
                      y1={last.y - last.hy}
                      x2={last.x + last.hx}
                      y2={last.y + last.hy}
                      stroke={ACCENT}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx={last.x + last.hx} cy={last.y + last.hy} r={handleSize * 0.4} fill="#fff" stroke={ACCENT} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                    <circle cx={last.x - last.hx} cy={last.y - last.hy} r={handleSize * 0.4} fill="#fff" stroke={ACCENT} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            )
          })()}

        {/* furniture */}
        {sortedFurniture.map((f) => (
          <g
            key={f.id}
            transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}
            onPointerDown={(e) => {
              if (tool.type !== 'select' || spaceDown) return
              const world = worldFromClient(e.clientX, e.clientY)
              useStore.getState().select({ kind: 'furniture', id: f.id })
              beginDrag(
                { mode: 'furn-move', id: f.id, offset: sub(world, { x: f.x, y: f.y }), moved: false },
                e
              )
            }}
            style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
          >
            <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} fill="transparent" stroke="none" />
            <Glyph kind={f.kind} w={f.w} d={f.d} />
          </g>
        ))}

        {/* buildings on the plot */}
        {isPlot &&
          buildings.map((b) => {
            const pts: Pt[] = []
            for (const w of b.floors[0].walls) pts.push(w.a, w.b)
            const bb = planBounds(pts) ?? { min: { x: -60, y: -60 }, max: { x: 60, y: 60 } }
            const sel = selection?.kind === 'building' && selection.id === b.id
            return (
              <g key={b.id} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
                <rect
                  x={bb.min.x}
                  y={bb.min.y}
                  width={bb.max.x - bb.min.x}
                  height={bb.max.y - bb.min.y}
                  fill="var(--canvas-bg)"
                  fillOpacity={0.85}
                  stroke="none"
                />
                {b.floors[0].walls.map((w) => (
                  <WallShape key={w.id} w={w} selected={false} />
                ))}
                <text
                  x={(bb.min.x + bb.max.x) / 2}
                  y={(bb.min.y + bb.max.y) / 2}
                  fontSize={Math.max(14, 16 / view.ppi)}
                  fontFamily="Inter, system-ui, sans-serif"
                  fontWeight={700}
                  fill={sel ? ACCENT : 'var(--glyph-stroke)'}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {b.name}
                </text>
                <rect
                  x={bb.min.x - 6}
                  y={bb.min.y - 6}
                  width={bb.max.x - bb.min.x + 12}
                  height={bb.max.y - bb.min.y + 12}
                  fill="transparent"
                  stroke={sel ? ACCENT : 'transparent'}
                  strokeWidth={1.6}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
                  onPointerDown={(e) => {
                    if (tool.type !== 'select' || spaceDown) return
                    const world = worldFromClient(e.clientX, e.clientY)
                    useStore.getState().select({ kind: 'building', id: b.id })
                    beginDrag(
                      { mode: 'building-move', id: b.id, offset: sub(world, { x: b.x, y: b.y }) },
                      e
                    )
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    const idx = useStore.getState().project.buildings.findIndex((x) => x.id === b.id)
                    if (idx >= 0) useStore.getState().enterBuilding(idx)
                  }}
                />
              </g>
            )
          })}

        {/* walls */}
        {floor.walls.map((w) => (
          <g key={w.id}>
            <WallShape w={w} selected={selection?.kind === 'wall' && selection.id === w.id} />
            <path
              d={wallPathD(w)}
              stroke="transparent"
              strokeWidth={Math.max(w.thickness + 4, 14 / view.ppi)}
              fill="none"
              style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
              onPointerDown={(e) => {
                if (tool.type !== 'select' || spaceDown) return
                const world = worldFromClient(e.clientX, e.clientY)
                useStore.getState().select({ kind: 'wall', id: w.id })
                beginDrag(
                  {
                    mode: 'wall-move',
                    wallId: w.id,
                    startWorld: world,
                    origA: w.a,
                    origB: w.b,
                    clusterA: clusterAt(w.a, w.id),
                    clusterB: clusterAt(w.b, w.id),
                  },
                  e
                )
              }}
            />
          </g>
        ))}

        {/* openings */}
        {floor.openings.map((o) => {
          const wall = wallsById.get(o.wallId)
          if (!wall) return null
          return (
            <g key={o.id}>
              <OpeningGlyph
                o={o}
                wall={wall}
                bg={BG}
                selected={selection?.kind === 'opening' && selection.id === o.id}
              />
              <OpeningHit
                o={o}
                wall={wall}
                onPointerDown={(e) => {
                  if (tool.type !== 'select' || spaceDown) return
                  useStore.getState().select({ kind: 'opening', id: o.id })
                  beginDrag({ mode: 'opening-move', id: o.id }, e)
                }}
              />
            </g>
          )
        })}

        {/* wall dimensions */}
        {showDims &&
          floor.walls.map((w) => {
            if (dist(w.a, w.b) * view.ppi < 46) return null
            return (
              <WallDim
                key={w.id}
                w={w}
                fontWorld={fontWorld}
                selected={selection?.kind === 'wall' && selection.id === w.id}
              />
            )
          })}

        {/* labels */}
        {floor.labels.map((l) => (
          <text
            key={l.id}
            x={l.x}
            y={l.y}
            fontSize={l.size}
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={600}
            fill="var(--glyph-stroke)"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ cursor: tool.type === 'select' ? 'move' : undefined, userSelect: 'none' }}
            onPointerDown={(e) => {
              if (tool.type !== 'select' || spaceDown) return
              const world = worldFromClient(e.clientX, e.clientY)
              useStore.getState().select({ kind: 'label', id: l.id })
              beginDrag({ mode: 'label-move', id: l.id, offset: sub(world, { x: l.x, y: l.y }) }, e)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setFloatInput({ kind: 'label', id: l.id })
              setFloatValue(l.text)
            }}
          >
            {selection?.kind === 'label' && selection.id === l.id ? (
              <tspan fill={ACCENT}>{l.text || 'Label'}</tspan>
            ) : (
              l.text || 'Label'
            )}
          </text>
        ))}

        {/* measurement guides: rays first, then markers */}
        {guidesVisible.map((g) => {
          const rays = guideRays(g, floor.walls)
          const selectedG = selection?.kind === 'guide' && selection.id === g.id
          return (
            <g key={g.id}>
              {rays.map((r, i) => {
                const mid = { x: (g.x + r.hit.x) / 2, y: (g.y + r.hit.y) / 2 }
                const horizontal = r.dir.y === 0
                if (r.distance < 2) return null
                return (
                  <g key={i} pointerEvents="none">
                    <line
                      x1={g.x}
                      y1={g.y}
                      x2={r.hit.x}
                      y2={r.hit.y}
                      stroke={MEASURE_COLOR}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.75}
                    />
                    <text
                      x={mid.x + (horizontal ? 0 : fontWorld * 0.7)}
                      y={mid.y - (horizontal ? fontWorld * 0.5 : 0)}
                      fontSize={fontWorld * 0.88}
                      fill={MEASURE_COLOR}
                      fontFamily="Inter, system-ui, sans-serif"
                      fontWeight={600}
                      textAnchor={horizontal ? 'middle' : 'start'}
                      dominantBaseline="middle"
                      style={{ userSelect: 'none' }}
                    >
                      {fmtLenShort(r.distance)}
                    </text>
                  </g>
                )
              })}
              {/* diamond marker */}
              <rect
                x={-handleSize * 0.55}
                y={-handleSize * 0.55}
                width={handleSize * 1.1}
                height={handleSize * 1.1}
                transform={`translate(${g.x} ${g.y}) rotate(45)`}
                fill={selectedG ? MEASURE_COLOR : '#fff'}
                stroke={MEASURE_COLOR}
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool.type !== 'select' || spaceDown) return
                  useStore.getState().select({ kind: 'guide', id: g.id })
                  beginDrag({ mode: 'guide-move', id: g.id }, e)
                }}
              />
            </g>
          )
        })}

        {/* floor material paint seeds */}
        {floor.paints.map((p) => {
          const sel = selection?.kind === 'paint' && selection.id === p.id
          return (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <circle
                r={handleSize * 0.8}
                fill={PAINT_COLORS[p.material]}
                stroke={sel ? ACCENT : '#ffffff'}
                strokeWidth={sel ? 2 : 1.4}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: tool.type === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool.type !== 'select' || spaceDown) return
                  useStore.getState().select({ kind: 'paint', id: p.id })
                  beginDrag({ mode: 'paint-move', id: p.id }, e)
                }}
              />
              <circle r={handleSize * 0.28} fill="#ffffff" pointerEvents="none" />
            </g>
          )
        })}

        {/* selected wall handles */}
        {selectedWall && (
          <g>
            {(['a', 'b'] as EndKey[]).map((end) => {
              const p = selectedWall[end]
              return (
                <rect
                  key={end}
                  x={p.x - handleSize / 2}
                  y={p.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="#fff"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) =>
                    beginDrag(
                      {
                        mode: 'wall-end',
                        wallId: selectedWall.id,
                        end,
                        cluster: clusterAt(selectedWall[end], selectedWall.id),
                      },
                      e
                    )
                  }
                />
              )
            })}
            {(() => {
              const p = wallPointAt(selectedWall, 0.5)
              return (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={handleSize * 0.55}
                  fill={selectedWall.bulge ? ACCENT : '#fff'}
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'ns-resize' }}
                  onPointerDown={(e) => beginDrag({ mode: 'bulge', wallId: selectedWall.id }, e)}
                />
              )
            })()}
          </g>
        )}

        {/* selected furniture handles */}
        {selectedFurn &&
          (() => {
            const f = selectedFurn
            const corners: Pt[] = [
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ]
            const rotHandleLocal = { x: 0, y: -f.d / 2 - 22 / view.ppi }
            const rotWorld = add({ x: f.x, y: f.y }, rotatePt(rotHandleLocal, f.rot))
            const topWorld = add({ x: f.x, y: f.y }, rotatePt({ x: 0, y: -f.d / 2 }, f.rot))
            return (
              <g>
                <g transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
                  <rect
                    x={-f.w / 2}
                    y={-f.d / 2}
                    width={f.w}
                    height={f.d}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1.2}
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
                <line
                  x1={topWorld.x}
                  y1={topWorld.y}
                  x2={rotWorld.x}
                  y2={rotWorld.y}
                  stroke={ACCENT}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={rotWorld.x}
                  cy={rotWorld.y}
                  r={handleSize * 0.55}
                  fill="#fff"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => beginDrag({ mode: 'furn-rotate', id: f.id }, e)}
                />
                {corners.map((c, i) => {
                  const world = add(
                    { x: f.x, y: f.y },
                    rotatePt({ x: (c.x * f.w) / 2, y: (c.y * f.d) / 2 }, f.rot)
                  )
                  return (
                    <rect
                      key={i}
                      x={world.x - handleSize / 2}
                      y={world.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="#fff"
                      stroke={ACCENT}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: 'nwse-resize' }}
                      onPointerDown={(e) =>
                        beginDrag(
                          {
                            mode: 'furn-resize',
                            id: f.id,
                            corner: c,
                            orig: { x: f.x, y: f.y, w: f.w, d: f.d, rot: f.rot },
                          },
                          e
                        )
                      }
                    />
                  )
                })}
              </g>
            )
          })()}

        {/* wall draft preview */}
        {draft && draft.cur && draft.pts.length > 0 && (
          <g pointerEvents="none">
            <line
              x1={draft.pts[draft.pts.length - 1].x}
              y1={draft.pts[draft.pts.length - 1].y}
              x2={draft.cur.x}
              y2={draft.cur.y}
              stroke={ACCENT}
              strokeOpacity={0.85}
              strokeWidth={tool.type === 'fence' ? 2.5 : WALL_THICKNESS}
              strokeLinecap="square"
            />
            {(() => {
              const last = draft.pts[draft.pts.length - 1]
              const L = dist(last, draft.cur!)
              if (L < 1) return null
              const mid = scale(add(last, draft.cur!), 0.5)
              const n = perp(norm(sub(draft.cur!, last)))
              return (
                <text
                  x={mid.x - n.x * (fontWorld * 1.6)}
                  y={mid.y - n.y * (fontWorld * 1.6)}
                  fontSize={fontWorld}
                  fill={ACCENT}
                  fontWeight={600}
                  fontFamily="Inter, system-ui, sans-serif"
                  textAnchor="middle"
                >
                  {fmtLenShort(L)}
                  {draft.pts.length > 1 ? `  ·  total ${fmtLenShort(chainTotal)}` : ''}
                </text>
              )
            })()}
            <circle cx={draft.pts[0].x} cy={draft.pts[0].y} r={4 / view.ppi} fill={ACCENT} />
          </g>
        )}

        {/* opening ghost */}
        {tool.type === 'opening' &&
          openingGhost &&
          (() => {
            const wall = wallsById.get(openingGhost.wallId)
            if (!wall) return null
            const p = wallPointAt(wall, openingGhost.t)
            const tan = wallTangentAt(wall, openingGhost.t)
            const ang = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
            const width = OPENING_DEFAULTS[tool.opening] ?? 36
            return (
              <g
                transform={`translate(${p.x} ${p.y}) rotate(${ang})`}
                opacity={0.55}
                pointerEvents="none"
              >
                <rect
                  x={-width / 2}
                  y={-wall.thickness / 2 - 1}
                  width={width}
                  height={wall.thickness + 2}
                  fill={ACCENT}
                />
              </g>
            )
          })()}

        {/* furniture placement ghost */}
        {tool.type === 'place' &&
          hoverWorld &&
          (() => {
            const it = catalogItem(tool.kind)
            return (
              <g
                transform={`translate(${snapTo(hoverWorld.x, 1)} ${snapTo(hoverWorld.y, 1)})`}
                opacity={0.5}
                pointerEvents="none"
              >
                <Glyph kind={tool.kind} w={it.w} d={it.d} />
              </g>
            )
          })()}

        {/* measure tool crosshair ghost */}
        {tool.type === 'measure' && hoverWorld && !snapMark && (
          <g pointerEvents="none" opacity={0.6}>
            <line
              x1={snapTo(hoverWorld.x, 1) - 8 / view.ppi}
              y1={snapTo(hoverWorld.y, 1)}
              x2={snapTo(hoverWorld.x, 1) + 8 / view.ppi}
              y2={snapTo(hoverWorld.y, 1)}
              stroke={MEASURE_COLOR}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapTo(hoverWorld.x, 1)}
              y1={snapTo(hoverWorld.y, 1) - 8 / view.ppi}
              x2={snapTo(hoverWorld.x, 1)}
              y2={snapTo(hoverWorld.y, 1) + 8 / view.ppi}
              stroke={MEASURE_COLOR}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* snap marker + along-wall readout */}
        {snapMark && (
          <g pointerEvents="none">
            <circle
              cx={snapMark.p.x}
              cy={snapMark.p.y}
              r={5 / view.ppi}
              fill="none"
              stroke={ACCENT}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            {snapMark.along && (
              <text
                x={snapMark.p.x}
                y={snapMark.p.y - fontWorld * 1.4}
                fontSize={fontWorld * 0.92}
                fill={ACCENT}
                fontWeight={600}
                fontFamily="Inter, system-ui, sans-serif"
                textAnchor="middle"
                style={{ userSelect: 'none' }}
              >
                {`${fmtLenShort(snapMark.along.d0)} ⟷ ${fmtLenShort(snapMark.along.d1)}`}
              </text>
            )}
          </g>
        )}
      </svg>

      {/* draw-length floating input */}
      {draft && drawCurScreen && (
        <input
          ref={drawInputRef}
          className="float-input"
          style={{ left: drawCurScreen.x + 16, top: drawCurScreen.y + 16 }}
          value={drawValue}
          placeholder={`type length, e.g. 12'6"`}
          onChange={(e) => setDrawValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (drawValue.trim()) applyDrawValue()
              else setDraft(null)
            } else if (e.key === 'Escape') {
              setDraft(null)
              setDrawValue('')
            } else {
              e.stopPropagation()
            }
          }}
          autoFocus
        />
      )}

      {/* wall length / label floating input */}
      {floatInput && floatPos && (
        <input
          className="float-input"
          style={{ left: floatPos.x, top: floatPos.y - 36, transform: 'translateX(-50%)' }}
          value={floatValue}
          placeholder={floatInput.kind === 'label' ? 'Room name' : `12'6"`}
          onChange={(e) => setFloatValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyFloatInput()
            } else if (e.key === 'Escape') {
              setFloatInput(null)
              useStore.getState().select(null)
            } else {
              e.stopPropagation()
            }
          }}
          onBlur={() => {
            if (floatInput.kind === 'label') applyFloatInput()
          }}
          autoFocus={floatInput.kind === 'label'}
        />
      )}

      {/* road finish button */}
      {roadDraft && roadDraft.nodes.length >= 2 && (
        <button className="road-done" onClick={finishRoad}>
          ✓ Finish road
        </button>
      )}

      {/* zoom controls */}
      <div className="zoom-controls">
        <button title="Zoom in" onClick={() => setView((v) => ({ ...v, ppi: Math.min(12, v.ppi * 1.3) }))}>
          +
        </button>
        <button title="Zoom out" onClick={() => setView((v) => ({ ...v, ppi: Math.max(0.12, v.ppi / 1.3) }))}>
          −
        </button>
        <button title="Fit plan" onClick={fitView}>
          ⤢
        </button>
      </div>

      {/* helper hint */}
      <div className="canvas-hint">
        {tool.type === 'wall' || tool.type === 'fence'
          ? draft
            ? 'Click to place · type a length + Enter for exact · Enter/Esc to finish'
            : tool.type === 'fence'
              ? 'Click to run fence lines · snaps to marks, posts & 45°'
              : 'Click to start a wall · snaps to marks, endpoints & 45°'
          : tool.type === 'opening'
            ? 'Hover a wall, click to place. Drag later to reposition.'
            : tool.type === 'place'
              ? 'Click to place · hold Shift to place multiple'
              : tool.type === 'label'
                ? 'Click to add a label'
                : tool.type === 'measure'
                  ? 'Click to drop a reference mark · marks show distances to nearby walls and snap like endpoints'
                  : tool.type === 'road'
                    ? roadDraft
                      ? 'Click to add points · click-drag for curves · Enter or ✓ to generate the road · Esc cancels'
                      : 'Pen tool: click to place the road centerline · click-drag a point to curve it'
                  : tool.type === 'paint'
                    ? 'Click inside a room to set its floor material'
                    : isPlot
                      ? 'Drag buildings to move them · double-click a building to edit its floors'
                      : activeFloor > 0
                        ? `Editing ${floor.name} — the floor below is shown in gray`
                        : 'Scroll to pan · ⌘/Ctrl+scroll to zoom · Space+drag to pan'}
      </div>
    </div>
  )
}
