import { useRef, useState } from 'react'
import { useActiveFloor, useStore } from '../model/store'
import { SAMPLE_PROJECT } from '../model/samplePlan'
import { MAX_FLOORS, type FenceType, type FloorMaterial, type OpeningType } from '../model/types'

const DOOR_TYPES: { type: OpeningType; label: string }[] = [
  { type: 'door', label: 'Single door' },
  { type: 'double-door', label: 'Double door' },
  { type: 'sliding', label: 'Sliding glass' },
  { type: 'bifold', label: 'Bifold' },
  { type: 'opening', label: 'Cased opening' },
  { type: 'garage', label: 'Garage door' },
]

const FENCE_TYPES: { type: FenceType; label: string }[] = [
  { type: 'privacy', label: 'Privacy fence' },
  { type: 'picket', label: 'Picket fence' },
  { type: 'chain', label: 'Chain-link' },
  { type: 'rail', label: 'Split rail' },
]

const PAINT_MATERIALS: { type: FloorMaterial; label: string }[] = [
  { type: 'wood', label: 'Wood' },
  { type: 'tile', label: 'Tile' },
  { type: 'carpet', label: 'Carpet' },
  { type: 'concrete', label: 'Concrete' },
  { type: 'stone', label: 'Stone' },
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

/** Split button with a dropdown of variants. The menu renders position:fixed so the
 * toolbar's overflow clipping can't hide it. */
function DropTool({
  active,
  label,
  title,
  options,
  onPick,
  onMain,
  icon,
}: {
  active: boolean
  label: string
  title: string
  options: { key: string; label: string }[]
  onPick: (key: string) => void
  onMain: () => void
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setPos({ x: r.left, y: r.bottom + 4 })
    }
    setOpen(!open)
  }

  return (
    <div className="tb-split" ref={wrapRef}>
      <ToolButton active={active} onClick={onMain} title={title}>
        {icon}
        {label}
      </ToolButton>
      <button className="tb-caret" onClick={toggle} title={title}>
        ▾
      </button>
      {open && (
        <div
          className="tb-menu"
          style={{ left: pos.x, top: pos.y }}
          onPointerLeave={() => setOpen(false)}
        >
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                onPick(o.key)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const mode = useStore((s) => s.mode)
  const buildings = useStore((s) => s.project.buildings)
  const showDims = useStore((s) => s.showDims)
  const setShowDims = useStore((s) => s.setShowDims)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const hasGuides = useActiveFloor().guides.length > 0
  const snapOn = useStore((s) => s.snapOn)
  const theme = useStore((s) => s.theme)
  const fileRef = useRef<HTMLInputElement>(null)

  const isPlot = mode.scope === 'plot'
  const building = !isPlot ? buildings[mode.index] : null
  const floors = building?.floors ?? []
  const activeFloor = useStore((s) => s.activeFloor)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const addFloor = useStore((s) => s.addFloor)

  const doorActive = tool.type === 'opening' && tool.opening !== 'window'
  const currentDoor: OpeningType = doorActive ? (tool as any).opening : 'door'
  const currentFence: FenceType = tool.type === 'fence' ? tool.fence : 'privacy'
  const currentPaint: FloorMaterial = tool.type === 'paint' ? tool.material : 'tile'

  const exportJson = () => {
    const { project } = useStore.getState()
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'property.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    file.text().then((text) => {
      try {
        if (!useStore.getState().loadProject(JSON.parse(text))) {
          alert('That file does not look like a project export.')
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

      <div className="tb-scroll">
        {view === '2d' && (
        <>
          {/* breadcrumb: plot ↔ building */}
          <div className="tb-crumbs">
            <button
              className={`tb-crumb ${isPlot ? 'active' : ''}`}
              onClick={() => useStore.getState().exitToPlot()}
              title="Edit the site plan"
            >
              ⌂ Plot
            </button>
            {building && (
              <>
                <span className="tb-crumb-sep">›</span>
                <span className="tb-crumb active">{building.name}</span>
              </>
            )}
          </div>

          {!isPlot && (
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
          )}

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

            {isPlot && (
              <ToolButton
                active={tool.type === 'road'}
                onClick={() => setTool({ type: 'road' })}
                title="Draw a road with the pen tool: click points, drag for curves"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 13C5 13 4 3 8 3s3 10 6 10" stroke="currentColor" strokeWidth="1.6" fill="none" />
                  <circle cx="8" cy="3" r="1.6" fill="currentColor" />
                  <circle cx="2" cy="13" r="1.6" fill="currentColor" />
                  <circle cx="14" cy="13" r="1.6" fill="currentColor" />
                </svg>
                Road
              </ToolButton>
            )}
            {isPlot && (
              <ToolButton
                active={tool.type === 'opening' && tool.opening === 'gate'}
                onClick={() => setTool({ type: 'opening', opening: 'gate' })}
                title="Place a gate on a fence — width is adjustable after placing"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 6v7M14 6v7M5 6v7M8 6v7M11 6v7" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M2 6c4-4 8-4 12 0" stroke="currentColor" strokeWidth="1.4" fill="none" />
                </svg>
                Gate
              </ToolButton>
            )}
            {isPlot ? (
              <DropTool
                active={tool.type === 'fence'}
                label={FENCE_TYPES.find((f) => f.type === currentFence)?.label ?? 'Fence'}
                title="Draw fence lines (W)"
                options={FENCE_TYPES.map((f) => ({ key: f.type, label: f.label }))}
                onMain={() => setTool({ type: 'fence', fence: currentFence })}
                onPick={(k) => setTool({ type: 'fence', fence: k as FenceType })}
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 6v7M6 6v7M10 6v7M14 6v7M1 8h14M1 11h14" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                }
              />
            ) : (
              <>
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
                <DropTool
                  active={doorActive}
                  label={DOOR_TYPES.find((d) => d.type === currentDoor)?.label ?? 'Door'}
                  title="Place doors (D)"
                  options={DOOR_TYPES.map((d) => ({ key: d.type, label: d.label }))}
                  onMain={() => setTool({ type: 'opening', opening: currentDoor })}
                  onPick={(k) => setTool({ type: 'opening', opening: k as OpeningType })}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 13h10M4 13V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M11 3a8 8 0 0 1-7 8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none" />
                    </svg>
                  }
                />
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
                <DropTool
                  active={tool.type === 'paint'}
                  label={`Floor: ${PAINT_MATERIALS.find((p) => p.type === currentPaint)?.label ?? 'Tile'}`}
                  title="Set room floor materials (P)"
                  options={PAINT_MATERIALS.map((p) => ({ key: p.type, label: p.label }))}
                  onMain={() => setTool({ type: 'paint', material: currentPaint })}
                  onPick={(k) => setTool({ type: 'paint', material: k as FloorMaterial })}
                  icon={
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 9l7-7 5 5-7 7H4l-2-2v-3z" stroke="currentColor" strokeWidth="1.3" fill="none" />
                      <path d="M12.5 11.5s1.5 1.8 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.9 1.5-2.7 1.5-2.7z" fill="currentColor" />
                    </svg>
                  }
                />
              </>
            )}

            <ToolButton
              active={tool.type === 'box'}
              onClick={() => setTool({ type: 'box' })}
              title={isPlot ? 'Draw a fenced rectangle (B): drag, or click for exact sizes' : 'Draw a room box (B): drag for size, or click to type exact dimensions like 40×60'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2.5" y="3.5" width="11" height="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
              </svg>
              Box
            </ToolButton>
            <ToolButton
              active={tool.type === 'label'}
              onClick={() => setTool({ type: 'label' })}
              title="Add label (T)"
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
                title="Clear all measurement marks on this layer"
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
            <ToolButton active={showDims} onClick={() => setShowDims(!showDims)} title="Show wall dimensions">
              ⇤⇥
            </ToolButton>
            <ToolButton
              active={snapOn}
              onClick={() => useStore.getState().setSnapOn(!snapOn)}
              title={
                snapOn
                  ? 'Angle snap ON — lines lock to 45°/90° (S toggles, hold Alt for free angles). Endpoints & marks always snap.'
                  : 'Angle snap OFF — draw at any angle (S toggles, hold Alt to lock 45°). Endpoints & marks still snap.'
              }
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 2v6a4 4 0 0 0 8 0V2"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  fill="none"
                />
                <path d="M4 2v3M12 2v3" stroke="currentColor" strokeWidth="3.4" />
                {!snapOn && <path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.4" />}
              </svg>
              Snap
            </ToolButton>
          </div>

          <div className="tb-group tb-file">
            <ToolButton onClick={exportJson} title="Export project as JSON" active={false}>
              Export
            </ToolButton>
            <ToolButton onClick={() => fileRef.current?.click()} title="Import project JSON" active={false}>
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
                if (confirm('Clear the entire project? (Undo is available afterwards.)')) {
                  useStore.getState().clearProject()
                }
              }}
              title="Clear project"
              active={false}
            >
              Clear
            </ToolButton>
            <ToolButton
              onClick={() => useStore.getState().loadProject(JSON.parse(JSON.stringify(SAMPLE_PROJECT)))}
              title="Load the sample property"
              active={false}
            >
              Sample
            </ToolButton>
          </div>
        </>
      )}

      </div>

      <div className="tb-right">
        <button
          className="tb-btn"
          onClick={() => useStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ fontSize: 15 }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          className="tb-primary"
          onClick={() => setView(view === '2d' ? '3d' : '2d')}
          title={view === '2d' ? 'Generate a textured 3D view of the whole property' : 'Back to the 2D editor'}
        >
          {view === '2d' ? 'Generate 3D ✦' : '← Back to 2D editor'}
        </button>
      </div>
    </header>
  )
}
