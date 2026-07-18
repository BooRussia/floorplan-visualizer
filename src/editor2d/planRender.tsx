import React from 'react'
import type { Opening, Wall } from '../model/types'
import {
  fmtLenShort,
  perp,
  norm,
  sub,
  wallControl,
  wallLength,
  wallPointAt,
  wallTangentAt,
} from '../model/geometry'

export const WALL_COLOR = 'var(--wall-color)'
export const ACCENT = '#2563eb'
export const BG = 'var(--canvas-bg)'

export function wallPathD(w: Wall): string {
  if (!w.bulge) return `M ${w.a.x} ${w.a.y} L ${w.b.x} ${w.b.y}`
  const c = wallControl(w)
  return `M ${w.a.x} ${w.a.y} Q ${c.x} ${c.y} ${w.b.x} ${w.b.y}`
}

export function WallShape({ w, selected }: { w: Wall; selected: boolean }) {
  if (w.fence) {
    const L = wallLength(w)
    const posts = Math.max(2, Math.round(L / 96) + 1)
    const color = selected ? ACCENT : 'var(--fence-color)'
    return (
      <>
        <path
          d={wallPathD(w)}
          stroke={color}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={w.fence === 'chain' ? '6 3' : undefined}
          fill="none"
        />
        {Array.from({ length: posts }, (_, i) => {
          const p = wallPointAt(w, i / (posts - 1))
          return (
            <circle key={i} cx={p.x} cy={p.y} r={2.2} fill={color} />
          )
        })}
      </>
    )
  }
  return (
    <>
      <path
        d={wallPathD(w)}
        stroke={WALL_COLOR}
        strokeWidth={w.thickness}
        strokeLinecap="square"
        fill="none"
      />
      {selected && (
        <path
          d={wallPathD(w)}
          stroke={ACCENT}
          strokeOpacity={0.55}
          strokeWidth={w.thickness + 1.5}
          strokeLinecap="square"
          fill="none"
        />
      )}
    </>
  )
}

/** Dimension text along a wall. fontWorld = desired screen px / ppi. */
export function WallDim({ w, fontWorld, selected }: { w: Wall; fontWorld: number; selected: boolean }) {
  const L = wallLength(w)
  const mid = wallPointAt(w, 0.5)
  const tan = wallTangentAt(w, 0.5)
  let ang = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
  const n = perp(tan)
  // place text on the -n side of the wall
  const off = w.thickness / 2 + fontWorld * 0.9
  let px = mid.x - n.x * off
  let py = mid.y - n.y * off
  if (ang > 90 || ang < -90) ang += 180
  return (
    <text
      x={px}
      y={py}
      fontSize={fontWorld}
      fill={selected ? ACCENT : 'var(--dim-color)'}
      fontFamily="Inter, system-ui, sans-serif"
      fontWeight={selected ? 600 : 500}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${ang} ${px} ${py})`}
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {fmtLenShort(L)}
    </text>
  )
}

const jamb = { stroke: WALL_COLOR, strokeWidth: 1.2, vectorEffect: 'non-scaling-stroke' as const }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const leafStyle = { stroke: WALL_COLOR, strokeWidth: 1.4, vectorEffect: 'non-scaling-stroke' as const, fill: 'none' }
const arcStyle = {
  stroke: '#8b8b92',
  strokeWidth: 1,
  vectorEffect: 'non-scaling-stroke' as const,
  fill: 'none',
}

/**
 * Opening glyph, rendered in the wall's local frame:
 * x runs along the wall (centered on the opening), y across the thickness.
 */
export function OpeningGlyph({
  o,
  wall,
  selected,
  bg,
}: {
  o: Opening
  wall: Wall
  selected: boolean
  bg: string
}) {
  const p = wallPointAt(wall, o.t)
  const tan = wallTangentAt(wall, o.t)
  const ang = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
  const th = wall.thickness
  const hw = o.width / 2
  const sy = o.flipSwing ? -1 : 1
  const sx = o.flipHinge ? -1 : 1

  let inner: React.ReactNode = null
  switch (o.type) {
    case 'window':
      inner = (
        <>
          <rect x={-hw} y={-th / 2} width={o.width} height={th} fill="var(--glyph-fill)" style={jamb} />
          <line x1={-hw} y1={0} x2={hw} y2={0} style={jamb} />
        </>
      )
      break
    case 'door': {
      // hinge at -hw (or +hw flipped); leaf opens to -y (or +y flipped)
      inner = (
        <g transform={`scale(${sx} ${sy})`}>
          <line x1={-hw} y1={-th / 2} x2={-hw} y2={-th / 2 - o.width} style={leafStyle} />
          <path
            d={`M ${hw} ${-th / 2} A ${o.width} ${o.width} 0 0 0 ${-hw} ${-th / 2 - o.width}`}
            style={arcStyle}
          />
        </g>
      )
      break
    }
    case 'double-door': {
      const lw = hw // each leaf = half opening
      inner = (
        <g transform={`scale(1 ${sy})`}>
          <line x1={-hw} y1={-th / 2} x2={-hw} y2={-th / 2 - lw} style={leafStyle} />
          <path d={`M 0 ${-th / 2} A ${lw} ${lw} 0 0 0 ${-hw} ${-th / 2 - lw}`} style={arcStyle} />
          <line x1={hw} y1={-th / 2} x2={hw} y2={-th / 2 - lw} style={leafStyle} />
          <path d={`M 0 ${-th / 2} A ${lw} ${lw} 0 0 1 ${hw} ${-th / 2 - lw}`} style={arcStyle} />
        </g>
      )
      break
    }
    case 'sliding': {
      const t3 = Math.max(1.6, th / 3)
      inner = (
        <g transform={`scale(${sx} ${sy})`}>
          <rect x={-hw} y={-t3 / 2 - t3 * 0.6} width={o.width * 0.55} height={t3} fill="var(--glyph-fill)" style={jamb} />
          <rect x={hw - o.width * 0.55} y={-t3 / 2 + t3 * 0.6} width={o.width * 0.55} height={t3} fill="var(--glyph-fill)" style={jamb} />
          <line x1={-hw + 3} y1={-t3 * 1.6} x2={-hw + o.width * 0.4} y2={-t3 * 1.6} style={arcStyle} />
        </g>
      )
      break
    }
    case 'bifold': {
      const q = o.width / 4
      const y0 = -th / 2
      inner = (
        <g transform={`scale(${sx} ${sy})`}>
          <path d={`M ${-hw} ${y0} L ${-hw + q} ${y0 - q * 1.6} L ${-hw + 2 * q} ${y0}`} style={leafStyle} />
          <path d={`M ${hw} ${y0} L ${hw - q} ${y0 - q * 1.6} L ${hw - 2 * q} ${y0}`} style={leafStyle} />
        </g>
      )
      break
    }
    case 'opening':
      inner = (
        <line
          x1={-hw}
          y1={0}
          x2={hw}
          y2={0}
          style={{ ...arcStyle, strokeDasharray: '4 3' }}
        />
      )
      break
    case 'garage': {
      // sectional door panel in the wall plane + dashed overhead-track zone inside
      const trackDepth = Math.min(o.height ?? 84, o.width * 0.6)
      inner = (
        <g transform={`scale(1 ${sy})`}>
          <rect x={-hw} y={-2} width={o.width} height={4} fill="var(--glyph-fill)" style={jamb} />
          <line x1={-hw} y1={0} x2={hw} y2={0} style={arcStyle} />
          <line
            x1={-hw + 2}
            y1={th / 2}
            x2={-hw + 2}
            y2={th / 2 + trackDepth}
            style={{ ...arcStyle, strokeDasharray: '5 4' }}
          />
          <line
            x1={hw - 2}
            y1={th / 2}
            x2={hw - 2}
            y2={th / 2 + trackDepth}
            style={{ ...arcStyle, strokeDasharray: '5 4' }}
          />
          <line
            x1={-hw + 2}
            y1={th / 2 + trackDepth}
            x2={hw - 2}
            y2={th / 2 + trackDepth}
            style={{ ...arcStyle, strokeDasharray: '5 4' }}
          />
        </g>
      )
      break
    }
  }

  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${ang})`}>
      {/* erase the wall underneath the opening */}
      <rect x={-hw} y={-th / 2 - 0.75} width={o.width} height={th + 1.5} fill={bg} />
      {/* jamb caps */}
      <line x1={-hw} y1={-th / 2} x2={-hw} y2={th / 2} style={jamb} />
      <line x1={hw} y1={-th / 2} x2={hw} y2={th / 2} style={jamb} />
      {inner}
      {selected && (
        <rect
          x={-hw - 2}
          y={-th / 2 - o.width - 3}
          width={o.width + 4}
          height={o.width + th + 6}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          rx={2}
        />
      )}
    </g>
  )
}

/** Transparent hit area for an opening (rendered above walls). */
export function OpeningHit({
  o,
  wall,
  onPointerDown,
}: {
  o: Opening
  wall: Wall
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const p = wallPointAt(wall, o.t)
  const tan = wallTangentAt(wall, o.t)
  const ang = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
  const th = Math.max(wall.thickness, 8)
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${ang})`}>
      <rect
        x={-o.width / 2}
        y={-th / 2 - 2}
        width={o.width}
        height={th + 4}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={onPointerDown}
      />
    </g>
  )
}
