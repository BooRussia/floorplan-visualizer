import { useEffect, useState } from 'react'
import { stairSpecs, useActiveFloor, useStore } from '../model/store'
import { catalogItem } from '../model/catalog'
import { dist, fmtLenShort, norm, parseLen, roadLength, scale, sub, add } from '../model/geometry'
import {
  MAX_BUILDINGS,
  MAX_FLOORS,
  SQIN_PER_ACRE,
  STORY_GAP,
  type FenceType,
  type FloorMaterial,
  type OpeningType,
  type Road,
} from '../model/types'

const FENCE_LABELS: Record<FenceType, string> = {
  privacy: 'Privacy fence',
  picket: 'Picket fence',
  chain: 'Chain-link fence',
  rail: 'Split-rail fence',
}

const MATERIAL_LABELS: Record<FloorMaterial, string> = {
  wood: 'Wood',
  tile: 'Tile',
  carpet: 'Carpet',
  concrete: 'Concrete',
  stone: 'Stone',
}

/** Text input that accepts measurements like 12'6", commits on Enter/blur. */
function LenInput({
  value,
  onCommit,
  label,
}: {
  value: number
  onCommit: (inches: number) => void
  label: string
}) {
  const [text, setText] = useState(fmtLenShort(value))
  useEffect(() => setText(fmtLenShort(value)), [value])
  const commit = () => {
    const v = parseLen(text)
    if (v != null && v > 0) onCommit(v)
    else setText(fmtLenShort(value))
  }
  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </label>
  )
}

const OPENING_LABELS: Record<OpeningType, string> = {
  door: 'Single door',
  'double-door': 'Double door',
  sliding: 'Sliding glass',
  bifold: 'Bifold door',
  opening: 'Cased opening',
  window: 'Window',
  garage: 'Garage door',
  gate: 'Fence gate',
}

const GATE_WIDTHS = [
  { label: `3'`, inches: 36 },
  { label: `4'`, inches: 48 },
  { label: `8'`, inches: 96 },
  { label: `10'`, inches: 120 },
  { label: `12'`, inches: 144 },
]

const GARAGE_WIDTHS = [
  { label: `8'`, inches: 96 },
  { label: `9'`, inches: 108 },
  { label: `16'`, inches: 192 },
  { label: `18'`, inches: 216 },
]

export default function PropertiesPanel() {
  const selection = useStore((s) => s.selection)
  const floor = useActiveFloor()
  const mode = useStore((s) => s.mode)
  const project = useStore((s) => s.project)
  const activeFloor = useStore((s) => s.activeFloor)
  const st = useStore.getState()
  const isPlot = mode.scope === 'plot'
  const floorCount = isPlot ? 1 : project.buildings[(mode as any).index].floors.length

  if (!selection && isPlot) {
    const acres = (project.plotW * project.plotD) / SQIN_PER_ACRE
    return (
      <aside className="props">
        <div className="props-header">Plot</div>
        <div className="props-body">
          <LenInput
            label="Plot width"
            value={project.plotW}
            onCommit={(v) => st.setPlotSize(v, project.plotD)}
          />
          <LenInput
            label="Plot depth"
            value={project.plotD}
            onCommit={(v) => st.setPlotSize(project.plotW, v)}
          />
          <div className="props-stat">
            <span>Area</span>
            <b>{acres >= 0.2 ? `${acres.toFixed(2)} acres` : `${Math.round((project.plotW * project.plotD) / 144)} sq ft`}</b>
          </div>
          <div className="props-stat">
            <span>Buildings</span>
            <b>{project.buildings.length}</b>
          </div>
          <div className="props-stat">
            <span>Fence lines</span>
            <b>{project.site.walls.length}</b>
          </div>
          <div className="props-stat">
            <span>Landscape items</span>
            <b>{project.site.furniture.length}</b>
          </div>
          {project.buildings.length < MAX_BUILDINGS && (
            <button className="mini-btn" onClick={() => st.addBuilding()}>
              ＋ Add building
            </button>
          )}
          <p className="props-tip">
            Tip: a 10-acre square plot is about 660' × 660'. Drag buildings to place them;
            double-click one to design its floors. Draw fences with <kbd>W</kbd>, drop
            driveways and landscaping from the site library.
          </p>
        </div>
      </aside>
    )
  }

  if (selection?.kind === 'building') {
    const b = project.buildings.find((x) => x.id === selection.id)
    if (!b) return null
    const idx = project.buildings.indexOf(b)
    return (
      <aside className="props">
        <div className="props-header">Building</div>
        <div className="props-body">
          <label className="prop-field">
            <span>Name</span>
            <input
              value={b.name}
              onChange={(e) => st.updateBuilding(b.id, { name: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="prop-field">
            <span>Rotation</span>
            <div className="prop-row">
              <input
                type="number"
                value={Math.round(b.rot)}
                onChange={(e) => st.updateBuilding(b.id, { rot: Number(e.target.value) % 360 })}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: 64 }}
              />
              <button
                className="mini-btn"
                onClick={() => {
                  st.checkpoint()
                  st.updateBuilding(b.id, { rot: (b.rot + 90) % 360 })
                }}
              >
                ⟳ 90°
              </button>
            </div>
          </label>
          <div className="props-stat">
            <span>Floors</span>
            <b>{b.floors.length}</b>
          </div>
          <button className="mini-btn" onClick={() => st.enterBuilding(idx)}>
            Edit floor plans →
          </button>
          {project.buildings.length > 1 && (
            <button
              className="danger-btn"
              onClick={() => {
                if (confirm(`Delete ${b.name} and all its floors?`)) st.deleteBuilding(b.id)
              }}
            >
              Delete {b.name}
            </button>
          )}
          <p className="props-tip">Drag the building on the plot to move it. Double-click it to edit floors.</p>
        </div>
      </aside>
    )
  }

  if (selection?.kind === 'road') {
    const r = floor.roads.find((x) => x.id === selection.id)
    if (!r) return null
    return (
      <aside className="props">
        <div className="props-header">Road</div>
        <div className="props-body">
          <label className="prop-field">
            <span>Material</span>
            <select
              value={r.material}
              onChange={(e) => {
                st.checkpoint()
                st.updateRoad(r.id, { material: e.target.value as Road['material'] })
              }}
            >
              <option value="asphalt">Asphalt</option>
              <option value="concrete">Concrete</option>
              <option value="gravel">Gravel</option>
              <option value="pavers">Pavers</option>
            </select>
          </label>
          <LenInput
            label="Width"
            value={r.width}
            onCommit={(v) => {
              st.checkpoint()
              st.updateRoad(r.id, { width: Math.min(600, Math.max(24, v)) })
            }}
          />
          <div className="prop-row">
            {[96, 120, 144, 192, 240].map((w) => (
              <button
                key={w}
                className="mini-btn"
                onClick={() => {
                  st.checkpoint()
                  st.updateRoad(r.id, { width: w })
                }}
              >
                {w / 12}'
              </button>
            ))}
          </div>
          <div className="props-stat">
            <span>Length (centerline)</span>
            <b>{fmtLenShort(roadLength(r.nodes))}</b>
          </div>
          <div className="props-stat">
            <span>Points</span>
            <b>{r.nodes.length}</b>
          </div>
          <p className="props-tip">
            Drag the square points to move them and the round grips to bend the curve —
            the road stays equal width either side of the centerline. Double-click a
            point to remove it.
          </p>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete road
          </button>
        </div>
      </aside>
    )
  }

  if (selection?.kind === 'paint') {
    const p = floor.paints.find((x) => x.id === selection.id)
    if (!p) return null
    return (
      <aside className="props">
        <div className="props-header">Floor material</div>
        <div className="props-body">
          <label className="prop-field">
            <span>Material</span>
            <select
              value={p.material}
              onChange={(e) => {
                st.checkpoint()
                st.updatePaint(p.id, { material: e.target.value as FloorMaterial })
              }}
            >
              {Object.entries(MATERIAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p className="props-tip">
            The room containing this marker gets a {MATERIAL_LABELS[p.material].toLowerCase()} floor
            in 3D. Drag it into a different room to move the material.
          </p>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete marker
          </button>
        </div>
      </aside>
    )
  }

  if (!selection) {
    const wallFt = floor.walls.reduce((acc, w) => acc + dist(w.a, w.b), 0) / 12
    return (
      <aside className="props">
        <div className="props-header">{floor.name}</div>
        <div className="props-body">
          <LenInput
            label="Story height"
            value={floor.height}
            onCommit={(v) => {
              st.checkpoint()
              const h = Math.min(240, Math.max(72, v))
              st.updateFloor(activeFloor, { height: h })
              // re-run staircases on this floor for the new rise
              const rise = h + STORY_GAP
              const specs = stairSpecs(rise)
              for (const f of floor.furniture) {
                if (f.kind === 'staircase') st.updateFurniture(f.id, { d: specs.run, h: rise })
              }
            }}
          />
          <div className="props-stat">
            <span>Walls</span>
            <b>{floor.walls.length}</b>
          </div>
          <div className="props-stat">
            <span>Total wall length</span>
            <b>{wallFt.toFixed(0)} ft</b>
          </div>
          <div className="props-stat">
            <span>Doors & windows</span>
            <b>{floor.openings.length}</b>
          </div>
          <div className="props-stat">
            <span>Furniture</span>
            <b>{floor.furniture.length}</b>
          </div>
          {floor.guides.length > 0 && (
            <div className="props-stat">
              <span>Measure marks</span>
              <b>{floor.guides.length}</b>
            </div>
          )}
          {floorCount < MAX_FLOORS && (
            <button className="mini-btn" onClick={() => st.addFloor()}>
              ＋ Add floor above
            </button>
          )}
          {activeFloor > 0 && (
            <button
              className="danger-btn"
              onClick={() => {
                if (confirm(`Delete ${floor.name} and everything on it?`)) {
                  st.deleteFloor(activeFloor)
                }
              }}
            >
              Delete {floor.name}
            </button>
          )}
          <p className="props-tip">
            Select anything on the canvas to edit its exact size here. Draw walls with{' '}
            <kbd>W</kbd>, doors <kbd>D</kbd>, windows <kbd>N</kbd>, marks <kbd>M</kbd>.
            {activeFloor > 0 && ' The floor below shows in gray for alignment.'}
          </p>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'wall') {
    const w = floor.walls.find((x) => x.id === selection.id)
    if (!w) return null
    if (w.fence) {
      return (
        <aside className="props">
          <div className="props-header">{FENCE_LABELS[w.fence]}</div>
          <div className="props-body">
            <label className="prop-field">
              <span>Type</span>
              <select
                value={w.fence}
                onChange={(e) => {
                  st.checkpoint()
                  st.updateWall(w.id, { fence: e.target.value as FenceType })
                }}
              >
                {Object.entries(FENCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <LenInput
              label="Length"
              value={dist(w.a, w.b)}
              onCommit={(v) => {
                st.checkpoint()
                const dir = norm(sub(w.b, w.a))
                st.updateWall(w.id, { b: add(w.a, scale(dir, v)) })
              }}
            />
            <LenInput
              label="Height"
              value={w.height}
              onCommit={(v) => {
                st.checkpoint()
                st.updateWall(w.id, { height: Math.min(120, Math.max(24, v)) })
              }}
            />
            <div className="prop-field">
              <span>Curve</span>
              <div className="prop-row">
                <b>{w.bulge ? `${Math.abs(Math.round(w.bulge))}" bow` : 'straight'}</b>
                {w.bulge !== 0 && (
                  <button
                    className="mini-btn"
                    onClick={() => {
                      st.checkpoint()
                      st.updateWall(w.id, { bulge: 0 })
                    }}
                  >
                    Straighten
                  </button>
                )}
              </div>
            </div>
            <button className="danger-btn" onClick={() => st.deleteSelected()}>
              Delete fence line
            </button>
          </div>
        </aside>
      )
    }
    return (
      <aside className="props">
        <div className="props-header">Wall</div>
        <div className="props-body">
          <LenInput
            label="Length"
            value={dist(w.a, w.b)}
            onCommit={(v) => {
              st.checkpoint()
              const dir = norm(sub(w.b, w.a))
              st.updateWall(w.id, { b: add(w.a, scale(dir, v)) })
            }}
          />
          <LenInput
            label="Thickness"
            value={w.thickness}
            onCommit={(v) => {
              st.checkpoint()
              st.updateWall(w.id, { thickness: Math.min(24, v) })
            }}
          />
          <LenInput
            label="Height (3D)"
            value={w.height}
            onCommit={(v) => {
              st.checkpoint()
              st.updateWall(w.id, { height: Math.min(240, v) })
            }}
          />
          <div className="prop-field">
            <span>Curve</span>
            <div className="prop-row">
              <b>{w.bulge ? `${Math.abs(Math.round(w.bulge))}" bow` : 'straight'}</b>
              {w.bulge !== 0 && (
                <button
                  className="mini-btn"
                  onClick={() => {
                    st.checkpoint()
                    st.updateWall(w.id, { bulge: 0 })
                  }}
                >
                  Straighten
                </button>
              )}
            </div>
          </div>
          <p className="props-tip">
            Drag the round handle at the wall's midpoint to curve it. Drag the square end
            handles to reshape — connected walls follow.
          </p>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete wall
          </button>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'opening') {
    const o = floor.openings.find((x) => x.id === selection.id)
    if (!o) return null
    const isDoor = o.type !== 'window' && o.type !== 'opening'
    return (
      <aside className="props">
        <div className="props-header">{OPENING_LABELS[o.type]}</div>
        <div className="props-body">
          <label className="prop-field">
            <span>Type</span>
            <select
              value={o.type}
              onChange={(e) => {
                st.checkpoint()
                st.updateOpening(o.id, { type: e.target.value as OpeningType })
              }}
            >
              {Object.entries(OPENING_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <LenInput
            label="Width"
            value={o.width}
            onCommit={(v) => {
              st.checkpoint()
              st.updateOpening(o.id, { width: Math.min(300, v) })
            }}
          />
          {o.type === 'gate' && (
            <div className="prop-row">
              {GATE_WIDTHS.map((g) => (
                <button
                  key={g.label}
                  className="mini-btn"
                  onClick={() => {
                    st.checkpoint()
                    st.updateOpening(o.id, { width: g.inches })
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          {o.type === 'garage' && (
            <>
              <div className="prop-row">
                {GARAGE_WIDTHS.map((g) => (
                  <button
                    key={g.label}
                    className="mini-btn"
                    onClick={() => {
                      st.checkpoint()
                      st.updateOpening(o.id, { width: g.inches })
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <LenInput
                label="Door height"
                value={o.height ?? 84}
                onCommit={(v) => {
                  st.checkpoint()
                  st.updateOpening(o.id, { height: Math.min(180, Math.max(48, v)) })
                }}
              />
            </>
          )}
          {isDoor && (
            <div className="prop-field">
              <span>Swing</span>
              <div className="prop-row">
                <button
                  className="mini-btn"
                  onClick={() => {
                    st.checkpoint()
                    st.updateOpening(o.id, { flipSwing: !o.flipSwing })
                  }}
                >
                  Flip side
                </button>
                {(o.type === 'door' || o.type === 'sliding' || o.type === 'bifold' || o.type === 'gate') && (
                  <button
                    className="mini-btn"
                    onClick={() => {
                      st.checkpoint()
                      st.updateOpening(o.id, { flipHinge: !o.flipHinge })
                    }}
                  >
                    Flip hinge
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="props-tip">Drag the {isDoor ? 'door' : o.type} along its wall to reposition it.</p>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete
          </button>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'furniture') {
    const f = floor.furniture.find((x) => x.id === selection.id)
    if (!f) return null
    const item = catalogItem(f.kind)
    const isStair = f.kind === 'staircase'
    const stairInfo = isStair
      ? (() => {
          const risers = Math.max(2, Math.ceil(f.h / 7.75))
          return { risers, treads: risers - 1, riser: f.h / risers, tread: f.d / (risers - 1) }
        })()
      : null
    return (
      <aside className="props">
        <div className="props-header">{item.name}</div>
        <div className="props-body">
          <LenInput
            label="Width"
            value={f.w}
            onCommit={(v) => {
              st.checkpoint()
              st.updateFurniture(f.id, { w: v })
            }}
          />
          <LenInput
            label={isStair ? 'Run (depth)' : 'Depth'}
            value={f.d}
            onCommit={(v) => {
              st.checkpoint()
              st.updateFurniture(f.id, { d: v })
            }}
          />
          <LenInput
            label={isStair ? 'Total rise' : 'Height (3D)'}
            value={f.h}
            onCommit={(v) => {
              st.checkpoint()
              st.updateFurniture(f.id, { h: v })
            }}
          />
          {stairInfo && (
            <p className="props-tip" style={{ marginTop: 0 }}>
              {stairInfo.risers} risers @ {stairInfo.riser.toFixed(1)}" ·{' '}
              {stairInfo.treads} treads @ {stairInfo.tread.toFixed(1)}". Sized for this story's
              height — the floor above gets an opening automatically. Arrow points up.
            </p>
          )}
          <label className="prop-field">
            <span>Rotation</span>
            <div className="prop-row">
              <input
                type="number"
                value={Math.round(f.rot)}
                onChange={(e) => st.updateFurniture(f.id, { rot: Number(e.target.value) % 360 })}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: 64 }}
              />
              <button
                className="mini-btn"
                onClick={() => {
                  st.checkpoint()
                  st.updateFurniture(f.id, { rot: (f.rot + 90) % 360 })
                }}
              >
                ⟳ 90°
              </button>
            </div>
          </label>
          <div className="prop-row">
            <button className="mini-btn" onClick={() => st.duplicateSelected()}>
              Duplicate (⌘D)
            </button>
          </div>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete
          </button>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'label') {
    const l = floor.labels.find((x) => x.id === selection.id)
    if (!l) return null
    return (
      <aside className="props">
        <div className="props-header">Label</div>
        <div className="props-body">
          <label className="prop-field">
            <span>Text</span>
            <input
              value={l.text}
              onChange={(e) => st.updateLabel(l.id, { text: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="prop-field">
            <span>Size</span>
            <input
              type="range"
              min={5}
              max={24}
              value={l.size}
              onChange={(e) => st.updateLabel(l.id, { size: Number(e.target.value) })}
            />
          </label>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete
          </button>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'guide') {
    const g = floor.guides.find((x) => x.id === selection.id)
    if (!g) return null
    return (
      <aside className="props">
        <div className="props-header">Measure mark</div>
        <div className="props-body">
          <p className="props-tip" style={{ marginTop: 0 }}>
            Reference point at ({fmtLenShort(g.x)}, {fmtLenShort(g.y)}). Dotted lines show the
            clear distance to nearby walls. Walls and other marks snap to it while drawing.
          </p>
          <button className="danger-btn" onClick={() => st.deleteSelected()}>
            Delete mark
          </button>
          <button className="mini-btn" onClick={() => st.clearGuides()}>
            Clear all marks on this floor
          </button>
        </div>
      </aside>
    )
  }

  return null
}
