import { create } from 'zustand'
import {
  emptyFloor,
  emptyPlan,
  migratePlan,
  MAX_FLOORS,
  STORY_GAP,
  uid,
  type Floor,
  type Furniture,
  type Guide,
  type Label,
  type Opening,
  type Plan,
  type Selection,
  type Tool,
  type Wall,
} from './types'
import { catalogItem } from './catalog'
import { SAMPLE_PLAN } from './samplePlan'

const STORAGE_KEY = 'floorplan-visualizer-plan-v1'

/** Stair sizing from total rise: risers ≤ 7¾", treads 10½". */
export function stairSpecs(totalRise: number) {
  const risers = Math.max(2, Math.ceil(totalRise / 7.75))
  const treadDepth = 10.5
  const treads = risers - 1
  return { risers, treads, treadDepth, run: treads * treadDepth, riserHeight: totalRise / risers }
}

interface StoreState {
  plan: Plan
  activeFloor: number
  selection: Selection
  tool: Tool
  view: '2d' | '3d'
  showDims: boolean
  past: Plan[]
  future: Plan[]

  setTool: (t: Tool) => void
  setView: (v: '2d' | '3d') => void
  setShowDims: (b: boolean) => void
  select: (s: Selection) => void

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
  deleteSelected: () => void
  duplicateSelected: () => void
  clearPlan: () => void
  loadPlan: (p: unknown) => boolean
}

const clone = <T,>(p: T): T => JSON.parse(JSON.stringify(p))

function loadInitial(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = migratePlan(JSON.parse(raw))
      if (p) return p
    }
  } catch {
    /* corrupted save — start fresh */
  }
  // first launch: open with the sample apartment so there's something to explore
  return clone(SAMPLE_PLAN)
}

export const useStore = create<StoreState>((set, get) => {
  /** Apply fn to the active floor, immutably. */
  const onFloor = (fn: (f: Floor) => Floor) =>
    set((s) => ({
      plan: {
        floors: s.plan.floors.map((f, i) => (i === s.activeFloor ? fn(f) : f)),
      },
    }))

  return {
    plan: loadInitial(),
    activeFloor: 0,
    selection: null,
    tool: { type: 'select' },
    view: '2d',
    showDims: true,
    past: [],
    future: [],

    setTool: (tool) => set({ tool, selection: null }),
    setView: (view) => set({ view }),
    setShowDims: (showDims) => set({ showDims }),
    select: (selection) => set({ selection }),

    setActiveFloor: (i) =>
      set((s) => ({
        activeFloor: Math.max(0, Math.min(i, s.plan.floors.length - 1)),
        selection: null,
      })),
    addFloor: () => {
      const { plan, checkpoint } = get()
      if (plan.floors.length >= MAX_FLOORS) return
      checkpoint()
      const f = emptyFloor(plan.floors.length + 1)
      set((s) => ({
        plan: { floors: [...s.plan.floors, f] },
        activeFloor: s.plan.floors.length,
        selection: null,
      }))
    },
    deleteFloor: (i) => {
      const { plan, checkpoint } = get()
      if (plan.floors.length <= 1 || i === 0) return // ground floor stays
      checkpoint()
      set((s) => ({
        plan: { floors: s.plan.floors.filter((_, j) => j !== i) },
        activeFloor: Math.min(s.activeFloor, s.plan.floors.length - 2),
        selection: null,
      }))
    },
    updateFloor: (i, patch) =>
      set((s) => ({
        plan: { floors: s.plan.floors.map((f, j) => (j === i ? { ...f, ...patch } : f)) },
      })),

    checkpoint: () => {
      const { plan, past } = get()
      const next = [...past, clone(plan)]
      if (next.length > 100) next.shift()
      set({ past: next, future: [] })
    },
    undo: () => {
      const { past, plan, future, activeFloor } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({
        plan: prev,
        past: past.slice(0, -1),
        future: [clone(plan), ...future],
        selection: null,
        activeFloor: Math.min(activeFloor, prev.floors.length - 1),
      })
    },
    redo: () => {
      const { past, plan, future, activeFloor } = get()
      if (!future.length) return
      const next = future[0]
      set({
        plan: next,
        future: future.slice(1),
        past: [...past, clone(plan)],
        selection: null,
        activeFloor: Math.min(activeFloor, next.floors.length - 1),
      })
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
      const floor = get().plan.floors[get().activeFloor]
      let { w, d, h } = item
      if (kind === 'staircase') {
        // size the run for this story's rise
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

    deleteSelected: () => {
      const { selection, checkpoint } = get()
      if (!selection) return
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
        }
        return p
      })
      set({ selection: null })
    },

    duplicateSelected: () => {
      const { selection, plan, activeFloor, checkpoint } = get()
      if (!selection || selection.kind !== 'furniture') return
      const f = plan.floors[activeFloor].furniture.find((x) => x.id === selection.id)
      if (!f) return
      checkpoint()
      const id = uid('furn')
      const copy = { ...f, id, x: f.x + 12, y: f.y + 12 }
      onFloor((fl) => ({ ...fl, furniture: [...fl.furniture, copy] }))
      set({ selection: { kind: 'furniture', id } })
    },

    clearPlan: () => {
      get().checkpoint()
      set({ plan: emptyPlan(), activeFloor: 0, selection: null })
    },
    loadPlan: (raw) => {
      const p = migratePlan(raw)
      if (!p) return false
      get().checkpoint()
      set({ plan: p, activeFloor: 0, selection: null })
      return true
    },
  }
})

/** Convenience selector for the floor being edited. */
export const useActiveFloor = () => useStore((s) => s.plan.floors[s.activeFloor])

// Debug/scripting access from the browser console (dev only)
if (import.meta.env.DEV) (globalThis as any).__store = useStore

// Autosave (debounced)
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((state) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan))
    } catch {
      /* storage full/unavailable — skip autosave */
    }
  }, 400)
})
