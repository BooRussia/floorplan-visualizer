// Auto exterior dimension strings: per-side segments from exterior-facing wall
// endpoints, plus an overall total row. Regenerated from the model every render —
// they can never go stale. Clicking a segment's label edits it (stretch resize).

import type { Wall } from '../model/types'
import type { FloorRaster } from '../model/raster'
import { fmtLenShort } from '../model/geometry'

export type DimSide = 'n' | 's' | 'e' | 'w'

export interface DimSegment {
  side: DimSide
  /** span along the axis (x for n/s rows, y for e/w columns) */
  a: number
  b: number
  /** the row/column the dimension line sits on (y for n/s, x for e/w) */
  line: number
  total?: boolean
}

const OFF1 = 30 // inches outside the footprint for the segment row
const OFF2 = 62 // total row

function outsideAt(r: FloorRaster, x: number, y: number): boolean {
  const cx = Math.round((x - r.ox) / r.CELL)
  const cy = Math.round((y - r.oy) / r.CELL)
  if (cx < 0 || cy < 0 || cx >= r.W || cy >= r.H) return true
  return r.outside[cy * r.W + cx] === 1
}

/** Build the four exterior dimension strings for a building floor. */
export function autoDimensions(walls: Wall[], raster: FloorRaster | null): DimSegment[] {
  const solid = walls.filter((w) => !w.divider && !w.fence)
  if (solid.length < 2 || !raster) return []

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const w of solid)
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }

  const out: DimSegment[] = []
  const sides: { side: DimSide; horiz: boolean; probe: number; line: number; lineTotal: number }[] = [
    { side: 'n', horiz: true, probe: -1, line: minY - OFF1, lineTotal: minY - OFF2 },
    { side: 's', horiz: true, probe: 1, line: maxY + OFF1, lineTotal: maxY + OFF2 },
    { side: 'w', horiz: false, probe: -1, line: minX - OFF1, lineTotal: minX - OFF2 },
    { side: 'e', horiz: false, probe: 1, line: maxX + OFF1, lineTotal: maxX + OFF2 },
  ]

  for (const s of sides) {
    // walls aligned with this side whose outer face sees the outside in the probe direction
    const coords: number[] = []
    for (const w of solid) {
      const dx = Math.abs(w.b.x - w.a.x)
      const dy = Math.abs(w.b.y - w.a.y)
      const aligned = s.horiz ? dy < 1 && dx > 6 : dx < 1 && dy > 6
      if (!aligned || w.bulge) continue
      const mx = (w.a.x + w.b.x) / 2
      const my = (w.a.y + w.b.y) / 2
      const d = w.thickness / 2 + raster.CELL * 2.5
      const px = s.horiz ? mx : mx + s.probe * d
      const py = s.horiz ? my + s.probe * d : my
      if (!outsideAt(raster, px, py)) continue
      coords.push(s.horiz ? w.a.x : w.a.y, s.horiz ? w.b.x : w.b.y)
    }
    if (!coords.length) continue
    coords.sort((x, y) => x - y)
    const uniq: number[] = []
    for (const c of coords) {
      if (!uniq.length || c - uniq[uniq.length - 1] > 1.5) uniq.push(c)
    }
    for (let i = 0; i < uniq.length - 1; i++) {
      if (uniq[i + 1] - uniq[i] < 7) continue
      out.push({ side: s.side, a: uniq[i], b: uniq[i + 1], line: s.line })
    }
    const segCount = out.filter((o) => o.side === s.side && !o.total).length
    if (segCount > 1) {
      out.push({ side: s.side, a: uniq[0], b: uniq[uniq.length - 1], line: s.lineTotal, total: true })
    }
  }
  return out
}

const DIM = 'var(--dim-color)'

/** One dimension string segment: line, end ticks, centered length label. */
export function DimString({
  seg,
  fontWorld,
  onClickLabel,
}: {
  seg: DimSegment
  fontWorld: number
  onClickLabel?: (seg: DimSegment) => void
}) {
  const horiz = seg.side === 'n' || seg.side === 's'
  const len = seg.b - seg.a
  const mid = (seg.a + seg.b) / 2
  const t = 5 // tick half-size
  const x1 = horiz ? seg.a : seg.line
  const y1 = horiz ? seg.line : seg.a
  const x2 = horiz ? seg.b : seg.line
  const y2 = horiz ? seg.line : seg.b
  const label = fmtLenShort(len)
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* extension + architectural slash ticks at both ends */}
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (
        <g key={i}>
          <line
            x1={horiz ? x : x - t}
            y1={horiz ? y - t : y}
            x2={horiz ? x : x + t}
            y2={horiz ? y + t : y}
            stroke={DIM}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x - t * 0.7}
            y1={y + (horiz ? t * 0.7 : -t * 0.7) * -1}
            x2={x + t * 0.7}
            y2={y + (horiz ? t * 0.7 : -t * 0.7)}
            stroke={DIM}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      <text
        x={horiz ? mid : seg.line}
        y={horiz ? seg.line : mid}
        fontSize={fontWorld}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={seg.total ? 700 : 600}
        fill={DIM}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={horiz ? undefined : `rotate(-90 ${seg.line} ${mid})`}
        paintOrder="stroke"
        stroke="var(--canvas-bg)"
        strokeWidth={fontWorld / 3.2}
        style={onClickLabel ? { cursor: 'pointer', userSelect: 'none' } : { userSelect: 'none' }}
        onPointerDown={
          onClickLabel
            ? (e) => {
                e.stopPropagation()
                onClickLabel(seg)
              }
            : undefined
        }
      >
        {label}
      </text>
    </g>
  )
}
