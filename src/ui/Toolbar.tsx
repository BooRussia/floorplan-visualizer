import { useRef, useState } from 'react'
import { useActiveFloor, useStore } from '../model/store'
import { SAMPLE_PROJECT } from '../model/samplePlan'
import { MAX_FLOORS } from '../model/types'

function TbButton({
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
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | null>(null)

  const isPlot = mode.scope === 'plot'
  const building = !isPlot ? buildings[mode.index] : null
  const floors = building?.floors ?? []
  const activeFloor = useStore((s) => s.activeFloor)
  const setActiveFloor = useStore((s) => s.setActiveFloor)
  const addFloor = useStore((s) => s.addFloor)

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

      {view === '2d' && (
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
      )}

      {view === '2d' && !isPlot && (
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

      <div className="tb-spacer" />

      {view === '2d' && (
        <div className="tb-group">
          <TbButton onClick={undo} title="Undo (⌘Z)" active={false}>
            <span style={{ opacity: canUndo ? 1 : 0.35 }}>↩</span>
          </TbButton>
          <TbButton onClick={redo} title="Redo (⌘⇧Z)" active={false}>
            <span style={{ opacity: canRedo ? 1 : 0.35 }}>↪</span>
          </TbButton>
          <TbButton
            active={snapOn}
            onClick={() => useStore.getState().setSnapOn(!snapOn)}
            title={
              snapOn
                ? 'Angle snap ON — 45°/90° lock (S). Endpoints always snap.'
                : 'Angle snap OFF — any angle (S). Endpoints always snap.'
            }
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 2v6a4 4 0 0 0 8 0V2" stroke="currentColor" strokeWidth="2.2" fill="none" />
              <path d="M4 2v3M12 2v3" stroke="currentColor" strokeWidth="3.4" />
              {!snapOn && <path d="M2 14L14 2" stroke="currentColor" strokeWidth="1.4" />}
            </svg>
          </TbButton>
          <TbButton active={showDims} onClick={() => setShowDims(!showDims)} title="Show wall dimensions">
            ⇤⇥
          </TbButton>
          {hasGuides && (
            <TbButton
              onClick={() => useStore.getState().clearGuides()}
              title="Clear all measurement marks on this layer"
              active={false}
            >
              ✕
            </TbButton>
          )}
          <button
            className={`tb-btn ${fileMenu ? 'active' : ''}`}
            title="File — export, import, clear, sample"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setFileMenu(fileMenu ? null : { x: r.left, y: r.bottom + 4 })
            }}
          >
            File ▾
          </button>
        </div>
      )}

      {fileMenu && (
        <>
          <div className="tb-menu-scrim" onClick={() => setFileMenu(null)} />
          <div className="tb-menu" style={{ left: fileMenu.x, top: fileMenu.y }}>
            <button
              onClick={() => {
                exportJson()
                setFileMenu(null)
              }}
            >
              Export project…
            </button>
            <button
              onClick={() => {
                fileRef.current?.click()
                setFileMenu(null)
              }}
            >
              Import project…
            </button>
            <button
              onClick={() => {
                useStore.getState().loadProject(JSON.parse(JSON.stringify(SAMPLE_PROJECT)))
                setFileMenu(null)
              }}
            >
              Load sample property
            </button>
            <button
              onClick={() => {
                if (confirm('Clear the entire project? (Undo is available afterwards.)')) {
                  useStore.getState().clearProject()
                }
                setFileMenu(null)
              }}
            >
              Clear project
            </button>
          </div>
        </>
      )}

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
          title={
            view === '2d'
              ? isPlot
                ? 'Generate a 3D view of the whole property'
                : `Generate a 3D dollhouse of ${building?.name ?? 'this building'}`
              : 'Back to the 2D editor'
          }
        >
          {view === '2d' ? 'Generate 3D ✦' : '← Back to 2D editor'}
        </button>
      </div>
    </header>
  )
}
