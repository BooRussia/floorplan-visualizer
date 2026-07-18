import { useEffect, useState } from 'react'
import { useStore } from '../model/store'
import { catalogItem } from '../model/catalog'
import { dist, fmtLenShort, norm, parseLen, scale, sub, add } from '../model/geometry'
import type { OpeningType } from '../model/types'

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
  const plan = useStore((s) => s.plan)
  const st = useStore.getState()

  if (!selection) {
    const wallFt = plan.walls.reduce((acc, w) => acc + dist(w.a, w.b), 0) / 12
    return (
      <aside className="props">
        <div className="props-header">Plan</div>
        <div className="props-body">
          <div className="props-stat">
            <span>Walls</span>
            <b>{plan.walls.length}</b>
          </div>
          <div className="props-stat">
            <span>Total wall length</span>
            <b>{wallFt.toFixed(0)} ft</b>
          </div>
          <div className="props-stat">
            <span>Doors & windows</span>
            <b>{plan.openings.length}</b>
          </div>
          <div className="props-stat">
            <span>Furniture</span>
            <b>{plan.furniture.length}</b>
          </div>
          <p className="props-tip">
            Select anything on the canvas to edit its exact size here. Draw walls with{' '}
            <kbd>W</kbd>, doors <kbd>D</kbd>, windows <kbd>N</kbd>.
          </p>
        </div>
      </aside>
    )
  }

  if (selection.kind === 'wall') {
    const w = plan.walls.find((x) => x.id === selection.id)
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
    const o = plan.openings.find((x) => x.id === selection.id)
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
    const f = plan.furniture.find((x) => x.id === selection.id)
    if (!f) return null
    const item = catalogItem(f.kind)
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
            label="Depth"
            value={f.d}
            onCommit={(v) => {
              st.checkpoint()
              st.updateFurniture(f.id, { d: v })
            }}
          />
          <LenInput
            label="Height (3D)"
            value={f.h}
            onCommit={(v) => {
              st.checkpoint()
              st.updateFurniture(f.id, { h: v })
            }}
          />
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
    const l = plan.labels.find((x) => x.id === selection.id)
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

  return null
}
