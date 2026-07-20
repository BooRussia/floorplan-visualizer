// Print / PDF: a true-scale sheet (CSS inch units) with title block and scale bar,
// printed via the browser's print dialog (Save as PDF included for free).

import { useMemo, useState } from 'react'
import { floorFor, useStore } from '../model/store'
import { fmtLenShort, wallLength } from '../model/geometry'
import { rasterizeFloor, regionAt, roomRegions } from '../model/raster'
import { autoDimensions, DimString } from '../editor2d/dimensions'
import { OpeningGlyph, WallShape } from '../editor2d/planRender'
import { Glyph } from '../editor2d/glyphs'

const PAPERS = [
  { key: 'letter', label: 'Letter 8.5×11', w: 8.5, h: 11 },
  { key: 'legal', label: 'Legal 8.5×14', w: 8.5, h: 14 },
  { key: 'tabloid', label: 'Tabloid 11×17', w: 11, h: 17 },
  { key: 'a4', label: 'A4', w: 8.27, h: 11.69 },
  { key: 'a3', label: 'A3', w: 11.69, h: 16.54 },
]

const SCALES: { key: string; label: string; f: number }[] = [
  { key: 'fit', label: 'Fit to page', f: 0 },
  { key: '1-16', label: '1/16″ = 1′', f: 1 / 192 },
  { key: '3-32', label: '3/32″ = 1′', f: 1 / 128 },
  { key: '1-8', label: '1/8″ = 1′', f: 1 / 96 },
  { key: '3-16', label: '3/16″ = 1′', f: 1 / 64 },
  { key: '1-4', label: '1/4″ = 1′', f: 1 / 48 },
  { key: '1-2', label: '1/2″ = 1′', f: 1 / 24 },
]

const MARGIN = 0.3 // paper inches
const TITLE_H = 0.75

export default function PrintSheet({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.mode)
  const floor = floorFor(useStore.getState())
  const isPlot = mode.scope === 'plot'
  const building = mode.scope === 'building' ? project.buildings[mode.index] : null

  const [paperKey, setPaperKey] = useState('letter')
  const [scaleKey, setScaleKey] = useState('fit')
  const [title, setTitle] = useState(
    building ? `${building.name} — ${floor.name}` : 'Site plan'
  )

  // plan bounds (world inches) with margin for the dimension rows
  const bounds = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    for (const w of floor.walls) {
      xs.push(w.a.x, w.b.x)
      ys.push(w.a.y, w.b.y)
    }
    for (const f of floor.furniture) {
      xs.push(f.x - f.w / 2, f.x + f.w / 2)
      ys.push(f.y - f.d / 2, f.y + f.d / 2)
    }
    for (const l of floor.labels) {
      xs.push(l.x)
      ys.push(l.y)
    }
    if (isPlot) {
      for (const ring of project.plotBoundary ?? []) for (const p of ring) {
        xs.push(p.x)
        ys.push(p.y)
      }
      if (!project.plotBoundary) {
        xs.push(0, project.plotW)
        ys.push(0, project.plotD)
      }
      for (const b of project.buildings) {
        xs.push(b.x, b.x + 240)
        ys.push(b.y, b.y + 240)
        for (const w of b.floors[0]?.walls ?? []) {
          // rough footprint extent (unrotated bounds are fine for framing)
          xs.push(b.x + w.a.x, b.x + w.b.x)
          ys.push(b.y + w.a.y, b.y + w.b.y)
        }
      }
      for (const r of floor.roads) for (const n of r.nodes) {
        xs.push(n.x)
        ys.push(n.y)
      }
    }
    if (!xs.length) {
      xs.push(0, 240)
      ys.push(0, 240)
    }
    const pad = 96
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    return {
      minX,
      minY,
      w: Math.max(...xs) + pad - minX,
      h: Math.max(...ys) + pad - minY,
    }
  }, [floor, isPlot, project])

  const paper = PAPERS.find((p) => p.key === paperKey)!
  // landscape when the plan is wider than tall
  const landscape = bounds.w > bounds.h
  const pw = landscape ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h)
  const ph = landscape ? Math.min(paper.w, paper.h) : Math.max(paper.w, paper.h)
  const availW = pw - MARGIN * 2
  const availH = ph - MARGIN * 2 - TITLE_H

  const fitF = Math.min(availW / bounds.w, availH / bounds.h)
  const chosen = SCALES.find((s) => s.key === scaleKey)!
  const f = chosen.f || fitF
  const fits = bounds.w * f <= availW + 1e-6 && bounds.h * f <= availH + 1e-6
  const scaleLabel = chosen.f ? chosen.label : `1 : ${Math.round(1 / fitF)}`

  const raster = useMemo(
    () => (isPlot ? null : rasterizeFloor(floor.walls, [])),
    [isPlot, floor.walls]
  )
  const rooms = useMemo(() => {
    const rs = roomRegions(raster)
    return rs.map((r) => ({
      ...r,
      tag: raster ? floor.rooms.find((t) => regionAt(raster, t.x, t.y) === r.id) : undefined,
    }))
  }, [raster, floor.rooms])
  const dims = useMemo(
    () => (isPlot ? [] : autoDimensions(floor.walls, raster)),
    [isPlot, floor.walls, raster]
  )

  const today = new Date().toLocaleDateString()
  const barFt = f >= 1 / 49 ? 10 : f >= 1 / 129 ? 20 : 50 // scale-bar length in feet

  return (
    <div className="print-scrim">
      <style>{`@page { size: ${pw}in ${ph}in; margin: 0; }`}</style>
      <div className="print-controls">
        <b>Print / PDF</b>
        <select value={paperKey} onChange={(e) => setPaperKey(e.target.value)}>
          {PAPERS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={scaleKey} onChange={(e) => setScaleKey(e.target.value)}>
          {SCALES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Sheet title"
        />
        {!fits && <span className="print-warn">Doesn't fit — pick a smaller scale or larger paper</span>}
        <button className="box-dialog-create" onClick={() => window.print()}>
          Print…
        </button>
        <button className="mini-btn" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <div className="print-sheet-holder">
        <div className="print-sheet" style={{ width: `${pw}in`, height: `${ph}in` }}>
          <div className="print-plan" style={{ padding: `${MARGIN}in` }}>
            <svg
              width={`${bounds.w * f}in`}
              height={`${bounds.h * f}in`}
              viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            >
              {isPlot && (
                <>
                  {(project.plotBoundary ?? [
                    [
                      { x: 0, y: 0 },
                      { x: project.plotW, y: 0 },
                      { x: project.plotW, y: project.plotD },
                      { x: 0, y: project.plotD },
                    ],
                  ]).map((ring, i) => (
                    <path
                      key={i}
                      d={`M ${ring.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`}
                      fill="none"
                      stroke="#5f7a4e"
                      strokeWidth={2}
                      strokeDasharray="14 7 3 7"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {floor.roads.map((r) => (
                    <path
                      key={r.id}
                      d={`M ${r.nodes.map((n) => `${n.x} ${n.y}`).join(' L ')}`}
                      stroke="#c9c9ce"
                      strokeWidth={r.width}
                      strokeLinecap="round"
                      fill="none"
                    />
                  ))}
                  {project.buildings.map((b) => (
                    <g key={b.id} transform={`translate(${b.x} ${b.y}) rotate(${b.rot})`}>
                      {(b.floors[0]?.walls ?? []).map((w) => (
                        <WallShape key={w.id} w={w} selected={false} />
                      ))}
                      <text
                        x={(b.floors[0]?.walls ?? []).reduce((a, w) => a + w.a.x, 0) / Math.max(1, b.floors[0]?.walls.length ?? 1)}
                        y={(b.floors[0]?.walls ?? []).reduce((a, w) => a + w.a.y, 0) / Math.max(1, b.floors[0]?.walls.length ?? 1)}
                        fontSize={16}
                        fontWeight={700}
                        textAnchor="middle"
                        fill="#3f3f46"
                      >
                        {b.name}
                      </text>
                    </g>
                  ))}
                </>
              )}

              {floor.walls.map((w) => (
                <WallShape key={w.id} w={w} selected={false} />
              ))}
              {floor.openings.map((o) => {
                const w = floor.walls.find((x) => x.id === o.wallId)
                if (!w || wallLength(w) < 1) return null
                return <OpeningGlyph key={o.id} o={o} wall={w} selected={false} bg="#ffffff" />
              })}
              {floor.furniture.map((fu) => (
                <g key={fu.id} transform={`translate(${fu.x} ${fu.y}) rotate(${fu.rot})`}>
                  <Glyph kind={fu.kind} w={fu.w} d={fu.d} />
                </g>
              ))}
              {floor.labels.map((l) => (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  fontSize={l.size}
                  fontWeight={600}
                  fill="#3f3f46"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {l.text}
                </text>
              ))}
              {rooms.map((r) => (
                <g key={r.id}>
                  {r.tag && (
                    <text x={r.cx} y={r.cy - 5} fontSize={10} fontWeight={700} fill="#27272a" textAnchor="middle">
                      {r.tag.name}
                    </text>
                  )}
                  <text x={r.cx} y={r.tag ? r.cy + 8 : r.cy} fontSize={7.5} fill="#71717a" textAnchor="middle">
                    {Math.round(r.areaSqIn / 144)} sq ft
                  </text>
                </g>
              ))}
              {dims.map((seg, i) => (
                <DimString key={i} seg={seg} fontWorld={9} />
              ))}
            </svg>
          </div>
          <div className="print-title" style={{ height: `${TITLE_H}in`, margin: `0 ${MARGIN}in ${MARGIN}in` }}>
            <div className="pt-name">{title || 'Floor plan'}</div>
            <div className="pt-meta">
              <span>{project.buildings.length > 1 && building ? building.name : 'Floorplan Visualizer'}</span>
              <span>{today}</span>
              <span>Scale {scaleLabel}</span>
            </div>
            <div className="pt-bar">
              <div className="pt-bar-line" style={{ width: `${barFt * 12 * f}in` }}>
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="pt-bar-label">{fmtLenShort(barFt * 12)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
