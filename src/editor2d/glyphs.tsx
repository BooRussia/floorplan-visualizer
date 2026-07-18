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
    case 'staircase': {
      // treads across the run; walk-up direction is -y (bottom step at +y)
      const treads = Math.max(3, Math.round(d / 10.5))
      return (
        <g>
          <Rect w={w} d={d} />
          {Array.from({ length: treads - 1 }, (_, i) => {
            const y = hd - ((i + 1) * d) / treads
            return <line key={i} x1={-hw} y1={y} x2={hw} y2={y} style={thinNoFill} />
          })}
          {/* center walk line with UP arrow */}
          <line x1={0} y1={hd - 4} x2={0} y2={-hd + 8} style={thinNoFill} />
          <path
            d={`M ${-3.5} ${-hd + 11} L 0 ${-hd + 5} L 3.5 ${-hd + 11}`}
            style={{ ...thinNoFill, fill: 'none' }}
          />
          <circle cx={0} cy={hd - 4} r={1.6} style={{ ...thin, fill: stroke }} />
        </g>
      )
    }
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
    case 'car': {
      const cw = w * 0.86
      return (
        <g>
          <rect x={-cw / 2} y={-hd} width={cw} height={d} rx={Math.min(14, cw * 0.28)} style={thin} />
          {/* cabin */}
          <rect
            x={-cw / 2 + 4}
            y={-hd + d * 0.28}
            width={cw - 8}
            height={d * 0.42}
            rx={8}
            style={thinNoFill}
          />
          <line x1={-cw / 2 + 4} y1={-hd + d * 0.28} x2={cw / 2 - 4} y2={-hd + d * 0.28} style={thinNoFill} />
          {/* mirrors */}
          <rect x={-cw / 2 - 3} y={-hd + d * 0.3} width={3} height={5} rx={1} style={thin} />
          <rect x={cw / 2} y={-hd + d * 0.3} width={3} height={5} rx={1} style={thin} />
        </g>
      )
    }
    case 'pickup': {
      const cw = w * 0.88
      return (
        <g>
          <rect x={-cw / 2} y={-hd} width={cw} height={d} rx={Math.min(10, cw * 0.18)} style={thin} />
          {/* cab */}
          <rect x={-cw / 2 + 4} y={-hd + d * 0.3} width={cw - 8} height={d * 0.22} rx={5} style={thinNoFill} />
          {/* bed */}
          <rect x={-cw / 2 + 3} y={-hd + d * 0.56} width={cw - 6} height={d * 0.4} rx={2} style={thinNoFill} />
          <line x1={-cw / 2 + 3} y1={hd - 5} x2={cw / 2 - 3} y2={hd - 5} style={thinNoFill} />
        </g>
      )
    }
    case 'camper': {
      return (
        <g>
          {/* body with rounded nose at -y, hitch tongue beyond */}
          <rect x={-hw} y={-hd + 16} width={w} height={d - 16} rx={10} style={thin} />
          <path d={`M ${-hw * 0.35} ${-hd + 16} L 0 ${-hd} L ${hw * 0.35} ${-hd + 16}`} style={thinNoFill} />
          <circle cx={0} cy={-hd + 2} r={2.2} style={thinNoFill} />
          <Rect w={w} d={d - 40} inset={6} style={thinNoFill} />
          {/* wheels */}
          <rect x={-hw - 2} y={d * 0.12} width={4} height={16} rx={2} style={softFill} />
          <rect x={hw - 2} y={d * 0.12} width={4} height={16} rx={2} style={softFill} />
        </g>
      )
    }
    case 'boat-trailer': {
      const bw = w * 0.8
      return (
        <g>
          {/* hull: pointed bow at -y */}
          <path
            d={`M 0 ${-hd + 6} L ${bw / 2} ${-hd + d * 0.42} L ${bw / 2} ${hd - 10} Q ${bw / 2} ${hd - 4} ${bw / 2 - 6} ${hd - 4} L ${-bw / 2 + 6} ${hd - 4} Q ${-bw / 2} ${hd - 4} ${-bw / 2} ${hd - 10} L ${-bw / 2} ${-hd + d * 0.42} Z`}
            style={thin}
          />
          <path
            d={`M 0 ${-hd + 16} L ${bw / 2 - 5} ${-hd + d * 0.44} L ${bw / 2 - 5} ${hd - 9} L ${-bw / 2 + 5} ${hd - 9} L ${-bw / 2 + 5} ${-hd + d * 0.44} Z`}
            style={thinNoFill}
          />
          {/* windshield */}
          <line x1={-bw / 2 + 5} y1={-hd + d * 0.52} x2={bw / 2 - 5} y2={-hd + d * 0.52} style={thinNoFill} />
          {/* trailer tongue + hitch */}
          <line x1={0} y1={-hd + 6} x2={0} y2={-hd - 0} style={jambLine} />
          <circle cx={0} cy={-hd + 1} r={2} style={thinNoFill} />
          {/* trailer wheels */}
          <rect x={-hw - 1} y={d * 0.18} width={4} height={14} rx={2} style={softFill} />
          <rect x={hw - 3} y={d * 0.18} width={4} height={14} rx={2} style={softFill} />
        </g>
      )
    }
    case 'jet-ski': {
      const jw = w * 0.62
      return (
        <g>
          <path
            d={`M 0 ${-hd + 4} L ${jw / 2} ${-hd + d * 0.4} L ${jw / 2 - 2} ${hd - 6} L ${-jw / 2 + 2} ${hd - 6} Z`}
            style={thin}
          />
          {/* seat */}
          <rect x={-jw * 0.18} y={-hd + d * 0.45} width={jw * 0.36} height={d * 0.42} rx={4} style={softFill} />
          {/* handlebars */}
          <line x1={-jw * 0.3} y1={-hd + d * 0.38} x2={jw * 0.3} y2={-hd + d * 0.38} style={thinNoFill} />
          {/* trailer */}
          <circle cx={0} cy={-hd + 1} r={1.8} style={thinNoFill} />
          <rect x={-hw - 1} y={d * 0.2} width={3.5} height={11} rx={1.5} style={softFill} />
          <rect x={hw - 2.5} y={d * 0.2} width={3.5} height={11} rx={1.5} style={softFill} />
        </g>
      )
    }
    case 'workbench':
      return (
        <g>
          <Rect w={w} d={d} />
          <Rect w={w} d={d} inset={2} style={thinNoFill} />
          {/* vise + tools */}
          <circle cx={-hw + 8} cy={0} r={2.5} style={thinNoFill} />
          <rect x={hw - 20} y={-hd + 3} width={14} height={d - 6} rx={1} style={thinNoFill} />
        </g>
      )
    case 'tool-chest': {
      return (
        <g>
          <Rect w={w} d={d} />
          <line x1={-hw + 3} y1={-hd} x2={-hw + 3} y2={hd} style={thinNoFill} />
          <line x1={hw - 3} y1={-hd} x2={hw - 3} y2={hd} style={thinNoFill} />
          <circle cx={-hw / 2} cy={hd - 4} r={1.2} style={{ ...thin, fill: stroke }} />
          <circle cx={hw / 2} cy={hd - 4} r={1.2} style={{ ...thin, fill: stroke }} />
        </g>
      )
    }
    case 'tree-oak': {
      const r = Math.min(hw, hd)
      return (
        <g>
          <circle cx={0} cy={0} r={r} style={{ ...thinNoFill, strokeDasharray: '3 3' }} />
          <path
            d={`M ${-r * 0.7} ${r * 0.3} Q ${-r * 0.9} ${-r * 0.5} ${-r * 0.2} ${-r * 0.65} Q ${r * 0.2} ${-r * 0.95} ${r * 0.55} ${-r * 0.4} Q ${r * 0.95} ${-r * 0.1} ${r * 0.55} ${r * 0.45} Q ${r * 0.25} ${r * 0.9} ${-r * 0.25} ${r * 0.7} Q ${-r * 0.85} ${r * 0.75} ${-r * 0.7} ${r * 0.3} Z`}
            style={thinNoFill}
          />
          <circle cx={0} cy={0} r={r * 0.09} style={{ ...thin, fill: stroke }} />
        </g>
      )
    }
    case 'tree-pine': {
      const r = Math.min(hw, hd)
      return (
        <g>
          <circle cx={0} cy={0} r={r} style={{ ...thinNoFill, strokeDasharray: '3 3' }} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <line
                key={i}
                x1={Math.cos(a) * r * 0.15}
                y1={Math.sin(a) * r * 0.15}
                x2={Math.cos(a) * r * 0.92}
                y2={Math.sin(a) * r * 0.92}
                style={thinNoFill}
              />
            )
          })}
          <circle cx={0} cy={0} r={r * 0.1} style={{ ...thin, fill: stroke }} />
        </g>
      )
    }
    case 'shrub': {
      const r = Math.min(hw, hd)
      return (
        <g>
          <path
            d={`M ${-r} 0 Q ${-r} ${-r} ${-r * 0.3} ${-r * 0.85} Q 0 ${-r * 1.05} ${r * 0.4} ${-r * 0.8} Q ${r} ${-r * 0.75} ${r * 0.9} ${-r * 0.05} Q ${r} ${r * 0.7} ${r * 0.25} ${r * 0.85} Q ${-r * 0.4} ${r} ${-r * 0.8} ${r * 0.55} Q ${-r} ${r * 0.3} ${-r} 0 Z`}
            style={thin}
          />
        </g>
      )
    }
    case 'flower-bed':
      return (
        <g>
          <Rect w={w} d={d} r={4} style={softFill} />
          {(() => {
            const n = Math.max(3, Math.round(w / 18))
            return Array.from({ length: n }, (_, i) => {
              const x = -hw + ((i + 0.5) * w) / n
              return (
                <g key={i}>
                  <circle cx={x} cy={-hd / 3} r={3} style={thinNoFill} />
                  <circle cx={x + 4} cy={hd / 3} r={3} style={thinNoFill} />
                </g>
              )
            })
          })()}
        </g>
      )
    case 'stepping-stone':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={hw} ry={hd} style={softFill} />
        </g>
      )
    case 'boulder':
      return (
        <g>
          <path
            d={`M ${-hw} ${hd * 0.2} Q ${-hw * 0.9} ${-hd} ${-hw * 0.1} ${-hd * 0.9} Q ${hw * 0.8} ${-hd * 0.8} ${hw} ${-hd * 0.1} Q ${hw * 0.95} ${hd * 0.8} ${hw * 0.2} ${hd} Q ${-hw * 0.7} ${hd * 0.95} ${-hw} ${hd * 0.2} Z`}
            style={softFill}
          />
        </g>
      )
    case 'mailbox':
      return (
        <g>
          <Rect w={w} d={d} r={2} />
          <line x1={0} y1={-hd} x2={0} y2={hd} style={thinNoFill} />
        </g>
      )
    case 'surface-concrete':
    case 'surface-asphalt':
    case 'surface-gravel':
    case 'surface-pavers':
    case 'surface-mulch': {
      const fills: Record<string, string> = {
        'surface-concrete': '#e4e4e2',
        'surface-asphalt': '#c8c9cc',
        'surface-gravel': '#e0ddd6',
        'surface-pavers': '#e6ded2',
        'surface-mulch': '#dfd0c0',
      }
      const surfStyle = {
        stroke: '#a1a1aa',
        strokeWidth: 1,
        vectorEffect: 'non-scaling-stroke' as const,
        fill: fills[kind],
        fillOpacity: 0.75,
      }
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} style={surfStyle} />
          {kind === 'surface-pavers' && (
            <>
              {Array.from({ length: Math.max(1, Math.floor(w / 24)) - 0 }, (_, i) => (
                <line key={`v${i}`} x1={-hw + (i + 1) * 24} y1={-hd} x2={-hw + (i + 1) * 24} y2={hd} style={{ ...thinNoFill, stroke: '#b5aa98' }} />
              )).slice(0, Math.floor(w / 24))}
              {Array.from({ length: Math.floor(d / 24) }, (_, i) => (
                <line key={`h${i}`} x1={-hw} y1={-hd + (i + 1) * 24} x2={hw} y2={-hd + (i + 1) * 24} style={{ ...thinNoFill, stroke: '#b5aa98' }} />
              ))}
            </>
          )}
          {kind === 'surface-gravel' &&
            Array.from({ length: Math.min(60, Math.round((w * d) / 900)) }, (_, i) => {
              const x = -hw + ((i * 37) % w)
              const y = -hd + ((i * 53 + 17) % d)
              return <circle key={i} cx={x} cy={y} r={1.1} style={{ ...thinNoFill, stroke: '#a89f90' }} />
            })}
          {kind === 'surface-asphalt' && (
            <line x1={0} y1={-hd + 4} x2={0} y2={hd - 4} style={{ ...thinNoFill, stroke: '#ffffff', strokeDasharray: '8 8' }} />
          )}
        </g>
      )
    }
    default:
      return <Rect w={w} d={d} />
  }
}

const jambLine = { stroke, strokeWidth: 1.3, vectorEffect: 'non-scaling-stroke' as const }

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
