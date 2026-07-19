import { useRef, useState } from 'react'
import { useStore } from '../model/store'
import type { FenceType, FloorMaterial, OpeningType, Tool } from '../model/types'

const DOOR_TYPES: { key: OpeningType; label: string }[] = [
  { key: 'door', label: 'Single door' },
  { key: 'double-door', label: 'Double door' },
  { key: 'sliding', label: 'Sliding glass' },
  { key: 'bifold', label: 'Bifold' },
  { key: 'opening', label: 'Cased opening' },
  { key: 'garage', label: 'Garage door' },
]

const FENCE_TYPES: { key: FenceType; label: string }[] = [
  { key: 'privacy', label: 'Privacy fence' },
  { key: 'picket', label: 'Picket fence' },
  { key: 'chain', label: 'Chain-link' },
  { key: 'rail', label: 'Split rail' },
]

const PAINT_MATERIALS: { key: FloorMaterial; label: string }[] = [
  { key: 'wood', label: 'Wood' },
  { key: 'tile', label: 'Tile' },
  { key: 'carpet', label: 'Carpet' },
  { key: 'concrete', label: 'Concrete' },
  { key: 'stone', label: 'Stone' },
  { key: 'open', label: 'Open to below' },
]

// --- icons ---
const IconSelect = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M4 2l8 6.5-4 .5 2.2 4.3-1.8 1-2.2-4.5L4 12V2z" fill="currentColor" />
  </svg>
)
const IconBox = (
  <svg viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="3.5" width="11" height="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
  </svg>
)
const IconWall = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M2 12h12M2 12v-2h5V7h5V4h2" stroke="currentColor" strokeWidth="1.6" fill="none" />
  </svg>
)
const IconDoor = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M3 13h10M4 13V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M11 3a8 8 0 0 1-7 8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none" />
  </svg>
)
const IconWindow = (
  <svg viewBox="0 0 16 16" fill="none">
    <rect x="2" y="6" width="12" height="4" stroke="currentColor" strokeWidth="1.4" fill="none" />
    <path d="M2 8h12" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const IconPaint = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M2 9l7-7 5 5-7 7H4l-2-2v-3z" stroke="currentColor" strokeWidth="1.3" fill="none" />
    <path d="M12.5 11.5s1.5 1.8 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.9 1.5-2.7 1.5-2.7z" fill="currentColor" />
  </svg>
)
const IconRoad = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M2 13C5 13 4 3 8 3s3 10 6 10" stroke="currentColor" strokeWidth="1.6" fill="none" />
    <circle cx="8" cy="3" r="1.6" fill="currentColor" />
  </svg>
)
const IconGate = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M2 6v7M14 6v7M5 6v7M8 6v7M11 6v7" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2 6c4-4 8-4 12 0" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>
)
const IconFence = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M2 6v7M6 6v7M10 6v7M14 6v7M1 8h14M1 11h14" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)
const IconLabel = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M3 4V3h10v1M8 3v10M6.5 13h3" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>
)
const IconMeasure = (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 5.5L10.5 8 8 10.5 5.5 8z" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
)

type FlyoutKind = 'door' | 'fence' | 'paint'

interface RailItem {
  key: string
  label: string
  title: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  flyout?: FlyoutKind
}

export default function ToolRail() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const isPlot = useStore((s) => s.mode.scope === 'plot')
  const [flyout, setFlyout] = useState<{ kind: FlyoutKind; top: number } | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  const doorActive = tool.type === 'opening' && tool.opening !== 'window' && tool.opening !== 'gate'
  const currentDoor: OpeningType = doorActive ? (tool as any).opening : 'door'
  const currentFence: FenceType = tool.type === 'fence' ? tool.fence : 'privacy'
  const currentPaint: FloorMaterial = tool.type === 'paint' ? tool.material : 'tile'

  const openFlyout = (kind: FlyoutKind, e: React.MouseEvent) => {
    const btn = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFlyout({ kind, top: btn.top })
  }

  const commonTools: RailItem[] = [
    {
      key: 'label',
      label: 'Label',
      title: 'Add a text label (T)',
      icon: IconLabel,
      active: tool.type === 'label',
      onClick: () => setTool({ type: 'label' }),
    },
    {
      key: 'measure',
      label: 'Measure',
      title: 'Drop measurement reference marks (M)',
      icon: IconMeasure,
      active: tool.type === 'measure',
      onClick: () => setTool({ type: 'measure' }),
    },
  ]

  const select: RailItem = {
    key: 'select',
    label: 'Select',
    title: 'Select / move (V)',
    icon: IconSelect,
    active: tool.type === 'select',
    onClick: () => setTool({ type: 'select' }),
  }
  const box: RailItem = {
    key: 'box',
    label: 'Box',
    title: isPlot ? 'Draw a fenced rectangle (B)' : 'Draw a room box (B)',
    icon: IconBox,
    active: tool.type === 'box',
    onClick: () => setTool({ type: 'box' }),
  }

  const items: RailItem[] = isPlot
    ? [
        select,
        box,
        {
          key: 'road',
          label: 'Road',
          title: 'Draw a road with the pen tool',
          icon: IconRoad,
          active: tool.type === 'road',
          onClick: () => setTool({ type: 'road' }),
        },
        {
          key: 'gate',
          label: 'Gate',
          title: 'Place a gate on a fence',
          icon: IconGate,
          active: tool.type === 'opening' && (tool as any).opening === 'gate',
          onClick: () => setTool({ type: 'opening', opening: 'gate' }),
        },
        {
          key: 'fence',
          label: 'Fence',
          title: 'Draw fence lines — click for types',
          icon: IconFence,
          active: tool.type === 'fence',
          onClick: () => setTool({ type: 'fence', fence: currentFence }),
          flyout: 'fence',
        },
        ...commonTools,
      ]
    : [
        select,
        box,
        {
          key: 'wall',
          label: 'Wall',
          title: 'Draw walls (W)',
          icon: IconWall,
          active: tool.type === 'wall',
          onClick: () => setTool({ type: 'wall' }),
        },
        {
          key: 'door',
          label: 'Door',
          title: 'Place doors — click for types',
          icon: IconDoor,
          active: doorActive,
          onClick: () => setTool({ type: 'opening', opening: currentDoor }),
          flyout: 'door',
        },
        {
          key: 'window',
          label: 'Window',
          title: 'Place windows (N)',
          icon: IconWindow,
          active: tool.type === 'opening' && (tool as any).opening === 'window',
          onClick: () => setTool({ type: 'opening', opening: 'window' }),
        },
        {
          key: 'paint',
          label: 'Floor',
          title: 'Set room floor materials — click for materials',
          icon: IconPaint,
          active: tool.type === 'paint',
          onClick: () => setTool({ type: 'paint', material: currentPaint }),
          flyout: 'paint',
        },
        ...commonTools,
      ]

  const flyoutOptions =
    flyout?.kind === 'door'
      ? DOOR_TYPES.map((d) => ({
          key: d.key,
          label: d.label,
          onClick: () => setTool({ type: 'opening', opening: d.key } as Tool),
        }))
      : flyout?.kind === 'fence'
        ? FENCE_TYPES.map((f) => ({
            key: f.key,
            label: f.label,
            onClick: () => setTool({ type: 'fence', fence: f.key } as Tool),
          }))
        : flyout?.kind === 'paint'
          ? PAINT_MATERIALS.map((p) => ({
              key: p.key,
              label: p.label,
              onClick: () => setTool({ type: 'paint', material: p.key } as Tool),
            }))
          : []

  return (
    <div className="tool-rail" ref={railRef}>
      {items.map((it) => (
        <button
          key={it.key}
          className={`rail-btn ${it.active ? 'active' : ''}`}
          title={it.title}
          onClick={(e) => {
            it.onClick()
            if (it.flyout) openFlyout(it.flyout, e)
            else setFlyout(null)
          }}
        >
          <span className="rail-icon">{it.icon}</span>
          <span className="rail-label">{it.label}</span>
          {it.flyout && <span className="rail-caret">▸</span>}
        </button>
      ))}

      {flyout && (
        <>
          <div className="rail-flyout-scrim" onClick={() => setFlyout(null)} />
          <div className="rail-flyout" style={{ top: flyout.top }}>
            {flyoutOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  o.onClick()
                  setFlyout(null)
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
