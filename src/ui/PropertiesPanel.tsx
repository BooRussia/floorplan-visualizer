import { useEffect, useState } from 'react'
import { stairSpecs, useActiveFloor, useStore } from '../model/store'
import { catalogItem } from '../model/catalog'
import { dist, fmtLenShort, norm, parseLen, scale, sub, add } from '../model/geometry'
import { MAX_FLOORS, STORY_GAP, type OpeningType } from '../model/types'

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
}

export default function PropertiesPanel() {
  const selection = useStore((s) => s.selection)
  const floor = useActiveFloor()
  const activeFloor = useStore((s) => s.activeFloor)
  const floorCount = useStore((s) => s.plan.floors.length)
  const st = useStore.getState()

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
              st.updateOpening(o.id, { width: Math.min(240, v) })
            }}
          />
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
                {(o.type === 'door' || o.type === 'sliding' || o.type === 'bifold') && (
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
