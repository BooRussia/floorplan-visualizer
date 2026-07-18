import { create } from 'zustand'
import {
  emptyBuilding,
  emptyFloor,
  emptyProject,
  migrateProject,
  MAX_BUILDINGS,
  MAX_FLOORS,
  STORY_GAP,
  uid,
  type Building,
  type EditMode,
  type Floor,
  type FloorMaterial,
  type FloorPaint,
  type Furniture,
  type Guide,
  type Label,
  type Opening,
  type Project,
  type Road,
  type Selection,
  type Tool,
  type Wall,
} from './types'
import { catalogItem } from './catalog'
import { SAMPLE_PROJECT } from './samplePlan'

const STORAGE_KEY = 'floorplan-visualizer-project-v3'
const LEGACY_KEY = 'floorplan-visualizer-plan-v1'

/** Stair sizing from total rise: risers ≤ 7¾", treads 10½". */
export function stairSpecs(totalRise: number) {
  const risers = Math.max(2, Math.ceil(totalRise / 7.75))
  const treadDepth = 10.5
  const treads = risers - 1
  return { risers, treads, treadDepth, run: treads * treadDepth, riserHeight: totalRise / risers }
}

interface StoreState {
  project: Project
  mode: EditMode
  activeFloor: number
  selection: Selection
  tool: Tool
  view: '2d' | '3d'
  showDims: boolean
  /** magnet: endpoint/guide/angle snapping while drawing (S toggles; Alt overrides) */
  snapOn: boolean
  theme: 'light' | 'dark'
  past: Project[]
  future: Project[]

  setTool: (t: Tool) => void
  setView: (v: '2d' | '3d') => void
  setShowDims: (b: boolean) => void
  setSnapOn: (b: boolean) => void
  setTheme: (t: 'light' | 'dark') => void
  select: (s: Selection) => void

  enterBuilding: (index: number) => void
  exitToPlot: () => void
  setPlotSize: (w: number, d: number) => void
  addBuilding: (opts?: { w?: number; d?: number; x?: number; y?: number; name?: string }) => void
  updateBuilding: (id: string, patch: Partial<Pick<Building, 'name' | 'x' | 'y' | 'rot'>>) => void
  deleteBuilding: (id: string) => void

  setActiveFloor: (i: number) => void
  addFloor: () => void
  deleteFloor: (i: number) => void
  updateFloor: (i: number, patch: Partial<Pick<Floor, 'name' | 'height'>>) => void

  checkpoint: () => void
  undo: () => void
  redo: () => void

  addWall: (w: Omit<Wall, 'id'>) => string
  updateWall: (id: string, patch: Partial<Wall>) => void
  addOpening: (o: Omit<Opening, 'id'>) => string
  updateOpening: (id: string, patch: Partial<Opening>) => void
  addFurniture: (kind: string, x: number, y: number, rot?: number) => string
  updateFurniture: (id: string, patch: Partial<Furniture>) => void
  addLabel: (x: number, y: number, text?: string) => string
  updateLabel: (id: string, patch: Partial<Label>) => void
  addGuide: (x: number, y: number) => string
  updateGuide: (id: string, patch: Partial<Guide>) => void
  clearGuides: () => void
  addPaint: (x: number, y: number, material: FloorMaterial) => string
  updatePaint: (id: string, patch: Partial<FloorPaint>) => void
  addRoad: (road: Omit<Road, 'id'>) => string
  updateRoad: (id: string, patch: Partial<Road>) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  clearProject: () => void
  loadProject: (p: unknown) => boolean
}

const clone = <T,>(p: T): T => JSON.parse(JSON.stringify(p))

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const p = migrateProject(JSON.parse(raw))
      if (p) return p
    }
  } catch {
    /* corrupted save — start fresh */
  }
  return clone(SAMPLE_PROJECT)
}

/** The floor currently being edited (site layer in plot mode). */
export function floorFor(state: { project: Project; mode: EditMode; activeFloor: number }): Floor {
  if (state.mode.scope === 'plot') return state.project.site
  const b = state.project.buildings[state.mode.index]
  return b.floors[Math.min(state.activeFloor, b.floors.length - 1)]
}

export const useStore = create<StoreState>((set, get) => {
  /** Apply fn to the active floor (site or building floor), immutably. */
  const onFloor = (fn: (f: Floor) => Floor) =>
    set((s) => {
      if (s.mode.scope === 'plot') {
        return { project: { ...s.project, site: fn(s.project.site) } }
      }
      const bi = s.mode.index
      return {
        project: {
          ...s.project,
          buildings: s.project.buildings.map((b, i) =>
            i === bi
              ? {
                  ...b,
                  floors: b.floors.map((f, j) => (j === s.activeFloor ? fn(f) : f)),
                }
              : b
          ),
        },
      }
    })

  return {
    project: loadInitial(),
    mode: { scope: 'plot' },
    activeFloor: 0,
    selection: null,
    tool: { type: 'select' },
    view: '2d',
    showDims: true,
    snapOn: true,
    theme: (localStorage.getItem('fv-theme') === 'dark' ? 'dark' : 'light') as 'light' | 'dark',
    past: [],
    future: [],

    setTool: (tool) => set({ tool, selection: null }),
    setView: (view) => set({ view }),
    setShowDims: (showDims) => set({ showDims }),
    setSnapOn: (snapOn) => set({ snapOn }),
    setTheme: (theme) => {
      localStorage.setItem('fv-theme', theme)
      document.documentElement.dataset.theme = theme
      set({ theme })
    },
    select: (selection) => set({ selection }),

    enterBuilding: (index) =>
      set((s) => ({
        mode: { scope: 'building', index: Math.max(0, Math.min(index, s.project.buildings.length - 1)) },
        activeFloor: 0,
        selection: null,
        tool: { type: 'select' },
      })),
    exitToPlot: () =>
      set({ mode: { scope: 'plot' }, activeFloor: 0, selection: null, tool: { type: 'select' } }),
    setPlotSize: (w, d) => {
      get().checkpoint()
      set((s) => ({
        project: {
          ...s.project,
          plotW: Math.max(240, Math.min(w, 5280 * 12)),
          plotD: Math.max(240, Math.min(d, 5280 * 12)),
        },
      }))
    },
    addBuilding: (opts) => {
      const { project, checkpoint } = get()
      if (project.buildings.length >= MAX_BUILDINGS) return
      checkpoint()
      const w = opts?.w
      const d = opts?.d
      // when a footprint is given, center the building's shell on the drop point
      const cx = opts?.x ?? project.plotW / 2
      const cy = opts?.y ?? project.plotD / 2
      const ox = w && d ? cx - w / 2 : cx
      const oy = w && d ? cy - d / 2 : cy
      const b = emptyBuilding(project.buildings.length + 1, ox, oy)
      if (opts?.name) b.name = opts.name
      if (w && d) {
        const mk = (ax: number, ay: number, bx: number, by: number): Wall => ({
          id: uid('wall'),
          a: { x: ax, y: ay },
          b: { x: bx, y: by },
          thickness: 6,
          bulge: 0,
          height: b.floors[0].height,
        })
        b.floors[0].walls = [mk(0, 0, w, 0), mk(w, 0, w, d), mk(w, d, 0, d), mk(0, d, 0, 0)]
      }
      set((s) => ({
        project: { ...s.project, buildings: [...s.project.buildings, b] },
        selection: { kind: 'building', id: b.id },
      }))
    },
    updateBuilding: (id, patch) =>
      set((s) => ({
        project: {
          ...s.project,
          buildings: s.project.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        },
      })),
    deleteBuilding: (id) => {
      const { project, checkpoint } = get()
      if (project.buildings.length <= 1) return
      checkpoint()
      set((s) => ({
        project: { ...s.project, buildings: s.project.buildings.filter((b) => b.id !== id) },
        mode: { scope: 'plot' },
        selection: null,
      }))
    },

    setActiveFloor: (i) =>
      set((s) => {
        if (s.mode.scope !== 'building') return {}
        const b = s.project.buildings[s.mode.index]
        return { activeFloor: Math.max(0, Math.min(i, b.floors.length - 1)), selection: null }
      }),
    addFloor: () => {
      const s = get()
      if (s.mode.scope !== 'building') return
      const b = s.project.buildings[s.mode.index]
      if (b.floors.length >= MAX_FLOORS) return
      s.checkpoint()
      const f = emptyFloor(b.floors.length + 1)
      set((st) => {
        const bi = (st.mode as { scope: 'building'; index: number }).index
        return {
          project: {
            ...st.project,
            buildings: st.project.buildings.map((bb, i) =>
              i === bi ? { ...bb, floors: [...bb.floors, f] } : bb
            ),
          },
          activeFloor: b.floors.length,
          selection: null,
        }
      })
    },
    deleteFloor: (i) => {
      const s = get()
      if (s.mode.scope !== 'building' || i === 0) return
      const bi = s.mode.index
      const b = s.project.buildings[bi]
      if (b.floors.length <= 1) return
      s.checkpoint()
      set((st) => ({
        project: {
          ...st.project,
          buildings: st.project.buildings.map((bb, j) =>
            j === bi ? { ...bb, floors: bb.floors.filter((_, k) => k !== i) } : bb
          ),
        },
        activeFloor: Math.min(s.activeFloor, b.floors.length - 2),
        selection: null,
      }))
    },
    updateFloor: (i, patch) =>
      set((s) => {
        if (s.mode.scope !== 'building') return {}
        const bi = s.mode.index
        return {
          project: {
            ...s.project,
            buildings: s.project.buildings.map((b, j) =>
              j === bi
                ? { ...b, floors: b.floors.map((f, k) => (k === i ? { ...f, ...patch } : f)) }
                : b
            ),
          },
        }
      }),

    checkpoint: () => {
      const { project, past } = get()
      const next = [...past, clone(project)]
      if (next.length > 100) next.shift()
      set({ past: next, future: [] })
    },
    undo: () => {
      const { past, project, future } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set((s) => ({
        project: prev,
        past: past.slice(0, -1),
        future: [clone(project), ...future],
        selection: null,
        mode:
          s.mode.scope === 'building' && s.mode.index >= prev.buildings.length
            ? { scope: 'plot' }
            : s.mode,
      }))
    },
    redo: () => {
      const { past, project, future } = get()
      if (!future.length) return
      const next = future[0]
      set((s) => ({
        project: next,
        future: future.slice(1),
        past: [...past, clone(project)],
        selection: null,
        mode:
          s.mode.scope === 'building' && s.mode.index >= next.buildings.length
            ? { scope: 'plot' }
            : s.mode,
      }))
    },

    addWall: (w) => {
      const id = uid('wall')
      onFloor((f) => ({ ...f, walls: [...f.walls, { ...w, id }] }))
      return id
    },
    updateWall: (id, patch) =>
      onFloor((f) => ({
        ...f,
        walls: f.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      })),
    addOpening: (o) => {
      const id = uid('op')
      onFloor((f) => ({ ...f, openings: [...f.openings, { ...o, id }] }))
      return id
    },
    updateOpening: (id, patch) =>
      onFloor((f) => ({
        ...f,
        openings: f.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      })),
    addFurniture: (kind, x, y, rot = 0) => {
      const item = catalogItem(kind)
      const id = uid('furn')
      const s = get()
      let { w, d, h } = item
      if (kind === 'staircase' && s.mode.scope === 'building') {
        const floor = floorFor(s)
        const specs = stairSpecs(floor.height + STORY_GAP)
        d = specs.run
        h = floor.height + STORY_GAP
      }
      const furn: Furniture = { id, kind, x, y, rot, w, d, h }
      onFloor((f) => ({ ...f, furniture: [...f.furniture, furn] }))
      return id
    },
    updateFurniture: (id, patch) =>
      onFloor((f) => ({
        ...f,
        furniture: f.furniture.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      })),
    addLabel: (x, y, text = 'Room') => {
      const id = uid('label')
      const l: Label = { id, x, y, text, size: 9 }
      onFloor((f) => ({ ...f, labels: [...f.labels, l] }))
      return id
    },
    updateLabel: (id, patch) =>
      onFloor((f) => ({
        ...f,
        labels: f.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      })),
    addGuide: (x, y) => {
      const id = uid('guide')
      get().checkpoint()
      onFloor((f) => ({ ...f, guides: [...f.guides, { id, x, y }] }))
      return id
    },
    updateGuide: (id, patch) =>
      onFloor((f) => ({
        ...f,
        guides: f.guides.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      })),
    clearGuides: () => {
      get().checkpoint()
      onFloor((f) => ({ ...f, guides: [] }))
      set({ selection: null })
    },
    addPaint: (x, y, material) => {
      const id = uid('paint')
      get().checkpoint()
      onFloor((f) => ({ ...f, paints: [...f.paints, { id, x, y, material }] }))
      return id
    },
    updatePaint: (id, patch) =>
      onFloor((f) => ({
        ...f,
        paints: f.paints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    addRoad: (road) => {
      const id = uid('road')
      get().checkpoint()
      onFloor((f) => ({ ...f, roads: [...f.roads, { ...road, id }] }))
      return id
    },
    updateRoad: (id, patch) =>
      onFloor((f) => ({
        ...f,
        roads: f.roads.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),

    deleteSelected: () => {
      const { selection, checkpoint } = get()
      if (!selection) return
      if (selection.kind === 'building') {
        get().deleteBuilding(selection.id)
        return
      }
      checkpoint()
      onFloor((f) => {
        const p = clone(f)
        if (selection.kind === 'wall') {
          p.walls = p.walls.filter((w) => w.id !== selection.id)
          p.openings = p.openings.filter((o) => o.wallId !== selection.id)
        } else if (selection.kind === 'opening') {
          p.openings = p.openings.filter((o) => o.id !== selection.id)
        } else if (selection.kind === 'furniture') {
          p.furniture = p.furniture.filter((x) => x.id !== selection.id)
        } else if (selection.kind === 'label') {
          p.labels = p.labels.filter((l) => l.id !== selection.id)
        } else if (selection.kind === 'guide') {
          p.guides = p.guides.filter((g) => g.id !== selection.id)
        } else if (selection.kind === 'paint') {
          p.paints = p.paints.filter((g) => g.id !== selection.id)
        } else if (selection.kind === 'road') {
          p.roads = p.roads.filter((r) => r.id !== selection.id)
        }
        return p
      })
      set({ selection: null })
    },

    duplicateSelected: () => {
      const s = get()
      if (!s.selection || s.selection.kind !== 'furniture') return
      const selId = s.selection.id
      const f = floorFor(s).furniture.find((x) => x.id === selId)
      if (!f) return
      s.checkpoint()
      const id = uid('furn')
      const copy = { ...f, id, x: f.x + 12, y: f.y + 12 }
      onFloor((fl) => ({ ...fl, furniture: [...fl.furniture, copy] }))
      set({ selection: { kind: 'furniture', id } })
    },

    clearProject: () => {
      get().checkpoint()
      set({ project: emptyProject(), mode: { scope: 'plot' }, activeFloor: 0, selection: null })
    },
    loadProject: (raw) => {
      const p = migrateProject(raw)
      if (!p) return false
      get().checkpoint()
      set({ project: p, mode: { scope: 'plot' }, activeFloor: 0, selection: null })
      return true
    },
  }
})

/** Convenience selector for the floor being edited (site layer in plot mode). */
export const useActiveFloor = () => useStore((s) => floorFor(s))

// apply the persisted theme immediately
document.documentElement.dataset.theme = useStore.getState().theme

// Debug/scripting access from the browser console (dev only)
if (import.meta.env.DEV) (globalThis as any).__store = useStore

// Autosave (debounced)
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((state) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project))
    } catch {
      /* storage full/unavailable — skip autosave */
    }
  }, 400)
})
