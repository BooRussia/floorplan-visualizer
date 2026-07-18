import { create } from 'zustand'
import {
  emptyPlan,
  uid,
  type Furniture,
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

interface StoreState {
  plan: Plan
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

  /** Push current plan onto the undo stack (call before a discrete mutation, or on drag start). */
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
  deleteSelected: () => void
  duplicateSelected: () => void
  clearPlan: () => void
  loadPlan: (p: Plan) => void
}

const clone = (p: Plan): Plan => JSON.parse(JSON.stringify(p))

function loadInitial(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p && Array.isArray(p.walls)) return p
    }
  } catch {
    /* corrupted save — start fresh */
  }
  // first launch: open with the sample apartment so there's something to explore
  return JSON.parse(JSON.stringify(SAMPLE_PLAN))
}

export const useStore = create<StoreState>((set, get) => ({
  plan: loadInitial(),
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

  checkpoint: () => {
    const { plan, past } = get()
    const next = [...past, clone(plan)]
    if (next.length > 100) next.shift()
    set({ past: next, future: [] })
  },
  undo: () => {
    const { past, plan, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({
      plan: prev,
      past: past.slice(0, -1),
      future: [clone(plan), ...future],
      selection: null,
    })
  },
  redo: () => {
    const { past, plan, future } = get()
    if (!future.length) return
    const next = future[0]
    set({
      plan: next,
      future: future.slice(1),
      past: [...past, clone(plan)],
      selection: null,
    })
  },

  addWall: (w) => {
    const id = uid('wall')
    set((s) => ({ plan: { ...s.plan, walls: [...s.plan.walls, { ...w, id }] } }))
    return id
  },
  updateWall: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        walls: s.plan.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
    })),
  addOpening: (o) => {
    const id = uid('op')
    set((s) => ({ plan: { ...s.plan, openings: [...s.plan.openings, { ...o, id }] } }))
    return id
  },
  updateOpening: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        openings: s.plan.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      },
    })),
  addFurniture: (kind, x, y, rot = 0) => {
    const item = catalogItem(kind)
    const id = uid('furn')
    const f: Furniture = { id, kind, x, y, rot, w: item.w, d: item.d, h: item.h }
    set((s) => ({ plan: { ...s.plan, furniture: [...s.plan.furniture, f] } }))
    return id
  },
  updateFurniture: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        furniture: s.plan.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    })),
  addLabel: (x, y, text = 'Room') => {
    const id = uid('label')
    const l: Label = { id, x, y, text, size: 9 }
    set((s) => ({ plan: { ...s.plan, labels: [...s.plan.labels, l] } }))
    return id
  },
  updateLabel: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        labels: s.plan.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      },
    })),

  deleteSelected: () => {
    const { selection, plan, checkpoint } = get()
    if (!selection) return
    checkpoint()
    const p = clone(plan)
    if (selection.kind === 'wall') {
      p.walls = p.walls.filter((w) => w.id !== selection.id)
      p.openings = p.openings.filter((o) => o.wallId !== selection.id)
    } else if (selection.kind === 'opening') {
      p.openings = p.openings.filter((o) => o.id !== selection.id)
    } else if (selection.kind === 'furniture') {
      p.furniture = p.furniture.filter((f) => f.id !== selection.id)
    } else if (selection.kind === 'label') {
      p.labels = p.labels.filter((l) => l.id !== selection.id)
    }
    set({ plan: p, selection: null })
  },

  duplicateSelected: () => {
    const { selection, plan, checkpoint } = get()
    if (!selection || selection.kind !== 'furniture') return
    const f = plan.furniture.find((x) => x.id === selection.id)
    if (!f) return
    checkpoint()
    const id = uid('furn')
    const copy = { ...f, id, x: f.x + 12, y: f.y + 12 }
    set((s) => ({
      plan: { ...s.plan, furniture: [...s.plan.furniture, copy] },
      selection: { kind: 'furniture', id },
    }))
  },

  clearPlan: () => {
    get().checkpoint()
    set({ plan: emptyPlan(), selection: null })
  },
  loadPlan: (p) => {
    get().checkpoint()
    set({ plan: p, selection: null })
  },
}))

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
