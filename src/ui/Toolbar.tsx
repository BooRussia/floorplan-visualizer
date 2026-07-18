import { useRef, useState } from 'react'
import { useActiveFloor, useStore } from '../model/store'
import { SAMPLE_PLAN } from '../model/samplePlan'
import { MAX_FLOORS, type OpeningType } from '../model/types'

const DOOR_TYPES: { type: OpeningType; label: string }[] = [
  { type: 'door', label: 'Single door' },
  { type: 'double-door', label: 'Double door' },
  { type: 'sliding', label: 'Sliding glass' },
  { type: 'bifold', label: 'Bifold' },
  { type: 'opening', label: 'Cased opening' },
]

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button className={`tb-btn ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export default function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const showDims = useStore((s) => s.showDims)
  const setShowDims = useStore((s) => s.setShowDims)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const [doorMenu, setDoorMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const floors = useStore((s) => s.plan.floors)
  const activeFloor = useStore((s) => s.activeFloor)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const addFloor = useStore((s) => s.addFloor)
  const hasGuides = useActiveFloor().guides.length > 0

  const doorActive = tool.type === 'opening' && tool.opening !== 'window'
  const currentDoor: OpeningType = doorActive ? (tool as any).opening : 'door'

  const exportJson = () => {
    const { plan } = useStore.getState()
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floorplan.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    file.text().then((text) => {
      try {
        if (!useStore.getState().loadPlan(JSON.parse(text))) {
          alert('That file does not look like a floorplan export.')
        }
      } catch {
        alert('Could not read that file as JSON.')
      }
    })
  }

  return (
    <header className="toolbar">
      <div className="tb-brand">
        <span className="tb-logo">▦</span> Floorplan Visualizer
      </div>

      {view === '2d' && (
        <>
          <div className="tb-floors" role="tablist" aria-label="Floors">
            {floors.map((f, i) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={i === activeFloor}
                className={`tb-floor ${i === activeFloor ? 'active' : ''}`}
                title={`Edit ${f.name}`}
                onClick={() => setActiveFloor(i)}
              >
                {i + 1}
              </button>
            ))}
            {floors.length < MAX_FLOORS && (
              <button className="tb-floor add" title="Add a floor above" onClick={addFloor}>
                +
              </button>
            )}
          </div>
          <div className="tb-group">
            <ToolButton
              active={tool.type === 'select'}
              onClick={() => setTool({ type: 'select' })}
              title="Select / move (V)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 2l8 6.5-4 .5 2.2 4.3-1.8 1-2.2-4.5L4 12V2z" fill="currentColor" />
              </svg>
              Select
            </ToolButton>
            <ToolButton
              active={tool.type === 'wall'}
              onClick={() => setTool({ type: 'wall' })}
              title="Draw walls (W)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 12h12M2 12v-2h5V7h5V4h2" stroke="currentColor" strokeWidth="1.6" fill="none" />
              </svg>
              Wall
            </ToolButton>
            <div className="tb-split">
              <ToolButton
                active={doorActive}
                onClick={() => setTool({ type: 'opening', opening: currentDoor })}
                title="Place doors (D)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13h10M4 13V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M11 3a8 8 0 0 1-7 8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none" />
                </svg>
                {DOOR_TYPES.find((d) => d.type === currentDoor)?.label ?? 'Door'}
              </ToolButton>
              <button className="tb-caret" onClick={() => setDoorMenu(!doorMenu)} title="Door types">
                ▾
              </button>
              {doorMenu && (
                <div className="tb-menu" onPointerLeave={() => setDoorMenu(false)}>
                  {DOOR_TYPES.map((d) => (
                    <button
                      key={d.type}
                      onClick={() => {
                        setTool({ type: 'opening', opening: d.type })
                        setDoorMenu(false)
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ToolButton
              active={tool.type === 'opening' && tool.opening === 'window'}
              onClick={() => setTool({ type: 'opening', opening: 'window' })}
              title="Place windows (N)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="6" width="12" height="4" stroke="currentColor" strokeWidth="1.4" fill="none" />
                <path d="M2 8h12" stroke="currentColor" strokeWidth="1" />
              </svg>
              Window
            </ToolButton>
            <ToolButton
              active={tool.type === 'label'}
              onClick={() => setTool({ type: 'label' })}
              title="Add room label (T)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4V3h10v1M8 3v10M6.5 13h3" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
              Label
            </ToolButton>
            <ToolButton
              active={tool.type === 'measure'}
              onClick={() => setTool({ type: 'measure' })}
              title="Drop measurement reference marks (M)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5.5L10.5 8 8 10.5 5.5 8z" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
              Measure
            </ToolButton>
            {hasGuides && (
              <ToolButton
                onClick={() => useStore.getState().clearGuides()}
                title="Clear all measurement marks on this floor"
                active={false}
              >
                ✕ Marks
              </ToolButton>
            )}
          </div>

          <div className="tb-group">
            <ToolButton onClick={undo} title="Undo (⌘Z)" active={false}>
              <span style={{ opacity: canUndo ? 1 : 0.35 }}>↩</span>
            </ToolButton>
            <ToolButton onClick={redo} title="Redo (⌘⇧Z)" active={false}>
              <span style={{ opacity: canRedo ? 1 : 0.35 }}>↪</span>
            </ToolButton>
            <ToolButton
              active={showDims}
              onClick={() => setShowDims(!showDims)}
              title="Show wall dimensions"
            >
              ⇤⇥
            </ToolButton>
          </div>

          <div className="tb-group tb-file">
            <ToolButton onClick={exportJson} title="Export plan as JSON" active={false}>
              Export
            </ToolButton>
            <ToolButton onClick={() => fileRef.current?.click()} title="Import plan JSON" active={false}>
              Import
            </ToolButton>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.target.value = ''
              }}
            />
            <ToolButton
              onClick={() => {
                if (confirm('Clear the entire plan? (Undo is available afterwards.)')) {
                  useStore.getState().clearPlan()
                }
              }}
              title="Clear plan"
              active={false}
            >
              Clear
            </ToolButton>
            <ToolButton
              onClick={() => useStore.getState().loadPlan(JSON.parse(JSON.stringify(SAMPLE_PLAN)))}
              title="Load the sample apartment plan"
              active={false}
            >
              Sample
            </ToolButton>
          </div>
        </>
      )}

      <div className="tb-spacer" />

      <button
        className="tb-primary"
        onClick={() => setView(view === '2d' ? '3d' : '2d')}
        title={view === '2d' ? 'Generate a textured 3D view of this plan' : 'Back to the 2D editor'}
      >
        {view === '2d' ? 'Generate 3D ✦' : '← Back to 2D editor'}
      </button>
    </header>
  )
}
