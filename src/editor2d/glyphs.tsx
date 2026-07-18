import React from 'react'

// Furniture glyphs are drawn in LOCAL inches: origin at the item's center,
// x ∈ [-w/2, w/2], y ∈ [-d/2, d/2]. "Front" of the item faces +y.
// Strokes use non-scaling-stroke so linework stays crisp at any zoom.

const S: React.CSSProperties = {}
const stroke = '#3f3f46'
const thin = {
  stroke,
  strokeWidth: 1.1,
  vectorEffect: 'non-scaling-stroke' as const,
  fill: '#ffffff',
}
const thinNoFill = { ...thin, fill: 'none' }
const softFill = { ...thin, fill: '#f4f4f5' }

function Rect({ w, d, r = 0, style = thin as React.CSSProperties, inset = 0 }: {
  w: number; d: number; r?: number; style?: React.CSSProperties; inset?: number
}) {
  const iw = w - inset * 2
  const id = d - inset * 2
  return <rect x={-iw / 2} y={-id / 2} width={iw} height={id} rx={r} style={{ ...S, ...style }} />
}

function Burner({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} style={thinNoFill} />
      <circle cx={x} cy={y} r={r * 0.45} style={thinNoFill} />
    </>
  )
}

/** Renders the 2D symbol for a furniture kind at footprint w × d (inches). */
export function Glyph({ kind, w, d }: { kind: string; w: number; d: number }) {
  const hw = w / 2
  const hd = d / 2
  switch (kind) {
    case 'base-cabinet':
      return (
        <g>
          <Rect w={w} d={d} />
          <Rect w={w} d={d} inset={2.5} style={thinNoFill} />
        </g>
      )
    case 'kitchen-island':
      return (
        <g>
          <Rect w={w} d={d} r={3} />
          <Rect w={w} d={d} r={2} inset={3} style={thinNoFill} />
        </g>
      )
    case 'kitchen-sink': {
      const bw = Math.min(12, w / 2 - 4)
      return (
        <g>
          <Rect w={w} d={d} />
          <rect x={-bw - 1.5} y={-hd + 5} width={bw} height={d - 10} rx={2.5} style={thinNoFill} />
          <rect x={1.5} y={-hd + 5} width={bw} height={d - 10} rx={2.5} style={thinNoFill} />
          <circle cx={0} cy={-hd + 3} r={1.4} style={{ ...thin, fill: stroke }} />
        </g>
      )
    }
    case 'stove': {
      const ox = hw * 0.45
      const oy = hd * 0.4
      return (
        <g>
          <Rect w={w} d={d} />
          <Burner x={-ox} y={-oy} r={3.4} />
          <Burner x={ox} y={-oy} r={2.6} />
          <Burner x={-ox} y={oy} r={2.6} />
          <Burner x={ox} y={oy} r={3.4} />
        </g>
      )
    }
    case 'fridge':
      return (
        <g>
          <Rect w={w} d={d} />
          <line x1={-hw} y1={-hd + 3} x2={hw} y2={-hd + 3} style={thinNoFill} />
          <line x1={-1} y1={-hd + 3} x2={-1} y2={hd} style={thinNoFill} />
        </g>
      )
    case 'dishwasher':
      return (
        <g>
          <Rect w={w} d={d} />
          <Rect w={w} d={d} inset={2.5} style={thinNoFill} />
          <line x1={-hw + 2.5} y1={-hd + 2.5} x2={hw - 2.5} y2={hd - 2.5} style={thinNoFill} />
        </g>
      )
    case 'washer':
    case 'dryer':
      return (
        <g>
          <Rect w={w} d={d} />
          <circle cx={0} cy={1.5} r={Math.min(hw, hd) * 0.62} style={thinNoFill} />
          <circle cx={0} cy={1.5} r={Math.min(hw, hd) * 0.4} style={thinNoFill} />
          <line x1={-hw} y1={-hd + 4} x2={hw} y2={-hd + 4} style={thinNoFill} />
        </g>
      )
    case 'toilet':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d * 0.32} rx={1.5} style={thin} />
          <ellipse cx={0} cy={hd * 0.28} rx={hw * 0.78} ry={hd * 0.62} style={thin} />
          <ellipse cx={0} cy={hd * 0.3} rx={hw * 0.55} ry={hd * 0.46} style={thinNoFill} />
        </g>
      )
    case 'vanity':
      return (
        <g>
          <Rect w={w} d={d} />
          <ellipse cx={0} cy={0.5} rx={Math.min(hw - 4, 9)} ry={Math.min(hd - 4, 6.5)} style={thinNoFill} />
          <circle cx={0} cy={-hd + 3} r={1.3} style={{ ...thin, fill: stroke }} />
        </g>
      )
    case 'pedestal-sink':
      return (
        <g>
          <rect x={-hw * 0.8} y={-hd} width={w * 0.8} height={3.5} style={thin} />
          <ellipse cx={0} cy={1} rx={hw * 0.85} ry={hd * 0.75} style={thin} />
          <ellipse cx={0} cy={1} rx={hw * 0.6} ry={hd * 0.52} style={thinNoFill} />
        </g>
      )
    case 'shower':
      return (
        <g>
          <Rect w={w} d={d} style={softFill} />
          <Rect w={w} d={d} inset={2} style={thinNoFill} />
          <circle cx={0} cy={0} r={1.8} style={thinNoFill} />
          <line x1={-hw + 2} y1={hd - 2} x2={-hw + 10} y2={hd - 10} style={thinNoFill} />
          <line x1={-hw + 2} y1={hd - 6} x2={-hw + 6} y2={hd - 10} style={thinNoFill} />
        </g>
      )
    case 'bathtub':
      return (
        <g>
          <Rect w={w} d={d} r={3} />
          <rect x={-hw + 3} y={-hd + 3} width={w - 6} height={d - 6} rx={Math.min(9, hd - 3)} style={thinNoFill} />
          <circle cx={-hw + 9} cy={0} r={1.6} style={thinNoFill} />
        </g>
      )
    case 'bed-queen':
    case 'bed-king':
    case 'bed-twin': {
      const single = kind === 'bed-twin'
      const pw = single ? w - 10 : w / 2 - 8
      return (
        <g>
          <Rect w={w} d={d} r={1.5} />
          {/* headboard at -y */}
          <line x1={-hw} y1={-hd + 3} x2={hw} y2={-hd + 3} style={thinNoFill} />
          {single ? (
            <rect x={-pw / 2} y={-hd + 6} width={pw} height={10} rx={3} style={softFill} />
          ) : (
            <>
              <rect x={-hw + 5} y={-hd + 6} width={pw} height={10} rx={3} style={softFill} />
              <rect x={3} y={-hd + 6} width={pw} height={10} rx={3} style={softFill} />
            </>
          )}
          {/* folded blanket */}
          <line x1={-hw} y1={hd - 14} x2={hw} y2={hd - 14} style={thinNoFill} />
          <line x1={-hw} y1={hd - 11} x2={hw} y2={hd - 11} style={thinNoFill} />
        </g>
      )
    }
    case 'nightstand':
    case 'end-table':
      return (
        <g>
          <Rect w={w} d={d} />
          <Rect w={w} d={d} inset={2} style={thinNoFill} />
        </g>
      )
    case 'dresser': {
      const knobs = Math.max(2, Math.round(w / 20))
      return (
        <g>
          <Rect w={w} d={d} />
          {Array.from({ length: knobs - 1 }, (_, i) => {
            const x = -hw + ((i + 1) * w) / knobs
            return <line key={i} x1={x} y1={-hd} x2={x} y2={hd} style={thinNoFill} />
          })}
          {Array.from({ length: knobs }, (_, i) => {
            const x = -hw + ((i + 0.5) * w) / knobs
            return <circle key={i} cx={x} cy={hd - 3.5} r={1.1} style={{ ...thin, fill: stroke }} />
          })}
        </g>
      )
    }
    case 'wardrobe':
      return (
        <g>
          <Rect w={w} d={d} />
          <line x1={-hw + 2} y1={0} x2={hw - 2} y2={0} style={thinNoFill} />
          {(() => {
            const n = Math.max(3, Math.round(w / 8))
            return Array.from({ length: n }, (_, i) => {
              const x = -hw + 4 + (i * (w - 8)) / (n - 1)
              return <line key={i} x1={x} y1={-4.5} x2={x} y2={4.5} style={thinNoFill} />
            })
          })()}
        </g>
      )
    case 'desk':
      return (
        <g>
          <Rect w={w} d={d} />
          <rect x={-hw + 2} y={-hd + 2} width={16} height={10} rx={1} style={thinNoFill} />
        </g>
      )
    case 'office-chair':
      return (
        <g>
          <circle cx={0} cy={1} r={Math.min(hw, hd) * 0.72} style={thin} />
          <path
            d={`M ${-hw * 0.85} ${-hd * 0.35} A ${hw} ${hd} 0 0 1 ${hw * 0.85} ${-hd * 0.35}`}
            style={thinNoFill}
          />
        </g>
      )
    case 'sofa':
    case 'loveseat': {
      const cushions = kind === 'sofa' ? 3 : 2
      const arm = Math.min(7, w * 0.09)
      const back = Math.min(8, d * 0.24)
      const iw = w - arm * 2
      return (
        <g>
          <Rect w={w} d={d} r={3.5} />
          {/* back at -y */}
          <line x1={-hw + arm} y1={-hd + back} x2={hw - arm} y2={-hd + back} style={thinNoFill} />
          <line x1={-hw + arm} y1={-hd} x2={-hw + arm} y2={hd} style={thinNoFill} />
          <line x1={hw - arm} y1={-hd} x2={hw - arm} y2={hd} style={thinNoFill} />
          {Array.from({ length: cushions - 1 }, (_, i) => {
            const x = -hw + arm + ((i + 1) * iw) / cushions
            return <line key={i} x1={x} y1={-hd + back} x2={x} y2={hd} style={thinNoFill} />
          })}
        </g>
      )
    }
    case 'armchair': {
      const arm = Math.min(6, w * 0.16)
      const back = Math.min(7, d * 0.22)
      return (
        <g>
          <Rect w={w} d={d} r={4} />
          <line x1={-hw + arm} y1={-hd + back} x2={hw - arm} y2={-hd + back} style={thinNoFill} />
          <line x1={-hw + arm} y1={-hd + 2} x2={-hw + arm} y2={hd - 2} style={thinNoFill} />
          <line x1={hw - arm} y1={-hd + 2} x2={hw - arm} y2={hd - 2} style={thinNoFill} />
        </g>
      )
    }
    case 'coffee-table':
      return (
        <g>
          <Rect w={w} d={d} r={2.5} />
          <Rect w={w} d={d} inset={2.5} r={1.5} style={thinNoFill} />
        </g>
      )
    case 'tv-stand': {
      const tvw = w * 0.8
      return (
        <g>
          <Rect w={w} d={d} />
          {/* TV panel on front edge */}
          <rect x={-tvw / 2} y={hd - 2.6} width={tvw} height={2.6} style={{ ...thin, fill: '#27272a' }} />
        </g>
      )
    }
    case 'floor-lamp':
    case 'table-lamp': {
      const r = Math.min(hw, hd)
      return (
        <g>
          <circle cx={0} cy={0} r={r} style={thin} />
          <circle cx={0} cy={0} r={r * 0.3} style={thinNoFill} />
          <line x1={-r} y1={0} x2={r} y2={0} style={thinNoFill} />
          <line x1={0} y1={-r} x2={0} y2={r} style={thinNoFill} />
        </g>
      )
    }
    case 'bookshelf':
      return (
        <g>
          <Rect w={w} d={d} />
          {(() => {
            const n = Math.max(2, Math.round(w / 14)) - 1
            return Array.from({ length: n }, (_, i) => {
              const x = -hw + ((i + 1) * w) / (n + 1)
              return <line key={i} x1={x} y1={-hd} x2={x} y2={hd} style={thinNoFill} />
            })
          })()}
        </g>
      )
    case 'rug':
      return (
        <g>
          <Rect w={w} d={d} r={1} style={{ ...thin, fill: '#fafafa' }} />
          <Rect w={w} d={d} inset={4} style={thinNoFill} />
        </g>
      )
    case 'plant': {
      const r = Math.min(hw, hd)
      const leaves = 7
      return (
        <g>
          <circle cx={0} cy={0} r={r * 0.55} style={thin} />
          {Array.from({ length: leaves }, (_, i) => {
            const a = (i / leaves) * Math.PI * 2
            return (
              <ellipse
                key={i}
                cx={Math.cos(a) * r * 0.62}
                cy={Math.sin(a) * r * 0.62}
                rx={r * 0.34}
                ry={r * 0.2}
                transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * r * 0.62} ${Math.sin(a) * r * 0.62})`}
                style={{ ...thinNoFill, fill: '#f4f4f5' }}
              />
            )
          })}
        </g>
      )
    }
    case 'dining-table':
      return (
        <g>
          <Rect w={w} d={d} r={2} />
          <Rect w={w} d={d} inset={2.5} r={1.5} style={thinNoFill} />
        </g>
      )
    case 'round-table':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} style={thin} />
          <circle cx={0} cy={0} r={Math.min(hw, hd) - 3} style={thinNoFill} />
        </g>
      )
    case 'chair':
      return (
        <g>
          <Rect w={w} d={d} r={2} />
          <line x1={-hw + 1.5} y1={-hd + 3.5} x2={hw - 1.5} y2={-hd + 3.5} style={thinNoFill} />
        </g>
      )
    case 'bar-stool':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} style={thin} />
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.55} style={thinNoFill} />
        </g>
      )
    default:
      return <Rect w={w} d={d} />
  }
}

/** Small preview tile used in the palette. */
export function GlyphPreview({ kind, w, d, size = 46 }: { kind: string; w: number; d: number; size?: number }) {
  const m = Math.max(w, d) * 1.18
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-m / 2} ${-m / 2} ${m} ${m}`}
      style={{ display: 'block' }}
      aria-hidden
    >
      <Glyph kind={kind} w={w} d={d} />
    </svg>
  )
}
